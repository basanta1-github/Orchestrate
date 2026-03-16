import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

@Entity()
export class RecurringJob {
  @PrimaryGeneratedColumn("uuid")
  id: string;
  @Column({ type: "int", default: 0 })
  runCount: number; // tracks recurring job run sequence

  @Column()
  jobType: string;

  @Column()
  cron: string;

  @Column("jsonb", { nullable: true })
  metadata?: Record<string, any>;

  @Column({ default: true })
  active: boolean;

  @ManyToOne(() => Tenant)
  tenant: Tenant;

  @ManyToOne(() => User)
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
