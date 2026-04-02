import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Redis } from "ioredis";
// import { QueueService, JobQueuePayload } from "@jobque/shared";
import { QueueService } from "../queue/queue.service";
import { JobQueuePayload } from "../queue/job-queue.payload";
import { JobStatus } from "../jobs";

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

  constructor(private readonly queueService: QueueService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || "redis",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    });
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
    const key = this.inflightKey(payload.tenantId);
    const current = await this.redis.incr(key);

    if (current <= this.MAX_CONCURRENT_PER_TENANT) {
      // slot available - go straigt to the queue
      await this.queueService.enqueue(payload);
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
  async release(tenantId: string): Promise<void> {
    const key = this.inflightKey(tenantId);

    // Decrement - floow at 0 to guard against double-release bugs
    const after = await this.redis.decr(key);
    if (after < 0) {
      await this.redis.set(key, 0);
    }
    await this.drainOne(tenantId);
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
  private async drainOne(tenantId: string): Promise<void> {
    const raw = await this.redis.lpop(this.stagingKey(tenantId));
    if (!raw) return;

    const payload: JobQueuePayload = JSON.parse(raw);

    //increment before enqueuing - this job now occupies a slot
    await this.redis.incr(this.inflightKey(tenantId));
    await this.queueService.enqueue(payload);

    this.logger.debug(
      `Tenant ${tenantId} | drained staged job ${payload.jobId} into queue`,
    );
  }
  private inflightKey(tenantId: string): string {
    return ` tenant:inflight:${tenantId}`;
  }
  private stagingKey(tenantId: string): string {
    return ` tenant:staging:${tenantId}`;
  }
}
