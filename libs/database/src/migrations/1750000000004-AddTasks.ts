import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * tasks: the demo CRUD reference module (pagination, ownership, caching,
 * messaging hooks). Reference-only — init.mjs removes this migration together
 * with the tasks module when generating a minimal app. FK to users.
 */
export class AddTasks1750000000004 implements MigrationInterface {
  name = 'AddTasks1750000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tasks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "title" varchar(200) NOT NULL,
        "description" varchar(2000),
        "status" varchar(20) NOT NULL DEFAULT 'TODO',
        "owner_id" uuid NOT NULL,
        "assignee_id" uuid,
        "due_date" TIMESTAMPTZ,
        CONSTRAINT "PK_tasks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tasks_owner" FOREIGN KEY ("owner_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tasks_assignee" FOREIGN KEY ("assignee_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_tasks_owner_id" ON "tasks" ("owner_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_tasks_assignee_id" ON "tasks" ("assignee_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tasks"`);
  }
}
