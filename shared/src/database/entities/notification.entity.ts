import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export enum NotificationChanel {
  EMAIL = "email",
  SMS = "sms",
  PUSH = "push",
}

export enum NotificationStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  SENT = "sent",
  FAILED = "failed",
}

@Entity("notifications")
@Index(["jobId", "recipient", "channel"], { unique: true }) //  IDEMPOTENCY
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Job context
  @Column()
  @Index()
  jobId: string;

  @Column()
  @Index()
  tenantId: string;

  @Column()
  userId: string;

  // who receieve the notification
  @Column()
  @Index()
  recipient: string;

  // subject (email specific)
  @Column({ nullable: true })
  subject: string;

  // message body
  @Column("text")
  content: string;

  // channel tupe
  @Column({
    type: "enum",
    enum: NotificationChanel,
    default: NotificationChanel.EMAIL,
  })
  channel: NotificationChanel;

  // Delivery state
  @Column({
    type: "enum",
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  @Index()
  status: NotificationStatus;

  //retry tracking
  @Column({ default: 0 })
  attemptCount: number;

  @Column({ nullable: true })
  lastAttemptAT: Date;

  // provider response tracking
  @Column({ nullable: true })
  providerMessageId: string;

  @Column({ nullable: true })
  faliureReason: string;

  @Column({ nullable: true })
  sentAt: Date;

  // Idempotency protection
  @Column({ unique: true })
  @Index()
  referenceId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
