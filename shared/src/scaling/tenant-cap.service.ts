import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Redis } from "ioredis";
import { QueueService } from "../queue/queue.service";
import { JobQueuePayload } from "../queue/job-queue.payload";
import { JobStatus } from "../jobs";
import { QueueReconcileCollector } from "../metrics/queueReconcileCollector";
import { QUEUE_EVENT_SUFFIX } from "bullmq";

/**
 * Tenant cap service
 *
 * Responsibilities
 * 1. enforce per-tenant concurrency cap before a jjob enters the queue
 * 2. if cap is exceeded, park the job in redis liist (staging area)
 * 3. when a job finishes (worker calls release()), drain one staged job
 * back into the queue so throughout stays maximal
 * 4. expose metrics (current in-flight count, staging depth) for the
 * autocaller and dashboards
 *
 * redis key schema
 * tenant:inflight:<tenantId>         INCR/DECR counter
 * tenant:staging:<tenantId>          RPUSH/LPDP list of serialised payloads
 *
 */

@Injectable()
export class TenantCapService implements OnModuleInit {
  private readonly logger = new Logger(TenantCapService.name);

  // how many jobs a single tenant may havve in-flight at once.
  // Tune this value per your SLA - start conservative.

  private readonly MAX_CONCURRENT_PER_TENANT = 5; // 20
  private readonly redis: Redis;

  private recordCapHit: ((tenantId: string) => void) | null = null;

  constructor(
    private readonly queueService: QueueService,
    private readonly queueReconcileCollector: QueueReconcileCollector,
  ) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || "redis",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    });
  }

  setMetricsCallback(cb: (tenantId: string) => void): void {
    this.recordCapHit = cb;
  }
  onModuleInit() {
    this.logger.log(
      `TenantCapService ready - max ${this.MAX_CONCURRENT_PER_TENANT} concurrent jobs per tenant`,
    );
  }

  //   PUBLIC API

  /**
   * called by JobService instead of QueueService.enqueue() directly,
   *
   * decision tree:
   * in-flight < cap -> increment counter, enqueue immediately, return "queued"
   * in-flight >= -> push to staging list, return "staged"
   *
   */
  async submitJob(
    payload: JobQueuePayload,
  ): Promise<{ status: JobStatus.QUEUED | JobStatus.STAGED }> {
    await this.queueReconcileCollector.incrementSubmitted(payload.queueName);
    const key = this.inflightKey(payload.tenantId);
    const current = await this.redis.incr(key);

    /**
     * inflight = jobs admitted against tenant concurrency capacity
     * and not yet released.
     *
     * This is NOT the same as BullMQ "active".
     * It may include jobs that are queued, delayed, retrying,
     * or otherwise still occupying tenant capacity.
     */

    if (current === 1) {
      await this.redis.expire(key, 60); // safety TTL
    }

    this.logger.warn(
      `DEBUG inflight BEFORE decision = ${current} for tenant ${payload.tenantId}`,
    );

    if (current <= this.MAX_CONCURRENT_PER_TENANT) {
      // slot available - go straigt to the queue
      await this.queueService.enqueue(payload);
      // this.queueReconcileCollector.incrementInflight(payload.queueName);
      this.logger.debug(
        `Tenant ${payload.tenantId} | in-flight=${current} | job ${payload.jobId} queued directly`,
      );

      return { status: JobStatus.QUEUED };
    }
    // cap exceeded - undo the premature increment and stage the job
    await this.redis.decr(key);
    await this.redis.rpush(
      this.stagingKey(payload.tenantId),
      JSON.stringify(payload),
    );
    // aggregate reconcile counters
    await this.queueReconcileCollector.incrementStaged(payload.queueName);

    if (this.recordCapHit) {
      this.recordCapHit(payload.tenantId);
    }
    const depth = await this.redis.llen(this.stagingKey(payload.tenantId));
    this.logger.warn(
      `Tenant ${payload.tenantId} | cap hit(max=${this.MAX_CONCURRENT_PER_TENANT}) | job ${payload.jobId} staged (staging depth=${depth})`,
    );
    return { status: JobStatus.STAGED };
  }
  /**
   * called by BaseProcessor when a job finishes (success or final faliure).
   *
   * Decrements the in-flight counter for the tenant and immediately drains
   * one staged job back into the queue if one exists.
   */
  async release(tenantId: string, queueName: string): Promise<void> {
    const key = this.inflightKey(tenantId);

    // Decrement - floow at 0 to guard against double-release bugs
    const after = await this.redis.decr(key);
    if (after < 0) {
      this.logger.warn(
        `Inflight counter went negative (${after}) for tenant ${tenantId} — resetting to 0`,
      );
      await this.redis.set(key, 0);
      return; // Don't drain if counter was already corrupt
    }
    // reconcile counters
    // this.queueReconcileCollector.decrementInflight(queueName);
    await this.drainOne(tenantId, queueName);
  }
  /**
   * Returns current in-flight count and staging depth for a tenant
   * useful for dashboards and autoscaler decisions.
   */
  async getTenantMetrics(
    tenantId: string,
  ): Promise<{ inflight: number; staged: number }> {
    const [inflightRaw, staged] = await Promise.all([
      this.redis.get(this.inflightKey(tenantId)),
      this.redis.llen(this.stagingKey(tenantId)),
    ]);
    return {
      inflight: parseInt(inflightRaw ?? "0", 10),
      staged,
    };
  }
  // private helpers
  /**
   * pep one payload from the tenant's staging list and enqueue it.
   * no-op if staging is empty
   */
  private async drainOne(tenantId: string, queueName: string): Promise<void> {
    const raw = await this.redis.lpop(this.stagingKey(tenantId));
    if (!raw) return;

    const payload: JobQueuePayload = JSON.parse(raw);
    const resolvedQueue = payload.queueName;
    await this.queueReconcileCollector.decrementStaged(resolvedQueue);
    await this.queueReconcileCollector.incrementReleasePending(resolvedQueue);
    try {
      await this.queueService.enqueue(payload);
      await this.redis.incr(this.inflightKey(tenantId));

      // aggregate reconcile counters
      await this.queueReconcileCollector.decrementReleasePending(resolvedQueue);

      this.logger.debug(
        `Tenant ${tenantId} | drained staged job ${payload.jobId} into queue`,
      );
    } catch (err) {
      // put it back at the front so the next release() retries it
      await this.redis.lpush(this.stagingKey(tenantId), raw);

      await this.queueReconcileCollector.decrementReleasePending(resolvedQueue);
      await this.queueReconcileCollector.incrementStaged(resolvedQueue);

      this.logger.error(
        `Tenant ${tenantId} | failed to drain staged job ${payload.jobId} — returned to staging`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  private inflightKey(tenantId: string): string {
    return `tenant:inflight:${tenantId}`;
  }
  private stagingKey(tenantId: string): string {
    return `tenant:staging:${tenantId}`;
  }

  async getStagedJobs(tenantId: string): Promise<any[]> {
    const rawJobs = await this.redis.lrange(this.stagingKey(tenantId), 0, -1);
    return rawJobs.map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return { raw, error: "failed to parse" };
      }
    });
  }
}
