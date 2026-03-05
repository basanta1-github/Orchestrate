import { Module } from "@nestjs/common";
import { DatabaseModule } from "@jobque/shared";
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

@Module({
  imports: [DatabaseModule],
  providers: [
    MediaProcessor,
    MediaWorker,
    ReportProcessor,
    ReportWorker,
    MLProcessor,
    MLWorker,
    EmailProcessor,
    EmailWorker,
  ],
  controllers: [MediaController, ReportController],
  // exports: [MediaWorker, MediaProcessor], // optional, if you want to bootstrap it elsewhere
})
export class WorkerModule {}
