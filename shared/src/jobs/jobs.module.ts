import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { QueueModule } from "../queue/queue.module";
import { DatabaseModule } from "../database/database.module";
import { ChainService } from "../chain/chain.service";
import { ChainController } from "../chain/chain.controller";

@Module({
  imports: [DatabaseModule, QueueModule],
  controllers: [JobsController, ChainController],
  providers: [JobsService],
})
export class JobsModule {}
