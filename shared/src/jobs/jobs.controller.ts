import {
  Controller,
  Post,
  Body,
  UseGuards,
  Param,
  Get,
  Query,
  Req,
} from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { CreateJobDto } from "./dto/create-job.dto";
// import {JwtAuthGuard} from '../auth/jwt-auth.guard'
import { DEMO_USER } from "../demo-user";
import { QueueService } from "../queue/queue.service";
import { randomUUID } from "node:crypto";

@Controller("jobs")
// @UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly queueService: QueueService,
  ) {}

  // create job
  @Post()
  async createJob(@Body() dto: CreateJobDto) {
    // async createJob(@Body() dto: CreateJobDto, @Req() req){
    //     const userId = req.user.id;
    //     const tenantId = req.user.tenantId;

    //     return this.jobsService.createAndEnqueue(dto, userId, tenantId)

    // Use fake user and tenant IDs for now
    const { id: userId, tenantId } = DEMO_USER;
    const job = await this.jobsService.createAndEnqueue(dto, userId, tenantId);
    return { success: true, job };
  }
  @Post("schedule")
  async scheduleJob(@Body() dto: CreateJobDto) {
    const { id: userId, tenantId } = DEMO_USER;
    const job = await this.jobsService.createAndEnqueue(dto, userId, tenantId);

    return job;
  }

  // stop recurring jobs

  @Post("list-recurring")
  async listRecurring(@Body() body: { jobType: string }) {
    const { jobType } = body;
    return this.queueService.listRecurringJobs(jobType);
  }
  @Post("stop-recurring")
  async stopRecurring(
    @Body()
    body: {
      jobType: string;
      cronPattern: string;
      jobId?: string;
    },
  ) {
    const { jobType, cronPattern, jobId } = body;

    if (!jobType || !cronPattern) {
      return { message: "jobType and cronPattern are required" };
    }

    return this.queueService.stopRecurringJob(jobType, cronPattern, jobId);
  }

  // fetch single job by ID
  @Get(":id")
  async getJob(@Param("id") id: string) {
    const { id: userId, tenantId } = DEMO_USER;
    const job = await this.jobsService.getJobById(id, userId, tenantId);
    return job;
  }

  // list all jobs with optional filters
  @Get()
  async listJobs(@Query() query: any) {
    const { id: userId, tenantId } = DEMO_USER;
    const job = await this.jobsService.listJobs(userId, tenantId, query);
    return job;
  }
}
