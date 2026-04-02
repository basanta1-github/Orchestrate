import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "node:crypto";
import { Job } from "../database/entities/job.entity";
import { JobStatus } from "../jobs";
import { TenantCapService } from "../scaling/tenant-cap.service";

export interface batchJobItem {
  key: string;
  type: string;
  priorityLevel?: Job["priorityLevel"]; // "HIGH" | "MEDIUM" | "LOW" | "NONE"
  metadata?: Record<string, any>;
  retries?: number;
  delayMs?: number;
  idempotencyKey: string;
}

export interface BatchJobDto {
  jobs: batchJobItem[];
}
/**
 * batchJobService
 *
 * handles multiple independent jobs submitted in a single request
 * each job has no dependency on any other they are all enqueued
 * immediately and processed in paraller, ordered by priority
 *
 * this is the correct endpoint to use when testing:
 * - autoscalling (submit 10+ slowjobs, watch workers spawn)
 * - tenant cap submit 25+ jobs watch staging kick in at 20
 * band promoter submit jobs wait 602 wath them promot
 *
 * worker registery watch workers spawn and terminate
 * jobs/batch
 */

@Injectable()
export class BatchJobService {
  private readonly logger = new Logger(BatchJobService.name);
  private readonly priorityMap: Record<string, number> = {
    HIGH: 1,
    MEDIUM: 2,
    LOW: 10,
    NONE: 20,
  };
  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    private readonly tenantCapService: TenantCapService,
  ) {}
  async submitBatch(
    dto: BatchJobDto,
    userId: string,
    tenantId: string,
  ): Promise<{
    batchId: string;
    submitted: number;
    jobs: {
      key: string;
      jobId: string;
      type: string;
      priorityLevel: string;
      status: string;
    }[];
  }> {
    // ensure TS sees dto.jobs as BatchJobItem[]
    const jobs: batchJobItem[] = dto.jobs;
    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      throw new BadRequestException(
        "jobs array is required and must not be empty",
      );
    }

    // validate no duplicate keys
    const keys = jobs.map((j) => j.key);
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      throw new BadRequestException("Duplicate job keys found in batch");
    }
    // validate all jobs have required fields
    for (const job of jobs) {
      if (!job.key || !job.type) {
        throw new BadRequestException(
          `Each job must have "key" and "type" Missing onL ${JSON.stringify(job)}`,
        );
      }
    }
    const batchId = randomUUID();

    // sort by priority before saving so higher-priority jobs are submitted first
    const sorted = [...jobs].sort((a, b) => {
      const pa = this.priorityMap[a.priorityLevel ?? "NONE"] ?? 20;
      const pb = this.priorityMap[b.priorityLevel ?? "NONE"] ?? 20;
      return pa - pb; // lower number = higher priority = first
    });
    const results: {
      key: string;
      jobId: string;
      type: string;
      priorityLevel: string;
      status: string;
    }[] = [];

    for (const item of sorted) {
      //save to db
      const saved = await this.jobRepo.save({
        type: item.type,
        metadata: item.metadata ?? {},
        priorityLevel: (item.priorityLevel ?? "NONE") as Job["priorityLevel"],
        retries: item.retries ?? 3,
        status: item.delayMs ? JobStatus.SCHEDULED : JobStatus.QUEUED,
        tenant: { id: tenantId },
        user: { id: userId },
        delayMs: item.delayMs,
        idempotencyKey: item.idempotencyKey,
        scheduledAt: item.delayMs
          ? new Date(Date.now() + item.delayMs)
          : new Date(),

        // batchid stored in metadata so jobs are traceable together
        // we can add batchId to the jobEntity to query by batch
      });
      // submit through tenantcap gate
      // if tenant is at cap, job goes to staging and drains when a slot opens
      try {
        const result = await this.tenantCapService.submitJob({
          jobId: saved.id,
          jobType: saved.type,
          tenantId,
          priorityLevel: saved.priorityLevel,
          retries: saved.retries,
          metadata: { ...saved.metadata, batchId, batchKey: item.key },
          delayMs: item.delayMs,
          idempotencyKey: item.idempotencyKey,
        });
        this.logger.log(
          `Batch ${batchId} | job ${saved.id} (${item.key} / ${item.type} / ${item.priorityLevel ?? "NONE"}) → ${result.status}`,
        );
        results.push({
          key: item.key,
          jobId: saved.id,
          type: saved.type,
          priorityLevel: saved.priorityLevel,
          status: result.status, // "queued" or "staged"
        });
      } catch (error) {
        // revert to db status so it doesnt sit as queued with nothing in bullMQ

        await this.jobRepo.update(saved.id, { status: JobStatus.FAILED });
        this.logger.error(
          `Batch ${batchId} failed to submit job ${saved.id} (${item.key})`,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    }
    this.logger.log(
      `Batch ${batchId} complete — ${results.length} job(s) submitted for tenant ${tenantId}`,
    );
    return {
      batchId,
      submitted: results.length,
      jobs: results,
    };
  }
}
