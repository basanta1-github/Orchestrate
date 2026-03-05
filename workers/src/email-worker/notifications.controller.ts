import { Controller, Post, Body } from "@nestjs/common";
import { DataSource } from "typeorm";
import { InjectDataSource } from "@nestjs/typeorm";
import { QueueService } from "@jobque/shared";

@Controller("notifications")
export class NotificationsController {
  constructor(
    @InjectDataSource() private datasource: DataSource,
    private readonly queueService: QueueService,
  ) {}
  @Post()
  async createJob(@Body() body: any) {
    const { jobType, payload, priority = 1, retries = 3 } = body;

    if (!jobType || !payload) {
      throw new Error("jobType and payload are required");
    }

    return this.queueService.enqueue({
      jobType,
      jobId: payload.jobId,
      tenantId: payload.tenantId,
      priority,
      retries,
      metadata: payload,
    });
  }
}
