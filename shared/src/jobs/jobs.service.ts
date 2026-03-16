import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Job } from "../database/entities/job.entity";
import { QueueService } from "../queue/queue.service";
import { CreateJobDto } from "./dto/create-job.dto";
import { JobStatus } from "./jobs.constants";
import { RecurringJob } from "../database/entities/recurring-jobs.entity";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    @InjectRepository(RecurringJob)
    readonly recurringJobRepo: Repository<RecurringJob>,
    private readonly queueService: QueueService,
  ) {}

  async createAndEnqueue(dto: CreateJobDto, userId: string, tenantId: string) {
    let recurringJobId: string | undefined;

    if (dto.cron) {
      const recurring = this.recurringJobRepo.create({
        jobType: dto.jobType,
        cron: dto.cron,
        metadata: dto.metadata,
        tenant: { id: tenantId },
        user: { id: userId },
      });

      const savedRecurring = await this.recurringJobRepo.save(recurring);
      recurringJobId = savedRecurring.id;
    }

    const Scheduled = !!dto.delayMs || !!dto.cron;
    const job = this.jobRepo.create({
      type: dto.jobType,
      metadata: dto.metadata,
      priority: dto.priority ?? 5,
      retries: 3,
      status: Scheduled ? JobStatus.SCHEDULED : JobStatus.QUEUED,
      tenant: { id: tenantId }, // TypeORM accepts object with only id for ManyToOne
      user: { id: userId },
      delayMs: dto.delayMs,
      cron: dto.cron,
      idempotencyKey: dto.idempotencyKey,
      recurringJob: recurringJobId ? { id: recurringJobId } : undefined,
      scheduledAt: dto.delayMs
        ? new Date(Date.now() + dto.delayMs)
        : new Date(),
    });

    const savedJob = await this.jobRepo.save(job);
    const isScheduled = !!savedJob.delayMs || !!savedJob.cron;
    const logMessage = isScheduled
      ? `Job scheduled: ${savedJob.id} | Type: ${savedJob.type} | Tenant: ${tenantId} | User: ${userId} | Scheduled At: ${savedJob.scheduledAt}`
      : `Job queued: ${savedJob.id} | Type: ${savedJob.type} | Tenant: ${tenantId} | User: ${userId}`;

    this.logger.log(logMessage);

    try {
      await this.queueService.enqueue({
        jobId: savedJob.id,
        recurringJobId,
        jobType: savedJob.type,
        tenantId: tenantId,
        priority: savedJob.priority,
        retries: savedJob.retries,
        metadata: savedJob.metadata,
        delayMs: savedJob.delayMs,
        cron: savedJob.cron,
        idempotencyKey: savedJob.idempotencyKey,
        // ⚠ Only include jobId for normal/delayed jobs
        // ...(savedJob.cron
        //   ? {}
        //   : { jobId: savedJob.idempotencyKey ?? savedJob.id }),
      });
      console.log(`Enqueued job ${savedJob.id} successfully.`);
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
    const job = await this.jobRepo
      .createQueryBuilder("job")
      .leftJoinAndSelect("job.attempts", "attempts")
      .leftJoinAndSelect("job.user", "user")
      .leftJoinAndSelect("job.tenant", "tenant")
      .where("job.id = :jobId", { jobId })
      .andWhere("user.id = :userId", { userId })
      .andWhere("tenant.id = :tenantId", { tenantId })
      .orderBy("attempts.attemptNumber", "ASC") // important: order attempts
      .getOne();

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
        id: a.id,
        attemptNumber: a.attemptNumber,
        status: a.status,

        // execution timing
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,

        // debugging / observability
        errorMessage: a.errorMessage,
        result: a.result,

        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      logs: job.logs?.map((l) => ({
        id: l.id,
        message: l.message,
        data: l.data,
        createdAt: l.createdAt,
      })),
      timestamps: {
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
      },
    };
  }
}
