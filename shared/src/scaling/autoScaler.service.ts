import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";

/**
 *
 * Autto scaler service
 *
 * watches queue depth and dynamically adjust the number of active workers
 *
 * Rules (all tunable via env vars or constants below):
 * -- min workers: workers always running(base load, always-on).
 * -- scale up when depth > scale_up_threshold -> add one worker
 * -- scale down when depth < SCALE_DOWN_THRESHHOLD -> remove one worker
 * -- max workers hard ceiling - never exceed regardless of depth
 * --cooldown MIN_COOLDOWN_MS must pass betn any two scaling events to prevent flapping.
 *
 * Local mode(Docker compose):
 *
 * spawnWorker() / terminateWorker() call the worker registery with holds
 * BullmQ worker instants in memory. perfectly fine for a single process or multi process Docker Compose Setup.
 *
 * Kubernetes mode:
 * Replace spawnWorker / terminateWorker with a call to:
 * kubectl scale deplyment <worker-deployment> -- replicas=<n>
 * pr use @Kubernetics/client-node to patch the deployment direcyly
 * the rest of the file does not change
 *
 * When you move to Kubernetes: the only change is inside WorkerRegistryService.spawnWorker()
 *  — replace the in-memory new Worker(...) call with a kubectl scale or Kubernetes client API call.
 * The autoscaler, cap service, and promoter don't change at all.
 *
 * Note: this service doesnot directly create worker instances. It delegates to
 *  workerRegisteryService  so that worker lifecycle (startup, shutdown, graceful drain) is
 * encapsulated in one place
 */

@Injectable()
export class AutoScalerService implements OnModuleInit {
  private readonly logger = new Logger(AutoScalerService.name);

  // tuning constants

  // workers that are always running regardless of queue depth
  private readonly MIN_WORKERS = 1; //2

  // hard ceiling - no queue may ahve more than this many workers
  private readonly MAX_WORKERS = 50;

  //add a worker when any queue exceeds its depth
  private readonly SCALE_UP_THRESHOLD = 1; // 500

  // remove a worker when all queues drop below this depth
  private readonly SCALE_DOWN_THRESHOLD = 0; //50

  // mionimum ms between scale events (prevents flaping)
  private readonly MIN_COOLDOWN_MS = 2_000; // 30_000

  // how often to check queue depths
  private readonly POLL_INTERVAL_MS = 5000; //10_000

  // state
  private queues: Map<string, Queue> = new Map();

  /**
   * current logical worker count per queue name
   * start at MIN_WORKERS; the WorkerRegistery own actual instances.
   */

  private workerCounts: Map<string, number> = new Map();

  // timestamp of the last scale event per queue (for cooldown)
  private lastScaleAt: Map<string, number> = new Map();

  private intervalHandle: NodeJS.Timeout | null = null;

  /**
   * Injected by the module- provides spawnWorker / terminateWorker.
   * we accept it as a plan bject so there is no circular dep
   */

  private workerRegistery: {
    spawnWorker: (queueName: string) => Promise<void>;
    terminateWorker: (queueName: string) => Promise<void>;
    getWorkerCount: (queueName: string) => number;
  } | null = null;

  // detup
  setWorkerregistery(registry: {
    spawnWorker: (queueName: string) => Promise<void>;
    terminateWorker: (queueName: string) => Promise<void>;
    getWorkerCount: (queueName: string) => number;
  }): void {
    this.workerRegistery = registry;
  }
  registerQueues(queues: Map<string, Queue>): void {
    this.queues = queues;
    for (const name of queues.keys()) {
      if (!this.workerCounts.has(name)) {
        this.workerCounts.set(name, this.MIN_WORKERS);
      }
    }
  }
  onModuleInit(): void {
    this.intervalHandle = setInterval(() => this.tick(), this.POLL_INTERVAL_MS);
    this.logger.log(
      `AutoscalerService started — poll=${this.POLL_INTERVAL_MS / 1000}s, ` +
        `min=${this.MIN_WORKERS}, max=${this.MAX_WORKERS}, ` +
        `up@${this.SCALE_UP_THRESHOLD}, down@${this.SCALE_DOWN_THRESHOLD}`,
    );
  }
  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }
  // core tick

  /**
   * called every POLL_INTERVAL_MS. checks each queue independently
   * scale-up is triggered per-queue; scale-down only happens when the queue is quiet
   * (prevents removing workers while work is pending)
   */
  private async tick(): Promise<void> {
    for (const [queueName, queue] of this.queues.entries()) {
      try {
        await this.evaluateQueue(queueName, queue);
      } catch (err) {
        this.logger.error(
          `Autoscaler tick failed for "${queueName}"`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
  private async evaluateQueue(queueName: string, queue: Queue): Promise<void> {
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "prioritized",
    );
    const depth =
      counts.waiting + counts.active + counts.delayed + counts.prioritized;

    this.logger.debug(
      `[${queueName}] RAW: waiting=${counts.waiting} active=${counts.active} delayed=${counts.delayed} 
      prioritized=${counts.prioritized} total=${depth}`,
    );
    const current = this.workerCounts.get(queueName) ?? this.MIN_WORKERS;
    const now = Date.now();
    const lastScale = this.lastScaleAt.get(queueName) ?? 0;
    const coolDownOk = now - lastScale >= this.MIN_COOLDOWN_MS;
    // only log when there is actual work or scalling event
    if (depth > 0) {
      this.logger.debug(
        `[${queueName}] depth=${depth} workers=${current} cooldown=${coolDownOk ? "ok" : "wait"}`,
      );
    }
    if (!coolDownOk) return;

    if (depth > this.SCALE_UP_THRESHOLD && current < this.MAX_WORKERS) {
      await this.scaleUp(queueName, current);
      this.lastScaleAt.set(queueName, now);
      return;
    }
    if (depth < this.SCALE_DOWN_THRESHOLD && current > this.MIN_WORKERS) {
      await this.scaleDown(queueName, current);
      this.lastScaleAt.set(queueName, now);
    }
  }
  // scale actions
  private async scaleUp(queueName: string, current: number): Promise<void> {
    const next = current + 1;
    this.logger.log(`[${queueName}] SCALE UP ${current} → ${next} workers`);
    if (this.workerRegistery) {
      await this.workerRegistery.spawnWorker(queueName);
    }
    this.workerCounts.set(queueName, next);
  }
  private async scaleDown(queueName: string, current: number): Promise<void> {
    const next = Math.max(this.MIN_WORKERS, current - 1);
    if (next === current) return;

    this.logger.log(`[${queueName}] SCALE DOWN ${current} → ${next} workers`);
    if (this.workerRegistery) {
      await this.workerRegistery.terminateWorker(queueName);
    }
    this.workerCounts.set(queueName, next);
  }
  // metrics
  // snapshot of current worker counts - useful for a health/metrics endpoint.
  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.workerCounts);
  }
}
