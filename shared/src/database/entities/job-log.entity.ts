import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from "typeorm";
import { Job } from "./job.entity";

@Entity("job_logs")
export class JobLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  message: string;

  @Column({ type: "jsonb", nullable: true })
  data: Record<string, any>;

  @CreateDateColumn()
  createdAT: Date;

  //Relations
  @ManyToOne(() => Job, (job) => job.logs)
  job: Job;
}
