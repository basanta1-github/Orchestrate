import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1781770326747 implements MigrationInterface {
    name = 'InitSchema1781770326747'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tenants_plan_enum" AS ENUM('free', 'pro', 'enterprise')`);
        await queryRunner.query(`CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "plan" "public"."tenants_plan_enum" NOT NULL DEFAULT 'free', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_32731f181236a46182a38c992a8" UNIQUE ("name"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('super_admin', 'admin', 'user')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "email" character varying(255) NOT NULL, "password" character varying(255) NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'user', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tenantId" uuid, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "job_attempts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "attemptNumber" integer NOT NULL DEFAULT '1', "status" character varying NOT NULL DEFAULT 'pending', "result" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "startedAt" TIMESTAMP, "finishedAt" TIMESTAMP, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "errorMessage" text, "jobId" uuid, CONSTRAINT "PK_61deab46f06c9ab9d5585b28423" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "job_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "message" character varying NOT NULL, "data" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "jobId" uuid, CONSTRAINT "PK_58193ed7a13b6627e99dc1c0985" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "workers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e950c9aba3bd84a4f193058d838" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "recurring_job" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "runCount" integer NOT NULL DEFAULT '0', "jobType" character varying NOT NULL, "cron" character varying NOT NULL, "metadata" jsonb, "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tenantId" uuid, "userId" uuid, CONSTRAINT "PK_b5c58b7b2ef17bf3fbb021a941d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."jobs_status_enum" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'SCHEDULED', 'SKIPPED', 'PENDING', 'WAITING_FOR_DEPENDENCIES', 'READY', 'STAGED')`);
        await queryRunner.query(`CREATE TYPE "public"."jobs_prioritylevel_enum" AS ENUM('HIGH', 'MEDIUM', 'LOW', 'NONE')`);
        await queryRunner.query(`CREATE TABLE "jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "queueSequence" integer, "type" character varying NOT NULL, "status" "public"."jobs_status_enum" NOT NULL DEFAULT 'QUEUED', "priorityLevel" "public"."jobs_prioritylevel_enum" NOT NULL DEFAULT 'NONE', "retries" integer NOT NULL DEFAULT '0', "metadata" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "completedAt" TIMESTAMP, "delayMs" bigint, "cron" character varying, "idempotencyKey" character varying, "scheduledAt" TIMESTAMP NOT NULL DEFAULT now(), "recurringJobId" uuid, "workFlowId" character varying, "faliureStrategy" character varying, "tenantId" uuid, "userId" uuid, "workerId" uuid, CONSTRAINT "UQ_e7bffc12dbf947ffa4b453eb60c" UNIQUE ("idempotencyKey"), CONSTRAINT "PK_cf0a6c42b72fcc7f7c237def345" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "job_dependencies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "parentJobId" uuid NOT NULL, "childJobId" uuid NOT NULL, "triggered" boolean NOT NULL DEFAULT false, "status" character varying NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1d435220b97892c66d0e3697ed4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_channel_enum" AS ENUM('email', 'sms', 'push')`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_status_enum" AS ENUM('pending', 'processing', 'sent', 'failed')`);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "jobId" character varying NOT NULL, "tenantId" character varying NOT NULL, "userId" character varying NOT NULL, "recipient" character varying NOT NULL, "subject" character varying, "content" text NOT NULL, "channel" "public"."notifications_channel_enum" NOT NULL DEFAULT 'email', "status" "public"."notifications_status_enum" NOT NULL DEFAULT 'pending', "attemptCount" integer NOT NULL DEFAULT '0', "lastAttemptAT" TIMESTAMP, "providerMessageId" character varying, "faliureReason" character varying, "sentAt" TIMESTAMP, "referenceId" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d1b85f861c7a0274b39aba4bd6e" UNIQUE ("referenceId"), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cdbc0d66a7288ce43a9cc1ee54" ON "notifications" ("jobId") `);
        await queryRunner.query(`CREATE INDEX "IDX_d5b86bc522af7cc9e3e13960ff" ON "notifications" ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_b78edd430e2dc39d22fb49ff64" ON "notifications" ("recipient") `);
        await queryRunner.query(`CREATE INDEX "IDX_92f5d3a7779be163cbea7916c6" ON "notifications" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_d1b85f861c7a0274b39aba4bd6" ON "notifications" ("referenceId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_258a70d7302a03e14db5fa5645" ON "notifications" ("jobId", "recipient", "channel") `);
        await queryRunner.query(`CREATE TABLE "queue_sequences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "queueName" character varying NOT NULL, "lastSequence" integer NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_120429fa0344475531a470fff87" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "processed_users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, CONSTRAINT "PK_0c48c36b8661b8a1ca3ca17f577" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_c58f7e88c286e5e3478960a998b" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_attempts" ADD CONSTRAINT "FK_8c1759b899ebddee08db795a37b" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_logs" ADD CONSTRAINT "FK_35fcfcba9d292c0c1738b8edd97" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurring_job" ADD CONSTRAINT "FK_28a8579aa07601df90a821a399b" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurring_job" ADD CONSTRAINT "FK_8257f3fd9249f051b652bff1d6d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_8231b5f5f898c6608094a5553bc" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_79ae682707059d5f7655db4212a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_b003c3e96d524079907b0248c7e" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_b4e86166de9e9bf17aef9933c04" FOREIGN KEY ("recurringJobId") REFERENCES "recurring_job"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_dependencies" ADD CONSTRAINT "FK_61ec9bbd51ed2e87dfde6ea8c6c" FOREIGN KEY ("parentJobId") REFERENCES "jobs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_dependencies" ADD CONSTRAINT "FK_c67b80e4e9145c945672eadf7f1" FOREIGN KEY ("childJobId") REFERENCES "jobs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_dependencies" DROP CONSTRAINT "FK_c67b80e4e9145c945672eadf7f1"`);
        await queryRunner.query(`ALTER TABLE "job_dependencies" DROP CONSTRAINT "FK_61ec9bbd51ed2e87dfde6ea8c6c"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_b4e86166de9e9bf17aef9933c04"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_b003c3e96d524079907b0248c7e"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_79ae682707059d5f7655db4212a"`);
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_8231b5f5f898c6608094a5553bc"`);
        await queryRunner.query(`ALTER TABLE "recurring_job" DROP CONSTRAINT "FK_8257f3fd9249f051b652bff1d6d"`);
        await queryRunner.query(`ALTER TABLE "recurring_job" DROP CONSTRAINT "FK_28a8579aa07601df90a821a399b"`);
        await queryRunner.query(`ALTER TABLE "job_logs" DROP CONSTRAINT "FK_35fcfcba9d292c0c1738b8edd97"`);
        await queryRunner.query(`ALTER TABLE "job_attempts" DROP CONSTRAINT "FK_8c1759b899ebddee08db795a37b"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_c58f7e88c286e5e3478960a998b"`);
        await queryRunner.query(`DROP TABLE "processed_users"`);
        await queryRunner.query(`DROP TABLE "queue_sequences"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_258a70d7302a03e14db5fa5645"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d1b85f861c7a0274b39aba4bd6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_92f5d3a7779be163cbea7916c6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b78edd430e2dc39d22fb49ff64"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d5b86bc522af7cc9e3e13960ff"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cdbc0d66a7288ce43a9cc1ee54"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_channel_enum"`);
        await queryRunner.query(`DROP TABLE "job_dependencies"`);
        await queryRunner.query(`DROP TABLE "jobs"`);
        await queryRunner.query(`DROP TYPE "public"."jobs_prioritylevel_enum"`);
        await queryRunner.query(`DROP TYPE "public"."jobs_status_enum"`);
        await queryRunner.query(`DROP TABLE "recurring_job"`);
        await queryRunner.query(`DROP TABLE "workers"`);
        await queryRunner.query(`DROP TABLE "job_logs"`);
        await queryRunner.query(`DROP TABLE "job_attempts"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "tenants"`);
        await queryRunner.query(`DROP TYPE "public"."tenants_plan_enum"`);
    }

}
