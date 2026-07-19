# Database

PostgreSQL 16. The scaffold works unchanged against local Docker, self-hosted
Postgres, or managed hosts (Supabase, Neon, RDS) — direct or pooled.

## Connection matrix

| Host            | `DATABASE_URL`                                                                    | SSL                      | Notes                             |
| --------------- | --------------------------------------------------------------------------------- | ------------------------ | --------------------------------- |
| Local Docker    | `postgresql://postgres:postgres@localhost:5432/clevscaffold`                      | `disable`                | `npm run db:up`                   |
| Self-hosted     | `postgresql://user:pw@host:5432/db`                                               | `require` or `no-verify` | `no-verify` for self-signed certs |
| Supabase direct | `postgresql://postgres:pw@db.<ref>.supabase.co:5432/postgres`                     | `require`                | migrations + normal use           |
| Supabase pooled | `postgresql://postgres.<ref>:pw@aws-0-<region>.pooler.supabase.com:6543/postgres` | `require`                | transaction pooler (pgbouncer)    |

`DATABASE_SSL` accepts `disable | require | no-verify`. Managed hosts usually need
`require` (verified) or `no-verify` (self-signed). Tune the pool with
`DATABASE_POOL_MAX` (default 20).

## The API (`apps/api`)

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

### Pooled connections (Supabase / pgbouncer)

TypeORM runs through node-postgres, so transaction-mode pooling works — point
`DATABASE_URL` at the pooler for the app. **Migrations still need the direct
(5432) host**: pgbouncer's transaction mode can't run migration DDL, so run
`npm run migration:run` against the direct URL.

## e2e database

`npm run e2e:setup` creates + migrates a disposable DB (`clevscaffold_test`).
Override the connection in CI with `E2E_DATABASE_URL`. See [TESTING.md](TESTING.md).

## Backups

Managed hosts provide automated backups (Supabase PITR, RDS snapshots). For
self-hosted, schedule `pg_dump` and test restores. Never run destructive DDL
outside a reviewed migration.
