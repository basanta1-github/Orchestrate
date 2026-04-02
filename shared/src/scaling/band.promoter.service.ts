import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Queue, Job as BullJob } from "bullmq";

/**
 * BandPromoterService
 *
 * Runs on a fixed interval and promotes jobs that have been waiting
 * in the normal and (priority >= 10) for longer than PROMOTION_THRESHOLD_MS
 * into high band priority = 1
 *
 * How BULLMQ priority bands map to our two-band model:
 *
 * priority 1= high band (processed first by all workers)
 * priority 2= medium
 * priority 10= low
 * priority 20 = none / normal band
 *
 * promotion sets priority to 1 sso that job jumps to the front of the priority queue
 * workers already frain lower-priority-number jobs first no extra worker logic needed
 *
 * mnote: bullMq does not expose a native "re-prioritise" api. we simulate it by reading waiting jobs,
 * removing the stale one, and re-adding it with priority = 1. this is safe: the job data and attempt count are preserved
 */

@Injectable()
export class BandPromoterService implements OnModuleInit {
  private readonly logger = new Logger(BandPromoterService.name);

  // jobs waiting longer thn this will promoted to the high band.
  private readonly PROMOTION_THRESHHOLD_MS = 5_000; // 60 seconds

  // How often to scan for promotable jobs (ms).
  private readonly SCAN_INTERVAL_MS = 3_000; // 30 seconds

  // priority value assinged to promoted jobs
  private readonly HIGH_BAND_PRIORITY = 1;

  // only promote jobs currently in teh normal band (priority >= this)
  private readonly NORMAL_BAND_MIN_PRIORITY = 2;

  private queues: Map<string, Queue> = new Map();
  private intervalHandle: NodeJS.Timeout | null = null;

  // called by queueModule to register queues after they are created.
  registerQueues(queues: Map<string, Queue>): void {
    this.queues = queues;
  }

  onModuleInit(): void {
    this.intervalHandle = setInterval(
      () => this.promoteStalledJobs(),
      this.SCAN_INTERVAL_MS,
    );
    this.logger.log(
      `BandPromoterService started - scanning every ${this.SCAN_INTERVAL_MS / 1000}s, threshold=${this.PROMOTION_THRESHHOLD_MS / 1000}s`,
    );
  }
  onModuleDestory(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  // core scam
  private async promoteStalledJobs(): Promise<void> {
    const now = Date.now();

    for (const [queueName, queue] of this.queues.entries()) {
      try {
        await this.promoteQueue(queue, queueName, now);
      } catch (err) {
        this.logger.error(
          `Promotion scan failed queued "${queueName}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
  private async promoteQueue(
    queue: Queue,
    queueName: string,
    now: number,
  ): Promise<void> {
    // fetch all waiting jobs (bullMQ  returns them sorted by priority then
    // timestamp so this is efficient for typical queue depths)
    const waiting: BullJob[] = await queue.getJobs(
      ["waiting", "prioritized"],
      0,
      10,
    );
    let promoted = 0;

    for (const job of waiting) {
      const currentPriority = job.opts.priority ?? 20;

      // skip jobs alreaady in high band
      if (currentPriority < this.NORMAL_BAND_MIN_PRIORITY) continue;

      //skip jobs that haven't waited long enough
      const waitedMs = now - job.timestamp;
      if (waitedMs < this.PROMOTION_THRESHHOLD_MS) continue;

      //promote: remove + re-add with high priority.
      await this.promoteJob(queue, job);
      promoted++;
    }
    if (promoted > 0) {
      this.logger.log(
        `Queue "${queueName}" - promoted ${promoted} job(s) to high band`,
      );
    }
  }
  /**
   * Re-adds a job with priority =1 (high band).
   * Preserves all original job data and options except priority
   */
  private async promoteJob(queue: Queue, job: BullJob): Promise<void> {
    try {
      // remove from its current position
      await job.remove();

      // Re-add with high band priority. keep original attempts, backoff, etc
      await queue.add(job.name, job.data, {
        ...job.opts,
        priority: this.HIGH_BAND_PRIORITY,
        // preserve the original jobId so idempotency keys still work.
        jobId: job.opts.jobId ?? job.id,
        // no delay - the job has already waited long enough.
        delay: 0,
      });

      this.logger.debug(
        `Promoted job${job.id} (DBJob=${job.data.jobId} from priority ${job.opts.priority ?? 20} -> ${this.HIGH_BAND_PRIORITY} after ${Math.round((Date.now() - job.timestamp) / 1000)}s wait)`,
      );
    } catch (err) {
      // non -fatal: if the job was already picked up between getWaiting() and
      // remove(), bullmq will will throw "job not found" error. safe to ignore
      this.logger.warn(
        `Could not promote job ${job.id} - it may have been picked up already`,
      );
    }
  }
}
