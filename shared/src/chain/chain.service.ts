import { DataSource, In, Repository } from "typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { QueueService } from "../queue/queue.service";
import { JobDependency } from "../database";
import { Job } from "../database/entities/job.entity";
import { JobStatus } from "../jobs";
import { Body, BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { TenantCapService } from "../scaling";
import { resolveQueueName } from "../queue/resolvedQueueName";
// import { DEMO_USER } from "../auth/demo-user";

/**
 * chain service
 * manages multi seep workflow jobs (job a -> job b -> job c)
 *
 * schedulenextJobs calls tenantCapService.submitJob()
 * instead of queueservice.enqueue() directly to make sure workflow jobs
 * pass thorugh tenant cap and staging area like regular single jobs without this
 * workflow can flood queue ignoring per tenant cap
 */
@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);
  // job priority -> bullmq priority number lower runs first in bullmq
  // these are used as tiebreakers within the same branch banned
  private readonly jobPriorityValue: Record<string, number> = {
    HIGH: 1,
    // MID: 2,
    MEDIUM: 2,
    LOW: 3,
    NONE: 4,
  };
  // USED FOR SORTING ROOT JOBS BY THEIR DECLARED PRIORITY
  private readonly priorityRank: Record<
    "HIGH" | "MEDIUM" | "LOW" | "NONE",
    number
  > = {
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
    NONE: 4,
  };
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    // private readonly queueService: QueueService,
    private readonly tenantCapService: TenantCapService,

    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
  ) {}

  async createWorkFlow(@Body() dto: any, userId: string, tenantId: string) {
    if (!dto.jobs || !Array.isArray(dto.jobs) || dto.jobs.length === 0) {
      throw new Error("Invalid jobs array");
    }

    const keys = dto.jobs.map((j: any) => j.key);
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      const duplicates = keys.filter(
        (key: string, index: number) => keys.indexOf(key) !== index,
      );
      throw new BadRequestException(
        `Invalid workflow: duplicate jobs keys found ${[...new Set(duplicates)].join(", ")}`,
      );
    }

    // ensure at least 1 root job exists
    const hasRootJob = dto.jobs.some((j: any) => !j.dependsOn);
    if (!hasRootJob) {
      throw new BadRequestException(
        "Invalid workflow: at least onejob musthave no dependencies (no root)",
      );
    }

    // check for circular dependencies
    function hasCircularDependency(jobs: any[]): boolean {
      const graph: Record<string, string[]> = {};

      for (const job of jobs) {
        graph[job.key] = job.dependsOn ? [job.dependsOn] : [];
      }
      const visited = new Set<string>();
      const recStack = new Set<string>();

      function dfs(node: string): boolean {
        if (!visited.has(node)) {
          visited.add(node);
          recStack.add(node);

          for (const neighbour of graph[node] || []) {
            if (!visited.has(neighbour) && dfs(neighbour)) return true;
            else if (recStack.has(neighbour)) return true;
          }
        }
        recStack.delete(node);
        return false;
      }
      for (const node of Object.keys(graph)) {
        if (dfs(node)) return true;
      }
      return false;
    }

    if (hasCircularDependency(dto.jobs)) {
      throw new BadRequestException(
        "Invalid workflow: circular dependency detected",
      );
    }
    // const { id: userId, tenantId } = DEMO_USER;
    const workFlowId = randomUUID();
    const jobMap: Record<string, Job> = {};
    const depRepo = this.dataSource.getRepository(JobDependency);

    for (const job of dto.jobs) {
      if (!job.key || !job.type) {
        throw new BadRequestException("Each job must have key and type");
      }

      const dependencies = job.dependsOn
        ? Array.isArray(job.dependsOn)
          ? job.dependsOn
          : [job.dependsOn]
        : [];
      const created = await this.jobRepo.save({
        // id: job.id,
        type: job.type,
        metadata: job.metadata ?? {},
        status:
          dependencies.length > 0
            ? JobStatus.WAITING_FOR_DEPENDENCIES
            : JobStatus.READY,
        workFlowId,
        priorityLevel: job.priorityLevel ?? "NONE",
        retries: job.retries ?? 3,
        faliureStrategy: job.faliureStrategy ?? "STRICT",
        tenant: { id: tenantId },
        user: { id: userId },
      });

      jobMap[job.key] = created;
    }
    // create dependencies
    for (const job of dto.jobs) {
      const dependencies = job.dependsOn
        ? Array.isArray(job.dependsOn)
          ? job.dependsOn
          : [job.dependsOn]
        : [];

      for (const parentKey of dependencies) {
        const parentJob = jobMap[parentKey];
        const childJob = jobMap[job.key];

        if (!parentJob)
          throw new BadRequestException(
            `parent job ${job.dependsOn} not found`,
          );
        await depRepo.save({
          parentJobId: parentJob.id,
          childJobId: childJob.id,
        });
      }
    }

    await this.scheduleNextJob(workFlowId, tenantId);

    // const savedJobs =
    // await this.jobRepo.find({
    //   where: { workFlowId },
    //   order: { createdAt: "ASC" },
    // });

    return {
      workFlowId,
      jobs: dto.jobs.map((job: any) => {
        const createdJob = jobMap[job.key];
        const dependencies = job.dependsOn
          ? Array.isArray(job.dependsOn)
            ? job.dependsOn
            : [job.dependsOn]
          : [];
        return {
          id: createdJob.id,
          key: job.key,
          type: createdJob.type,
          status: createdJob.status,
          priorityLevel: createdJob.priorityLevel,
          dependsOn: dependencies,
          // metadata: createdJob.metadata,
          // retries: createdJob.retries,
          // failureStrategy: createdJob.faliureStrategy,
          workFlowId: createdJob.workFlowId,
          // createdAt: createdJob.createdAt,
        };
      }),
    };
  }

  async onJobCompleted(jobId: string) {
    const completedJob = await this.jobRepo.findOne({
      where: { id: jobId },
      relations: ["tenant", "user"],
    });

    if (!completedJob || !completedJob.workFlowId) return;

    await this.unlockChildren(jobId);
    await this.scheduleNextJob(completedJob.workFlowId, completedJob.tenant.id);
  }

  async unlockChildren(parentJobId: string) {
    const depRepo = this.dataSource.getRepository(JobDependency);
    const jobRepo = this.dataSource.getRepository(Job);

    const childDeps = await depRepo.find({
      where: { parentJobId },
      relations: ["childJob"],
    });
    for (const dep of childDeps) {
      const childId = dep.childJobId;

      const child = await jobRepo.findOne({
        where: { id: childId },
        relations: ["tenant", "user"],
      });
      if (!child) continue;
      if (child.status !== JobStatus.WAITING_FOR_DEPENDENCIES) continue;

      const remainingDeps = await depRepo
        .createQueryBuilder("jd")
        .innerJoin(Job, "parent", "parent.id = jd.parentJobId")
        .where("jd.childJobId = :childId", { childId })
        .andWhere("parent.status != :status", {
          status: JobStatus.COMPLETED,
        })
        .getCount();

      if (remainingDeps === 0) {
        await jobRepo.update(child.id, {
          status: JobStatus.READY,
        });
        await depRepo.update(
          { childJobId: child.id },
          { status: JobStatus.READY },
        );

        this.logger.log(`Unlocked child job ${child.id} -> READY`);
      }
    }
  }
  /**
   * scheduleNextJob now takes tenantid so it can routethrough tenant cap service
   * this ensure workflow jobsrespect the pertenant job just like regular jobs
   *
   * We do NOT block any job from entering the BullMQ queue.
  Tenant cap, band promoter, autoscaler all work normally.

   Instead we control WHICH JOB RUNS FIRST inside BullMQ by assigning
   a carefully calculated BullMQ priority number to each job when we enqueue it.

   BullMQ runs lower priority NUMBER first (priority=1 before priority=10).

   The formula:
     bullPriority = (rootRank * 100) + jobOwnPriorityValue

   rootRank = position of this job's root in the sorted root list
     (highest-priority root = rank 1, next = rank 2, etc.)

   jobOwnPriorityValue = HIGH=1, MID=2, LOW=3, NONE=4

   Example from the scenario:
     B is root rank 1 (HIGH root).
     D is B's child with HIGH own priority.
     bullPriority(D) = (1 * 100) + 1 = 101

     A is root rank 2 (MID root).
     G is A's child with HIGH own priority.
     bullPriority(G) = (2 * 100) + 1 = 201

     So D (101) always runs before G (201) even though both have HIGH own priority.
     BullMQ handles this automatically — no blocking needed.

   Independent jobs (no workFlowId):
     Use their own priority directly — HIGH=1, MID=2, LOW=10, NONE=20.
     They go through TenantCapService exactly as before.
   */

  async scheduleNextJob(workFlowId: string, tenantId: string) {
    const queuedOrProcessingCount = await this.jobRepo.count({
      where: [
        { workFlowId, status: JobStatus.QUEUED },
        { workFlowId, status: JobStatus.PROCESSING },
      ],
    });

    this.logger.debug(
      `Active jobs in workflow ${workFlowId}: ${queuedOrProcessingCount}`,
    );

    if (queuedOrProcessingCount > 0) {
      this.logger.debug(
        `Workflow ${workFlowId} already has an active job. Skipping schedule.`,
      );
      return;
    }
    // always try full workflow-aware pick which respects branch depth
    let candidate = await this.pickNextJobGLobal(workFlowId);

    if (!candidate) {
      this.logger.debug(`No READY job found for workflow ${workFlowId}`);
      return;
    }

    this.logger.debug(
      `Candidate selected: ${candidate.id} ${candidate.priorityLevel} ${candidate.status}`,
    );

    await this.jobRepo.update(candidate.id, { status: JobStatus.QUEUED });
    // roting through tenantcapservice

    await this.tenantCapService.submitJob({
      jobId: candidate.id,
      jobType: candidate.type,
      tenantId: candidate.tenant?.id,
      priorityLevel: candidate.priorityLevel ?? "NONE",
      retries: candidate.retries,
      metadata: candidate.metadata,
      idempotencyKey: candidate.id,
      queueName: resolveQueueName(candidate.type),
    });

    this.logger.log(
      `Scheduled next workflow job ${candidate.id} (${candidate.priorityLevel}) for workflow ${workFlowId}`,
    );
  }
  // async scheduleNextJob(workFlowId: string, tenantId: string): Promise<void> {
  //   const deprepo = this.dataSource.getRepository(JobDependency);

  //   // load the entire workflow
  //   const allJobs = await this.jobRepo.find({
  //     where: { workFlowId },
  //     relations: ["tenant", "user"],
  //   });

  //   // find root jobs (jobs that nobody lists as a child)
  //   const allIds = allJobs.map((j) => j.id);
  //   const childIds = new Set(
  //     (await deprepo.find({ where: { parentJobId: In(allIds) } })).map(
  //       (d) => d.childJobId,
  //     ),
  //   );
  //   const rootJobs = allJobs
  //     .filter((j) => !childIds.has(j.id))
  //     .sort((a, b) => {
  //       const p =
  //         (this.priorityRank[a.priorityLevel] ?? 4) -
  //         (this.priorityRank[b.priorityLevel] ?? 4);
  //       return p !== 0 ? p : a.createdAt.getTime() - b.createdAt.getTime();
  //     });

  //   // for each root compute its rank (1-based highest priority = 1)
  //   const rootRankMap = new Map<string, number>();
  //   rootJobs.forEach((root, idx) => rootRankMap.set(root.id, idx + 1));

  //   // build a map of jobId => rootId so every job know its branch
  //   const jobRootMap = await this.buildJobRootMap(allJobs, deprepo);

  //   // find all ready jobs
  //   const readyJobs = allJobs.filter((j) => j.status === JobStatus.READY);
  //   if (readyJobs.length === 0) {
  //     this.logger.debug(`Workflow ${workFlowId} — no READY jobs`);
  //     return;
  //   }
  //   this.logger.log(
  //     `Workflow ${workFlowId} — scheduling ${readyJobs.length} READY job(s)`,
  //   );
  //   // enqueue each ready jobs with its calculated bullMQ priority
  //   for (const job of readyJobs) {
  //     // atomatic claim: only proceed if we're the one that flipped it to QUEUED
  //     const result = await this.jobRepo
  //       .createQueryBuilder()
  //       .update(Job)
  //       .set({ status: JobStatus.QUEUED })
  //       .where("id = :id", { id: job.id })
  //       .andWhere("status = :status", { status: JobStatus.READY })
  //       .execute();
  //     if (result.affected === 0) {
  //       // another cocurrent call already claimed this job
  //       continue;
  //     }

  //     // calculate BullMQ priority number
  //     const rootId = jobRootMap.get(job.id);
  //     const rootRank = rootId ? (rootRankMap.get(rootId) ?? 99) : 99;
  //     const ownPriority = this.jobPriorityValue[job.priorityLevel] ?? 4;

  //     // rootrank * 100 ensures entire B branch (rank = 1 , scores 101-104)
  //     // always neats entire A branch ( rank = 2, scores 201-204) in BullMQ
  //     // own priority  is the tieBreaker within the same branch
  //     const bullPriority = rootRank * 100 * ownPriority;
  //     try {
  //       await this.tenantCapService.submitJob({
  //         jobId: job.id,
  //         jobType: job.type,
  //         tenantId: job.tenant?.id ?? tenantId,
  //         priorityLevel: job.priorityLevel ?? "NONE",
  //         retries: job.retries,
  //         metadata: job.metadata,
  //         // Pass bullPriority override so QueueService uses this number
  //         // instead of calculating from priorityLevel alone
  //         bullPriorityOverride: bullPriority,
  //       });

  //       this.logger.log(
  //         `Workflow ${workFlowId} — enqueued job ${job.id} ` +
  //           `(${job.type} / own=${job.priorityLevel} / rootRank=${rootRank} / bullPriority=${bullPriority})`,
  //       );
  //     } catch (error) {
  //       await this.jobRepo.update(job.id, { status: JobStatus.READY });
  //       this.logger.error(
  //         `Failed to enqueue job ${job.id}, reverted to READY`,
  //         error instanceof Error ? error.message : String(error),
  //       );
  //     }
  //   }
  // }
  // // build job root map
  // // walks the dependency graph for every job to find its root ancestor
  // // returns a Map <jobId, rootJobId>

  // private async buildJobRootMap(
  //   allJobs: Job[],
  //   depRepo: Repository<JobDependency>,
  // ): Promise<Map<string, string>> {
  //   const allIds = allJobs.map((j) => j.id);

  //   // load all dependencies
  //   const allDeps = await depRepo.find({
  //     where: { parentJobId: In(allIds) },
  //   });

  //   // build child -> parent map
  //   const childToParent = new Map<string, string>();
  //   for (const dep of allDeps) {
  //     childToParent.set(dep.childJobId, dep.parentJobId);
  //   }
  //   // for each job walk up to root
  //   const result = new Map<string, string>();
  //   for (const job of allJobs) {
  //     let current = job.id;
  //     const visited = new Set<String>();
  //     while (childToParent.has(current) && !visited.has(current)) {
  //       visited.add(current);
  //     }
  //     result.set(job.id, current);
  //   }
  //   return result;
  // }

  // picks next job to run across the whole workflow
  //  strategy: for each root job sorted by priority, do a depth-first walk of its subtree
  //  the first ready job in this walk wins where we can ensure we fully exhaust a branch before
  //  moving to sibling root jobs

  private async pickNextJobGLobal(workFlowId: string): Promise<Job | null> {
    const jobRepo = this.dataSource.getRepository(Job);
    const depRepo = this.dataSource.getRepository(JobDependency);

    // get all root jobs for this workflow (no parents), sorted by priority
    const allJobs = await jobRepo.find({
      where: { workFlowId },
      relations: ["tenant", "user"],
    });

    const allJobIds = allJobs.map((j) => j.id); // no one lists them as a child
    const childJobIds = (
      await depRepo.find({
        where: { parentJobId: In(allJobIds) },
      })
    ).map((d) => d.childJobId);

    const rootJobs = allJobs
      .filter((j) => !childJobIds.includes(j.id))
      .sort((a, b) => {
        const p =
          this.priorityRank[a.priorityLevel] -
          this.priorityRank[b.priorityLevel];
        return p !== 0 ? p : a.createdAt.getTime() - b.createdAt.getTime();
      });

    for (const root of rootJobs) {
      // if this rroot itself is ready it means its whole subtree was never started
      if (root.status === JobStatus.READY) {
        return root;
      }

      // if this root is still active (QUEUED/PROCESSING/WAITING), skip entirely -
      // we will call again when it finishes

      if (
        root.status === JobStatus.QUEUED ||
        root.status === JobStatus.PROCESSING ||
        root.status === JobStatus.WAITING_FOR_DEPENDENCIES
      ) {
        return null; // block - dont start siblings yet
      }

      // root is completed (or skipped/failed) - search its subtree depth first
      if (
        root.status === JobStatus.COMPLETED ||
        root.status === JobStatus.SKIPPED
      ) {
        const readyDescendant = await this.pickBestReadyDescendantDfs(
          root.id,
          depRepo,
          jobRepo,
        );
        if (readyDescendant) return readyDescendant;
        // subtree fully done - continue to next root sibling
      }
    }
    return null;
  }

  //  depth-first search through a jobs subtree
  //  returns the first ready job found respecting prority among the siblings

  private async pickBestReadyDescendantDfs(
    parentId: string,
    depRepo: Repository<JobDependency>,
    jobRepo: Repository<Job>,
  ): Promise<Job | null> {
    const childDeps = await depRepo.find({
      where: { parentJobId: parentId },
      relations: ["childJob"],
    });

    const children = childDeps
      .map((d) => d.childJob)
      .filter(Boolean)
      .sort((a, b) => {
        const p =
          this.priorityRank[a.priorityLevel] -
          this.priorityRank[b.priorityLevel];
        return p !== 0 ? p : a.createdAt.getTime() - b.createdAt.getTime();
      });
    for (const child of children) {
      const full = await jobRepo.findOne({
        where: { id: child.id },
        relations: ["tenant", "user"],
      });
      if (!full) continue;

      if (full.status === JobStatus.READY) return full;

      // if a child is active, block - wait for it to finish before going deeper
      if (
        full.status === JobStatus.QUEUED ||
        full.status === JobStatus.PROCESSING ||
        full.status === JobStatus.WAITING_FOR_DEPENDENCIES
      ) {
        return null; // block - dont start siblings yet
      }

      // child is done - go deeper
      if (
        full.status === JobStatus.COMPLETED ||
        full.status === JobStatus.SKIPPED
      ) {
        const deeper = await this.pickBestReadyDescendantDfs(
          full.id,
          depRepo,
          jobRepo,
        );
        if (deeper) return deeper;
        // subtree fully done - continue to next root sibling
      }
    }
    return null;
  }

  async handleParentFailure(parentJobId: string) {
    const depRepo = this.dataSource.getRepository(JobDependency);

    const parentJob = await this.jobRepo.findOne({
      where: { id: parentJobId },
      relations: ["tenant"],
    });
    if (!parentJob?.workFlowId) return;

    const deps = await depRepo.find({
      where: { parentJobId },
      relations: ["childJob"],
    });

    for (const dep of deps) {
      const child = dep.childJob;

      if (!child) continue;

      const fullChild = await this.jobRepo.findOne({ where: { id: child.id } });
      if (!fullChild) continue;

      if (fullChild.faliureStrategy === "STRICT") {
        await this.jobRepo.update(fullChild.id, {
          status: JobStatus.SKIPPED,
        });
        Logger.warn(
          `Child job ${child.id} skipped due to STRICT failure strategy`,
        );
      }
    }
    await this.scheduleNextJob(
      parentJob.workFlowId,
      parentJob.tenant?.id ?? "",
    );
  }
}
