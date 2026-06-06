import { Injectable, OnModuleInit } from "@nestjs/common";
import { EmailProcessor } from "./processor";
import { BaseProcessor } from "../base-worker/base.processor";
import { BaseWorker } from "../base-worker/base.worker";
import { QueueReconcileCollector, workerRegistryService } from "@jobque/shared";

@Injectable()
export class EmailWorker extends BaseWorker implements OnModuleInit {
  constructor(
    private readonly processor: EmailProcessor,
    workerRegistery: workerRegistryService,
    queueReconcileCollector: QueueReconcileCollector,
  ) {
    super("email-jobs", workerRegistery, queueReconcileCollector);
  }

  async onModuleInit() {
    await super.startWorker(this.processor);
    console.log(
      "🔥 EmailWorker initialized and listening to queue:",
      this.queueName,
    );
  }
}
