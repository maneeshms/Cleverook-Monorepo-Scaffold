import { MigrationInterface, QueryRunner } from 'typeorm';

/** feature_flags table backing the OpenFeature `database` provider. */
export class AddFeatureFlags1750000000003 implements MigrationInterface {
  name = 'AddFeatureFlags1750000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "feature_flags" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "key" varchar(120) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "value" jsonb,
        "description" varchar(500),
        CONSTRAINT "PK_feature_flags" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_feature_flags_key" ON "feature_flags" ("key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_feature_flags_key"`);
    await queryRunner.query(`DROP TABLE "feature_flags"`);
  }
}
