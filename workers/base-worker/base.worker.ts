import { Queue, Worker, Job, QueueEvents } from "bullmq";
import { BaseProcessor } from "./base.processor";
import { Logger } from "@nestjs/common";

export abstract class BaseWorker {
  protected queue: Queue;
  protected worker: Worker;
  protected queueEvents: QueueEvents;
  protected logger = new Logger(BaseWorker.name);

  constructor(
    protected readonly queueName: string,
    protected readonly processor: BaseProcessor,
  ) {
    const connection = {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    };

    // queue (producer side)
    this.queue = new Queue(queueName, { connection });

    //worker (consumer side)
    this.worker = new Worker(
      queueName,
      async (job: Job) => {
        return this.processor.execute(job);
      },
      { connection },
    );

    this.queueEvents = new QueueEvents(queueName, { connection });

    this.worker.on("completed", (job, err) => {
      this.logger.log(`Job completed: ${job.id}`);
    });

    this.worker.on("failed", (job, err) => {
      this.logger.error(
        `Job failed ${job?.id} | attempt ${job?.attemptsMade}/${job?.opts.attempts}`,
        err.stack,
      );
    });

    this.worker.on("error", (err) => this.logger.error("Worker error", err));
    this.worker.on("active", (job) => this.logger.log(`Job ${job.id} started`));
    this.worker.on("completed", (job) =>
      this.logger.log(`Job ${job.id} completed`),
    );
    // this.worker.on("failed", (job, err) =>
    //   this.logger.error(`Job ${job.id} failed`, err?.stack),
    // );

    this.logger.log(`${queueName} worker initialized`);
  }
}
