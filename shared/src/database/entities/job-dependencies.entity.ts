import {
  Column,
  Entity,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("job_dependencies")
export class JobDependency {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  parentJobId: string;

  @Column("uuid")
  childJobId: string;

  @Column({ default: false })
  triggered: boolean;

  @Column({ default: "PENDING" })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
