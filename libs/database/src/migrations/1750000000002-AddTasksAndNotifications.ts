import { MigrationInterface, QueryRunner } from 'typeorm';

/** Demo feature tables: tasks (CRUD reference module) + notifications (in-app feed). */
export class AddTasksAndNotifications1750000000002 implements MigrationInterface {
  name = 'AddTasksAndNotifications1750000000002';

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
    await queryRunner.query(`DROP TABLE "tasks"`);
  }
}
