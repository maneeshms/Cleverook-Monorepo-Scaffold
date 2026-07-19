#!/usr/bin/env node
/**
 * Idempotent seed for the API: one admin account for local exploration.
 *
 * Run:  npm run seed:api        (after `npm run migration:run`)
 * Env:  DATABASE_URL            (default: local compose Postgres)
 *       SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD  (override credentials)
 *       BCRYPT_ROUNDS           (default 12 — matches the app)
 *
 * Uses parameterized SQL directly (scripts can't import app entities — libs/apps
 * dependency direction), and ON CONFLICT against the partial unique email index.
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';

const url =
  process.env.DATABASE_URL ??
  `postgresql://postgres:postgres@localhost:${process.env.POSTGRES_PORT ?? 5432}/clevscaffold`;
const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const password = process.env.SEED_ADMIN_PASSWORD ?? 'Adm1n!ChangeMe';
const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const passwordHash = await bcrypt.hash(password, rounds);
  const { rowCount } = await client.query(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1, $2, $3, 'ADMIN')
     ON CONFLICT (email) WHERE deleted_at IS NULL DO NOTHING`,
    [email, passwordHash, 'Admin'],
  );
  console.log(
    rowCount
      ? `seeded admin ${email} (change the password!)`
      : `admin ${email} already exists — nothing to do`,
  );
} finally {
  await client.end();
}
