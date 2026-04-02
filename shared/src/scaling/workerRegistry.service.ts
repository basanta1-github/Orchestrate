import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Worker, Job as BullJob } from "bullmq";
// import { BaseProcessor } from "../../../workers/src/base-worker/base.processor";
// import { queue } from "sharp";

/**
 * WorkerRegistryService
 *
 * Owns all BullMQ instances. The autoscalar calls spawnworker/ terminateWorker;
 * this service handles the actual BullMQ lifecycle
 *
 * Each queue type has exactly one registered processor (set at bot by the respective
 * *Worker NestJS service). When the autoscalar asks for a new worker,
 * this service creates a second (or third..) BullMQ Worker pointing at the same queue with the same
 * processor --BullMQ handles fan-out automatically (multiple consumers on the same queue)
 *
 * Graceful shutdown:
 * terminateWorker() calls worker.close() which waits for the in-flight job to finish before removing
 * the worker from the pool. No jobs are dropped.
 */
@Injectable()
export class workerRegistryService implements OnModuleDestroy {
  private readonly logger = new Logger(workerRegistryService.name);

  /**
   * Map of queueName → list of active Worker instances.
   * Index 0 is the "base" worker started at boot; subsequent entries are
   * auto-scaled workers.
   */
  private workers: Map<string, Worker[]> = new Map();
  /**
   *                _____________
   *               |             |
   *               |  <->   <->  |
   *               |      |      |
   *               |   -------   |
   *               |_____________|
   * Map of queueName -> processor factory function.
   * Registered at boot by each *worker service (eg: mlworker, etlworker)
   */
  private processors: Map<string, () => (job: BullJob) => Promise<void>> =
    new Map();

  private readonly redisConnection = {
    host: process.env.REDIS_HOST || "redis",
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
  // registration called at module boot

  /**
   * called once per queue type at application startup. the processorFactory returns the function
   * BullMQ's worker will call for each job -- typically '(job)=> processor.execute(job)
   */
  registerProcessor(
    queueName: string,
    processorFactory: () => (job: BullJob) => Promise<void>,
  ): void {
    this.processors.set(queueName, processorFactory);
    this.logger.log(`Processor  registered for queue "${queueName}`);
  }
  // autoscaler api

  async spawnWorker(queueName: string): Promise<void> {
    const factory = this.processors.get(queueName);
    if (!factory) {
      this.logger.error(
        `Cannot spawn worker for "${queueName}" - no processor registered`,
      );
      return;
    }
    const worker = this.createWorker(queueName, factory());
    const existing = this.workers.get(queueName) ?? [];
    existing.push(worker);
    this.workers.set(queueName, existing);

    this.logger.log(
      `Spawned worker #${existing.length} for queue "${queueName}`,
    );
  }
  async terminateWorker(queueName: string): Promise<void> {
    const list = this.workers.get(queueName);
    if (!list || list.length === 0) {
      this.logger.warn(
        `terminateWorker called for "${queueName}" but no workers to remove`,
      );
      return;
    }
    // always remove the last worker (LIFO - keeps the oldest/warmest ones)
    const worker = list.pop()!;
    // graceful close: waits for current jobs (if any) to finish.
    await worker.close();

    this.logger.log(
      `Terminated one worker for "${queueName}" (${list.length} remaining)`,
    );
  }
  getWorkerCount(queueName: string): number {
    return this.workers.get(queueName)?.length ?? 0;
  }

  // lifecycles
  async onModuleDestroy(): Promise<void> {
    this.logger.log("shutting down all workers gracefully...");
    const closeAll: Promise<void>[] = [];

    for (const [, workerList] of this.workers) {
      for (const worker of workerList) {
        closeAll.push(worker.close());
      }
    }
    await Promise.all(closeAll);
    this.logger.log("All workers closed");
  }

  // private helpers
  private createWorker(
    queueName: string,
    processor: (job: BullJob) => Promise<void>,
  ): Worker {
    const worker = new Worker(queueName, processor, {
      connection: this.redisConnection,
      concurrency: 1,
      removeOnComplete: true as any,
      removeOnFail: false as any,
    });
    worker.on("active", (job) => {
      this.logger.log(
        `[${queueName}] COMPLETED BullJob=${job.id} DBJob=${job.data.jobId}`,
      );
    });
    worker.on("failed", (job, err) => {
      this.logger.error(
        `[${queueName}] FAILED BullJob=${job?.id} attempt=${job?.attemptsMade}`,
        err.stack,
      );
    });
    return worker;
  }
}
