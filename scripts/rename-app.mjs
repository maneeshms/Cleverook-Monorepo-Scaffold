#!/usr/bin/env node
/**
 * Rename an app in a GENERATED project — `apps/my-app-api` → `apps/billing`,
 * everywhere the name is hardcoded (Dockerfile, railway.json, workflows,
 * project.json, docs — see docs/EVOLVING.md).
 *
 * init.mjs already derives app names from your project name at generation
 * (`<name>-api`, `<name>-web`, …); this tool is the escape hatch for changing
 * one later. The heavy lifting lives in scaffold-manifest.mjs `renameApp`.
 *
 * Usage:
 *   node scripts/rename-app.mjs --from my-app-api --to billing [--no-install]
 *
 * Not available in the pristine scaffold repo: init/add/new-app manifests
 * reference the reference-app names, so renaming there would corrupt them.
 * Zero dependencies.
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readJson, writeJson, renameApp } from './scaffold-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { opts: {}, flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-install') out.flags.add('no-install');
    else if (a.startsWith('--')) out.opts[a.slice(2)] = argv[++i];
  }
  return out;
}

async function main() {
  const { opts, flags } = parseArgs(process.argv.slice(2));
  const from = opts.from;
  const to = opts.to;
  if (!from || !to) {
    console.error('usage: node scripts/rename-app.mjs --from <app> --to <kebab> [--no-install]');
    process.exit(2);
  }
  if (existsSync(path.join(ROOT, 'scripts/init.mjs'))) {
    throw new Error(
      'this is the pristine scaffold — its manifests reference the reference-app names. ' +
        'rename-app.mjs is for generated projects.',
    );
  }
  if (!/^[a-z][a-z0-9-]*$/.test(to)) throw new Error(`--to "${to}" must be kebab-case`);
  if (!existsSync(path.join(ROOT, `apps/${from}`))) throw new Error(`apps/${from} does not exist`);
  if (existsSync(path.join(ROOT, `apps/${to}`))) throw new Error(`apps/${to} already exists`);

  console.log(`\nRenaming apps/${from} → apps/${to}\n`);
  renameApp(ROOT, from, to);

  // Keep add.mjs working: appRenames maps ORIGINAL scaffold names to current
  // ones so pristine capability paths land in the renamed directory.
  if (existsSync(path.join(ROOT, '.clevscaffold.json'))) {
    const manifest = readJson(ROOT, '.clevscaffold.json');
    const renames = manifest.appRenames ?? {};
    const original = Object.entries(renames).find(([, current]) => current === from)?.[0];
    if (original) {
      renames[original] = to;
      manifest.appRenames = renames;
      console.log(`  recorded appRenames.${original} = ${to} in .clevscaffold.json`);
    } else {
      console.log('  (custom app — no scaffold mapping needed)');
    }
    writeJson(ROOT, '.clevscaffold.json', manifest);
  }

  if (!flags.has('no-install')) {
    console.log('\nRegenerating lockfile…');
    execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
  }

  console.log(`\n✅  renamed. Run: npm run dev:${to} · npx nx build ${to}`);
  console.log('    Commit the change as one unit (directory move + reference rewrites).');
}

main().catch((err) => {
  console.error(`\n✗ rename-app failed: ${err.message}`);
  process.exit(1);
});
