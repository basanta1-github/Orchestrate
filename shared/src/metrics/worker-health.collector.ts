import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { MetricService } from "./metrics.service";

/**
 * WorkerHealthCollector
 *
 * Emits a per-process liveness heartbeat and per-queue worker counts.
 *
 * CPU and memory are NOT collected here — they come from collectDefaultMetrics()
 * in MetricService and are auto-attributed per process via the
 * service/worker_type/instance default labels:
 *   - jobque_nodejs_process_resident_memory_bytes  (RSS)
 *   - jobque_nodejs_process_cpu_seconds_total      (CPU, via rate())
 *   - jobque_nodejs_nodejs_eventloop_lag_seconds   (saturation)
 *
 * Liveness model:
 *   - Primary signal = Prometheus `up` (the process stopped being scrapable).
 *   - Heartbeat = secondary app-level signal proving the event loop still runs
 *     the interval callback. One series per process; when the process dies its
 *     series goes stale automatically — no orphaned, forever-firing series.
 */

@Injectable()
export class WorkerHealthCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerHealthCollector.name);
  private readonly HEARTBEAT_INTERVAL_MS = 15_000;

  private heartbeatbeatHandle: NodeJS.Timeout | null = null;

  // Snapshot for /metrics/workers JSON endpoint
  private workerSnapshot: Record<string, number> = {};

  constructor(private readonly metricsService: MetricService) {}

  private getWorkerCountsCallback: (() => Record<string, number>) | null = null;
  private getWorkerCountCallback: ((queueName: string) => number) | null = null;

  setWorkerRegistryCallbacks(callbacks: {
    getAllWorkerCounts: () => Record<string, number>;
    getWorkerCount: (queueName: string) => number;
  }): void {
    this.getWorkerCountsCallback = callbacks.getAllWorkerCounts;
    this.getWorkerCountCallback = callbacks.getWorkerCount;
    this.logger.log("Worker registry callbacks registered");
  }

  onModuleInit(): void {
    this.heartbeatbeatHandle = setInterval(
      () => this.emitHeartbeat(),
      this.HEARTBEAT_INTERVAL_MS,
    );

    // Emit immediately
    this.emitHeartbeat();

    this.logger.log(
      `WorkerHealthCollector started - heartbeat every ${this.HEARTBEAT_INTERVAL_MS / 1000}s`,
    );
  }
  onModuleDestroy(): void {
    if (this.heartbeatbeatHandle) clearInterval(this.heartbeatbeatHandle);
  }
  private emitHeartbeat(): void {
    // single per-process liveness heartbeat (identify via default labels)
    this.metricsService.workerHeartbeat.set(Date.now() / 1000);

    const counts = this.getWorkerCountsCallback?.() ?? {};
    this.workerSnapshot = { ...counts };

    console.log("Worker registery snapshot:", counts);

    for (const [queueName, count] of Object.entries(counts)) {
      this.metricsService.workerCount.set({ queue: queueName }, count);
    }
  }

  // called by AutoScaler Service after spawning a worker
  onWorkerSpawned(queueName: string): void {
    const count = this.getWorkerCountCallback?.(queueName) ?? 0;
    this.metricsService.workerCount.set({ queue: queueName }, count);
  }

  // called by autoScalerService after terminating a worker

  onWorkerTerminated(queueName: string): void {
    const count = this.getWorkerCountCallback?.(queueName) ?? 0;
    this.metricsService.workerCount.set({ queue: queueName }, count);
  }

  getWorkerSnapshot(): Record<string, number> {
    return { ...this.workerSnapshot };
  }
}
