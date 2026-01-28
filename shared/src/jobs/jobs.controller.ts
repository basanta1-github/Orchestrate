import {
  Controller,
  Post,
  Body,
  UseGuards,
  Param,
  Get,
  Query,
} from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { CreateJobDto } from "./dto/create-job.dto";
// import {JwtAuthGuard} from '../auth/jwt-auth.guard'
import { DEMO_USER } from "../demo-user";

@Controller("jobs")
// @UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  // create job
  @Post()
  async createJob(@Body() dto: CreateJobDto) {
    // try {
    // async createJob(@Body() dto: CreateJobDto, @Req() req){
    //     const userId = req.user.id;
    //     const tenantId = req.user.tenantId;

    //     return this.jobsService.createAndEnqueue(dto, userId, tenantId)

    // Use fake user and tenant IDs for now
    const { id: userId, tenantId } = DEMO_USER;
    const job = await this.jobsService.createAndEnqueue(dto, userId, tenantId);
    return job;
    // } catch (error) {
    //   console.error("Error in /jobs POST:", error);
    //   throw error;
    // }
  }

  // fetch single job by ID
  @Get(":id")
  async getJob(@Param("id") id: string) {
    // try {
    const { id: userId, tenantId } = DEMO_USER;
    const job = await this.jobsService.getJobById(id, userId, tenantId);
    return job;
    // } catch (error) {
    //   console.error("Error in get by an id", error);
    //   throw error;
    // }
  }

  // list all jobs with optional filters
  @Get()
  async listJobs(@Query() query: any) {
    // try {
    const { id: userId, tenantId } = DEMO_USER;
    const job = await this.jobsService.listJobs(userId, tenantId, query);
    return job;
    // } catch (error) {
    //   console.error("error in list all job with optional filters", error);
    //   throw error;
    // }
  }
}
