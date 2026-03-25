import { DataSource, In, Repository } from "typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { QueueService } from "../queue/queue.service";
import { JobDependency } from "../database";
import { Job } from "../database/entities/job.entity";
import { JobStatus } from "../jobs";
import { Body, BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
// import { DEMO_USER } from "../auth/demo-user";

@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);

  private readonly priorityRank: Record<
    "HIGH" | "MEDIUM" | "LOW" | "NONE",
    number
  > = {
    HIGH: 1,
    MEDIUM: 2,
    LOW: 10,
    NONE: 20,
  };
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly queueService: QueueService,

    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
  ) {}

  async createWorkFlow(@Body() dto: any, userId: string, tenantId: string) {
    if (!dto.jobs || !Array.isArray(dto.jobs) || dto.jobs.length === 0) {
      throw new Error("Invalid jobs array");
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

    await this.scheduleNextJob(workFlowId);

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
    const jobRepo = this.dataSource.getRepository(Job);
    const completedJob = await jobRepo.findOne({
      where: { id: jobId },
      relations: ["tenant", "user"],
    });

    if (!completedJob || !completedJob.workFlowId) return;

    await this.unlockChildren(jobId);
    await this.scheduleNextJob(completedJob.workFlowId);
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

  async scheduleNextJob(workFlowId: string) {
    const jobRepo = this.dataSource.getRepository(Job);

    const queuedOrProcessingCount = await jobRepo.count({
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

    await jobRepo.update(candidate.id, { status: JobStatus.QUEUED });

    await this.queueService.enqueue({
      jobId: candidate.id,
      jobType: candidate.type,
      tenantId: candidate.tenant?.id,
      priorityLevel: candidate.priorityLevel ?? "NONE",
      retries: candidate.retries,
      metadata: candidate.metadata,
      idempotencyKey: candidate.id,
    });

    this.logger.log(
      `Scheduled next workflow job ${candidate.id} (${candidate.priorityLevel}) for workflow ${workFlowId}`,
    );
  }

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
    const jobRepo = this.dataSource.getRepository(Job);

    const parentJob = await jobRepo.findOne({ where: { id: parentJobId } });
    if (!parentJob?.workFlowId) return;

    const deps = await depRepo.find({
      where: { parentJobId },
      relations: ["childJob"],
    });

    for (const dep of deps) {
      const child = await dep.childJob;

      if (!child) continue;

      const fullChild = await jobRepo.findOne({ where: { id: child.id } });
      if (!fullChild) continue;

      if (fullChild.faliureStrategy === "STRICT") {
        await jobRepo.update(fullChild.id, {
          status: JobStatus.SKIPPED,
        });
        Logger.warn(
          `Child job ${child.id} skipped due to STRICT failure strategy`,
        );
      }
    }
    await this.scheduleNextJob(parentJob.workFlowId);
  }
}
