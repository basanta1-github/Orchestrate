import { Queue } from "bullmq";
import { JobQueuePayload } from "./job-queue.payload";
import { Injectable } from "@nestjs/common";

@Injectable()
export class QueueService {
  private queues: Map<string, Queue>;

  // private readonly DEFAULT_TIMEOUT = 3000;

  constructor() {
    // 🔍 DEBUG — THIS IS THE RIGHT PLACE
    console.log("RAW REDIS_PORT =", JSON.stringify(process.env.REDIS_PORT));
    console.log(
      "PARSED REDIS_PORT =",
      parseInt(process.env.REDIS_PORT ?? "6379", 10),
    );
    const supportedQueues = [
      "email-jobs",
      "media-jobs",
      "report-jobs",
      "ml-jobs",
      "etl-jobs",
    ];
    const connection = {
      host: process.env.REDIS_HOST || "redis",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    };

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

    const returnedValue = queue.add(payload.jobType, payload, {
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
    });

    return returnedValue;
  }
}
