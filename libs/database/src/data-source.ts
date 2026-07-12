import 'reflect-metadata';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

loadEnv();

const isProd = process.env.NODE_ENV === 'production';

// DATABASE_SSL: disable | require | no-verify ('true' = legacy alias of no-verify).
const sslMode = (process.env.DATABASE_SSL ?? 'disable').toLowerCase();
const ssl =
  sslMode === 'require'
    ? true
    : sslMode === 'no-verify' || sslMode === 'true'
      ? { rejectUnauthorized: false }
      : false;

// Source layout (dev, run from repo root via ts-node) differs from the compiled
// layout (prod, this file sits at dist/apps/<app>/libs/database/src). Use globs
// that match each: cwd-relative .ts in dev, __dirname-relative .js in prod.
const entities = isProd
  ? [join(__dirname, '../../../**/*.entity.js')] // dist/apps/<app>/**/*.entity.js
  : ['apps/**/src/**/*.entity.ts', 'libs/**/src/**/*.entity.ts'];

const migrations = isProd
  ? [join(__dirname, 'migrations/*.js')]
  : ['libs/database/src/migrations/*.ts'];

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl,
  entities,
  migrations,
  synchronize: false,
  logging: !isProd,
});
