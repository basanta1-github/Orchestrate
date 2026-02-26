import { Injectable, OnModuleInit } from "@nestjs/common";
import { BaseWorker } from "../base-worker/base.worker";
import { ReportProcessor } from "./processor";

@Injectable()
export class ReportWorker extends BaseWorker implements OnModuleInit {
  constructor(private readonly reportProcessor: ReportProcessor) {
    super("report-jobs");
  }

  async onModuleInit() {
    await super.startWorker(this.reportProcessor);
    console.log(
      "🔥 ReportWorker initialized and listening to que:",
      this.queueName,
    );
  }
}
