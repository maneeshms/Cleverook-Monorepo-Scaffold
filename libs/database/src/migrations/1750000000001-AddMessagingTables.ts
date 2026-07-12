import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The omnichannel messaging layer.
 *
 *  - messaging_provider_configs : one row per delivery provider (resend,
 *    console-email, console-sms, in-app …). Credentials are AES-256-GCM
 *    encrypted (credentials_enc); non-secret settings live in config jsonb.
 *  - messaging_channel_routes   : maps a channel → primary/fallback provider.
 *    use_case is reserved for future per-message-type overrides.
 *  - message_templates          : DB overrides for the in-code template registry
 *    (per key + channel + locale). Empty by default = use code defaults.
 *  - message_deliveries         : per-attempt audit/observability record.
 *
 * Providers are seeded so the layer works out of the box: console providers are
 * enabled for dev; resend is present + enabled but only sends once an API key is
 * configured (env fallback or CMS later) — otherwise it errors explicitly rather
 * than faking success.
 */
export class AddMessagingTables1750000000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // ── providers ──────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE "messaging_provider_configs" (
        "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
        "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "deleted_at"      TIMESTAMPTZ,
        "provider_key"    VARCHAR(50)   NOT NULL,
        "display_name"    VARCHAR(100)  NOT NULL,
        "channels"        VARCHAR(200)  NOT NULL DEFAULT '',
        "enabled"         BOOLEAN       NOT NULL DEFAULT false,
        "credentials_enc" TEXT,
        "config"          JSONB,
        "sort_order"      INT           NOT NULL DEFAULT 0,
        CONSTRAINT "PK_messaging_provider_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_messaging_provider_key" UNIQUE ("provider_key")
      )
    `);

    // ── channel routes ───────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE "messaging_channel_routes" (
        "id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
        "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "deleted_at"            TIMESTAMPTZ,
        "channel"               VARCHAR(20)  NOT NULL,
        "use_case"              VARCHAR(80),
        "primary_provider_key"  VARCHAR(50)  NOT NULL,
        "fallback_provider_key" VARCHAR(50),
        CONSTRAINT "PK_messaging_channel_routes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_messaging_route_channel_usecase" UNIQUE ("channel", "use_case")
      )
    `);

    // ── templates (DB overrides) ─────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE "message_templates" (
        "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "key"        VARCHAR(80)   NOT NULL,
        "channel"    VARCHAR(20)   NOT NULL,
        "locale"     VARCHAR(10)   NOT NULL DEFAULT 'en',
        "subject"    VARCHAR(300),
        "body_html"  TEXT,
        "body_text"  TEXT,
        "enabled"    BOOLEAN       NOT NULL DEFAULT true,
        CONSTRAINT "PK_message_templates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_message_template_key_channel_locale" UNIQUE ("key", "channel", "locale")
      )
    `);

    // ── deliveries (audit) ───────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE "message_deliveries" (
        "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
        "created_at"          TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "deleted_at"          TIMESTAMPTZ,
        "user_id"             UUID,
        "message_type"        VARCHAR(80)   NOT NULL,
        "channel"             VARCHAR(20)   NOT NULL,
        "provider_key"        VARCHAR(50)   NOT NULL,
        "to_masked"           VARCHAR(200),
        "status"              VARCHAR(20)   NOT NULL DEFAULT 'QUEUED',
        "provider_message_id" VARCHAR(200),
        "error"               TEXT,
        "attempts"            INT           NOT NULL DEFAULT 0,
        CONSTRAINT "PK_message_deliveries" PRIMARY KEY ("id")
      )
    `);
    await qr.query(`
      CREATE INDEX "IDX_message_deliveries_user_id" ON "message_deliveries" ("user_id")
    `);
    await qr.query(`
      CREATE INDEX "IDX_message_deliveries_type" ON "message_deliveries" ("message_type")
    `);

    // ── seed providers ───────────────────────────────────────────────────────────
    await qr.query(`
      INSERT INTO "messaging_provider_configs"
        ("provider_key", "display_name", "channels", "enabled", "config", "sort_order")
      VALUES
        ('resend',        'Resend (Email)',       'EMAIL',  true,  '{"fromName":"ClevScaffold"}', 1),
        ('console-email', 'Console (Email, dev)', 'EMAIL',  true,  NULL,                       2),
        ('console-sms',   'Console (SMS, dev)',   'SMS',    true,  NULL,                       3),
        ('in-app',        'In-App Feed',          'IN_APP', true,  NULL,                       4)
    `);

    // ── seed channel routes ──────────────────────────────────────────────────────
    await qr.query(`
      INSERT INTO "messaging_channel_routes"
        ("channel", "primary_provider_key", "fallback_provider_key")
      VALUES
        ('EMAIL',  'resend',      'console-email'),
        ('SMS',    'console-sms', NULL),
        ('IN_APP', 'in-app',      NULL)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS "message_deliveries"`);
    await qr.query(`DROP TABLE IF EXISTS "message_templates"`);
    await qr.query(`DROP TABLE IF EXISTS "messaging_channel_routes"`);
    await qr.query(`DROP TABLE IF EXISTS "messaging_provider_configs"`);
  }
}
