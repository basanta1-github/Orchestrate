import { execFileSync } from "child_process";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";

const DEFAULT_FFMPEG =
  process.platform === "win32" ? "ffmpeg" : "/usr/bin/ffmpeg";
const DEFAULT_FFPROBE =
  process.platform === "win32" ? "ffprobe" : "/usr/bin/ffprobe";

function resolveBinary(envValue: string | undefined, fallback: string): string {
  const trimmed = envValue?.trim();
  return trimmed || fallback;
}

function assertBinary(label: string, binPath: string): void {
  if (binPath.includes("/") || binPath.includes("\\")) {
    if (!fs.existsSync(binPath)) {
      throw new Error(`${label} not found at ${binPath}`);
    }
    return;
  }

  try {
    const lookup = process.platform === "win32" ? "where" : "which";
    execFileSync(lookup, [binPath], { stdio: "ignore" });
  } catch {
    throw new Error(`${label} not found in PATH (${binPath})`);
  }
}

export function configureFfmpeg(): { ffmpegPath: string; ffprobePath: string } {
  const ffmpegPath = resolveBinary(process.env.FFMPEG_PATH, DEFAULT_FFMPEG);
  const ffprobePath = resolveBinary(process.env.FFPROBE_PATH, DEFAULT_FFPROBE);

  assertBinary("ffmpeg", ffmpegPath);
  assertBinary("ffprobe", ffprobePath);

  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);

  return { ffmpegPath, ffprobePath };
}
