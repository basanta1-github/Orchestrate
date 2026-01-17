import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {Repository} from 'typeorm'
import { Job } from "../database/entities/job.entity";
import { QueueService } from '@jobque/shared'
import { CreateJobDto } from "./dto/create-job.dto";
import { JobStatus } from "./jobs.constants";

@Injectable()
export class JobsService{
      private readonly logger = new Logger(JobsService.name); 
    constructor(
        private readonly queueService: QueueService,
        @InjectRepository(Job)
        private readonly jobRepo: Repository<Job>,
    ){}

    async createAndEnqueue(dto: CreateJobDto, userId: string, tenantId:string){
        const job = this.jobRepo.create({
            type: dto.jobType,
            metadata: dto.payload,
            priority: dto.priority ?? 5,
            retries: 3,
            status: JobStatus.QUEUED,
            tenant:{id: tenantId},// TypeORM accepts object with only id for ManyToOne
            user: {id:userId}
        })

        const savedJob = await this.jobRepo.save(job)
         // 🔹 Observability hook: log after saving but before enqueue
        this.logger.log(`Job queued: ${savedJob.id} | Type: ${savedJob.type} 
            | Tenant: ${tenantId} | User: ${userId}`);


       try{
         await this.queueService.enqueue({
            jobId: job.id,
            jobType: job.type,
            tenantId: tenantId,
            priority: job.priority,
            retries: job.retries,
            metadata: job.metadata
            })
        }
        catch(error){
            this.logger.error(`Failed to enqueue job ${savedJob.id}`, error.stack);
            throw error; // optional, or handle retry
        }

        return job;
    }
}