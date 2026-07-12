#!/usr/bin/env node
/**
 * ClevScaffold initializer — tailors a fresh clone to one project.
 *
 * Zero dependencies. Prunes the ORM(s) and frontend(s) you don't want, renames
 * the @clevscaffold scope, removes itself + the init-matrix workflow, regenerates
 * the lockfile, and verifies the result builds + tests green.
 *
 * Usage:
 *   node scripts/init.mjs                         # interactive
 *   node scripts/init.mjs --yes --name my-app --scope @myco \
 *        --orm typeorm|prisma|both --frontend vite|next|both|none
 *
 * Flags:
 *   --yes            non-interactive (use defaults / provided flags)
 *   --name <kebab>   workspace + package name
 *   --scope <@x>     npm scope replacing @clevscaffold (leading @ optional)
 *   --orm <v>        typeorm | prisma | both        (default both)
 *   --frontend <v>   vite | next | both | none       (default both)
 *   --reinit-git     wipe .git and start a fresh repo
 *   --no-install     skip npm install (lockfile not regenerated)
 *   --skip-verify    skip the build + test verification step
 */
import { existsSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// fileURLToPath (not URL.pathname) so paths containing spaces resolve correctly.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD_SCOPE = '@clevscaffold';

// ── Component manifest ──────────────────────────────────────────────────────
// Each removable component lists what to delete when it is NOT selected. Runtime
// deps live in each package's own package.json (npm workspaces), so removing a
// component's directory removes its dependencies with it — no root-dep pruning.
const COMPONENTS = {
  typeorm: {
    dirs: ['apps/api', 'libs/database', 'libs/feature-flags', 'libs/messaging'],
    scripts: [
      'dev:api',
      'migration:generate',
      'migration:create',
      'migration:run',
      'migration:revert',
    ],
    tsPaths: [`${OLD_SCOPE}/database`, `${OLD_SCOPE}/feature-flags`, `${OLD_SCOPE}/messaging`],
    sentinel: 'typeorm',
    dockerApps: ['api'],
  },
  prisma: {
    dirs: ['apps/api-prisma'],
    scripts: ['dev:api-prisma', 'prisma:generate', 'prisma:migrate', 'prisma:deploy', 'prisma:seed', 'prisma:studio'],
    tsPaths: [],
    sentinel: 'prisma',
    dockerApps: ['api-prisma'],
  },
  vite: {
    dirs: ['apps/web'],
    scripts: ['dev:web'],
    tsPaths: [],
    excludes: ['apps/web'],
    dockerApps: ['web'],
    auditDirs: ['apps/web'],
  },
  next: {
    dirs: ['apps/web-next'],
    scripts: ['dev:web-next'],
    tsPaths: [],
    excludes: ['apps/web-next'],
    dockerApps: ['web-next'],
    auditDirs: ['apps/web-next'],
  },
};

const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.mdc', '.yml', '.yaml', '.prisma', '.conf', '.template', '.example']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'tmp', '.next', 'coverage', '.nx']);
const RENAME_SKIP_FILES = new Set(['package-lock.json', 'init.mjs']);

// ── arg parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { flags: new Set(), opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (['yes', 'reinit-git', 'no-install', 'skip-verify'].includes(key)) {
      out.flags.add(key);
    } else {
      out.opts[key] = argv[++i];
    }
  }
  return out;
}

// ── fs helpers ──────────────────────────────────────────────────────────────
function walkTextFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Skip the .git dir exactly — NOT .github (startsWith('.git') would eat it).
    if (entry.name === '.git') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTextFiles(full, acc);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (TEXT_EXT.has(ext) || entry.name === 'Dockerfile') acc.push(full);
    }
  }
  return acc;
}

function rmrf(rel) {
  const full = path.join(ROOT, rel);
  if (existsSync(full)) {
    rmSync(full, { recursive: true, force: true });
    console.log(`  removed ${rel}`);
  }
}

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
}
function writeJson(rel, obj) {
  writeFileSync(path.join(ROOT, rel), JSON.stringify(obj, null, 2) + '\n');
}

