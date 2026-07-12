#!/usr/bin/env node
/**
 * Emit a self-contained production package.json for one app's Docker runtime image.
 *
 * The apps compile their @clevscaffold/* libs into dist (tsc + tsc-alias), so at
 * runtime only the EXTERNAL npm deps are needed — not the workspace libs. This
 * script walks the app's package.json, follows @clevscaffold/* deps into each
 * lib's package.json, and flattens the external dependency closure (exact pins)
 * into a lean manifest. The runtime stage then `npm install --omit=dev` from it,
 * so each image carries only what that app actually runs.
 *
 * Usage:  node scripts/docker-manifest.mjs apps/api dist/apps/api/package.json
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const appDir = process.argv[2];
const outFile = process.argv[3];
if (!appDir || !outFile) {
  console.error('usage: docker-manifest.mjs <appDir> <outFile>');
  process.exit(2);
}

const readPkg = (dir) => JSON.parse(readFileSync(path.join(ROOT, dir, 'package.json'), 'utf8'));

// Map every workspace lib package name -> its directory (init-proof: reads what exists).
const nameToDir = {};
for (const name of readdirSync(path.join(ROOT, 'libs'), { withFileTypes: true })) {
  if (!name.isDirectory()) continue;
  const dir = `libs/${name.name}`;
  if (existsSync(path.join(ROOT, dir, 'package.json'))) nameToDir[readPkg(dir).name] = dir;
}

const deps = {};
const seen = new Set();
function collect(dir) {
  if (seen.has(dir)) return;
  seen.add(dir);
  for (const [name, ver] of Object.entries(readPkg(dir).dependencies ?? {})) {
    if (name.startsWith('@clevscaffold/')) {
      if (nameToDir[name]) collect(nameToDir[name]);
    } else {
      deps[name] = ver; // exact pins are consistent across packages
    }
  }
}
collect(appDir);

const app = readPkg(appDir);
const out = {
  name: `${app.name.replace('@clevscaffold/', '')}-deploy`,
  version: app.version,
  private: true,
  dependencies: Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))),
};

mkdirSync(path.dirname(path.join(ROOT, outFile)), { recursive: true });
writeFileSync(path.join(ROOT, outFile), JSON.stringify(out, null, 2) + '\n');
console.error(`docker-manifest: ${outFile} — ${Object.keys(deps).length} prod deps for ${app.name}`);
