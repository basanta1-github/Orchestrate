import { Module, OnModuleInit, Type } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { join } from "path";
import { Job as BullJob } from "bullmq";
import {
  DatabaseModule,
  JobsModule,
  MetricsModule,
  QueueModule,
  workerRegistryService,
} from "@jobque/shared";
import { MediaProcessor } from "./media-worker/processor";
import { MediaWorker } from "./media-worker/worker";
import { MediaController } from "./media-worker/media.controller";
import { ReportProcessor } from "./report-worker/processor";
import { ReportWorker } from "./report-worker/worker";
import { ReportController } from "./report-worker/report.controller";
import { MLProcessor } from "./ml-worker/processor";
import { MLWorker } from "./ml-worker/worker";
import { EmailProcessor } from "./email-worker/processor";
import { EmailWorker } from "./email-worker/worker";
import { ETLProcessor } from "./etl-worker/processor";
import { ETLWorker } from "./etl-worker/worker";
import { ETLService } from "./etl-worker/service";

type WorkerType = "email" | "etl" | "media" | "ml" | "report";

const WORKER_CONFIG: Record<
  WorkerType,
  {
    queue: string;
    worker: Type<unknown>;
    controllers?: Type<unknown>[];
  }
> = {
  media: {
    queue: "media-jobs",
    worker: MediaWorker,
    controllers: [MediaController],
  },
  report: {
    queue: "report-jobs",
    worker: ReportWorker,
    controllers: [ReportController],
  },
  ml: { queue: "ml-jobs", worker: MLWorker },
  email: { queue: "email-jobs", worker: EmailWorker },
  etl: { queue: "etl-jobs", worker: ETLWorker },
};

const ALL_WORKERS = [
  MediaWorker,
  MLWorker,
  ReportWorker,
  EmailWorker,
  ETLWorker,
];
const ALL_CONTROLLERS = [MediaController, ReportController];
const ALL_PROCESSORS = [
  MediaProcessor,
  ReportProcessor,
  MLProcessor,
  EmailProcessor,
  ETLService,
  ETLProcessor,
];

function resolveWorkerMode():
  | { mode: "all" }
  | {
      mode: "single";
      type: WorkerType;
      config: (typeof WORKER_CONFIG)[WorkerType];
    } {
  const type = process.env.WORKER_TYPE as WorkerType | undefined;
  if (!type) {
    return { mode: "all" };
  }
  const config = WORKER_CONFIG[type];
  if (!config) {
    throw new Error(
      `Invalid WORKER_TYPE "${type}". Expected: email | etl | media | ml | report`,
    );
  }
  return { mode: "single", type, config };
}

const bootMode = resolveWorkerMode();
const workerProviders =
  bootMode.mode === "all" ? ALL_WORKERS : [bootMode.config.worker];
const workerControllers =
  bootMode.mode === "all"
    ? ALL_CONTROLLERS
    : (bootMode.config.controllers ?? []);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), "../.env"),
    }),
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432", 10),
      username: process.env.DB_USER || "postgres",
      password: process.env.DB_PASS || "postgres",
      database: process.env.DB_NAME || "job_que",
      autoLoadEntities: true,
      synchronize: process.env.DB_SYNCRONIZE !== "false",
      logging: ["error", "warn"],
    }),
    DatabaseModule,
    MetricsModule,
    QueueModule,
    JobsModule,
  ],
  providers: [...workerProviders, ...ALL_PROCESSORS],
  controllers: workerControllers,
})
export class WorkerModule implements OnModuleInit {
  constructor(
    private readonly workerRegistery: workerRegistryService,
    private readonly mediaProcessor: MediaProcessor,
    private readonly reportProcessor: ReportProcessor,
    private readonly mlProcessor: MLProcessor,
    private readonly emailProcessor: EmailProcessor,
    private readonly etlProcessor: ETLProcessor,
  ) {}

  onModuleInit(): void {
    const registrations: Array<
      [string, () => (job: BullJob) => Promise<void>]
    > = [
      ["media-jobs", () => (job) => this.mediaProcessor.execute(job)],
      ["report-jobs", () => (job) => this.reportProcessor.execute(job)],
      ["ml-jobs", () => (job) => this.mlProcessor.execute(job)],
      ["email-jobs", () => (job) => this.emailProcessor.execute(job)],
      ["etl-jobs", () => (job) => this.etlProcessor.execute(job)],
    ];

    const mode = resolveWorkerMode();
    const activeQueues =
      mode.mode === "all"
        ? new Set(registrations.map(([queue]) => queue))
        : new Set([mode.config.queue]);

    for (const [queue, factory] of registrations) {
      if (activeQueues.has(queue)) {
        this.workerRegistery.registerProcessor(queue, factory);
      }
    }
  }
}
