import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1772613263684 implements MigrationInterface {
  name = "InitSchema1772613263684";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // add columns as nullable
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "jobId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "tenantId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "userId" character varying`,
    );

    //fill existing rows
    await queryRunner.query(
      `UPDATE "notifications" SET "jobId" = uuid_generate_v4()::text WHERE "jobId" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "notifications" SET "tenantId" = 'legacy-tenant' WHERE "tenantId" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "notifications" SET "userId" = 'legacy-user' WHERE "userId" IS NULL`,
    );

    // enforce not null
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "jobId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "tenantId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "userId" SET NOT NULL`,
    );

    // STEP 4 — create indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_jobId" ON "notifications" ("jobId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_tenantId" ON "notifications" ("tenantId")`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_notifications_idempotency" ON "notifications" ("jobId","recipient","channel")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notifications_idempotency"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_tenantId"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_jobId"`);

    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "userId"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "tenantId"`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "jobId"`);
  }
}
