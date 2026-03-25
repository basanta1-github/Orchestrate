import { JobsOptions, Queue, RepeatOptions } from "bullmq";
import { JobQueuePayload } from "./job-queue.payload";
import { Injectable, Logger } from "@nestjs/common";

const QUEUE_MAP: Record<string, string[]> = {
  // ml: ["text_summarization", "classification", "ocr"],
  media: ["video_transcode", "audio_transcode", "image_resize"],
  etl: ["etl-jobs"],
  ml: ["ml-jobs"],
  email: ["email-jobs"],
  report: ["report-jobs"],
};

@Injectable()
export class QueueService {
  private queues: Map<string, Queue>;
  private readonly logger = new Logger(QueueService.name);
  private readonly priorityMap: Record<string, number> = {
    HIGH: 1,
    MEDIUM: 2,
    LOW: 10,
    NONE: 20,
  };

  constructor() {
    const connection = {
      host: process.env.REDIS_HOST || "redis",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    };
    this.queues = new Map(
      Object.keys(QUEUE_MAP).map((queueName) => [
        queueName,
        new Queue(queueName, { connection }),
      ]),
    );
  }

  // determine which main queue a job type belongs to

  private getQueueName(jobType: string): string | undefined {
    return Object.entries(QUEUE_MAP).find(([_, types]) =>
      types.includes(jobType),
    )?.[0];
  }
  // generic enque method
  async enqueue(payload: JobQueuePayload) {
    const queueName = this.getQueueName(payload.jobType);

    if (!queueName)
      throw new Error(`no queue found for this jobtype "${payload.jobType}"`);
    const queue = this.queues.get(queueName);

    if (!queue)
      throw new Error(`no queue found for this jobtype "${payload.jobType}"`);
    const options: JobsOptions = {
      attempts: payload.retries,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      priority: this.priorityMap[payload.priorityLevel ?? "NONE"],
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
      } as RepeatOptions;
    } else {
      if (payload.delayMs && payload.delayMs > 0) {
        options.delay = payload.delayMs;
      }
      options.jobId = payload.idempotencyKey ?? payload.jobId;
    }

    this.logger.log(`Enqueuing "${payload.jobType}" in "${queueName}" queue`);
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
    const queueName = this.getQueueName(jobType);
    if (!queueName) throw new Error(`No queue found for job type "${jobType}"`);

    const queue = this.queues.get(queueName);
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
