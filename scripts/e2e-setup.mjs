#!/usr/bin/env node
/**
 * Creates + migrates the disposable e2e databases.
 *
 * Usage:  npm run e2e:setup
 * Env:    E2E_DATABASE_URL          (API test DB; default clevscaffold_test)
 *         E2E_ADMIN_URL             (superuser conn for CREATE DATABASE; derived otherwise)
 *
 * Requires a reachable Postgres (docker compose up -d).
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import pg from 'pg';

// Honor POSTGRES_PORT so a remapped compose container (docker-compose.yml maps
// `${POSTGRES_PORT:-5432}:5432` when a host Postgres owns 5432) works untouched.
const DEFAULT_BASE = `postgresql://postgres:postgres@localhost:${process.env.POSTGRES_PORT ?? 5432}`;
const base = process.env.E2E_PG_BASE_URL ?? DEFAULT_BASE;

const typeormUrl = process.env.E2E_DATABASE_URL ?? `${base}/clevscaffold_test`;

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

if (existsSync('apps/api')) {
  await ensureDatabase(typeormUrl);
  console.log('migrating API test DB…');
  run('npx typeorm-ts-node-commonjs migration:run -d libs/database/src/data-source.ts', {
    DATABASE_URL: typeormUrl,
    DATABASE_SSL: 'disable',
  });
}

console.log('e2e databases ready.');
