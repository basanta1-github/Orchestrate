import { Job as BullJob } from "bullmq";
import { DataSource, Repository } from "typeorm";
import { Job, JobStatus } from "@jobque/shared";
import { JobAttempt } from "@jobque/shared";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";

@Injectable()
export abstract class BaseProcessor {
  protected logger = new Logger(BaseProcessor.name);

  constructor(protected readonly dataSource: DataSource) {}

  async execute(job: BullJob): Promise<void> {
    const jobRepo: Repository<Job> = this.dataSource.getRepository(Job);
    const JobAttemptRepo: Repository<JobAttempt> =
      this.dataSource.getRepository(JobAttempt);

    this.logger.log(`Processing Job ${job.id} (${job.name})`);

    const attempt = JobAttemptRepo.create({
      job: { id: job.data.id }, // relation reference
      attemptNumber: job.attemptsMade + 1,
      status: JobStatus.PROCESSING,
    });

    await JobAttemptRepo.save(attempt);

    if (job.attemptsMade === 0) {
      await jobRepo.update(
        { id: job.data.id },
        { status: JobStatus.PROCESSING },
      );
    }

    try {
      // deligating the actual work

      await this.process(job);

      await jobRepo.update(
        { id: job.data.id },
        { status: JobStatus.COMPLETED, completedAt: new Date() },
      );

      await JobAttemptRepo.update(
        { id: attempt.id },
        { status: JobStatus.COMPLETED },
      );

      this.logger.log(`Job ${job.id} completed successfully`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // attempt failed
      await JobAttemptRepo.update(
        { id: attempt.id },
        {
          status: JobStatus.FAILED,
          // updatedAt: new Date(),
          errorMessage: err.message,
        },
      );
      this.logger.error(`Job ${job.id} failed`, err.stack);

      throw error; // rethrow -> BullMQ retry/backoff
    }
  }

  protected abstract process(job: BullJob): Promise<void>;
}
