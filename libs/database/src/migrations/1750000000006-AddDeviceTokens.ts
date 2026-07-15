import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * device_tokens: push-notification device registrations (FCM tokens) behind the
 * messaging PUSH channel. One row per device+app install; unique on the token
 * itself so a device that changes hands follows its current user. FK to users —
 * this migration rides with the messaging capability (which implies auth).
 */
export class AddDeviceTokens1750000000006 implements MigrationInterface {
  name = 'AddDeviceTokens1750000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "device_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "user_id" uuid NOT NULL,
        "token" varchar(512) NOT NULL,
        "platform" varchar(10) NOT NULL,
        "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_device_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_device_tokens_token" UNIQUE ("token"),
        CONSTRAINT "FK_device_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_device_tokens_user_id" ON "device_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_device_tokens_last_seen_at" ON "device_tokens" ("last_seen_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "device_tokens"`);
  }
}
