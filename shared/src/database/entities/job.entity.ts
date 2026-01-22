import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";

import { User } from "./user.entity";
import { Tenant } from "./tenant.entity";
import { JobAttempt } from "./job-attempt.entity";
import { JobLog } from "./job-log.entity";
import { Worker } from "./worker.entity";
import { JobStatus } from "../../jobs/jobs.constants";

@Entity("jobs")
export class Job {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  type: string;

  @Column({ type: "enum", enum: JobStatus, default: JobStatus.QUEUED })
  status: string;

  @Column({ default: 0 })
  priority: number;

  @Column({ default: 0 })
  retries: number;

  @Column("jsonb", { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Tenant, (tenant) => tenant.jobs)
  tenant: Tenant;

  @ManyToOne(() => User, (user) => user.jobs)
  user: User;

  @OneToMany(() => JobAttempt, (attempt) => attempt.job)
  attempts: JobAttempt[];

  @OneToMany(() => JobLog, (log) => log.job)
  logs: JobLog[];

  @ManyToOne(() => Worker, (worker) => worker, { nullable: true })
  worker: Worker;
}
