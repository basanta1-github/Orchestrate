import { Queue, Worker, Job as BullJob, KeepJobs, QueueEvents } from "bullmq";
import { BaseProcessor } from "./base.processor";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";
import {
  TenantCapService,
  workerRegistryService,
  QueueReconcileCollector,
} from "@jobque/shared";

@Injectable()
export abstract class BaseWorker {
  protected queue!: Queue;
  protected worker!: Worker;
  protected queueEvents!: QueueEvents;
  protected logger = new Logger(BaseWorker.name);

  // redis client for rate limiting
  private redis = new Redis({
    host: process.env.REDIS_HOST || "redis",
    port: Number(process.env.REDIS_PORT || 6379),
  });

  // in-memory counter for jobs per minute
  // private jobTimeStamps: number[] = [];

  constructor(
    protected readonly queueName: string,
    protected readonly workerRegistery: workerRegistryService,
    protected readonly queueReconcileCollector: QueueReconcileCollector,
  ) {}

  // child classes must implement this to return thieir processor
  // protected abstract getProcessor(): BaseProcessor;

  protected async startWorker(processor: BaseProcessor) {
    const connection = {
      host: process.env.REDIS_HOST || "redis",
      port: Number(process.env.REDIS_PORT || 6379),
    };

    // queue (producer side)
    this.queue = new Queue(this.queueName, { connection });

    //worker (consumer side)
    // const processor = this.getProcessor();
    this.worker = new Worker(
      this.queueName,
      async (job: BullJob) => {
        if (!processor) {
          console.error("Processor is undefined! Did you pass it to super()?");
          throw new Error("Processor missing");
        }

        // rate limit checkusing redis
        // const redisKey = `jobs:${job.data.tenantId}:${Math.floor(Date.now() / 60000)}`;
        // const current = await this.redis.incr(redisKey);
        // if (current === 1) {
        //   await this.redis.expire(redisKey, 60); // set TTL of 1 minute
        // }
        // if (current > 5) {
        //   const errMsg = `Job ${job.id} rejected: maximum 5 jobs/minute reached for tenant ${job.data.tenantId}`;
        //   throw new Error(errMsg); // optional, to still trigger failed event
        // }
        // console.log("this.processor:", processor);
        // console.log("execute:", processor?.execute);
        this.logger.log(`Worker received job ${job.id}`);
        return processor.execute(job);
      },
      {
        connection,
        concurrency: 1,
        // remove it handeled by queue service
        // attempts: 5,
        // backoff: { type: "exponential", delay: 2000 },
        // cast to KeepJobs to satisfy TS
        removeOnComplete: true as unknown as KeepJobs,
        removeOnFail: false as unknown as KeepJobs,
      },
    );
    this.workerRegistery.registerExistingWorker(this.queueName, this.worker);

    this.queueEvents = new QueueEvents(this.queueName, { connection });
    // this.worker.on("active", (job) =>
    //   this.logger.log(
    //     `ACTIVE BullJob=${job.id} DBJob=${job.data.jobId} Queue=${job.queueName} PriorityLevel=${job.data.priorityLevel} BullPriority=${job.opts.priority}`,
    //   ),
    // );
    // this.worker.on("completed", (job) => {
    //   this.logger.log(
    //     `COMPLETED BullJob=${job.id} DBJob=${job.data.jobId} Queue=${job.queueName} PriorityLevel=${job.data.priorityLevel} BullPriority=${job.opts.priority}`,
    //   );
    // });
    this.worker.on("active", async (job) => {
      this.logger.log(
        `ACTIVE BullJob=${job.id} DBJob=${job.data.jobId} Queue=${job.queueName} PriorityLevel=${job.data.priorityLevel} BullPriority=${job.opts.priority}`,
      );

      // this.queueReconcileCollector.markActive(this.queueName);
    });
    this.worker.on("completed", async (job) => {
      if (!job) return;

      this.logger.log(
        `COMPLETED BullJob=${job.id} DBJob=${job.data.jobId} Queue=${job.queueName} PriorityLevel=${job.data.priorityLevel} BullPriority=${job.opts.priority}`,
      );

      // this.queueReconcileCollector.markCompleted(this.queueName);
    });

    this.worker.on("failed", async (job, err) => {
      if (!job) return;

      const maxAttempts = job.opts.attempts ?? 5;

      this.logger.error(
        `Job failed ${job.id} | attempt ${job.attemptsMade}/${maxAttempts}`,
        err.stack,
      );
      // this.queueReconcileCollector.markFailed(this.queueName);
      // final faliure move to DLQ
      if (job.attemptsMade >= maxAttempts) {
        const dlq = new Queue(`${this.queueName}_DLQ`, {
          connection: {
            host: process.env.REDIS_HOST,
            port: Number(process.env.REDIS_PORT),
          },
        });

        await dlq.add(job.name, job.data, {
          removeOnComplete: false,
          removeOnFail: false,
        });
        this.logger.error(`Job ${job.id} moved to DLQ`);
      }
    });

    this.worker.on("error", (err) => this.logger.error("Worker error", err));

    this.logger.log(`${this.queueName} worker initialized`);
  }
}
