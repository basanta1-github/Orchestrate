import { Job as BullJob } from "bullmq";
import { DataSource, Repository } from "typeorm";
import { Job, JobStatus, JobAttempt, JobLog } from "@jobque/shared";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";

@Injectable()
export abstract class BaseProcessor {
  protected logger = new Logger(BaseProcessor.name);

  constructor(
    @InjectDataSource()
    protected readonly dataSource: DataSource,
  ) {
    // super(dataSource);
    console.log("MediaProcessor DataSource:", this.dataSource);
  }

  async execute(job: BullJob): Promise<void> {
    const jobRepo: Repository<Job> = this.dataSource.getRepository(Job);
    const JobAttemptRepo: Repository<JobAttempt> =
      this.dataSource.getRepository(JobAttempt);
    const logRepo = this.dataSource.getRepository(JobLog);

    this.logger.log(`Processing Job ${job.id} (${job.name})`);

    const attempt = JobAttemptRepo.create({
      job: { id: job.data.jobId }, // relation reference
      attemptNumber: job.attemptsMade + 1,
      status: JobStatus.PROCESSING,
      startedAt: new Date(),
    });

    await JobAttemptRepo.save(attempt);

    // first attempt moves job to processing
    if (job.attemptsMade === 0) {
      await jobRepo.update(
        { id: job.data.jobId },
        { status: JobStatus.PROCESSING },
      );
    }

    await logRepo.save({
      job: { id: job.data.jobId },
      message: "Job attempt started",
      data: { attemptNumber: attempt.attemptNumber },
    });

    try {
      // deligating the actual work

      await this.process(job);
      const now = new Date();

      await JobAttemptRepo.update(
        { id: attempt.id },
        { status: JobStatus.COMPLETED, finishedAt: now },
      );

      // job success

      await jobRepo.update(
        { id: job.data.jobId },
        { status: JobStatus.COMPLETED, completedAt: now },
      );

      await logRepo.save({
        job: { id: job.data.jobId },
        message: "Job completed successfully",
        data: { attemptNumber: attempt.attemptNumber },
      });

      this.logger.log(`Job ${job.id} completed successfully`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const now = new Date();

      // attempt failed set finished at
      await JobAttemptRepo.update(
        { id: attempt.id },
        {
          status: JobStatus.FAILED,
          finishedAt: now,
          errorMessage: err.message,
        },
      );

      await logRepo.save({
        job: { id: job.data.jobId },
        message: "Job attempt failed",
        data: { attemptNumber: attempt.attemptNumber, error: err.message },
      });

      // final faliure - update job table
      const maxAttempts = job.opts.attempts ?? 5;
      // final job faliure
      if (job.attemptsMade + 1 >= maxAttempts) {
        await jobRepo.update(
          { id: job.data.jobId },
          { status: JobStatus.FAILED, completedAt: now },
        );
      }
      this.logger.error(`Job ${job.id} failed`, err.stack);

      throw error; // rethrow -> BullMQ retry/backoff
    }
  }

  protected abstract process(job: BullJob): Promise<void>;
}
