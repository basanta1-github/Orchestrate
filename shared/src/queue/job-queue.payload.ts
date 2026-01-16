// shared/queue/job-queue.payload.ts
export interface JobQueuePayload {
  jobId: string;
  jobType: string;
  tenantId: string;
  priority: number;
  retries: number;
  metadata?: Record<string, any>;
}
