import { Queue } from "bullmq";
import { JobQueuePayload } from "./job-queue.payload";
import { Injectable } from "@nestjs/common";

@Injectable()
export class QueueService {
  private queue: Queue;

  constructor() {
    // 🔍 DEBUG — THIS IS THE RIGHT PLACE
    console.log("RAW REDIS_PORT =", JSON.stringify(process.env.REDIS_PORT));
    console.log(
      "PARSED REDIS_PORT =",
      parseInt(process.env.REDIS_PORT ?? "6379", 10),
    );

    this.queue = new Queue("jobs", {
      connection: {
        host: process.env.REDIS_HOST || "redis",
        port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
      },
    });
  }

  async enqueue(payload: JobQueuePayload) {
    await this.queue.add(payload.jobType, payload, {
      priority: payload.priority,
      attempts: payload.retries,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    });
  }
}
