import { Module } from "@nestjs/common";
import { DatabaseModule } from "@jobque/shared";
import { MediaProcessor } from "./media-worker/processor";
import { MediaWorker } from "./media-worker/worker";

@Module({
  imports: [DatabaseModule],
  providers: [MediaProcessor, MediaWorker],
  exports: [MediaWorker, MediaProcessor], // optional, if you want to bootstrap it elsewhere
})
export class WorkerModule {}
