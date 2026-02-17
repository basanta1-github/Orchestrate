import { BaseProcessor } from "../base-worker/base.processor";
import { Job as Bulljob } from "bullmq";
import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { InjectDataSource } from "@nestjs/typeorm";

@Injectable()
export class MediaProcessor extends BaseProcessor {
  constructor(
    @InjectDataSource()
    dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected async process(job: Bulljob): Promise<void> {
    console.log(`[MediaProcessor] processing media job`, job.data);
    // Placeholder for:
    // - video transcoding
    // - image resizing
    // - audio processin

    // simulate faliure if failtest is true
    if (job.data.metadata?.failTest) {
      throw new Error("Simulated faliure");
    }

    // actual processing placeholder
    // eg: video transcoading, image resizing and audio processing
    await new Promise((resolve) => setTimeout(resolve, 2000)); // simulate work
    console.log(
      `[MediaProcessor] job ${job.data.jobId} processed successfully`,
    );
  }
}
