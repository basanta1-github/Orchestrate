import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { QueueModule } from "../queue/queue.module";
import { DatabaseModule } from "../database/database.module";
import { Job } from "../database/entities/job.entity";
import { JobAttempt } from "../database/entities/job-attempt.entity";
import { JobLog } from "../database/entities/job-log.entity";

@Module({
  imports: [DatabaseModule, QueueModule],
  controllers: [JobsController],
  providers: [JobsService],
  // exports: [JobsService],
})
export class JobsModule {}
