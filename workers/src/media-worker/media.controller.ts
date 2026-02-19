import { Controller, Get, Param, Res, NotFoundException } from "@nestjs/common";
import { Response } from "express";
import fs from "fs-extra";
import path from "path";

@Controller("processed_media")
export class MediaController {
  @Get(":filename")
  async getFile(@Param("filename") filename: string, @Res() res: Response) {
    const filePath = path.join(process.cwd(), "processed_media", filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException("File not found");
    }
    res.sendFile(filePath);
  }
}
