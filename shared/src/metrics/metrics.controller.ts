import { Controller, Get, Res, Logger, Query } from "@nestjs/common";
import { Response } from "express";
import { MetricService } from "./metrics.service";
import { QueueMetricsCollector } from "./queue-metrics.collector";
import { WorkerHealthCollector } from "./worker-health.collector";
import { TenantMetricsCollector } from "./tenant-metrics.collector";
import { QueueReconcileCollector } from "./queueReconcileCollector";

/**
 * MetricsController
 *
 * Routes
 * GET /metrics         -- prometheus text exposition format (scrapped every 15s)
 * GET /metrics/health  - JSON health for load balancers
 * GEt /metrics/queues  - JSON snapshot of queue depths
 * GET /metrics/workers - JSON snapshot of worker counts + process stats
 * GET /metrics/tenants - JSON snapshot of per-tenant inflight/staged
 *
 * the /metrics endpoint must not be behind JWT auth - Prometheus has no token
 * Restict access in production via network policy or reverse-proxy allow-list
 */

@Controller("metrics")
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  constructor(
    private readonly metricService: MetricService,
    private readonly queueMetrics: QueueMetricsCollector,
    private readonly WorkerHealth: WorkerHealthCollector,
    private readonly tenantMetrics: TenantMetricsCollector,
    private readonly queueReconcileCollector: QueueReconcileCollector,
  ) {}

  /**
   * Primary prometheus scrape endpoint
   * content-type: text/plain; version=0.0.4 (required by prometheus spec)
   */

  @Get("")
  async getMetrics(@Res() res: Response): Promise<void> {
    try {
      const metrics = await this.metricService.getMetrics();
      res
        .status(200)
        .header("Content-Type", this.metricService.getContentType())
        .send(metrics);
    } catch (error) {
      this.logger.error("failed to collect metrics", error);
      res.status(500).send("# Error collecting metrics \n");
    }
  }

  /**
   * JSON health endpoint for load balancers and uptime monitors
   * Returns 200 when healthy, 503 when metrics collection fails
   */

  @Get("health")
  async health(@Res() res: Response): Promise<void> {
    try {
      await this.metricService.getMetrics(); // verify collection works
      res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor(process.uptime()),
        memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        pid: process.pid,
        node_version: process.version,
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * JSON snapshot of all queue depths - useful for dashboards and debugging
   * Example: SET /metrics/queues
   */
  @Get("queues")
  async queues(
    @Query("fresh") fresh: string,
    @Res() res: Response,
  ): Promise<void> {
    if (fresh === "true") {
      await this.queueMetrics.refreshNow();
    }
    const snapshot = await this.queueMetrics.getQueueSnapshot();
    res.status(200).json({
      timestamp: new Date().toISOString(),
      queues: snapshot,
    });
  }

  /**
   * JSON snapshot of all worker counts and process resource usuage
   * expample: GET /metrics/workers
   */

  @Get("workers")
  async workers(@Res() res: Response): Promise<void> {
    const snapShot = this.WorkerHealth.getWorkerSnapshot();
    res.status(200).json({
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime_seconds: Math.floor(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      workers: snapShot,
    });
  }
  /*
   * JSON snapshot of per-tenant inflight and staged job counts.
   * Example: GET /metrics/tenants
   */
  @Get("tenants")
  async tenants(
    @Query("fresh") fresh: string,

    @Res() res: Response,
  ): Promise<void> {
    if (fresh === "true") {
      await this.tenantMetrics.refreshNow();
    }
    const snapshot = await this.tenantMetrics.getTenantSnapShot();
    res.status(200).json({
      timestamp: new Date().toISOString(),
      tenants: snapshot,
    });
  }
  @Get("reconcile")
  async reconcile(
    @Query("fresh") fresh: string,
    @Res() res: Response,
  ): Promise<void> {
    if (fresh === "true") {
      await this.queueMetrics.refreshNow();
    }

    const queueSnapshot = await this.queueMetrics.getQueueSnapshot();
    const result: Record<string, any> = {};

    for (const [queueName, q] of Object.entries(queueSnapshot)) {
      const reconcile =
        await this.queueReconcileCollector.getQueueState(queueName);

      const waiting = q.waiting ?? 0;
      const active = q.active ?? 0;
      const delayed = q.delayed ?? 0;
      const prioritized = q.prioritized ?? 0;
      const dlq = q.dlq ?? 0;

      const inflightTotal = waiting + prioritized + delayed + active;
      const visibleInBullmq = inflightTotal;

      const completed = reconcile.terminal.completed ?? 0;
      const failed = reconcile.terminal.failed ?? 0;

      const staged = reconcile.pre_queue.staged ?? 0;
      const releasePending = reconcile.pre_queue.release_pending ?? 0;
      const submittedTotal = reconcile.totals.submitted_total ?? 0;

      const accountedForTotal =
        staged + releasePending + inflightTotal + completed + failed + dlq;

      const delta = submittedTotal - accountedForTotal;
      const unknown = Math.max(0, delta);
      const overcount = Math.max(0, -delta);
      const accountedWithUnknown = accountedForTotal + unknown;

      result[queueName] = {
        pre_queue: {
          staged,
          release_pending: releasePending,
        },
        inflight: {
          total: inflightTotal,
          states: {
            waiting,
            prioritized,
            delayed,
            active,
          },
        },
        terminal: {
          completed,
          failed,
          dlq,
        },
        derived: {
          visible_in_bullmq: visibleInBullmq,
        },
        checks: {
          submitted_total: submittedTotal,
          accounted_for_total: accountedForTotal,
          unknown: unknown,
          overcount: overcount,
          matches: delta === 0,
        },
      };
    }

    res.status(200).json({
      timestamp: new Date().toISOString(),
      queues: result,
    });
  }
}
