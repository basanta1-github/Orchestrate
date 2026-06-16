import {
  IsString,
  IsInt,
  IsOptional,
  IsObject,
  Min,
  Max,
  IsNumber,
  IsIn,
} from "class-validator";
export class CreateJobDto {
  @IsString()
  jobType: string;

  @IsObject()
  metadata: Record<string, any>;

  @IsOptional()
  @IsIn(["HIGH", "MEDIUM", "LOW", "NONE"])
  priorityLevel?: "HIGH" | "MEDIUM" | "LOW" | "NONE";

  // number of retries
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  retries?: number;

  // delay scheduling
  @IsOptional()
  @IsNumber()
  @Min(0)
  delayMs?: number;

  // cron scheduling
  @IsOptional()
  @IsString()
  cron?: string;

  // idempotency protection
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
