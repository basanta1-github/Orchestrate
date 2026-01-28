import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from "typeorm";

import { Job } from "./job.entity";
@Entity("job_attempts")
export class JobAttempt {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ default: 1 })
  attemptNumber: number;

  @Column({ default: "pending" })
  status: string;

  @Column("jsonb", { nullable: true })
  result: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  // @Column({ type: 'timestamp', nullable: true })
  // startedAt?: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: "text", nullable: true })
  errorMessage?: string;

  @Column({ type: "timestamp", nullable: true })
  completedAt?: Date;

  //Relations
  @ManyToOne(() => Job, (job) => job.attempts)
  job: Job;
}
