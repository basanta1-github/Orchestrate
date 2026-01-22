import { BaseWorker } from "../base-worker/base.worker";
import { MediaProcessor } from "./processor";
import { DataSource } from "typeorm";

export class MediaWorker extends BaseWorker {
  constructor(dataSource: DataSource) {
    super("video_transcode", new MediaProcessor(dataSource));
  }
}
