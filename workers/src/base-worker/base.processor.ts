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
import { TenantCapService } from "@jobque/shared";

@Injectable()
export abstract class BaseProcessor {
  protected logger = new Logger(BaseProcessor.name);

  constructor(
    @InjectDataSource()
    protected readonly dataSource: DataSource,
    protected readonly chainService: ChainService,
    // inject so we can release the tenant slot when a job finishes
    protected readonly tenantCapService: TenantCapService,
  ) {}

  async execute(job: BullJob): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
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
    const isWorkflowJob = !!existingJob?.workFlowId;

    if (existingJob?.status === JobStatus.COMPLETED && !isRecurring) {
      this.logger.warn(`Job ${job.data.jobId} already completed. Skipping.`);
      // still release the slot even if we skipped - it was counted on enqueue
      await this.safeRelease(job.data.tenantId);
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
    // replace the multiline processing log with this
    this.logger.log(
      isRecurring
        ? `Processing recurring job ${job.data.jobId} run=${sequenceNumber} queue=${job.queueName}`
        : `Processing job ${job.data.jobId} queue=${job.queueName} priority=${job.data.priorityLevel}`,
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

      if (isWorkflowJob) {
        // child jobs
        try {
          await this.chainService.onJobCompleted(job.data.jobId);
          this.logger.log(
            `Scheduled next workflow step after ${job.data.jobId}`,
          );
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            `Failed workflow scheduling after ${job.data.jobId}`,
            err.stack,
          );
        }
      }

      this.logger.log(
        isWorkflowJob
          ? `Workflow job ${job.data.jobId} sequence ${sequenceNumber} completed (workflow=${existingJob?.workFlowId})`
          : isRecurring
            ? `Recurring job ${job.data.jobId} run ${sequenceNumber} completed`
            : `Job ${job.data.jobId} sequence ${sequenceNumber} completed`,
      );
      // release tenant slot on success
      await this.safeRelease(job.data.tenantId);
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
        // release tenant slot on finalfaliure
        await this.safeRelease(job.data.tenantId);
      }

      //  Handle failure strategy
      // Optionally, i can:
      // - Skip triggering dependent jobs (STRICT failure strategy)
      // - Or mark dependent jobs as FAILED/LENIENT
      // Example:

      // If NOT the final attempt we do NOT release — the job is still
      // in-flight (BullMQ will retry it). The slot stays occupied.
      await this.chainService.handleParentFailure(job.data.jobId);

      this.logger.error(`Job ${job.id} failed`, err.stack);

      throw error; // rethrow -> BullMQ retry/backoff
    }
    this.logger.log(`Job ${job.data.jobId} processed after 10s delay`);
  }
  /**
   * Release the tenant slot. Wrapped in try/catch so a Redis hiccup never
   * breaks job execution — worst case the counter drifts slightly and
   * self-corrects on the next job.
   */
  private async safeRelease(tenantId: string): Promise<void> {
    try {
      await this.tenantCapService.release(tenantId);
    } catch (err) {
      this.logger.error(
        `Failed to release tenant slot for ${tenantId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  protected abstract process(job: BullJob): Promise<void>;
}
