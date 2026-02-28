import { Injectable, OnModuleInit } from "@nestjs/common";
import { BaseWorker } from "../base-worker/base.worker";
import { MLProcessor } from "./processor";

@Injectable()
export class MLWorker extends BaseWorker implements OnModuleInit {
  constructor(private readonly mlProcessor: MLProcessor) {
    super("ml-jobs");
  }
  async onModuleInit() {
    await super.startWorker(this.mlProcessor);
    console.log(
      "🔥 ML Worker started and listening to queue...",
      this.queueName,
    );
  }
}
