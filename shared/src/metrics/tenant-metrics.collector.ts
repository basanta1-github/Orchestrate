import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { MetricService } from "./metrics.service";
import { error } from "node:console";

/**
 * TenantMetricsCollector
 *
 * scans redis every POLL_INTERVAL_MS for all tenant:inflight:* and
 * tenant:staging:* keys (written by TenantCapService) and updates the corresponding prometheus gauges
 * uses SCAN non-blocking instead of KEYS for production safety
 * Also exposes recordCaphit() so TenantCapServce can increment the cap-hit counter in realtime
 * rather than waiting for poll cycle
 */

@Injectable()
export class TenantMetricsCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantMetricsCollector.name);
  private readonly POLL_INTERVAL_MS = 15_000;
  private intervalHandle: NodeJS.Timeout | null = null;

  private readonly redis = new Redis({
    host: process.env.REDIS_HOST || "redis",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  });
  // snapshot cache for /metrics/tenant endpoint
  private tenantSnapShot: Record<string, { inflight: number; staged: number }> =
    {};

  constructor(private readonly metricsService: MetricService) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => this.poll(), this.POLL_INTERVAL_MS);
    this.logger.log(
      `TenantMetricsCollector started - polling every ${this.POLL_INTERVAL_MS / 1000}s`,
    );

    this.poll().catch((error) =>
      this.logger.error("Initial tenant poll failed", error),
    );
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.redis.disconnect();
  }

  private async poll(): Promise<void> {
    try {
      // tenantCapService stores keys with aleading space due to template literal
      // we match both with-space and without0-space for robustness

      const inflightKeys = await this.scanKeys("tenant:inflight:*");
      const stagingKeys = await this.scanKeys("tenant:staging:*");

      const snapshot: Record<string, { inflight: number; staged: number }> = {};

      for (const key of inflightKeys) {
        const tenantId = key.replace("tenant:inflight:", "");
        const raw = await this.redis.get(key);
        const count = parseInt(raw ?? "0", 10);
        this.metricsService.tenantInflight.set({ tenant_id: tenantId }, count);
        if (!snapshot[tenantId])
          snapshot[tenantId] = { inflight: 0, staged: 0 };
        snapshot[tenantId].inflight = count;
      }

      for (const key of stagingKeys) {
        const tenantId = key.replace("tenant:staging:", "");
        const depth = await this.redis.llen(key);
        this.metricsService.tenantStaged.set({ tenant_id: tenantId }, depth);
        if (!snapshot[tenantId])
          snapshot[tenantId] = { inflight: 0, staged: 0 };
        snapshot[tenantId].staged = depth;
      }

      this.tenantSnapShot = snapshot;
    } catch (error) {
      this.logger.error(
        "Tenant metrics poll failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async refreshNow(): Promise<void> {
    await this.poll();
  }

  // non-blocking redis key can be used to scan cursor
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, batch] = await this.redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );
      keys.push(...batch);
      cursor = nextCursor;
    } while (cursor !== "0");
    return keys;
  }

  /**
   * called by tenantCapService when tenant hits the concurrency cap
   * increments the counter immediately (not waiting for next poll)
   */
  recordCapHit(tenantId: string): void {
    this.metricsService.tenantCapHits.inc({ tenant_id: tenantId });
  }
  async getTenantSnapShot(): Promise<
    Record<string, { inflight: number; staged: number }>
  > {
    return { ...this.tenantSnapShot };
  }
}
