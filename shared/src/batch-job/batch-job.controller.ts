import { Controller, Post, Body, Logger } from "@nestjs/common";
import { BatchJobService, BatchJobDto } from "./batch-job.service";
import { AuthUser } from "../auth/auth.user.decorator";
import { Roles } from "../rbac/roles.decorer";

/**
 * abtchjobscontroller
 * post /jobs/batch
 *
 * accept a list of independent jobs and enqueues them all at once
 * no dependencies between the jobs - each runs as soon as the worker is free
 * priority is respected: high jobs enter the queue first
 */

@Controller("jobs")
export class BatchJobsController {
  private readonly logger = new Logger(BatchJobsController.name);
  constructor(private readonly batchJobService: BatchJobService) {}

  @Post("batch")
  @Roles("admin")
  async submitBatch(@Body() dto: BatchJobDto, @AuthUser() user: any) {
    return this.batchJobService.submitBatch(dto, user.id, user.tenant.id);
  }
}
