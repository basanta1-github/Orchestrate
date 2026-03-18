import { Controller, Post, Body, BadRequestException } from "@nestjs/common";
import { Job } from "../database/entities/job.entity";
import { DataSource, Repository } from "typeorm";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { JobStatus } from "../jobs";
import { JobDependency } from "../database";
import { ChainService } from "./chain.service";
import { QueueService } from "../queue/queue.service";
import { DEMO_USER } from "../demo-user";

@Controller("jobs")
export class ChainController {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    private readonly queueService: QueueService,
  ) {}
  // chain controller
  @Post("workflow")
  async createWorkFlow(@Body() dto: any) {
    if (!dto.jobs || !Array.isArray(dto.jobs || dto.jobs.length === 0)) {
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
    const { id: userId, tenantId } = DEMO_USER;
    const workFlowId = randomUUID();
    const jobMap: Record<string, Job> = {};
    const depRepo = this.dataSource.getRepository(JobDependency);

    for (const job of dto.jobs) {
      if (!job.key || !job.type) {
        throw new BadRequestException("Each job must have key and type");
      }

      const hasDependency = !!job.dependsOn;
      const created = await this.jobRepo.save({
        // id: job.id,
        type: job.type,
        metadata: job.metadata ?? {},
        status: hasDependency ? JobStatus.PENDING : JobStatus.QUEUED,
        workFlowId,
        priorityLevel: job.priorityLevel ?? "MEDIUM",
        retries: job.retries ?? 3,
        tenant: { id: tenantId },
        user: { id: userId },
      });

      jobMap[job.key] = created;
    }
    // create dependencies
    for (const job of dto.jobs) {
      if (!job.dependsOn) continue;

      const parentJob = jobMap[job.dependsOn];
      const childJob = jobMap[job.key];

      if (!parentJob) throw new Error(`parent job ${job.dependsOn} not found`);
      await depRepo.save({
        parentJobId: parentJob.id,
        childJobId: childJob.id,
      });
    }

    // trigger all jobs with no dependencies
    const firstJobs = dto.jobs.filter((j: any) => !j.dependsOn);
    for (const job of firstJobs) {
      const createdJob = jobMap[job.key];
      await this.queueService.enqueue({
        jobId: createdJob.id,
        jobType: createdJob.type,
        tenantId,
        priorityLevel: createdJob.priorityLevel,
        retries: createdJob.retries,
        metadata: createdJob.metadata,
        idempotencyKey: createdJob.id,
      });
      //   await this.chainService.triggerNextJobs(createdJob.id);
    }

    return {
      workFlowId,
      jobs: Object.values(jobMap).map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
      })),
    };
  }
}
