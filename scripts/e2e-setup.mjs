#!/usr/bin/env node
/**
 * Creates + migrates the disposable e2e databases.
 *
 * Usage:  npm run e2e:setup
 * Env:    E2E_DATABASE_URL          (TypeORM app test DB; default clevscaffold_test)
 *         E2E_PRISMA_DATABASE_URL   (Prisma app test DB;  default clevscaffold_prisma_test)
 *         E2E_ADMIN_URL             (superuser conn for CREATE DATABASE; derived otherwise)
 *
 * Requires a reachable Postgres (docker compose up -d).
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import pg from 'pg';

const DEFAULT_BASE = 'postgresql://postgres:postgres@localhost:5432';
const base = process.env.E2E_PG_BASE_URL ?? DEFAULT_BASE;

/* clevscaffold:typeorm:start */
const typeormUrl = process.env.E2E_DATABASE_URL ?? `${base}/clevscaffold_test`;
/* clevscaffold:typeorm:end */
/* clevscaffold:prisma:start */
const prismaUrl = process.env.E2E_PRISMA_DATABASE_URL ?? `${base}/clevscaffold_prisma_test`;
/* clevscaffold:prisma:end */

function adminUrlFor(url) {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
}

async function ensureDatabase(url) {
  const dbName = new URL(url).pathname.slice(1);
  const admin = new pg.Client({ connectionString: process.env.E2E_ADMIN_URL ?? adminUrlFor(url) });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
      console.log(`created database ${dbName}`);
    } else {
      console.log(`database ${dbName} already exists`);
    }
  } finally {
    await admin.end();
  }
}

function run(command, env = {}) {
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });
}

/* clevscaffold:typeorm:start */
if (existsSync('apps/api')) {
  await ensureDatabase(typeormUrl);
  console.log('migrating TypeORM test DB…');
  run('npx typeorm-ts-node-commonjs migration:run -d libs/database/src/data-source.ts', {
    DATABASE_URL: typeormUrl,
    DATABASE_SSL: 'disable',
  });
}
/* clevscaffold:typeorm:end */

/* clevscaffold:prisma:start */
if (existsSync('apps/api-prisma/prisma/schema.prisma')) {
  await ensureDatabase(prismaUrl);
  console.log('migrating Prisma test DB…');
  run('npx prisma migrate deploy --schema apps/api-prisma/prisma/schema.prisma', {
    PRISMA_DATABASE_URL: prismaUrl,
  });
}
/* clevscaffold:prisma:end */

console.log('e2e databases ready.');
