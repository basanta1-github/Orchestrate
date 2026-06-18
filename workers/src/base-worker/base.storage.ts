import fs from "fs-extra";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  // credentials: {
  //   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  //   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  // },
});
function resolveLocalOutputDir(folder: string): string {
  if (folder === "processed_media" && process.env.MEDIA_OUTPUT_DIR) {
    return process.env.MEDIA_OUTPUT_DIR;
  }
  if (folder === "processed_report" && process.env.REPORT_OUTPUT_DIR) {
    return process.env.REPORT_OUTPUT_DIR;
  }
  return path.join(process.cwd(), folder);
}
function getPublicApiUrl(): string {
  return (process.env.PUBLIC_API_URL || "http://localhost:3001").replace(
    /\/$/,
    "",
  );
}
export async function uploadFileLocal(
  filePath: string,
  folder: string = "processed_storage",
): Promise<{ url: string; path: string }> {
  const fileName = path.basename(filePath);
  const localDir = resolveLocalOutputDir(folder);

  //make sure folder exists
  await fs.ensureDir(localDir);

  // copy only if not there
  const destinationPath = path.join(localDir, fileName);
  if (filePath !== destinationPath) {
    await fs.copyFile(filePath, destinationPath);
  }
  // return destinationPath;
  return {
    url: `${getPublicApiUrl()}/${folder}/${fileName}`,
    path: destinationPath,
  };
}

export async function uploadFileS3(
  fullPath: string,
  filename: string,
): Promise<string> {
  const bucketName = process.env.S3_BUCKET!;
  const fileContent = await fs.readFile(fullPath);
  // console.log("ACCESS:", process.env.AWS_ACCESS_KEY_ID);
  // console.log("SECRET:", process.env.AWS_SECRET_ACCESS_KEY);
  // console.log("REGION:", process.env.AWS_REGION);
  // console.log("bucket:", process.env.S3_BUCKET);

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: filename,
        Body: fileContent,
      }),
    );
    console.log(`File uploaded successfully to S3: ${filename}`);
  } catch (err) {
    console.error("S3 upload error:", err);
    throw err;
  }

  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;
}
