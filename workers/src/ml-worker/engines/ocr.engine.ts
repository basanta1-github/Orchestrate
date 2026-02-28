import axios from "axios";
import fs from "fs-extra";
import path from "path";
import sharp from "sharp";
import { ModelLoader } from "../model-loader.service";
export class OCREngine {
  static async run(imageUrl: string): Promise<string> {
    // 1. Download image
    const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data, "binary");
    // 2. Preprocess image (grayscale + normalize + threshold)
    const preprocessedBuffer = await sharp(buffer)
      .grayscale()
      .normalize()
      // .threshold(180)
      .toBuffer();

    const worker = await ModelLoader.getOCRWorker();

    const { data } = await worker.recognize(preprocessedBuffer);
    const cleaned = data.text
      // remove weird unicode quotes/symbols
      .replace(/[^\x00-\x7F]/g, "")
      // remove unwanted symbols
      .replace(/[^a-zA-Z0-9\s.,!?]/g, "")
      // collapse multiple spaces
      .replace(/\s+/g, " ")
      .trim();

    return cleaned;
  }
}
