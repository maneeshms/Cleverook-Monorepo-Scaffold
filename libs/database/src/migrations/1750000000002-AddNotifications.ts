import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * notifications: the in-app feed backing the messaging IN_APP channel sink.
 * Rides with the messaging capability. FK to users, so it requires the auth
 * capability (users table) — init.mjs enforces messaging → auth.
 */
export class AddNotifications1750000000002 implements MigrationInterface {
  name = 'AddNotifications1750000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "user_id" uuid NOT NULL,
        "type" varchar(80),
        "title" varchar(200) NOT NULL,
        "body" varchar(1000),
        "payload" jsonb,
        "read_at" TIMESTAMPTZ,
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_id" ON "notifications" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
