
import { Queue } from 'bullmq';
import { JobQueuePayload } from './job-queue.payload';


export class QueueService {
  private queue: Queue;

  constructor() {
    this.queue = new Queue('jobs', {
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
      },
    });
  }

  async enqueue(payload: JobQueuePayload) {
    await this.queue.add(
      payload.jobType,
      payload,
      {
        priority: payload.priority,
        attempts: payload.retries,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: false,
        removeOnFail: false,
      }
    );
  }
}
