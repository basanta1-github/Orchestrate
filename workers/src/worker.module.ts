import { Module } from "@nestjs/common";
import { DatabaseModule } from "@jobque/shared";
import { MediaProcessor } from "./media-worker/processor";
import { MediaWorker } from "./media-worker/worker";
import { MediaController } from "./media-worker/media.controller";

@Module({
  imports: [DatabaseModule],
  providers: [MediaProcessor, MediaWorker],
  controllers: [MediaController],
  exports: [MediaWorker, MediaProcessor], // optional, if you want to bootstrap it elsewhere
})
export class WorkerModule {}
