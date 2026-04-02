import { Controller, Post, Body } from "@nestjs/common";
import { DataSource } from "typeorm";
import { InjectDataSource } from "@nestjs/typeorm";
import { QueueService, AuthUser, TenantCapService } from "@jobque/shared";

@Controller("notifications")
export class NotificationsController {
  constructor(
    // @InjectDataSource() private datasource: DataSource,
    private readonly tenantCapService: TenantCapService,
    private readonly queueService: QueueService,
  ) {}
  @Post()
  async createJob(@Body() body: any, @AuthUser() user: any) {
    const { jobType, payload, priority = 1, retries = 3 } = body;

    if (!jobType || !payload) {
      throw new Error("jobType and payload are required");
    }

    return this.tenantCapService.submitJob({
      jobType,
      jobId: payload.jobId,
      tenantId: payload.tenant.id,
      priorityLevel: payload.priorityLevel ?? "NONE",
      retries,
      metadata: payload,
    });
  }
}
