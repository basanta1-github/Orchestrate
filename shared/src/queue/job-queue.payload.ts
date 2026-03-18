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

  // use everyms for seconds instead of cron
}