/** Remove every line block delimited by `clevscaffold:<name>:start/end` (inclusive). */
function stripSentinelBlocks(rel, name) {
  const full = path.join(ROOT, rel);
  if (!existsSync(full)) return;
  const startTok = `clevscaffold:${name}:start`;
  const endTok = `clevscaffold:${name}:end`;
  const lines = readFileSync(full, 'utf8').split('\n');
  const kept = [];
  let skipping = false;
  for (const line of lines) {
    if (!skipping && line.includes(startTok)) { skipping = true; continue; }
    if (skipping && line.includes(endTok)) { skipping = false; continue; }
    if (!skipping) kept.push(line);
  }
  writeFileSync(full, kept.join('\n'));
  console.log(`  pruned ${name} block(s) in ${rel}`);
}

/** Remove any lingering `clevscaffold:*:start/end` marker lines (content kept). */
function stripSentinelMarkers(rel) {
  const full = path.join(ROOT, rel);
  if (!existsSync(full)) return;
  const kept = readFileSync(full, 'utf8')
    .split('\n')
    .filter((line) => !/clevscaffold:[a-z]+:(start|end)/.test(line));
  writeFileSync(full, kept.join('\n'));
}

/** Replace a YAML/JS inline array literal `key: [a, b, c]` with a filtered set. */
function rewriteArrayLiteral(rel, matchKey, keepValues, quote = false) {
  const full = path.join(ROOT, rel);
  if (!existsSync(full)) return;
  let text = readFileSync(full, 'utf8');
  const re = new RegExp(`(${matchKey}:\\s*)\\[[^\\]]*\\]`);
  const rendered = keepValues.map((v) => (quote ? `'${v}'` : v)).join(', ');
  text = text.replace(re, `$1[${rendered}]`);
  writeFileSync(full, text);
}

// ── interactive prompt ──────────────────────────────────────────────────────
async function prompt(rl, question, def) {
  const ans = (await rl.question(`${question}${def ? ` (${def})` : ''}: `)).trim();
  return ans || def;
}

