import {
  Controller,
  Post,
  Body,
  UseGuards,
  Param,
  Get,
  Query,
  Req,
  ForbiddenException,
} from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { CreateJobDto } from "./dto/create-job.dto";
// import {JwtAuthGuard} from '../auth/jwt-auth.guard'
import { DEMO_USER } from "../auth/demo-user";
import { QueueService } from "../queue/queue.service";
import { AuthUser } from "../auth/auth.user.decorator";
import { UserRole } from "../database";

@Controller("jobs")
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly queueService: QueueService,
  ) {}

  // create job
  @Post()
  async createJob(@Body() dto: CreateJobDto, @AuthUser() user: any) {
    // async createJob(@Body() dto: CreateJobDto, @Req() req){
    //     const userId = req.user.id;
    //     const tenantId = req.user.tenantId;

    //     return this.jobsService.createAndEnqueue(dto, userId, tenantId)

    // Use fake user and tenant IDs for now
    const { id: userId, tenantId } = user;
    const job = await this.jobsService.createAndEnqueue(
      { ...dto, priorityLevel: dto.priorityLevel ?? "NONE" },
      userId,
      tenantId,
    );
    return { success: true, job };
  }
  @Post("schedule")
  async scheduleJob(@Body() dto: CreateJobDto, @AuthUser() user: any) {
    const { id: userId, tenantId } = user;
    const job = await this.jobsService.createAndEnqueue(dto, userId, tenantId);

    return job;
  }

  // stop recurring jobs

  @Post("list-recurring")
  async listRecurring(
    @Body() body: { jobType: string },
    @AuthUser() user: any,
  ) {
    const { jobType } = body;
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }
    return this.queueService.listRecurringJobs(
      jobType,
      // user.tenantId
    );
  }
  @Post("stop-recurring")
  async stopRecurring(
    @Body()
    body: {
      jobType: string;
      cronPattern: string;
      jobId?: string;
    },
    @AuthUser() user: any,
  ) {
    const { jobType, cronPattern, jobId } = body;
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("only admin can stop recurring jobs");
    }

    if (!jobType || !cronPattern) {
      return { message: "jobType and cronPattern are required" };
    }

    return this.queueService.stopRecurringJob(jobType, cronPattern, jobId);
  }

  // fetch single job by ID
  @Get(":id")
  async getJob(@Param("id") id: string, @AuthUser() user: any) {
    const { id: userId, tenantId } = user;
    // service should verify this job belongs to user.tenantId
    // if not, throw NotFoundException (don't reveal the job exists)
    const job = await this.jobsService.getJobById(id, userId, tenantId);
    return job;
  }

  // list all jobs with optional filters
  @Get()
  async listJobs(@Query() query: any, @AuthUser() user: any) {
    const { id: userId, tenantId } = user;
    const job = await this.jobsService.listJobs(userId, tenantId, query);
    return job;
  }
}
