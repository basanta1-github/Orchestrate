import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { QueueModule } from "../queue/queue.module";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [DatabaseModule, QueueModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
