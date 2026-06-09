import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

/**
 * MetricsService
 *
 * single registery for every Prometheus metric in the system,
 * All collectors import this service and call its metric objects directly
 */

@Injectable()
export class MetricService implements OnModuleInit {
  private readonly logger = new Logger(MetricService.name);
  readonly registry = new Registry();

  //Queue depth
  readonly queueDepth = new Gauge({
    name: "jobque_queue_depth",
    help: "Number of jobs in each BullMQ queue by state",
    labelNames: ["queue", "state"] as const,
    registers: [this.registry],
  });

  // job counters
  readonly jobCompleted = new Counter({
    name: "jobque_jobs_completed_total",
    help: " Total jobs completed successfully",
    labelNames: ["queue", "job_type", "priority"] as const,
    registers: [this.registry],
  });

  readonly jobFailed = new Counter({
    name: "jobque_jobs_failed_total",
    help: "Total jobs that permanently failed (all retries exhausted)",
    labelNames: ["queue", "job_type", "priority", "reason"] as const,
    registers: [this.registry],
  });

  readonly jobRetries = new Counter({
    name: "jobque_job_retry_attempts_total",
    help: "Total jobs retry attempts",
    labelNames: ["queue", "job_type"] as const,
    registers: [this.registry],
  });
  readonly dlqJobs = new Counter({
    name: "jobque_dlq_jobs_total",
    help: "Total jobs moved to Dead Letter Queue",
    labelNames: ["queue", "job_type"] as const,
    registers: [this.registry],
  });

  readonly dlqDepth = new Gauge({
    name: "jobque_dlq_depth",
    help: "current number of jobs in each Dead Letter Queue",
    labelNames: ["queue"] as const,
    registers: [this.registry],
  });

  // processing time histograms
  readonly jobDuration = new Histogram({
    name: "jobque_job_duration_seconds",
    help: "End-to-end job processing time in seconds",
    labelNames: ["queue", "job_type", "status"] as const,
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    registers: [this.registry],
  });

  readonly jobWaitTime = new Histogram({
    name: "jobque_job_wait_seconds",
    help: "Time a job waited in queue before processing started",
    labelNames: ["queue", "job_type"] as const,
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600],
    registers: [this.registry],
  });

  // ── Worker health ──────────────────────────────────────────────────────────

  readonly workerCount = new Gauge({
    name: "jobque_worker_count",
    help: "Number of active BullMQ Worker instances per queue",
    labelNames: ["queue"] as const,
    registers: [this.registry],
  });

  /**
   * Per-process liveness heartbeat (gauge)- Unix epoch seconds of last check-in
   * one series per process; identity comes from service/worker_type/instance
   * default labels (set in onModuleInit). Primary liveness is Prometheus "up";
   * this is a secondary "Node evenbt loop is still running" signal.
   *
   * CPU and memorty are intentionally Not Defiuned here - they come free from
   * collectDefauleMetrics()
   *
   * jobque_nodejs_process_resident_memory_bytes (RSS, bytes)
   * jobque_nodejs_process_cpu_seconds_total (CPU, user rate())
   * jobque_nodejs_event_loop_lag_seconds (saturation)
   */

  readonly workerHeartbeat = new Gauge({
    name: "jobque_worker_heartbeat_timestamp",
    help: "Unix timestamp of last worker heartbeat (per process).",
    registers: [this.registry],
  });

  readonly workerActiveJobs = new Gauge({
    name: "jobque_worker_active_jobs",
    help: "Jobs currently being processed across all workers per queue",
    labelNames: ["queue"] as const,
    registers: [this.registry],
  });

  // ── Autoscaler ─────────────────────────────────────────────────────────────

  readonly autoscalerScaleUp = new Counter({
    name: "jobque_autoscaler_scale_up_total",
    help: "Total autoscaler scale-up events",
    labelNames: ["queue"] as const,
    registers: [this.registry],
  });

  readonly autoscalerScaleDown = new Counter({
    name: "jobque_autoscaler_scale_down_total",
    help: "Total autoscaler scale-down events",
    labelNames: ["queue"] as const,
    registers: [this.registry],
  });

  // ── Band promoter ──────────────────────────────────────────────────────────

  readonly bandPromotions = new Counter({
    name: "jobque_band_promotions_total",
    help: "Total jobs promoted from normal to high priority band",
    labelNames: ["queue"] as const,
    registers: [this.registry],
  });

  // ── Tenant isolation ───────────────────────────────────────────────────────

  readonly tenantInflight = new Gauge({
    name: "jobque_tenant_inflight_jobs",
    help: "Current in-flight job count per tenant",
    labelNames: ["tenant_id"] as const,
    registers: [this.registry],
  });

  readonly tenantStaged = new Gauge({
    name: "jobque_tenant_staged_jobs",
    help: "Jobs parked in staging area (cap exceeded) per tenant",
    labelNames: ["tenant_id"] as const,
    registers: [this.registry],
  });

  readonly tenantCapHits = new Counter({
    name: "jobque_tenant_cap_hit_total",
    help: "Total times a tenant hit the concurrency cap",
    labelNames: ["tenant_id"] as const,
    registers: [this.registry],
  });

  // ── HTTP ───────────────────────────────────────────────────────────────────

  readonly httpRequestDuration = new Histogram({
    name: "jobque_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"] as const,
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  readonly httpRequestsTotal = new Counter({
    name: "jobque_http_requests_total",
    help: "Total HTTP requests processed",
    labelNames: ["method", "route", "status_code"] as const,
    registers: [this.registry],
  });

  onModuleInit(): void {
    // identify labels applied to every metric in this registery - including the
    // default node.js process metrics: GC, event-loop log, CPU, memory
    // this makes eachh scraped process self-describiing
    // "instance" is intentionally not set here: Prometheus assigns it
    // from the scrape target address

    this.registry.setDefaultLabels({
      service:
        process.env.SERVICE_NAME ??
        (process.env.WORKER_TYPE ? "worker" : "api"),
      worker_type: process.env.WORKER_TYPE ?? "none",
    });

    // default node.js process Metrics: heap gc event-loop log, CPU, memory
    collectDefaultMetrics({
      register: this.registry,
      prefix: "jobque_nodejs_",
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
    });
    this.logger.log(
      `MetricsService ready — ${this.registry.getMetricsAsArray().length} metrics registered`,
    );
  }
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
  getContentType(): string {
    return this.registry.contentType;
  }
}
