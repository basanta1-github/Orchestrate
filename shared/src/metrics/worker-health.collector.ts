import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { MetricService } from "./metrics.service";
import { workerRegistryService } from "../scaling";

/**
 * WorkerHealthController
 *
 * tracks process-level health metrics and emits a periodic heartbeat.
 *
 * heartBeat alert rule (in alerts.yml):
 * time() - jobque_worker_heartbeat_timestamp > 60 -> WorkerHeartbeatMissing
 *
 * CPU is measured as delta between two samples using process.cpuUsage(),
 * which gives user + system micorseconds consumed in that interval.
 * dividing by elapsed wall-clock microseconds gives a 0-100% percentage
 */

@Injectable()
export class WorkerHealthCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerHealthCollector.name);
  private readonly HEARTBEAT_INTERVAL_MS = 15_000;
  private readonly HEALTH_SAMPLE_INTERVAL_MS = 30_000;

  private heartbeatbeatHandle: NodeJS.Timeout | null = null;
  private healthHandle: NodeJS.Timeout | null = null;

  // CPU baseline for delta calculation

  private prevCpuUsuage = process.cpuUsage();
  private prevHrTime = process.hrtime.bigint();

  // Snapshot for /metrics/workers JSON endpoint
  private workerSnapshot: Record<string, number> = {};

  constructor(
    private readonly metricsService: MetricService,
    // private readonly workerRegistry: workerRegistryService,
  ) {}

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
    this.healthHandle = setInterval(
      () => this.sampleHealth(),
      this.HEALTH_SAMPLE_INTERVAL_MS,
    );

    // Emit immediately
    this.emitHeartbeat();
    this.sampleHealth();

    this.logger.log(
      `WorkerHealthCollector started - heartbeat every ${this.HEARTBEAT_INTERVAL_MS / 1000}s`,
    );
  }
  onModuleDestroy(): void {
    if (this.heartbeatbeatHandle) clearInterval(this.heartbeatbeatHandle);
    if (this.healthHandle) clearInterval(this.healthHandle);
  }
  private emitHeartbeat(): void {
    const nowSeconds = Date.now() / 1000;
    const pid = String(process.pid);

    const counts = this.getWorkerCountsCallback?.() ?? {};
    this.workerSnapshot = { ...counts };

    console.log("WOrker registery snapshot:", counts);

    for (const [queueName, count] of Object.entries(counts)) {
      this.metricsService.workerHeartbeat.set(
        { queue: queueName, pid },
        nowSeconds,
      );
      this.metricsService.workerCount.set({ queue: queueName }, count);
    }
  }
  private sampleHealth(): void {
    const pid = String(process.pid);
    const memUsage = process.memoryUsage();

    // RSS in megabytes
    const rssMb = memUsage.rss / 1024 / 1024;
    this.metricsService.workerMemory.set({ pid }, rssMb);

    // cpu delta since last sample
    const currentCpu = process.cpuUsage(this.prevCpuUsuage);
    const currentHrTime = process.hrtime.bigint();
    const elapsedNs = Number(currentHrTime - this.prevHrTime);
    const elapsedUs = elapsedNs / 1000;
    const cpuPercent =
      elapsedUs > 0
        ? Math.min(
            ((currentCpu.user + currentCpu.system) / elapsedUs) * 100,
            100,
          )
        : 0;

    this.metricsService.workerCpu.set({ pid }, cpuPercent);

    // reset baseline
    this.prevCpuUsuage = process.cpuUsage();
    this.prevHrTime = process.hrtime.bigint();

    this.logger.log(
      `Health - PID= ${pid} RSS = ${rssMb.toFixed(1)}MB CPU=${cpuPercent.toFixed(1)}%`,
    );
  }

  // called by AutoScaler Service after spawning a worker
  onWorkerSpawned(queueName: string): void {
    // const count = this.workerRegistry.getWorkerCount(queueName);
    const count = this.getWorkerCountCallback?.(queueName) ?? 0;
    this.metricsService.workerCount.set({ queue: queueName }, count);
  }

  // called by autoScalerService after terminating a worker

  onWorkerTerminated(queueName: string): void {
    // const count = this.workerRegistry.getWorkerCount(queueName);
    const count = this.getWorkerCountCallback?.(queueName) ?? 0;
    this.metricsService.workerCount.set({ queue: queueName }, count);
  }

  getWorkerSnapshot(): Record<string, number> {
    return { ...this.workerSnapshot };
  }
}
