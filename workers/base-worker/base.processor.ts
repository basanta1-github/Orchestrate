import { Job as BullJob } from "bullmq";
import { DataSource, Repository } from "typeorm";
import { Job } from "@jobque/shared";
// import { Job } from "../../api/src/database/entities/job.entity";
// import { JobAttempt } from "../../api/src/database/entities/job-attempt.entity";
import { JobAttempt } from "@jobque/shared";
import { Logger } from "@nestjs/common";

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
      status: "PROCESSING",
    });

    await JobAttemptRepo.save(attempt);

    try {
      // deligating the actual work

      await this.process(job);

      await jobRepo.update(
        { id: job.data.id },
        { status: "COMPLETED", updatedAt: new Date() },
      );

      await JobAttemptRepo.update(
        { id: attempt.id },
        { status: "SUCCESS", updatedAt: new Date() },
      );

      this.logger.log(`Job ${job.id} completed successfully`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await JobAttemptRepo.update(
        { id: attempt.id },
        {
          status: "FAILED",
          updatedAt: new Date(),
          errorMessage: err.message,
        },
      );
      this.logger.error(`Job ${job.id} failed`, err.stack);

      throw error; // rethrow -> BullMQ retry/backoff
    }
  }

  protected abstract process(job: BullJob): Promise<void>;
}
