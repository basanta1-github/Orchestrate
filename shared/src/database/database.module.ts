import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Job } from "./entities/job.entity";
import { JobAttempt } from "./entities/job-attempt.entity";
import { JobLog } from "./entities/job-log.entity";
import { User } from "./entities/user.entity";
import { Tenant } from "./entities/tenant.entity";
import { Worker } from "./entities/worker.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([Job, JobAttempt, JobLog, User, Tenant, Worker]),
  ],
  exports: [TypeOrmModule], // <-- this exports all repositories makes the repo of above for feature abailablee in job module
})
export class DatabaseModule {}
