import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { QueueModule } from "../queue/queue.module";
import { Job } from "../database/entities/job.entity";
import { JobAttempt } from "../database/entities/job-attempt.entity";
import { JobRepository } from "../database/repositories/job.repository";

@Module({
  imports: [TypeOrmModule.forFeature([Job, JobAttempt]), QueueModule],
  controllers: [JobsController],
  providers: [JobsService, JobRepository],
  exports: [JobsService],
})
export class JobsModule {}
