// // import 'reflect-metadata';
// import { DataSource } from "typeorm";
// import { Job } from "./entities/job.entity";
// import { JobAttempt } from "./entities/job-attempt.entity";
// import { JobLog } from "./entities/job-log.entity";
// import { User } from "./entities/user.entity";
// import { Tenant } from "./entities/tenant.entity";
// import { Worker } from "./entities/worker.entity";

// export const AppDataSource = new DataSource({
//   type: "postgres",
//   host: process.env.DB_HOST,
//   port: parseInt(process.env.DB_PORT || "5432", 10),
//   username: process.env.DB_USER || "postgres",
//   password: process.env.DB_PASS || "postgres",
//   database: process.env.DB_NAME || "job_que",
//   entities: [Job, JobAttempt, JobLog, User, Tenant, Worker],
//   migrations: ["src/database/migrations/*.ts"], // migration folder
//   synchronize: true, // NEVER use true in production // use true in development
//   logging: true,
// });
