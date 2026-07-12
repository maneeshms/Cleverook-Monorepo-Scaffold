# Database

PostgreSQL 16. The scaffold works unchanged against local Docker, self-hosted
Postgres, or managed hosts (Supabase, Neon, RDS) — direct or pooled.

## Connection matrix

| Host | TypeORM (`DATABASE_URL`) | SSL | Notes |
|------|--------------------------|-----|-------|
| Local Docker | `postgresql://postgres:postgres@localhost:5432/clevscaffold` | `disable` | `npm run db:up` |
| Self-hosted | `postgresql://user:pw@host:5432/db` | `require` or `no-verify` | `no-verify` for self-signed certs |
| Supabase direct | `postgresql://postgres:pw@db.<ref>.supabase.co:5432/postgres` | `require` | migrations + normal use |
| Supabase pooled | `postgresql://postgres.<ref>:pw@aws-0-<region>.pooler.supabase.com:6543/postgres` | `require` | transaction pooler (pgbouncer) |

`DATABASE_SSL` accepts `disable | require | no-verify`. Managed hosts usually need
`require` (verified) or `no-verify` (self-signed). Tune the pool with
`DATABASE_POOL_MAX` (default 20).

## TypeORM app (`apps/api`)

`libs/database` owns the connection (`DatabaseModule`, `data-source.ts`) and reads
SSL/pool settings from config. Schema is **migrations-only** — `synchronize` is
never enabled.

```bash
npm run migration:run     # apply pending migrations
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

### Pooled connections (Supabase / pgbouncer)

For transaction-mode pooling, append `?pgbouncer=true` to the **runtime** URL and
point **migrations** at the direct (5432) URL — pgbouncer can't run Prisma's
migration statements over the transaction pooler:

```
PRISMA_DATABASE_URL="postgresql://…pooler…:6543/postgres?pgbouncer=true"
# run prisma:deploy against the direct 5432 host
```

## e2e databases

`npm run e2e:setup` creates + migrates disposable DBs (`clevscaffold_test`,
`clevscaffold_prisma_test`). Override the connections in CI with
`E2E_DATABASE_URL` / `E2E_PRISMA_DATABASE_URL`. See [TESTING.md](TESTING.md).

## Backups

Managed hosts provide automated backups (Supabase PITR, RDS snapshots). For
self-hosted, schedule `pg_dump` and test restores. Never run destructive DDL
outside a reviewed migration.
