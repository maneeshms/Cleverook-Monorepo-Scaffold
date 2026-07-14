import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Compliance tables (@clevrook/compliance):
 *  - audit_log: append-only, HMAC hash-chained, tamper-evident trail (SOC 2 CC7 /
 *    ISO 27001 A.8.15). No FK to users — the trail must outlive erased subjects.
 *  - consent_records: append-only consent ledger (GDPR Art. 6/7).
 *
 * Both are decoupled from auth (no FKs), so the compliance capability can be
 * enabled independently. Rides with the `compliance` init capability.
 */
export class AddCompliance1750000000005 implements MigrationInterface {
  name = 'AddCompliance1750000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sequence" BIGSERIAL NOT NULL,
        "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "actor_id" uuid,
        "actor_type" varchar(32) NOT NULL DEFAULT 'user',
        "action" varchar(100) NOT NULL,
        "resource_type" varchar(64),
        "resource_id" varchar(128),
        "outcome" varchar(16) NOT NULL DEFAULT 'success',
        "ip_address" varchar(64),
        "user_agent" varchar(512),
        "request_id" varchar(128),
        "metadata" jsonb,
        "prev_hash" varchar(64) NOT NULL DEFAULT '',
        "hash" varchar(64) NOT NULL,
        CONSTRAINT "PK_audit_log" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_audit_log_sequence" ON "audit_log" ("sequence")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_log_actor_id" ON "audit_log" ("actor_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_log_action" ON "audit_log" ("action")`);

    await queryRunner.query(`
      CREATE TABLE "consent_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "purpose" varchar(100) NOT NULL,
        "granted" boolean NOT NULL,
        "policy_version" varchar(40),
        "source" varchar(40),
        "ip_address" varchar(64),
        CONSTRAINT "PK_consent_records" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_consent_records_user_id" ON "consent_records" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_consent_records_user_purpose_created" ON "consent_records" ("user_id", "purpose", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "consent_records"`);
    await queryRunner.query(`DROP TABLE "audit_log"`);
  }
}
