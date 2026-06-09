import { Module, OnModuleInit } from "@nestjs/common";
import {
  // ChainController,
  // ChainService,
  DatabaseModule,
  JobsModule,
  MetricsModule,
  // JobsService,
  QueueModule,
  workerRegistryService,
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

/**
 * Worker module
 *
 * owns all processors and workers
 * imports queue module so processors get TenantCapService injected
 *
 * imports jobs module so processors can get chain service injected
 *
 * onModuleInit registers each processor with WorkerRegisteryService
 * so the autoscalar can spawn additional instances of any worker type
 *
 * do not add job service or chain service they come from job module
 */
@Module({
  imports: [DatabaseModule, QueueModule, JobsModule, MetricsModule],
  providers: [
    MediaWorker,
    MLWorker,
    ReportWorker,
    EmailWorker,
    ETLWorker,

    MediaProcessor,
    ReportProcessor,
    MLProcessor,
    EmailProcessor,
    ETLService,
    ETLProcessor,
  ],
  controllers: [MediaController, ReportController],
  // exports: [MediaWorker, MediaProcessor], // optional, if you want to bootstrap it elsewhere
})
export class WorkerModule implements OnModuleInit {
  constructor(
    private readonly workerRegistery: workerRegistryService,
    private readonly mediaProcessor: MediaProcessor,
    private readonly reportProcessor: ReportProcessor,
    private readonly mlProcessor: MLProcessor,
    private readonly emailProcessor: EmailProcessor,
    private readonly etlProcessor: ETLProcessor,
  ) {}
  /**
   * register each processor with workerregistery
   * this means when the autoscaler decides to spawn an extra ml-jobs worker
   * because the queue is deep, workerRegisteryService already knows which
   * processor function to use it was already registered here as startup
   *
   * the factory function not the processor directly so each new
   * worker instance gets a fresh call to processor.execute bound correctly
   *
   */
  onModuleInit(): void {
    this.workerRegistery.registerProcessor(
      "media-jobs",
      () => (job) => this.mediaProcessor.execute(job),
    );
    this.workerRegistery.registerProcessor(
      "report-jobs",
      () => (job) => this.reportProcessor.execute(job),
    );
    this.workerRegistery.registerProcessor(
      "ml-jobs",
      () => (job) => this.mlProcessor.execute(job),
    );
    this.workerRegistery.registerProcessor(
      "email-jobs",
      () => (job) => this.emailProcessor.execute(job),
    );
    this.workerRegistery.registerProcessor(
      "etl-jobs",
      () => (job) => this.etlProcessor.execute(job),
    );
  }
}
