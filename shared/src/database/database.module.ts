import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Job } from "./entities/job.entity";
import { JobAttempt } from "./entities/job-attempt.entity";
import { JobLog } from "./entities/job-log.entity";
import { User } from "./entities/user.entity";
import { Tenant } from "./entities/tenant.entity";
import { Worker } from "./entities/worker.entity";
import { Notification } from "./entities/notification.entity";
import { ProcessedUser } from "./entities/processed-user.entity";
import { RecurringJob } from "./entities/recurring-jobs.entity";
import { QueueSequence } from "./entities/queueSequence.entity";
import { JobDependency } from "./entities/job-dependencies.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Job,
      JobAttempt,
      JobLog,
      User,
      Tenant,
      Worker,
      Notification,
      ProcessedUser,
      RecurringJob,
      QueueSequence,
      JobDependency,
    ]),
  ],
  exports: [TypeOrmModule], // <-- this exports all repositories makes the repo of above for feature abailablee in job module
})
export class DatabaseModule {}
