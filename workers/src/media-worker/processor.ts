import { BaseProcessor } from "../base-worker/base.processor";
import { Job as Bulljob } from "bullmq";
import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { InjectDataSource } from "@nestjs/typeorm";

import ffmpeg from "fluent-ffmpeg";
import fs from "fs-extra";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { uploadFileLocal, uploadFileS3 } from "./storageService";

@Injectable()
export class MediaProcessor extends BaseProcessor {
  // for image
  private readonly MAX_WIDTH = 5000;
  private readonly MAX_HEIGHT = 5000;
  private readonly MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
  private readonly ALLOWED_FORMATS = ["jpeg", "png", "jpg", "webp"];
  private readonly ALLOWED_FILTERS = [
    "grayscale",
    "rotate",
    "flip",
    "flop",
    "blur",
  ];
  constructor(
    @InjectDataSource()
    dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected async process(job: Bulljob): Promise<void> {
    console.log(`[MediaProcessor] processing media job`, job.data);

    // simulate faliure if failtest is true
    if (job.data.metadata?.failTest) {
      throw new Error("Simulated faliure for testing");
    }
    let outputFileName: string;
    switch (job.data.jobType) {
      case "video_transcode":
        outputFileName = await this.processVideo(
          job.data.metadata.fileUrl,
          job.data.metadata.format,
        );
        break;
      case "audio_transcode":
        outputFileName = await this.processAudio(
          job.data.metadata.fileUrl,
          job.data.metadata.format,
        );
        break;
      case "image_resize":
        outputFileName = await this.processImage(
          job.data.metadata.fileUrl,
          job.data.metadata.width,
          job.data.metadata.height,
          job.data.metadata.format,
          job.data.metadata.filters || [],
        );
        break;
      default:
        throw new Error(`Unknown job type: ${job.data.jobType}`);
    }

    const fullOutputPath = path.join(
      process.cwd(),
      "processed_media",
      outputFileName,
    );

    // upload to local or s3 based on env uding the full path

    // local first
    const localPath = await uploadFileLocal(fullOutputPath);

    // uptionally upload to s3
    let s3Path =
      process.env.USE_S3 === "true"
        ? await uploadFileS3(fullOutputPath, outputFileName)
        : null;

    // Clean temp file (if it's a separate temp output, not local copy)
    if (
      fullOutputPath !==
      path.join(process.cwd(), "processed_media", outputFileName)
    ) {
      await fs.remove(fullOutputPath);
    }
    // attach file url to job data so baseProcessor can update db
    job.data.result = {
      local: localPath,
      s3: s3Path,
    };
    // await new Promise((resolve) => setTimeout(resolve, 2000)); // simulate work
    console.log(
      `[MediaProcessor] job ${job.data.jobId} processed successfully`,
    );
  }
  private async processVideo(fileUrl: string, format: string): Promise<string> {
    const outputFileName = `${uuidv4()}.${format}`;
    const outputPath = path.join(
      process.cwd(),
      "processed_media",
      outputFileName,
    );
    await fs.ensureDir(path.dirname(outputPath));

    return new Promise((resolve, reject) => {
      ffmpeg(fileUrl)
        .output(outputPath)
        .on("end", () => resolve(outputFileName))
        .on("error", (err) => reject(err))
        .run();
    });
  }
  private async processAudio(fileUrl: string, format: string): Promise<string> {
    const outputFileName = `${uuidv4()}.${format}`;
    const outputPath = path.join(
      process.cwd(),
      "processed_media",
      outputFileName,
    );
    await fs.ensureDir(path.dirname(outputPath));

    return new Promise((resolve, reject) => {
      ffmpeg(fileUrl)
        .output(outputPath)
        .on("end", () => resolve(outputFileName))
        .on("error", (err) => reject(err))
        .run();
    });
  }
  private async processImage(
    fileUrl: string,
    width: number,
    height: number,
    format: "jpeg" | "png" | "jpg" | "webp",
    filters: string[] = [],
  ): Promise<string> {
    // setup sharp and paths
    const { default: sharp } = await import("sharp"); // dynamic import to reduce startup time and optional dependency
    const outputFileName = `${uuidv4()}.${format}`;
    const outputPath = path.join(
      process.cwd(),
      "processed_media",
      outputFileName,
    );
    await fs.ensureDir(path.dirname(outputPath));

    let imageBuffer: Buffer;
    if (typeof fileUrl === "string" && fileUrl.startsWith("http")) {
      const response = await axios.get(fileUrl, {
        responseType: "arraybuffer",
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: fileUrl,
        },
      });
      if (response.data.length > this.MAX_FILE_SIZE) {
        throw new Error("File too large. Max 20MB allowed");
      }
      imageBuffer = Buffer.from(response.data);
    } else {
      imageBuffer = await fs.readFile(fileUrl);
    }
    // normalizing the filters for the for each loop
    let safeFilters: string[] = [];

    if (Array.isArray(filters)) {
      safeFilters = filters;
    } else if (typeof filters === "string") {
      try {
        const parsed = JSON.parse(filters);
        safeFilters = Array.isArray(parsed) ? parsed : [filters];
      } catch {
        safeFilters = [filters];
      }
    }
    this.validateImageInput(width, height, format, safeFilters);

    //fetch and process
    let processor = sharp(imageBuffer).resize(width, height, {
      fit: "cover",
      withoutEnlargement: true,
    });

    // apply filters dynamically
    safeFilters.forEach((filter) => {
      switch (filter.toLowerCase()) {
        case "grayscale":
          processor = processor.grayscale();
          break;
        case "rotate":
          processor = processor.rotate(90);
          break;
        case "flip":
          processor = processor.flip();
          break;
        case "flop":
          processor = processor.flop();
          break;
        case "blur":
          processor = processor.blur();
          break;
        default:
          console.warn(`Unknown folter: ${filter}`);
      }
    });
    processor = processor.toFormat(format);

    await processor.toFile(outputPath);

    return outputFileName;
  }

  private validateImageInput(
    width: number,
    height: number,
    format: string,
    filters: string[],
  ) {
    if (!width || !height) {
      throw new Error("width and height are required");
    }
    if (width > this.MAX_WIDTH || height > this.MAX_HEIGHT) {
      throw new Error(
        `dimensions exceed max ${this.MAX_HEIGHT || this.MAX_WIDTH}px`,
      );
    }
    if (!this.ALLOWED_FORMATS.includes(format)) {
      throw new Error(`Unsupported format : ${format}`);
    }
    filters.forEach((f) => {
      if (!this.ALLOWED_FILTERS.includes(f.toLowerCase())) {
        throw new Error(`Unsupported filter: ${f}`);
      }
    });
  }
}