async function main() {
  const { flags, opts } = parseArgs(process.argv.slice(2));
  const yes = flags.has('yes');

  let name = opts.name;
  let scope = opts.scope;
  let orm = opts.orm;
  let frontend = opts.frontend;

  if (!yes) {
    const rl = createInterface({ input: stdin, output: stdout });
    console.log('\nClevScaffold initializer\n========================\n');
    name = name ?? (await prompt(rl, 'Project name (kebab-case)', 'my-app'));
    scope = scope ?? (await prompt(rl, 'npm scope', `@${name}`));
    orm = orm ?? (await prompt(rl, 'ORM [typeorm|prisma|both]', 'both'));
    frontend = frontend ?? (await prompt(rl, 'Frontend [vite|next|both|none]', 'both'));
    await rl.close();
  }

  name = name ?? 'my-app';
  scope = scope ?? `@${name}`;
  orm = (orm ?? 'both').toLowerCase();
  frontend = (frontend ?? 'both').toLowerCase();
  if (!scope.startsWith('@')) scope = `@${scope}`;

  if (!['typeorm', 'prisma', 'both'].includes(orm)) throw new Error(`invalid --orm "${orm}"`);
  if (!['vite', 'next', 'both', 'none'].includes(frontend)) throw new Error(`invalid --frontend "${frontend}"`);

  // Which components to KEEP.
  const keep = new Set();
  if (orm === 'typeorm' || orm === 'both') keep.add('typeorm');
  if (orm === 'prisma' || orm === 'both') keep.add('prisma');
  if (frontend === 'vite' || frontend === 'both') keep.add('vite');
  if (frontend === 'next' || frontend === 'both') keep.add('next');

  const remove = Object.keys(COMPONENTS).filter((c) => !keep.has(c));

  console.log(`\nConfiguring: name=${name} scope=${scope} orm=${orm} frontend=${frontend}`);
  console.log(`Keeping: ${[...keep].join(', ') || '(none)'}`);
  console.log(`Removing: ${remove.join(', ') || '(none)'}\n`);

  // 1. Delete component directories.
  for (const c of remove) for (const d of COMPONENTS[c].dirs) rmrf(d);

  // 2. Root package.json — rename, drop scripts, and prune workspace entries whose
  //    directory was removed. Runtime deps live in each package's own package.json
  //    (npm workspaces), so there are no root runtime deps to prune here.
  const pkg = readJson('package.json');
  pkg.name = name;
  for (const c of remove) {
    for (const s of COMPONENTS[c].scripts) delete pkg.scripts?.[s];
  }
  if (Array.isArray(pkg.workspaces)) {
    pkg.workspaces = pkg.workspaces.filter(
      (w) => w.includes('*') || existsSync(path.join(ROOT, w)),
    );
  }
  writeJson('package.json', pkg);
  console.log('  updated package.json');

  // 3. tsconfig.base.json — drop path aliases + excludes for removed parts.
  const tsconfig = readJson('tsconfig.base.json');
  for (const c of remove) {
    for (const p of COMPONENTS[c].tsPaths) {
      delete tsconfig.compilerOptions?.paths?.[p];
      delete tsconfig.compilerOptions?.paths?.[`${p}/*`];
    }
    for (const ex of COMPONENTS[c].excludes ?? []) {
      tsconfig.exclude = (tsconfig.exclude ?? []).filter((e) => e !== ex);
    }
  }
  writeJson('tsconfig.base.json', tsconfig);
  console.log('  updated tsconfig.base.json');

  // 4. Prune ORM sentinel blocks from shared files.
  for (const c of remove) {
    if (!COMPONENTS[c].sentinel) continue;
    for (const f of ['.env.example', 'scripts/e2e-setup.mjs', '.github/workflows/ci.yml']) {
      stripSentinelBlocks(f, COMPONENTS[c].sentinel);
    }
  }

  // 4b. Strip any lingering sentinel markers for kept components (tidy output).
  for (const f of ['.env.example', 'scripts/e2e-setup.mjs', '.github/workflows/ci.yml']) {
    stripSentinelMarkers(f);
  }

  // 5. Fix workflow matrices to the kept apps / frontend dirs.
  const keptDockerApps = [...keep].flatMap((c) => COMPONENTS[c].dockerApps ?? []);
  rewriteArrayLiteral('.github/workflows/ci.yml', 'app', keptDockerApps);
  const keptAuditDirs = ['.', ...[...keep].flatMap((c) => COMPONENTS[c].auditDirs ?? [])];
  rewriteArrayLiteral('.github/workflows/security.yml', 'dir', keptAuditDirs, true);
  console.log('  updated CI workflow matrices');

  // 6. Rename the @clevscaffold scope across all text files.
  let renamed = 0;
  for (const file of walkTextFiles(ROOT)) {
    if (RENAME_SKIP_FILES.has(path.basename(file))) continue;
    const before = readFileSync(file, 'utf8');
    if (!before.includes(OLD_SCOPE)) continue;
    writeFileSync(file, before.split(OLD_SCOPE).join(scope));
    renamed++;
  }
  console.log(`  renamed ${OLD_SCOPE} → ${scope} in ${renamed} file(s)`);

  // 7. Remove the initializer + the scaffold-only matrix workflow.
  rmrf('.github/workflows/init-matrix.yml');

  // 8. Regenerate lockfile + verify.
  if (!flags.has('no-install')) {
    console.log('\nInstalling dependencies (regenerating lockfile)…');
    execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
    if (!flags.has('skip-verify')) {
      console.log('\nVerifying (lint + build + test)…');
      execSync('npm run lint && npm run build && npm run test', { cwd: ROOT, stdio: 'inherit' });
    }
  } else {
    console.log('\nSkipped install (--no-install). Run `npm install` next.');
  }

  // 9. Remove self BEFORE any git commit so the initializer never lands in the
  //    generated project's history (and a fresh commit sees a clean tree).
  rmSync(path.join(ROOT, 'scripts/init.mjs'), { force: true });

  // 10. Optional fresh git history — committed without init.mjs / init-matrix.yml.
  if (flags.has('reinit-git')) {
    rmrf('.git');
    execSync('git init && git add -A && git commit -m "chore: initialize from ClevScaffold"', {
      cwd: ROOT,
      stdio: 'inherit',
    });
    console.log('  reinitialized git repository');
  }

  console.log(`\n✅  ${name} is ready. See docs/GETTING_STARTED.md.`);
}

main().catch((err) => {
  console.error(`\n✗ init failed: ${err.message}`);
  process.exit(1);
});
