import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";
import "reflect-metadata";
import { EmailWorker } from "./email-worker/worker";
import { ETLWorker } from "./etl-worker/worker";
import { MediaWorker } from "./media-worker/worker";
import { MLWorker } from "./ml-worker/worker";
import { ReportWorker } from "./report-worker/worker";

const WORKER_TOKENS = {
  email: "EmailWorker",
  etl: "ETLWorker",
  media: "MediaWorker",
  ml: "MLWorker",
  report: "ReportWorker",
} as const;

async function bootstrap() {
  // create() (not createApplicationContext) gives us an http server
  // which is what lets Prometheus scrape this worker,s /metrics endpoint
  // const app = await NestFactory.createApplicationContext(WorkerModule);
  const app = await NestFactory.create(WorkerModule, {
    logger: ["error", "warn", "log"],
  });
  const type = process.env.WORKER_TYPE as keyof typeof WORKER_TOKENS;
  const workerClass = WORKER_TOKENS[type];
  if (!workerClass) {
    console.error(`❌ Invalid WORKER_TYPE: ${type}`);
    await app.close();
    process.exit(1);
    return;
  }

  console.log(`🚀 Starting worker of type: ${type}`);
  await app.get(workerClass).start();

  // expose /metrics for this worker process
  const port = Number(process.env.METRICS_PORT) || 3001;
  await app.listen(port, "0.0.0.0");
  console.log(`📈 ${type}-worker metrics: http://0.0.0.0:${port}/metrics`);
}

bootstrap().catch((err) => {
  console.error("🔥 WORKER BOOTSTRAP ERROR:", err);
  process.exit(1);
});
