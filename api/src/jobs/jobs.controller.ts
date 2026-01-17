import {Controller, Post, Body, Req, UseGuards} from '@nestjs/common'
import {JobsService} from './jobs.service'
import { CreateJobDto } from './dto/create-job.dto'
// import {JwtAuthGuard} from '../auth/jwt-auth.guard'
import {v4 as uuidv4} from 'uuid'

@Controller('jobs')
// @UseGuards(JwtAuthGuard)
export class JobsController{
    constructor(private readonly jobsService: JobsService){}

    @Post()
     async createJob(@Body() dto: CreateJobDto) {
    try{

            // async createJob(@Body() dto: CreateJobDto, @Req() req){
    //     const userId = req.user.id;
    //     const tenantId = req.user.tenantId;

    //     return this.jobsService.createAndEnqueue(dto, userId, tenantId)

        // Use fake user and tenant IDs for now
    const userId = "2e08e347-5d83-4df1-8c6a-428cbda9ffd3"
    const tenantId = "67732e60-0856-4950-ac26-616a8c1a04c2"

    const job = this.jobsService.createAndEnqueue(dto, userId, tenantId);
    return job;
    } catch(error){
         console.error('Error in /jobs POST:', error);
        throw error; 
    }


    }
}