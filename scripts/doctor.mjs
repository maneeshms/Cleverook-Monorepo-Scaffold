#!/usr/bin/env node
/**
 * Preflight checks for local development: catches the classic setup traps in
 * seconds instead of cryptic failures minutes later.
 *
 * Usage:  npm run doctor
 *
 * Checks: Node version vs .nvmrc · .env presence + JWT secret sanity · Docker
 * daemon · Postgres reachability (including the host-Postgres-on-5432 vs
 * compose-container port collision) · Redis (only if configured).
 *
 * Exit code 1 if any check FAILs (warnings don't fail).
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, msg) => results.push({ level: 'OK', name, msg });
const warn = (name, msg) => results.push({ level: 'WARN', name, msg });
const fail = (name, msg) => results.push({ level: 'FAIL', name, msg });

/** Minimal .env parser (KEY=VALUE lines) — no dependency on the app config loader. */
function parseDotenv(file) {
  if (!existsSync(file)) return null;
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

// ── 1. Node version vs .nvmrc ───────────────────────────────────────────────
const wanted = readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
const actual = process.versions.node;
if (actual.split('.')[0] === wanted.split('.')[0]) {
  ok('node', `v${actual} matches .nvmrc (${wanted})`);
} else {
  fail('node', `running v${actual}, .nvmrc wants ${wanted} — run \`nvm use\``);
}

// ── 2. .env + secret sanity ─────────────────────────────────────────────────
const env = parseDotenv(path.join(ROOT, '.env'));
if (!env) {
  warn('.env', 'missing — `cp .env.example .env` and add real JWT secrets');
} else {
  ok('.env', 'present');
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = process.env[key] ?? env[key];
    if (!v) warn(key, 'not set — auth endpoints will refuse to boot (apps that require it)');
    else if (v.length < 32) fail(key, `only ${v.length} chars — validation requires ≥32 (openssl rand -base64 48)`);
    else if (/change|example|replace|xxx/i.test(v)) fail(key, 'looks like a placeholder — generate a real secret');
    else ok(key, `set (${v.length} chars)`);
  }
}

// ── 3. Docker daemon ────────────────────────────────────────────────────────
let dockerUp = false;
try {
  execSync('docker info', { stdio: 'pipe' });
  dockerUp = true;
  ok('docker', 'daemon reachable');
} catch {
  warn('docker', 'not reachable — `npm run db:up` needs it (skip if using external Postgres)');
}

// ── 4. Postgres — including the 5432 port-collision trap ────────────────────
// If a host Postgres (Homebrew etc.) owns 5432, compose maps the container to
// another port and connections hit the WRONG server, failing with confusing
// errors like `role "postgres" does not exist`.
const composePort = process.env.POSTGRES_PORT ?? '5432';
let containerPort = null;
if (dockerUp) {
  try {
    const out = execSync('docker port clevscaffold-postgres-1 5432', { stdio: 'pipe' })
      .toString()
      .trim();
    containerPort = out.match(/:(\d+)\s*$/m)?.[1] ?? null;
  } catch {
    /* container not running */
  }
}
if (containerPort && containerPort !== composePort) {
  fail(
    'postgres-port',
    `compose container is mapped to host port ${containerPort}, but the default URLs point at ${composePort} — ` +
      `another Postgres likely owns ${composePort}. Either stop it, or export POSTGRES_PORT=${containerPort} ` +
      `and use that port in DATABASE_URL / E2E_* URLs`,
  );
}

const dbUrl =
  process.env.DATABASE_URL ??
  env?.DATABASE_URL ??
  `postgresql://postgres:postgres@localhost:${containerPort ?? composePort}/clevscaffold`;
try {
  const client = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 3000 });
  await client.connect();
  const { rows } = await client.query('select version()');
  await client.end();
  ok('postgres', `reachable — ${rows[0].version.split(' on ')[0]} (${new URL(dbUrl).host})`);
} catch (err) {
  const hint = /role .* does not exist/.test(String(err))
    ? ' — this usually means you reached a DIFFERENT Postgres (host install) than the compose container; see postgres-port above / set POSTGRES_PORT'
    : '';
  fail('postgres', `cannot connect to ${new URL(dbUrl).host}: ${err.message}${hint}`);
}

// ── 5. Redis (optional by design — only checked when configured) ────────────
const redisUrl = process.env.REDIS_URL ?? env?.REDIS_URL;
if (redisUrl) {
  const { hostname, port } = new URL(redisUrl);
  await new Promise((resolve) => {
    const sock = net.connect({ host: hostname, port: Number(port || 6379), timeout: 2000 });
    sock.on('connect', () => {
      ok('redis', `reachable at ${hostname}:${port || 6379}`);
      sock.destroy();
      resolve();
    });
    sock.on('error', (e) => {
      warn('redis', `REDIS_URL set but unreachable (${e.message}) — app falls back to in-memory`);
      resolve();
    });
    sock.on('timeout', () => {
      warn('redis', 'REDIS_URL set but connection timed out — app falls back to in-memory');
      sock.destroy();
      resolve();
    });
  });
} else {
  ok('redis', 'not configured (optional — in-memory fallbacks apply)');
}

// ── report ──────────────────────────────────────────────────────────────────
const icon = { OK: '✅', WARN: '⚠️ ', FAIL: '❌' };
console.log('\nClevScaffold doctor\n');
for (const r of results) console.log(`${icon[r.level]}  ${r.name.padEnd(18)} ${r.msg}`);
const fails = results.filter((r) => r.level === 'FAIL');
console.log(
  `\n${fails.length ? `${fails.length} problem(s) found.` : 'All checks passed — you are good to go.'}\n`,
);
process.exit(fails.length ? 1 : 0);
