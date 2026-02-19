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

export async function uploadFileLocal(fullPath: string): Promise<string> {
  const fileName = path.basename(fullPath);
  const localDir = path.join(process.cwd(), "processed_media");

  //make sure folder exists
  await fs.ensureDir(localDir);

  // copy only if not there
  const destinationPath = path.join(localDir, fileName);
  if (fullPath !== destinationPath) {
    await fs.copyFile(fullPath, destinationPath);
  }
  // return destinationPath;
  return `http://localhost:3001/processed_media/${fileName}`;
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
