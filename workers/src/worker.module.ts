import { Module } from "@nestjs/common";
import {
  ChainController,
  ChainService,
  DatabaseModule,
  JobsModule,
  JobsService,
} from "@jobque/shared";
import { MediaProcessor } from "./media-worker/processor";
import { MediaWorker } from "./media-worker/worker";
import { MediaController } from "./media-worker/media.controller";
import { ReportProcessor } from "./report-worker/processor";
import { ReportWorker } from "./report-worker/worker";
import { ReportController } from "./report-worker/report.controller";
import { MLProcessor } from "./ml-worker/processor";
import { MLWorker } from "./ml-worker/worker";
import { EmailProcessor } from "./email-worker/processor";
import { EmailWorker } from "./email-worker/worker";
import { ETLProcessor } from "./etl-worker/processor";
import { ETLWorker } from "./etl-worker/worker";
import { ETLService } from "./etl-worker/service";
import { QueueModule } from "@jobque/shared";

@Module({
  imports: [DatabaseModule, QueueModule, JobsModule],
  providers: [
    MediaProcessor,
    MediaWorker,
    ReportProcessor,
    ReportWorker,
    MLProcessor,
    MLWorker,
    EmailProcessor,
    EmailWorker,
    ETLService,
    ETLProcessor,
    ETLWorker,
    JobsService,
    ChainService,
  ],
  controllers: [MediaController, ReportController, ChainController],
  // exports: [MediaWorker, MediaProcessor], // optional, if you want to bootstrap it elsewhere
})
export class WorkerModule {}
