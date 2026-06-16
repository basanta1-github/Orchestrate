import { DataSource } from "typeorm";
import { Job } from "./entities/job.entity";
import { JobAttempt } from "./entities/job-attempt.entity";
import { JobLog } from "./entities/job-log.entity";
import { JobDependency } from "./entities/job-dependencies.entity";
import { User } from "./entities/user.entity";
import { Tenant } from "./entities/tenant.entity";
import { Worker } from "./entities/worker.entity";
import { Notification } from "./entities/notification.entity";
import { RecurringJob } from "./entities/recurring-jobs.entity";
import { QueueSequence } from "./entities/queueSequence.entity";
import { ProcessedUser } from "./entities/processed-user.entity";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASS || "postgres",
  database: process.env.DB_NAME || "job_que",
  entities: [
    Job,
    JobAttempt,
    JobLog,
    JobDependency,
    User,
    Tenant,
    Worker,
    Notification,
    RecurringJob,
    QueueSequence,
    ProcessedUser,
  ],
  migrations: ["src/database/migrations/*.ts"],
  synchronize: false,
  logging: process.env.NODE_ENV !== "production",
});
