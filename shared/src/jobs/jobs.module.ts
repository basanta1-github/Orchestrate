import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { QueueModule } from "../queue/queue.module";
import { DatabaseModule } from "../database/database.module";
import { ChainService } from "../chain/chain.service";
import { ChainController } from "../chain/chain.controller";
import { TenantCapService } from "../scaling/tenant-cap.service";
import { BatchJobsController } from "../batch-job/batch-job.controller";
import { BatchJobService } from "../batch-job/batch-job.service";

@Module({
  imports: [DatabaseModule, QueueModule], // provide typeorm repo
  //provides queueService + tenantCapService + all the scalling services
  controllers: [JobsController, ChainController, BatchJobsController],
  providers: [JobsService, ChainService, BatchJobService], // tenantCapService comes from queuemodule
  exports: [JobsService, ChainService, BatchJobService], // export so that worker module  can use chain service
})
export class JobsModule {}
