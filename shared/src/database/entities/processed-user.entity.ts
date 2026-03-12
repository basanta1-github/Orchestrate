import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("processed_users")
export class ProcessedUser {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  // add more columns to match the transformedData structure
}
