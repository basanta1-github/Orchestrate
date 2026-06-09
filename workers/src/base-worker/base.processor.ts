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
  QueueMetricsCollector,
  TenantCapService,
  QueueReconcileCollector,
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
    // inject so we can release the tenant slot when a job finishes
    protected readonly tenantCapService: TenantCapService,
    protected readonly queueMetrics: QueueMetricsCollector,
    protected readonly queueReconcileCollector: QueueReconcileCollector,
  ) {}

  async execute(job: BullJob): Promise<void> {
    // // DEMO ONLY: artificially slow down each job so you can visually observe
    // // band promotion, autoscaling, tenant-cap staging, etc.
    // // Set JOB_DEMO_DELAY_MS in the worker's .env (e.g. 10000 for 10s).
    // // Leave it unset / 0 in production.
    // const demoDelayMs = parseInt(process.env.JOB_DEMO_DELAY_MS ?? "0", 10);
    const demoDelayMs = 10000;
    if (demoDelayMs > 0) {
      this.logger.warn(
        `DEMO delay: holding job ${job.data.jobId} for ${demoDelayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, demoDelayMs));
    }
    // await new Promise((resolve) => setTimeout(resolve, 10_000));
    const jobRepo: Repository<Job> = this.dataSource.getRepository(Job);
    const JobAttemptRepo: Repository<JobAttempt> =
      this.dataSource.getRepository(JobAttempt);
    const logRepo = this.dataSource.getRepository(JobLog);
    const queueSeqRepo = this.dataSource.getRepository(QueueSequence);
    const recurringJobrepo = this.dataSource.getRepository(RecurringJob);

    const queueName = job.queueName;
    const tenantId = job.data.tenantId;

    let jobSucceded = false;

    //timing for metrics - measure from moment execute() is called
    const executeStart = Date.now();
    // wait time - elapsed since bullmQ created the job (job.timestamp is ms epoch)
    const waitSeconds = (Date.now() - job.timestamp) / 1000;

    const existingJob = await jobRepo.findOne({
      where: { id: job.data.jobId },
    });
    const isRecurring = !!job.opts.repeat;
    const isWorkflowJob = !!existingJob?.workFlowId;
    const jobType = job.data.jobType ?? job.name;
    const priority = job.data.priorityLevel ?? "NONE";

    if (existingJob?.status === JobStatus.COMPLETED && !isRecurring) {
      this.logger.warn(`Job ${job.data.jobId} already completed. Skipping.`);

      try {
        await this.tenantCapService.release(job.data.tenantId, job.queueName);
      } catch (err) {
        this.logger.error(
          `Failed to release tenant slot for skipped completed job ${job.data.jobId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }

      return;
    }

    // record retry if this is not the first attempt
    if (job.attemptsMade > 0) {
      this.queueMetrics.recordJobRetry(job.queueName, jobType);
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
      jobSucceded = true;
      const now = new Date();
      const durationSeconds = (Date.now() - executeStart) / 1000;

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

      //record successful completion with timing
      this.queueMetrics.recordJobCompleted(
        job.queueName,
        jobType,
        priority,
        durationSeconds,
        waitSeconds,
      );
      // release tenant slot on success
      // await this.safeRelease(job.data.tenantId, job.queueName);
      await this.queueReconcileCollector.incrementCompleted(queueName);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const now = new Date();
      const durationSeconds = (Date.now() - executeStart) / 100;

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
      const isFinalFailure = job.attemptsMade + 1 >= maxAttempts;

      if (isFinalFailure) {
        await jobRepo.update(
          { id: job.data.jobId },
          { status: JobStatus.FAILED, completedAt: now },
        );
        const reason = this.classifyFailure(err);

        this.queueMetrics.recordJobFailed(
          job.queueName,
          jobType,
          priority,
          durationSeconds,
          reason,
        );

        /**
         * IMPORTANT:
         * Pick ONE terminal accounting model:
         *
         * MODEL A:
         * - increment failed here
         * - do NOT also count same job in dlq bucket
         *
         * MODEL B:
         * - do NOT increment failed here
         * - count it only when worker moves it to DLQ
         *
         * If your desired output uses dlq as separate bucket for final failed jobs,
         * then COMMENT OUT the next line.
         */
        await this.queueReconcileCollector.incrementFailed(queueName);
      }

      await this.chainService.handleParentFailure(job.data.jobId);

      this.logger.error(
        `Job ${job.id} failed attempt ${job.attemptsMade + 1}`,
        err.stack,
      );

      throw error;
    } finally {
      const maxAttempts = job.opts.attempts ?? 5;
      const isFinalFailure =
        !jobSucceded && job.attemptsMade + 1 >= maxAttempts;

      /**
       * Release only on:
       * - success
       * - final failure
       *
       * Do NOT release on retry.
       */
      if (jobSucceded || isFinalFailure) {
        try {
          await this.tenantCapService.release(tenantId, queueName);
        } catch (releaseErr) {
          this.logger.error(
            `Failed to release tenant slot for ${tenantId} after processing job ${job.data.jobId}`,
            releaseErr instanceof Error ? releaseErr.stack : String(releaseErr),
          );
        }
      } else {
        this.logger.debug(
          `Job ${job.data.jobId} attempt ${job.attemptsMade + 1} failed, will retry — tenant slot retained for ${tenantId}`,
        );
      }

      // this.logger.log(`Job ${job.data.jobId} processed after 10s delay`);
      this.logger.log(`Job ${job.data.jobId} processed`);
    }
  }

  /**
   * Classify the failure reason for metrics reporting.
   * maps on arbitary error to a SMALL, bounded set of reasons so the
   * 'reason' label on jobque_jobs_failed_total never explodes cardinality
   */
  private classifyFailure(err: Error): string {
    const msg = `${err.name} ${err.message}`.toLowerCase();
    if (msg.includes("timeout") || msg.includes("etimedout")) return "timeout";
    if (
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("network") ||
      msg.includes("socket")
    )
      return "downstream";
    if (msg.includes("validation") || msg.includes("invalid"))
      return "validation";
    return "unknown";
  }

  /**
   * Release the tenant slot. Wrapped in try/catch so a Redis hiccup never
   * breaks job execution — worst case the counter drifts slightly and
   * self-corrects on the next job.
   */
  protected abstract process(job: BullJob): Promise<void>;
}
