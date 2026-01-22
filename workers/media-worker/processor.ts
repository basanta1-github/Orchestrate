import { BaseProcessor } from "../base-worker/base.processor";
import { Job as Bulljob } from "bullmq";

export class MediaProcessor extends BaseProcessor {
  protected async process(job: Bulljob): Promise<void> {
    console.log(`[MediaProcessor] processing media job`, job.data);
    // Placeholder for:
    // - video transcoding
    // - image resizing
    // - audio processin
  }
}
