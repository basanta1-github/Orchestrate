import {
  Column,
  Entity,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";

import { Job } from "./job.entity";

@Entity("job_dependencies")
export class JobDependency {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  parentJobId: string;

  @Column("uuid")
  childJobId: string;

  @ManyToOne(() => Job)
  @JoinColumn({ name: "parentJobId" })
  parentJob: Job;

  @ManyToOne(() => Job)
  @JoinColumn({ name: "childJobId" })
  childJob: Job;

  @Column({ default: false })
  triggered: boolean;

  @Column({ default: "PENDING" })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
