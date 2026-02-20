import { Queue, Worker, Job as BullJob, KeepJobs, QueueEvents } from "bullmq";
import { BaseProcessor } from "./base.processor";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

@Injectable()
export abstract class BaseWorker {
  protected queue!: Queue;
  protected worker!: Worker;
  protected queueEvents!: QueueEvents;
  protected logger = new Logger(BaseWorker.name);

  constructor(
    protected readonly queueName: string,
    // protected readonly processor: BaseProcessor,
  ) {}

  // child classes must implement this to return thieir processor
  // protected abstract getProcessor(): BaseProcessor;

  protected async startWorker(processor: BaseProcessor) {
    const connection = {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    };

    // queue (producer side)
    this.queue = new Queue(this.queueName, { connection });

    //worker (consumer side)
    // const processor = this.getProcessor();
    this.worker = new Worker(
      this.queueName,
      async (job: BullJob) => {
        // console.log("Inside worker callback");
        if (!processor) {
          console.error("Processor is undefined! Did you pass it to super()?");
          throw new Error("Processor missing");
        }
        // console.log("this.processor:", processor);
        // console.log("execute:", processor?.execute);
        return processor.execute(job);
      },
      {
        connection,
        concurrency: 3,
        // remove it handeled by que service
        // attempts: 5,
        // backoff: { type: "exponential", delay: 2000 },
        // cast to KeepJobs to satisfy TS
        removeOnComplete: true as unknown as KeepJobs,
        removeOnFail: false as unknown as KeepJobs,
      },
    );

    this.queueEvents = new QueueEvents(this.queueName, { connection });
    this.worker.on("active", (job) => this.logger.log(`Job ${job.id} started`));
    this.worker.on("completed", (job, err) => {
      this.logger.log(`Job completed: ${job.id}`);
    });

    this.worker.on("failed", async (job, err) => {
      if (!job) return;

      const maxAttempts = job.opts.attempts ?? 5;

      this.logger.error(
        `Job failed ${job.id} | attempt ${job.attemptsMade}/${maxAttempts}`,
        err.stack,
      );

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
