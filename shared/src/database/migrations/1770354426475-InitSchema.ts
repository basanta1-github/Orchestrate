import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1770354426475 implements MigrationInterface {
    name = 'InitSchema1770354426475'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_logs" RENAME COLUMN "createdAT" TO "createdAt"`);
        await queryRunner.query(`ALTER TABLE "job_attempts" DROP COLUMN "completedAt"`);
        await queryRunner.query(`ALTER TABLE "job_attempts" ADD "startedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "job_attempts" ADD "finishedAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_attempts" DROP COLUMN "finishedAt"`);
        await queryRunner.query(`ALTER TABLE "job_attempts" DROP COLUMN "startedAt"`);
        await queryRunner.query(`ALTER TABLE "job_attempts" ADD "completedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "job_logs" RENAME COLUMN "createdAt" TO "createdAT"`);
    }

}
