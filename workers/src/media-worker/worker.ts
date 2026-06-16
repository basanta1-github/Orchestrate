import { Injectable, OnModuleInit } from "@nestjs/common";
import { BaseWorker } from "../base-worker/base.worker";
// import { BaseProcessor } from "../base-worker/base.processor";
import { MediaProcessor } from "./processor";
import {
  QueueMetricsCollector,
  QueueReconcileCollector,
  workerRegistryService,
} from "@jobque/shared";
// import { DataSource } from "typeorm";

@Injectable()
export class MediaWorker extends BaseWorker implements OnModuleInit {
  constructor(
    protected readonly mediaProcessor: MediaProcessor,
    workerRegistery: workerRegistryService,
    queueReconcileCollector: QueueReconcileCollector,
    queueMetrics: QueueMetricsCollector,
  ) {
    super("media-jobs", workerRegistery, queueMetrics, queueReconcileCollector);
    // no proecessor passed to super
    // this.mediaProcessor = processor;
    // console.log("MediaWorker constructor processor:", mediaProcessor);
    // console.log("Processor injected:", !!mediaProcessor);
  }
  // protected getProcessor(): BaseProcessor {
  //   return this.mediaProcessor;
  // }
  async onModuleInit() {
    // now processor is fully injkected and can be used in startWorker
    await super.startWorker(this.mediaProcessor);
    // Workers start when module is initialized
    console.log(
      "🔥 MediaWorker initialized and listening to queue:",
      this.queueName,
    );
    // console.log("CLASS NAME:", this.constructor.name);
    // console.log("INSTANCE:", this);
  }
}
