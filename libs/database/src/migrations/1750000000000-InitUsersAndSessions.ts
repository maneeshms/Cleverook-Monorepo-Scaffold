import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema: users + user_sessions with the indexes the entities declare.
 * Hand-written baseline; subsequent changes should use `npm run migration:generate`.
 *
 * Postgres gotcha kept out of this file on purpose: there is no
 * `CREATE TYPE IF NOT EXISTS`. If you add Postgres enums later, wrap them in
 * `DO $$ BEGIN CREATE TYPE … EXCEPTION WHEN duplicate_object THEN null; END $$;`.
 * (Role is stored as varchar here, matching the entity, to avoid that class of
 * migration pain entirely.)
 */
export class InitUsersAndSessions1750000000000 implements MigrationInterface {
  name = 'InitUsersAndSessions1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "email" varchar(320) NOT NULL,
        "password_hash" varchar,
        "display_name" varchar(120),
        "role" varchar(50) NOT NULL DEFAULT 'USER',
        "failed_login_attempts" integer NOT NULL DEFAULT 0,
        "locked_until" TIMESTAMPTZ,
        "last_login_at" TIMESTAMPTZ,
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email") WHERE "deleted_at" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "user_id" uuid NOT NULL,
        "refresh_token_hash" varchar(64) NOT NULL,
        "user_agent" varchar(512),
        "ip_address" varchar(64),
        "expires_at" TIMESTAMPTZ NOT NULL,
        "last_used_at" TIMESTAMPTZ,
        "revoked_at" TIMESTAMPTZ,
        CONSTRAINT "PK_user_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_sessions_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_sessions_user_id" ON "user_sessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_sessions_token_hash" ON "user_sessions" ("refresh_token_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_sessions"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
