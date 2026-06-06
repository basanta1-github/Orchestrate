import { BaseProcessor } from "../base-worker/base.processor";
import { Job as BullJob } from "bullmq";
import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { InjectDataSource } from "@nestjs/typeorm";
import pTimeout from "p-timeout";

import { MLJobPayload } from "./types";
import { SummarizerEngine } from "./engines/summarizer.engine";
import { ClassifierEngine } from "./engines/classification.engine";
import { OCREngine } from "./engines/ocr.engine";
import {
  ChainService,
  QueueMetricsCollector,
  QueueReconcileCollector,
  TenantCapService,
} from "@jobque/shared";

@Injectable()
export class MLProcessor extends BaseProcessor {
  private readonly MAX_INPUT_SIZE = 10000; // Max characters for input
  private readonly INFERENCE_TIMEOUT = 3000; // 3 seconds timeout for inference
  constructor(
    @InjectDataSource() dataSource: DataSource,
    chainService: ChainService,
    tenantCapService: TenantCapService,
    queueMetrics: QueueMetricsCollector,
    queueReconcileCollector: QueueReconcileCollector,
  ) {
    super(
      dataSource,
      chainService,
      tenantCapService,
      queueMetrics,
      queueReconcileCollector,
    );
  }
  protected async process(job: BullJob): Promise<void> {
    // read from metadata
    const metadata = job.data.metadata ?? {};
    const taskType: string | undefined = metadata.taskType;
    const input: string | undefined = metadata.input;

    // const tenantId = job.data.tenantId;

    if (!taskType) throw new Error("taskType is required");
    if (!input) throw new Error("input is required");

    if (input.length > this.MAX_INPUT_SIZE) {
      throw new Error("Input too large");
    }
    let prediction: any;
    const inference = async () => {
      switch (taskType) {
        case "text_summarization":
          return SummarizerEngine.run(input);
        case "classification":
          return ClassifierEngine.run(input);
        case "ocr":
          return OCREngine.run(input);
        default:
          throw new Error("Unsupported task type: " + taskType);
      }
    };
    prediction = await pTimeout(inference(), {
      milliseconds: this.INFERENCE_TIMEOUT,
    });

    // attach to Base Processor persistance system
    job.data.result = { prediction };
    job.data.metadata = {
      ...metadata,
      modelVersion: "v1.0", // in real case, this should come from the model loader
      inferenceTime: new Date(),
    };
  }
}
