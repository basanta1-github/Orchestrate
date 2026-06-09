import { Injectable } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class QueueReconcileCollector {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || "redis",
      port: Number(process.env.REDIS_PORT || 6379),
    });
  }

  private preQueueKey(queueName: string): string {
    return `reconcile:queue:${queueName}:pre_queue`;
  }

  private terminalKey(queueName: string): string {
    return `reconcile:queue:${queueName}:terminal`;
  }

  private totalsKey(queueName: string): string {
    return `reconcile:queue:${queueName}:totals`;
  }

  async incrementSubmitted(queueName: string): Promise<void> {
    await this.redis.hincrby(this.totalsKey(queueName), "submitted_total", 1);
  }

  async incrementStaged(queueName: string): Promise<void> {
    await this.redis.hincrby(this.preQueueKey(queueName), "staged", 1);
  }
  async decrementStaged(queueName: string): Promise<void> {
    await this.decrementFloorZero(this.preQueueKey(queueName), "staged");
  }

  async incrementReleasePending(queueName: string): Promise<void> {
    await this.redis.hincrby(this.preQueueKey(queueName), "release_pending", 1);
  }

  async decrementReleasePending(queueName: string): Promise<void> {
    await this.decrementFloorZero(
      this.preQueueKey(queueName),
      "release_pending",
    );
  }
  async incrementCompleted(queueName: string): Promise<void> {
    await this.redis.hincrby(this.terminalKey(queueName), "completed", 1);
  }

  async incrementFailed(queueName: string): Promise<void> {
    await this.redis.hincrby(this.terminalKey(queueName), "failed", 1);
  }

  async incrementDlq(queueName: string): Promise<void> {
    await this.redis.hincrby(this.terminalKey(queueName), "dlq", 1);
  }

  async getQueueState(queueName: string) {
    const [preQueue, terminal, totals] = await Promise.all([
      this.redis.hgetall(this.preQueueKey(queueName)),
      this.redis.hgetall(this.terminalKey(queueName)),
      this.redis.hgetall(this.totalsKey(queueName)),
    ]);

    return {
      pre_queue: {
        staged: Number(preQueue.staged ?? 0),
        release_pending: Number(preQueue.release_pending ?? 0),
      },
      terminal: {
        completed: Number(terminal.completed ?? 0),
        failed: Number(terminal.failed ?? 0),
        dlq: Number(terminal.dlq ?? 0),
      },
      totals: {
        submitted_total: Number(totals.submitted_total ?? 0),
      },
    };
  }

  private async decrementFloorZero(key: string, field: string): Promise<void> {
    const current = Number((await this.redis.hget(key, field)) ?? 0);
    const next = Math.max(0, current - 1);
    await this.redis.hset(key, field, next);
  }
}
