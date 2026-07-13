import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration. Prisma 7 removed the `url` property from the schema's
 * `datasource` block — migration/introspection commands now read the connection
 * URL from here instead. The app itself opens its connection through the
 * `@prisma/adapter-pg` driver adapter (see src/prisma/prisma.service.ts).
 *
 * We read `process.env.PRISMA_DATABASE_URL` directly (with a fallback) rather than
 * Prisma's `env()` helper, because `env()` resolves eagerly at config-load time and
 * would throw during `prisma generate` (which needs no DB URL) whenever the var is
 * unset — e.g. in CI's build job. Migration commands set it and use it normally.
 * For Supabase/pgbouncer (transaction pooling → direct 5432 host for migrate) see
 * docs/DATABASE.md.
 */
export default defineConfig({
  schema: path.join('apps', 'api-prisma', 'prisma', 'schema.prisma'),
  datasource: {
    url: process.env.PRISMA_DATABASE_URL ?? '',
  },
});
