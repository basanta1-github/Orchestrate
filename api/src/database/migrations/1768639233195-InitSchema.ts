import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1768639233195 implements MigrationInterface {
    name = 'InitSchema1768639233195'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "status"`);
        await queryRunner.query(`CREATE TYPE "public"."jobs_status_enum" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "status" "public"."jobs_status_enum" NOT NULL DEFAULT 'QUEUED'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."jobs_status_enum"`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "status" character varying NOT NULL DEFAULT 'pending'`);
    }

}
