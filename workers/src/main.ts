import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";
import "reflect-metadata";

const VALID_TYPES = ["email", "etl", "media", "ml", "report"] as const;

async function bootstrap() {
  const type = process.env.WORKER_TYPE;
  if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    console.error(
      `❌ WORKER_TYPE is required. Valid values: ${VALID_TYPES.join(", ")}`,
    );
    process.exit(1);
  }

  const app = await NestFactory.create(WorkerModule, {
    logger: ["error", "warn", "log"],
  });

  console.log(`🚀 Starting ${type} worker`);

  const port = Number(process.env.METRICS_PORT) || 3001;
  await app.listen(port, "0.0.0.0");
  console.log(`📈 ${type}-worker metrics: http://0.0.0.0:${port}/metrics`);
}

bootstrap().catch((err) => {
  console.error("🔥 WORKER BOOTSTRAP ERROR:", err);
  process.exit(1);
});
