// shared/queue/job-queue.payload.ts
export interface JobQueuePayload {
  jobId: string;
  jobType: string;
  tenantId: string;
  priorityLevel: string;
  retries: number;
  metadata?: Record<string, any>;
  delayMs?: number;
  cron?: string;
  idempotencyKey?: string;
  recurringJobId?: string;
  bullPriorityOverride?: number;
  /**
   * bull priority obvverride - set by chainservice for workflow jobs
   *
   * when present queueservice uses this number directly as the bullmq priority instead
   * of calculating from priority level
   *
   * formula used by chain service
   * bullPriority = (rootRank *100) + jobOwnPriorityValue
   * this ensures entire high priority branches always run before
   * lower priority branches inside the bullmq without blocking
   *
   * for non-workflow jobs this field is undefined and queueservice falls back to its
   * normal priority map calculation
   */

  // use everyms for seconds instead of cron
}
