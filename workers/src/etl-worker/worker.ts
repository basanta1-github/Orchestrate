import { Injectable, OnModuleInit } from "@nestjs/common";
import { BaseWorker } from "../base-worker/base.worker";
import { ETLProcessor } from "./processor";
import {
  QueueReconcileCollector,
  workerRegistryService,
  QueueMetricsCollector,
} from "@jobque/shared";

@Injectable()
export class ETLWorker extends BaseWorker implements OnModuleInit {
  constructor(
    protected readonly etlProcessor: ETLProcessor,
    workerRegistery: workerRegistryService,
    queueReconcileCollector: QueueReconcileCollector,
    queueMetrics: QueueMetricsCollector,
  ) {
    super("etl-jobs", workerRegistery, queueMetrics, queueReconcileCollector);
  }
  async onModuleInit() {
    await super.startWorker(this.etlProcessor);
    console.log(
      "🔥 ETL Worker initialized and listening to queue:",
      this.queueName,
    );
  }
}
