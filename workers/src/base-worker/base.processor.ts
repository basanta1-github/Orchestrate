import { Job as BullJob } from "bullmq";
import { DataSource, Repository } from "typeorm";
import {
  Job,
  JobStatus,
  JobAttempt,
  JobLog,
  QueueSequence,
  RecurringJob,
  ChainService,
} from "@jobque/shared";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";

@Injectable()
export abstract class BaseProcessor {
  protected logger = new Logger(BaseProcessor.name);

  constructor(
    @InjectDataSource()
    protected readonly dataSource: DataSource,
    protected readonly chainService: ChainService,
  ) {}

  async execute(job: BullJob): Promise<void> {
    const jobRepo: Repository<Job> = this.dataSource.getRepository(Job);
    const JobAttemptRepo: Repository<JobAttempt> =
      this.dataSource.getRepository(JobAttempt);
    const logRepo = this.dataSource.getRepository(JobLog);
    const queueSeqRepo = this.dataSource.getRepository(QueueSequence);
    const recurringJobrepo = this.dataSource.getRepository(RecurringJob);

    const existingJob = await jobRepo.findOne({
      where: { id: job.data.jobId },
    });
    const isRecurring = !!job.opts.repeat;

    if (existingJob?.status === JobStatus.COMPLETED && !isRecurring) {
      this.logger.warn(`Job ${job.data.jobId} already completed. Skipping.`);
      return;
    }

    // sequence tracking

    let sequenceNumber = 0;

    if (!isRecurring) {
      let queSeq = await queueSeqRepo.findOne({
        where: { queueName: job.queueName },
      });
      if (!queSeq) {
        queSeq = queueSeqRepo.create({
          queueName: job.queueName,
          lastSequence: 0,
        });
      }
      queSeq.lastSequence += 1;
      sequenceNumber = queSeq.lastSequence;
      await queueSeqRepo.save(queSeq);

      // update job  entity
      await jobRepo.update(
        { id: job.data.jobId },
        { queueSequence: sequenceNumber },
      );
    } else if (isRecurring && job.data.recurringJobId) {
      // recurring job: use recurringJob.runcount
      const recurringJob = await recurringJobrepo.findOne({
        where: { id: job.data.recurringJobId },
      });
      if (recurringJob) {
        recurringJob.runCount += 1;
        sequenceNumber = recurringJob.runCount;
        await recurringJobrepo.save(recurringJob);
      }
    }
    this.logger.log(
      !isRecurring
        ? `Processing Job ${sequenceNumber} (${job.name}) in queue ${job.queueName} priority ${job.opts.priority}`
        : `Processing Recurring Job ${job.data.jobId} Run ${sequenceNumber} (${job.name}) `,
    );

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
      data: { attemptNumber: attempt.attemptNumber, sequenceNumber },
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
        {
          status: JobStatus.COMPLETED,
          completedAt: now,
          metadata: { ...job.data.metadata, result: job.data.result },
        },
      );

      // child jobs
      try {
        await this.chainService.triggerNextJobs(job.data.jobId);
        this.logger.log(`Triggered child jobs for ${job.data.jobId}`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `failed to trigger child jobs for ${job.data.jobId}`,
          err.stack,
        );
      }

      await logRepo.save({
        job: { id: job.data.jobId },
        message: "Job completed successfully",
        data: { attemptNumber: attempt.attemptNumber },
      });

      this.logger.log(
        !isRecurring
          ? `Job ${sequenceNumber} completed successfully`
          : `Recurring Job ${job.data.jobId} Run ${sequenceNumber} completed successfully`,
      );
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

      //  Handle failure strategy
      // Optionally, i can:
      // - Skip triggering dependent jobs (STRICT failure strategy)
      // - Or mark dependent jobs as FAILED/LENIENT
      // Example:
      await this.chainService.handleParentFailure(job.data.jobId);

      this.logger.error(`Job ${job.id} failed`, err.stack);

      throw error; // rethrow -> BullMQ retry/backoff
    }
  }

  protected abstract process(job: BullJob): Promise<void>;
}
