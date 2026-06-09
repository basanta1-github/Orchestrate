import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { Queue } from "bullmq";
import { MetricService } from "./metrics.service";

/**
 * QueueMetricsCollector
 *
 * two responsibilities:
 * 1. passive polling - runs every POLL_INTERVAL_MS, reads BullMQ queue sstate and updates depth /
 * active / delayed? DLQ gauges
 *
 * ACTIVE RECORDING: exposes named methods called by BaseProcessor,
 * AutoScalerService and BandPromoterService to record event as they happen (completions, faliures
 * retries, scale events, promotions )
 *
 * This separation means the /metrics endpoint always has a fresh data
 * (from polling) plus accurate event counts (from recording)
 */

@Injectable()
export class QueueMetricsCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsCollector.name);
  private readonly POLL_INTERVAL_MS = 10_000;
  private intervalHandle: NodeJS.Timeout | null = null;
  private queues: Map<string, Queue> = new Map();

  // cached DLQ handles - created once and reused ( no per poll connection churn)
  private dlqQueues: Map<string, Queue> = new Map();
  private readonly connection = {
    host: process.env.REDIS_HOST || "redis",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  };
  // only the designated owner polls depth. Default: the API process
  // (workers set WORKER_TYPE). override with AUEUE_DEPTH_POLLER=true

  private readonly isDepthPoller =
    process.env.QUEUE_DEPTH_POLLER === "true" ||
    process.env.WORKER_TYPE === undefined;

  // snapshot cache for /metrics/queues endpoint
  private queueSnapshot: Record<
    string,
    {
      waiting: number;
      active: number;
      delayed: number;
      dlq: number;
      prioritized: number;
    }
  > = {};

  constructor(private readonly metricsService: MetricService) {}

  setQueues(queues: Map<string, Queue>): void {
    this.queues = queues;
  }
  registerQueues(queues: Map<string, Queue>): void {
    this.queues = queues;
    this.logger.log(`register queues count = ${this.queues.size}`);
  }
  onModuleInit(): void {
    if (!this.isDepthPoller) {
      this.logger.log(
        "QueueMetricsCollector: depth polling disabled for this process " +
          "(event recording still active)",
      );
      return;
    }
    this.intervalHandle = setInterval(() => this.poll(), this.POLL_INTERVAL_MS);
    this.logger
      .log(`QueueMetricsCollector started - polling ${this.queues.size} queue(s) 
            every ${this.POLL_INTERVAL_MS / 1000}s`);
    // collect immediately on startup
    this.poll().catch((err) =>
      this.logger.error("initial queue poll failed", err),
    );
  }
  async onModuleDestroy(): Promise<void> {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    await Promise.all(
      [...this.dlqQueues.values()].map((q) => q.close().catch(() => undefined)),
    );
  }

  private getDlqQueue(queueName: string): Queue {
    let dlq = this.dlqQueues.get(queueName);
    if (!dlq) {
      dlq = new Queue(`${queueName}_DLQ`, { connection: this.connection });
      this.dlqQueues.set(queueName, dlq);
    }
    return dlq;
  }

  private async poll(): Promise<void> {
    for (const [queueName, queue] of this.queues.entries()) {
      try {
        const [waiting, active, delayed, prioritized] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getDelayedCount(),
          queue.getPrioritizedCount(),
        ]);

        this.metricsService.queueDepth.set(
          { queue: queueName, state: "waiting" },
          waiting,
        );
        this.metricsService.queueDepth.set(
          { queue: queueName, state: "active" },
          active,
        );
        this.metricsService.queueDepth.set(
          { queue: queueName, state: "delayed" },
          delayed,
        );
        this.metricsService.queueDepth.set(
          { queue: queueName, state: "prioritized" },
          prioritized,
        );

        this.metricsService.workerActiveJobs.set({ queue: queueName }, active);

        // dlq depth - queue may not exist on first run
        // dlq depth via a cached, reused Queue handle (no churn)
        let dlqCount = 0;
        try {
          const counts = await this.getDlqQueue(queueName).getJobCounts(
            "failed",
            "delayed",
            "waiting",
            "prioritized",
          );
          dlqCount =
            (counts.waiting ?? 0) +
            (counts.delayed ?? 0) +
            (counts.prioritized ?? 0) +
            (counts.failed ?? 0);
          this.metricsService.dlqDepth.set({ queue: queueName }, dlqCount);
        } catch (err) {
          this.logger.error(
            `DLQ depth read failed for "${queueName}"`,
            err instanceof Error ? err.message : String(err),
          );
        }
        this.queueSnapshot[queueName] = {
          waiting,
          active,
          delayed,
          prioritized,
          dlq: dlqCount,
        };
      } catch (err) {
        this.logger.error(
          `Poll failed for queue "${queueName}"`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }
  // recording methods

  recordJobCompleted(
    queueName: string,
    jobType: string,
    priority: string,
    durationSeconds: number,
    waitSeconds: number,
  ): void {
    this.metricsService.jobCompleted.inc({
      queue: queueName,
      job_type: jobType,
      priority,
    });
    this.metricsService.jobDuration.observe(
      {
        queue: queueName,
        job_type: jobType,
        status: "completed",
      },
      durationSeconds,
    );
    this.metricsService.jobWaitTime.observe(
      { queue: queueName, job_type: jobType },
      waitSeconds,
    );
  }
  recordJobFailed(
    queueName: string,
    jobType: string,
    priority: string,
    durationSeconds: number,
    reason: string = "unknown",
  ): void {
    this.metricsService.jobFailed.inc({
      queue: queueName,
      job_type: jobType,
      priority,
      reason,
    });
    this.metricsService.jobDuration.observe(
      { queue: queueName, job_type: jobType, status: "failed" },
      durationSeconds,
    );
  }

  recordJobRetry(queueName: string, jobType: string): void {
    this.metricsService.jobRetries.inc({ queue: queueName, job_type: jobType });
  }

  recordDlqMove(queueName: string, jobType: string): void {
    this.metricsService.dlqJobs.inc({ queue: queueName, job_type: jobType });
  }

  recordBandPromotion(queueName: string): void {
    this.metricsService.bandPromotions.inc({ queue: queueName });
  }

  recordScaleUp(queueName: string): void {
    this.metricsService.autoscalerScaleUp.inc({ queue: queueName });
  }

  recordScaleDown(queueName: string): void {
    this.metricsService.autoscalerScaleDown.inc({ queue: queueName });
  }

  async getQueueSnapshot(): Promise<
    Record<
      string,
      {
        waiting: number;
        active: number;
        delayed: number;
        prioritized: number;
        dlq: number;
      }
    >
  > {
    return { ...this.queueSnapshot };
  }

  async refreshNow(): Promise<void> {
    await this.poll();
  }
}
