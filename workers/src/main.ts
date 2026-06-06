import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const type = process.env.WORKER_TYPE;
  console.log(`🚀 Starting worker of type: ${type}`);

  const email = app.get("EmailWorker");
  const etl = app.get("ETLWorker");
  const media = app.get("MediaWorker");
  const ml = app.get("MLWorker");
  const report = app.get("ReportWorker");

  switch (type) {
    case "email":
      await email.start();
      break;

    case "etl":
      await etl.start();
      break;

    case "media":
      await media.start();
      break;

    case "ml":
      await ml.start();
      break;

    case "report":
      await report.start();
      break;

    default:
      console.error(`❌ Unknown WORKER_TYPE: ${type}`);
      process.exit(1);
  }
}

bootstrap().catch((err) => {
  console.error("🔥 WORKER BOOTSTRAP ERROR:", err);
});
