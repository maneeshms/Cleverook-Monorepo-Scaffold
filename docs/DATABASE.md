# Database

PostgreSQL 16. The scaffold works unchanged against local Docker, self-hosted
Postgres, or managed hosts (Supabase, Neon, RDS) — direct or pooled.

## Connection matrix

| Host            | TypeORM (`DATABASE_URL`)                                                          | SSL                      | Notes                             |
| --------------- | --------------------------------------------------------------------------------- | ------------------------ | --------------------------------- |
| Local Docker    | `postgresql://postgres:postgres@localhost:5432/clevscaffold`                      | `disable`                | `npm run db:up`                   |
| Self-hosted     | `postgresql://user:pw@host:5432/db`                                               | `require` or `no-verify` | `no-verify` for self-signed certs |
| Supabase direct | `postgresql://postgres:pw@db.<ref>.supabase.co:5432/postgres`                     | `require`                | migrations + normal use           |
| Supabase pooled | `postgresql://postgres.<ref>:pw@aws-0-<region>.pooler.supabase.com:6543/postgres` | `require`                | transaction pooler (pgbouncer)    |

`DATABASE_SSL` accepts `disable | require | no-verify`. Managed hosts usually need
`require` (verified) or `no-verify` (self-signed). Tune the pool with
`DATABASE_POOL_MAX` (default 20).

## TypeORM app (`apps/api`)

`libs/database` owns the connection (`DatabaseModule`, `data-source.ts`) and reads
SSL/pool settings from config. Schema is **migrations-only** — `synchronize` is
never enabled.

```bash
npm run migration:run     # apply pending migrations
npm run seed:api          # idempotent admin seed (SEED_ADMIN_EMAIL/_PASSWORD to override)
# author a migration by hand under libs/database/src/migrations/ (timestamp prefix)
```

Enum creation uses the Postgres-safe guard (no `CREATE TYPE IF NOT EXISTS`):

```sql
DO $$ BEGIN CREATE TYPE role_enum AS ENUM ('USER','ADMIN');
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

## Prisma app (`apps/api-prisma`)

Prisma reads `PRISMA_DATABASE_URL`. Schema in `apps/api-prisma/prisma/schema.prisma`
(`@@map` to snake_case tables).

```bash
npm run prisma:generate   # generate client
npm run prisma:migrate    # dev: create + apply a migration
npm run prisma:deploy     # prod/CI: apply committed migrations
npm run prisma:seed       # seed script
npm run prisma:studio     # browse data
```

### Prisma 7 connection model

Prisma 7 removed the schema's `datasource.url` — the app opens its connection
through the **`@prisma/adapter-pg` driver adapter** (`src/prisma/prisma.service.ts`),
and migration/introspection commands read `PRISMA_DATABASE_URL` via the root
`prisma.config.ts`.

### Pooled connections (Supabase / pgbouncer)

The runtime goes through node-postgres (the pg adapter), so transaction-mode
pooling works without the old `?pgbouncer=true` engine flag — just point
`PRISMA_DATABASE_URL` at the pooler. **Migrations still need the direct (5432)
host** — pgbouncer's transaction mode can't run Prisma's migration statements:

```
# runtime (app):        pooled URL is fine
PRISMA_DATABASE_URL="postgresql://…pooler…:6543/postgres"
# migrations (deploy):  set PRISMA_DATABASE_URL to the direct 5432 URL for the
#                       prisma:deploy step (prisma.config.ts reads it)
```

## e2e databases

`npm run e2e:setup` creates + migrates disposable DBs (`clevscaffold_test`,
`clevscaffold_prisma_test`). Override the connections in CI with
`E2E_DATABASE_URL` / `E2E_PRISMA_DATABASE_URL`. See [TESTING.md](TESTING.md).

## Backups

Managed hosts provide automated backups (Supabase PITR, RDS snapshots). For
self-hosted, schedule `pg_dump` and test restores. Never run destructive DDL
outside a reviewed migration.
