#!/usr/bin/env node
/**
 * ClevScaffold — Frontend Security Header Scan (static config assertion)
 *
 * The API's black-box scanner (scripts/security_scan.py) probes a LIVE api. The
 * frontends are static/SSR origins whose hardening lives in config, so this scan
 * asserts — without building or serving anything — that every PRESENT frontend
 * app declares the required security response headers:
 *
 *   apps/web       → nginx/security-headers.conf, include'd by default.conf.template,
 *                    and the snippet COPY'd in the Dockerfile.
 *   apps/web-next  → next.config.mjs headers() + poweredByHeader: false.
 *
 * Init-aware: an app pruned by scripts/init.mjs is skipped, not failed. Exit code
 * is non-zero if any present app is missing a header — wire it into CI.
 *
 *   node scripts/security_scan_frontend.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YEL = '\x1b[33m';
const CYAN = '\x1b[36m';
const RST = '\x1b[0m';

// Headers every frontend origin must send. Matched case-insensitively as a
// substring of the relevant config file(s).
const REQUIRED_HEADERS = [
  'Content-Security-Policy',
  'X-Frame-Options',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Strict-Transport-Security',
];

// CSP directives that must be present once CSP is declared (defence-in-depth
// baseline — locks framing, plugins, and <base> hijacking).
const REQUIRED_CSP_DIRECTIVES = ['default-src', 'frame-ancestors', 'object-src', 'base-uri'];

const failures = [];
const notes = [];

function read(rel) {
  const abs = path.join(ROOT, rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

function fail(app, msg) {
  failures.push(`${app}: ${msg}`);
}

function checkHeaders(app, haystack, source) {
  for (const h of REQUIRED_HEADERS) {
    if (!haystack.toLowerCase().includes(h.toLowerCase())) {
      fail(app, `missing header "${h}" in ${source}`);
    }
  }
  if (haystack.toLowerCase().includes('content-security-policy')) {
    for (const d of REQUIRED_CSP_DIRECTIVES) {
      if (!haystack.includes(d)) fail(app, `CSP is missing the "${d}" directive in ${source}`);
    }
  }
}

// ── apps/web (nginx) ─────────────────────────────────────────────────────────
function scanWeb() {
  const app = 'apps/web';
  if (!existsSync(path.join(ROOT, app))) return void notes.push(`${app} not present — skipped`);

  const snippet = read(`${app}/nginx/security-headers.conf`);
  const template = read(`${app}/nginx/default.conf.template`);
  const dockerfile = read(`${app}/Dockerfile`);

  if (snippet === null) return fail(app, 'nginx/security-headers.conf is missing');
  checkHeaders(app, snippet, 'nginx/security-headers.conf');

  if (template === null) fail(app, 'nginx/default.conf.template is missing');
  else if (!template.includes('security-headers.conf'))
    fail(app, 'default.conf.template does not include security-headers.conf');

  if (dockerfile === null) fail(app, 'Dockerfile is missing');
  else if (!dockerfile.includes('security-headers.conf'))
    fail(app, 'Dockerfile does not COPY security-headers.conf into the image');

  if (!failures.some((f) => f.startsWith(app))) notes.push(`${app}: nginx security headers OK`);
}

// ── apps/web-next (Next.js) ──────────────────────────────────────────────────
function scanWebNext() {
  const app = 'apps/web-next';
  if (!existsSync(path.join(ROOT, app))) return void notes.push(`${app} not present — skipped`);

  const cfg = read(`${app}/next.config.mjs`);
  if (cfg === null) return fail(app, 'next.config.mjs is missing');

  if (!/async\s+headers\s*\(/.test(cfg)) fail(app, 'next.config.mjs has no headers() function');
  checkHeaders(app, cfg, 'next.config.mjs');
  if (!/poweredByHeader\s*:\s*false/.test(cfg))
    fail(app, 'next.config.mjs should set poweredByHeader: false (hides X-Powered-By)');

  if (!failures.some((f) => f.startsWith(app))) notes.push(`${app}: Next security headers OK`);
}

console.log(`${CYAN}Frontend security header scan${RST}\n`);
scanWeb();
scanWebNext();

for (const n of notes)
  console.log(`  ${n.includes('OK') ? GREEN + 'PASS' + RST : YEL + 'SKIP' + RST}  ${n}`);
if (failures.length) {
  console.log(`\n${RED}Failures:${RST}`);
  for (const f of failures) console.log(`  ${RED}x${RST} ${f}`);
  console.log(`\n${RED}Frontend security scan FAILED (${failures.length}).${RST}`);
  process.exit(1);
}
console.log(`\n${GREEN}All present frontend apps declare the required security headers.${RST}`);
