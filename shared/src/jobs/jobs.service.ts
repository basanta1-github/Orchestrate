import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Job } from "../database/entities/job.entity";
import { QueueService } from "../queue/queue.service";
import { CreateJobDto } from "./dto/create-job.dto";
import { JobStatus } from "./jobs.constants";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    private readonly queueService: QueueService,
  ) {}

  async createAndEnqueue(dto: CreateJobDto, userId: string, tenantId: string) {
    const job = this.jobRepo.create({
      type: dto.jobType,
      metadata: dto.payload,
      priority: dto.priority ?? 5,
      retries: 3,
      status: JobStatus.QUEUED,
      // tenant: { id: tenantId }, // TypeORM accepts object with only id for ManyToOne
      // user: { id: userId },
    });

    const savedJob = await this.jobRepo.save(job);
    // // 🔹 Observability hook: log after saving but before enqueue
    this.logger.log(`Job queued: ${savedJob.id} | Type: ${savedJob.type} 
            | Tenant: ${tenantId} | User: ${userId}`);

    try {
      await this.queueService.enqueue({
        jobId: savedJob.id,
        jobType: savedJob.type,
        tenantId: tenantId,
        priority: savedJob.priority,
        retries: savedJob.retries,
        metadata: savedJob.metadata,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue job ${savedJob.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error; // optional, or handle retry
    }

    return this.formatJobResponse(savedJob);
  }

  //fetching single job
  async getJobById(jobId: string, userId: string, tenantId: string) {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, user: { id: userId }, tenant: { id: tenantId } },
      relations: ["attempts", "user", "tenant"],
    });
    if (!job) {
      throw new NotFoundException("Job not found");
    }

    return this.formatJobResponse(job);
  }

  //list jobs
  async listJobs(userId: string, tenantId: string, filters: any) {
    const query = this.jobRepo
      .createQueryBuilder("job")
      .leftJoinAndSelect("job.attempts", "attempts")
      .leftJoin("job.user", "user")
      .leftJoin("job.tenant", "tenant")
      .where("user.id = :userId", { userId })
      .andWhere("tenant.id = :tenantId", { tenantId });

    if (filters.status) {
      query.andWhere("job.status = :status", {
        status: filters.status,
      });
    }

    if (filters.jobType) {
      query.andWhere("job.type = :type", {
        type: filters.jobType,
      });
    }

    const jobs = await query.orderBy("job.createdAt", "DESC").getMany();

    return jobs.map((j) => this.formatJobResponse(j));
  }

  async updateJobStatus(
    jobId: string,
    newStatus: JobStatus,
    userId?: string,
    tenantId?: string,
  ) {
    const where: any = { id: jobId };

    if (userId) where.user = { id: userId };
    if (tenantId) where.tenant = { id: tenantId };

    const job = await this.jobRepo.findOne({
      where,
      relations: ["user", "tenant"],
    });

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    // prevent overwriting terminal jobs
    if (
      job.completedAt &&
      (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED)
    ) {
      return job;
    }

    // terminal state handlelling
    if (newStatus === JobStatus.COMPLETED || newStatus === JobStatus.FAILED) {
      job.completedAt = new Date();
    }

    job.status = newStatus;
    await this.jobRepo.save(job);
    return job;
  }

  private formatJobResponse(job: Job) {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      priority: job.priority,
      retries: job.retries,
      owner: {
        userId: job.user?.id,
        tenantId: job.tenant?.id,
      },
      metadata: job.metadata,
      attempts: job.attempts?.map((a) => ({
        attemptNumber: a.attemptNumber,
        status: a.status,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      timestamps: {
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
      },
    };
  }
}
