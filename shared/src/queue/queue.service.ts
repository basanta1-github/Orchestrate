import { JobsOptions, Queue } from "bullmq";
import { JobQueuePayload } from "./job-queue.payload";
import { Injectable, Logger } from "@nestjs/common";
import { RecurringJob } from "../database/entities/recurring-jobs.entity";
import { Repository } from "typeorm";

@Injectable()
export class QueueService {
  private queues: Map<string, Queue>;

  // private readonly DEFAULT_TIMEOUT = 3000;

  constructor() {
    const connection = {
      host: process.env.REDIS_HOST || "redis",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    };
    const supportedQueues = [
      "email-jobs",
      "media-jobs",
      "report-jobs",
      "ml-jobs",
      "etl-jobs",
    ];

    this.queues = new Map(
      supportedQueues.map((name) => [name, new Queue(name, { connection })]),
    );
  }
  // generic enque method
  async enqueue(payload: JobQueuePayload) {
    const queue = this.queues.get(payload.jobType);

    if (!queue) {
      throw new Error(`Queue for job type "${payload.jobType}" not found`);
    }

    const options: JobsOptions = {
      priority: payload.priority,
      attempts: payload.retries,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      // timeout: this.DEFAULT_TIMEOUT,
      removeOnComplete: false,
      removeOnFail: false,
      // BullMQ does not officially support `timeout` in TS,
      // but runtime will still enforce it if you want:
      // You can handle timeout in the processor instead
    };

    // recurring jobs and delayed jobs
    if (payload.cron) {
      options.repeat = {
        pattern: payload.cron,
        jobId: payload.recurringJobId,
      };
    } else {
      if (payload.delayMs && payload.delayMs > 0) {
        options.delay = payload.delayMs;
      }
      options.jobId = payload.idempotencyKey ?? payload.jobId;
    }

    return queue.add(payload.jobType, payload, options);
  }
  /** List all recurring jobs in a queue */
  async listRecurringJobs(jobType: string) {
    const queue = this.queues.get(jobType);
    if (!queue) throw new Error(`Queue for job type "${jobType}" not found`);

    const schedulers = await queue.getJobSchedulers();

    Logger.log(`Found ${schedulers.length} recurring jobs for ${jobType}`);
    return schedulers;
  }

  /** Remove a recurring job by its cron pattern and optional jobId */
  async stopRecurringJob(jobType: string, cronPattern: string, jobId?: string) {
    const queue = this.queues.get(jobType);
    if (!queue) throw new Error(`Queue for job type "${jobType}" not found`);

    const repeatables = await queue.getRepeatableJobs(0, 100, true);

    // find the matching job
    const jobToRemove = repeatables.find((r) => r.name === jobType);

    if (!jobToRemove) {
      Logger.warn(
        `Recurring job not found for ${jobType} / pattern: ${cronPattern}`,
      );
      return { message: `Recurring job not found` };
    }

    // ⚡ remove by key (non-deprecated)
    await queue.removeRepeatableByKey(jobToRemove.key);

    Logger.log(`Recurring job stopped: ${jobType} / ${cronPattern}`);
    return { message: `Recurring job stopped: ${jobType} / ${cronPattern}` };
  }
}
