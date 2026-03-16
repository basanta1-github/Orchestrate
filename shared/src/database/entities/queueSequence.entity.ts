import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from "typeorm";

@Entity("queue_sequences")
export class QueueSequence {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  queueName: string;

  @Column({ type: "int", default: 0 })
  lastSequence: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
