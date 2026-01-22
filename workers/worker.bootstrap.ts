import "module-alias/register";
import { config } from "dotenv";
import { resolve } from "path";
import { DataSource } from "typeorm";
import { MediaProcessor } from "./media-worker/processor";
import { MediaWorker } from "./media-worker/worker";
import {
  Job,
  JobAttempt,
  JobLog,
  User,
  Tenant,
  Worker as WorkerEntity,
} from "@jobque/shared";

// load .env from project root
config({ path: resolve(__dirname, "../.env") });
// Step C: Ensure env variables are correct
console.log(
  "REDIS_HOST:",
  process.env.REDIS_HOST,
  "DB_HOST:",
  process.env.DB_HOST,
);

// Step A: Initialize TypeORM DataSource
const dataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: [Job, JobAttempt, User, Tenant, WorkerEntity, JobLog],
  synchronize: true,
});

dataSource
  .initialize()
  .then(async () => {
    console.log("DataSource initialized");

    // creating worker instance, writing the processor
    new MediaWorker(dataSource);

    console.log("MediaWorker started and listening to queue");

    // Step B (optional but important): Keep Node alive if no jobs yet
    process.stdin.resume();
  })
  .catch((err) => {
    console.error("Error  initializing DataSource:", err);
    process.exit(1);
  });
