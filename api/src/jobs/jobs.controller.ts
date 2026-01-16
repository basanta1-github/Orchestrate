import {Controller, Post, Body, Req, UseGuards} from '@nestjs/common'
import {JobsService} from './jobs.service'
import { CreateJobDto } from './dto/create-job.dto'
// import {JwtAuthGuard} from '../auth/jwt-auth.guard'

@Controller('jobs')
// @UseGuards(JwtAuthGuard)
export class JobsController{
    constructor(private readonly jobsService: JobsService){}

    @Post()
     async createJob(@Body() dto: CreateJobDto) {
    // Use fake user and tenant IDs
    const userId = 'fake-user-id';
    const tenantId = 'fake-tenant-id';

    return this.jobsService.createAndEnqueue(dto, userId, tenantId);

    // async createJob(@Body() dto: CreateJobDto, @Req() req){
    //     const userId = req.user.id;
    //     const tenantId = req.user.tenantId;

    //     return this.jobsService.createAndEnqueue(dto, userId, tenantId)
    }
}