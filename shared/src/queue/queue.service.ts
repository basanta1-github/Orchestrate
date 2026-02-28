import { Queue } from "bullmq";
import { JobQueuePayload } from "./job-queue.payload";
import { Injectable } from "@nestjs/common";

@Injectable()
export class QueueService {
  private reportQueue: Queue;
  private mediaQueue: Queue;
  private mlQueue: Queue;

  // private readonly DEFAULT_TIMEOUT = 3000;

  constructor() {
    // 🔍 DEBUG — THIS IS THE RIGHT PLACE
    console.log("RAW REDIS_PORT =", JSON.stringify(process.env.REDIS_PORT));
    console.log(
      "PARSED REDIS_PORT =",
      parseInt(process.env.REDIS_PORT ?? "6379", 10),
    );
    const connection = {
      host: process.env.REDIS_HOST || "redis",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    };
    this.reportQueue = new Queue("report-jobs", { connection });
    this.mediaQueue = new Queue("media-jobs", { connection });
    this.mlQueue = new Queue("ml-jobs", { connection });
  }
  // generic enque method
  async enqueue(payload: JobQueuePayload) {
    const queue = payload.jobType.startsWith("report")
      ? this.reportQueue
      : payload.jobType.startsWith("media")
        ? this.mediaQueue
        : this.mlQueue;

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
