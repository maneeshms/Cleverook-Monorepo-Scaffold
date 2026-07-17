#!/usr/bin/env node
/**
 * ClevScaffold initializer — tailors a fresh clone to one project.
 *
 * Zero dependencies. Prunes the ORM(s) and frontend(s) you don't want, renames
 * the @clevrook scope, removes itself + the init-matrix workflow, regenerates
 * the lockfile, and verifies the result builds + tests green.
 *
 * Generated projects can EVOLVE later: init writes `.clevscaffold.json`
 * (scaffold origin + your choices) and keeps `scripts/add.mjs` (enable a
 * capability later) and `scripts/new-app.mjs` (create a new api/vite/next/expo
 * app) — see docs/EVOLVING.md.
 *
 * Usage:
 *   node scripts/init.mjs                         # interactive
 *   node scripts/init.mjs --yes --name my-app --scope @myco \
 *        --orm typeorm|prisma|both --frontend vite|next|both|none --mobile expo|none
 *   node scripts/init.mjs --yes --name my-app --minimal --with-auth   # bare kickstart
 *
 * The default output keeps the full reference apps (auth, users, tasks demo,
 * notifications, messaging, feature-flags, metrics). `--minimal` instead emits a
 * bare, bootable core (config + logger + database + health + throttler, Redis
 * optional) and you opt capabilities back in with the --with-* flags below.
 *
 * Flags:
 *   --yes                non-interactive (use defaults / provided flags)
 *   --name <kebab>       workspace + package name
 *   --scope <@x>         npm scope replacing @clevrook (leading @ optional)
 *   --orm <v>            typeorm | prisma | both        (default both)
 *   --frontend <v>       vite | next | both | none       (default both)
 *   --mobile <v>         expo | none                     (default expo)
 *   --minimal            core-only app; add capabilities with --with-* below
 *   --with-auth          include JWT auth + users (needed by messaging)
 *   --with-messaging     include the messaging engine + notifications (implies auth)
 *   --with-feature-flags include the OpenFeature feature-flags module
 *   --with-metrics       include the Prometheus /metrics endpoint
 *   --with-compliance    include the compliance toolkit (audit trail, GDPR
 *                        export/erasure, consent, retention) — implies auth
 *   --reinit-git         wipe .git and start a fresh repo
 *   --no-install         skip npm install (lockfile not regenerated)
 *   --skip-verify        skip the build + test verification step
 */
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  OLD_SCOPE,
  COMPONENTS,
  ALL_CAPS,
  MIGRATIONS_DIR,
  CAPABILITIES,
  CAP_SENTINEL_FILES,
  RENAME_SKIP_FILES,
  walkTextFiles,
  rmrf as rmrfAt,
  readJson as readJsonAt,
  writeJson as writeJsonAt,
  removePkgDep as removePkgDepAt,
  stripSentinelBlocks as stripSentinelBlocksAt,
  stripSentinelMarkers as stripSentinelMarkersAt,
  rewriteArrayLiteral as rewriteArrayLiteralAt,
  writeMinimalVite,
  writeMinimalMobile,
} from './scaffold-manifest.mjs';

// fileURLToPath (not URL.pathname) so paths containing spaces resolve correctly.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rmrf = (rel) => rmrfAt(ROOT, rel);
const readJson = (rel) => readJsonAt(ROOT, rel);
const writeJson = (rel, obj) => writeJsonAt(ROOT, rel, obj);
const removePkgDep = (rel, dep) => removePkgDepAt(ROOT, rel, dep);
const stripSentinelBlocks = (rel, name) => stripSentinelBlocksAt(ROOT, rel, name);
const stripSentinelMarkers = (rel) => stripSentinelMarkersAt(ROOT, rel);
const rewriteArrayLiteral = (rel, key, values, quote) =>
  rewriteArrayLiteralAt(ROOT, rel, key, values, quote);

// ── arg parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { flags: new Set(), opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const boolFlags = [
      'yes',
      'reinit-git',
      'no-install',
      'skip-verify',
      'minimal',
      'with-auth',
      'with-messaging',
      'with-feature-flags',
      'with-metrics',
      'with-compliance',
    ];
    if (boolFlags.includes(key)) {
      out.flags.add(key);
    } else {
      out.opts[key] = argv[++i];
    }
  }
  return out;
}

// ── interactive prompt ──────────────────────────────────────────────────────
async function prompt(rl, question, def) {
  const ans = (await rl.question(`${question}${def ? ` (${def})` : ''}: `)).trim();
  return ans || def;
}

/** Best-effort git metadata for .clevscaffold.json (captured before --reinit-git). */
function gitInfo() {
  const run = (cmd) => {
    try {
      return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      return null;
    }
  };
  return { origin: run('git remote get-url origin'), commit: run('git rev-parse HEAD') };
}

async function main() {
  const { flags, opts } = parseArgs(process.argv.slice(2));
  const yes = flags.has('yes');

  let name = opts.name;
  let scope = opts.scope;
  let orm = opts.orm;
  let frontend = opts.frontend;
  let mobile = opts.mobile;
  let minimal = flags.has('minimal');
  const withCap = {
    auth: flags.has('with-auth'),
    messaging: flags.has('with-messaging'),
    featureflags: flags.has('with-feature-flags'),
    metrics: flags.has('with-metrics'),
    compliance: flags.has('with-compliance'),
  };

  if (!yes) {
    const rl = createInterface({ input: stdin, output: stdout });
    console.log('\nClevScaffold initializer\n========================\n');
    name = name ?? (await prompt(rl, 'Project name (kebab-case)', 'my-app'));
    scope = scope ?? (await prompt(rl, 'npm scope', `@${name}`));
    orm = orm ?? (await prompt(rl, 'ORM [typeorm|prisma|both]', 'both'));
    frontend = frontend ?? (await prompt(rl, 'Frontend [vite|next|both|none]', 'both'));
    mobile = mobile ?? (await prompt(rl, 'Mobile app (Expo React Native) [expo|none]', 'expo'));
    if (!minimal) {
      minimal = (await prompt(rl, 'Minimal app — core only, features à la carte? [y/N]', 'n'))
        .toLowerCase()
        .startsWith('y');
    }
    if (minimal) {
      const picked = (
        await prompt(
          rl,
          'Capabilities [auth,messaging,feature-flags,metrics,compliance] (comma-sep, blank=none)',
          '',
        )
      ).toLowerCase();
      const set = new Set(
        picked
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
      if (set.has('auth')) withCap.auth = true;
      if (set.has('messaging')) withCap.messaging = true;
      if (set.has('feature-flags') || set.has('featureflags')) withCap.featureflags = true;
      if (set.has('metrics')) withCap.metrics = true;
      if (set.has('compliance')) withCap.compliance = true;
    }
    await rl.close();
  }

  // --with-* only means anything under --minimal; the default keeps everything.
  if (!minimal && Object.values(withCap).some(Boolean)) {
    console.warn(
      '  note: --with-* flags are ignored without --minimal (default keeps all features).',
    );
  }

  name = name ?? 'my-app';
  scope = scope ?? `@${name}`;
  orm = (orm ?? 'both').toLowerCase();
  frontend = (frontend ?? 'both').toLowerCase();
  mobile = (mobile ?? 'expo').toLowerCase();
  if (!scope.startsWith('@')) scope = `@${scope}`;

  if (!['typeorm', 'prisma', 'both'].includes(orm)) throw new Error(`invalid --orm "${orm}"`);
  if (!['vite', 'next', 'both', 'none'].includes(frontend))
    throw new Error(`invalid --frontend "${frontend}"`);
  if (!['expo', 'none'].includes(mobile)) throw new Error(`invalid --mobile "${mobile}"`);

  // Which components to KEEP.
  const keep = new Set();
  if (orm === 'typeorm' || orm === 'both') keep.add('typeorm');
  if (orm === 'prisma' || orm === 'both') keep.add('prisma');
  if (frontend === 'vite' || frontend === 'both') keep.add('vite');
  if (frontend === 'next' || frontend === 'both') keep.add('next');
  if (mobile === 'expo') keep.add('expo');

  const remove = Object.keys(COMPONENTS).filter((c) => !keep.has(c));

  // Which capabilities to KEEP. The default (non-minimal) keeps them all — the
  // full reference app. --minimal starts empty; --with-* opt back in.
  const caps = new Set(minimal ? [] : ALL_CAPS);
  if (minimal) {
    if (withCap.auth) caps.add('auth');
    if (withCap.messaging) {
      caps.add('messaging');
      caps.add('auth'); // notifications FK → users
    }
    if (withCap.featureflags) caps.add('featureflags');
    if (withCap.metrics) caps.add('metrics');
    if (withCap.compliance) {
      caps.add('compliance');
      caps.add('auth'); // wiring reads users; personal data is per-user
    }
    // tasks is reference-only — never added to a minimal app.
  }
  // Capabilities that live only in the TypeORM app vanish when it is removed.
  if (remove.includes('typeorm')) {
    caps.delete('messaging');
    caps.delete('featureflags');
    caps.delete('compliance');
    caps.delete('tasks');
  }
  const dropCaps = ALL_CAPS.filter((c) => !caps.has(c));

  console.log(
    `\nConfiguring: name=${name} scope=${scope} orm=${orm} frontend=${frontend} mobile=${mobile}`,
  );
  console.log(`Keeping: ${[...keep].join(', ') || '(none)'}`);
  console.log(`Removing: ${remove.join(', ') || '(none)'}`);
  if (minimal) {
    console.log(`Minimal app — capabilities: ${[...caps].join(', ') || '(core only)'}`);
    console.log(`Dropping capabilities: ${dropCaps.join(', ') || '(none)'}`);
  }
  console.log('');

  // 0. Capture scaffold provenance BEFORE any git changes — add.mjs/new-app.mjs
  //    use it to fetch pristine scaffold source later (docs/EVOLVING.md).
  const { origin, commit } = gitInfo();

  // 1. Delete component directories.
  for (const c of remove) for (const d of COMPONENTS[c].dirs) rmrf(d);

  // 1b. Delete dropped-capability dirs, files, and migrations.
  for (const c of dropCaps) {
    const cap = CAPABILITIES[c];
    for (const d of cap.dirs ?? []) rmrf(d);
    for (const f of cap.files ?? []) rmrf(f);
    for (const m of cap.migrations ?? []) rmrf(`${MIGRATIONS_DIR}/${m}`);
  }

  // 2. Root package.json — rename, drop scripts, and prune workspace entries whose
  //    directory was removed. Runtime deps live in each package's own package.json
  //    (npm workspaces), so there are no root runtime deps to prune here.
  const pkg = readJson('package.json');
  pkg.name = name;
  for (const c of remove) {
    for (const s of COMPONENTS[c].scripts) delete pkg.scripts?.[s];
  }
  for (const c of dropCaps) {
    for (const s of CAPABILITIES[c].scripts ?? []) delete pkg.scripts?.[s];
  }
  if (Array.isArray(pkg.workspaces)) {
    pkg.workspaces = pkg.workspaces.filter(
      (w) => w.includes('*') || existsSync(path.join(ROOT, w)),
    );
  }
  writeJson('package.json', pkg);
  console.log('  updated package.json');

  // 2b. Drop workspace-lib deps for dropped capabilities from the app package.json.
  for (const c of dropCaps) {
    for (const pd of CAPABILITIES[c].pkgDeps ?? []) removePkgDep(pd.file, pd.dep);
  }

  // 3. tsconfig.base.json — drop path aliases + excludes for removed parts.
  const tsconfig = readJson('tsconfig.base.json');
  const dropPath = (p) => {
    delete tsconfig.compilerOptions?.paths?.[p];
    delete tsconfig.compilerOptions?.paths?.[`${p}/*`];
  };
  for (const c of remove) {
    for (const p of COMPONENTS[c].tsPaths) dropPath(p);
    for (const ex of COMPONENTS[c].excludes ?? []) {
      tsconfig.exclude = (tsconfig.exclude ?? []).filter((e) => e !== ex);
    }
  }
  for (const c of dropCaps) for (const p of CAPABILITIES[c].tsPaths ?? []) dropPath(p);
  writeJson('tsconfig.base.json', tsconfig);
  console.log('  updated tsconfig.base.json');

  // 4. Prune ORM sentinel blocks from shared files.
  const ormSentinelFiles = ['.env.example', 'scripts/e2e-setup.mjs', '.github/workflows/ci.yml'];
  for (const c of remove) {
    if (!COMPONENTS[c].sentinel) continue;
    for (const f of ormSentinelFiles) stripSentinelBlocks(f, COMPONENTS[c].sentinel);
  }

  // 4b. Prune dropped-capability sentinel blocks from the app + shared files.
  for (const c of dropCaps) {
    for (const f of CAP_SENTINEL_FILES) stripSentinelBlocks(f, c);
  }

  // 4c. Strip any lingering sentinel markers for kept parts (tidy output).
  for (const f of [...ormSentinelFiles, ...CAP_SENTINEL_FILES]) {
    stripSentinelMarkers(f);
  }

  // 4d. Minimal frontend: swap the coupled auth+tasks samples for health pages.
  if (minimal && keep.has('vite')) writeMinimalVite(ROOT, name);
  if (minimal && keep.has('expo')) writeMinimalMobile(ROOT, name);

  // 5. Fix workflow matrices to the kept apps / frontend dirs.
  const keptDockerApps = [...keep].flatMap((c) => COMPONENTS[c].dockerApps ?? []);
  rewriteArrayLiteral('.github/workflows/ci.yml', 'app', keptDockerApps);
  rewriteArrayLiteral('.github/workflows/image-scan.yml', 'app', keptDockerApps);
  const keptAuditDirs = ['.', ...[...keep].flatMap((c) => COMPONENTS[c].auditDirs ?? [])];
  rewriteArrayLiteral('.github/workflows/security.yml', 'dir', keptAuditDirs, true);
  console.log('  updated CI workflow matrices');

  // 5b. Prune dependabot.yml app/frontend blocks to the kept stack. Each ORM /
  //     frontend block is gated by a `clevscaffold:<component>:start/end` sentinel
  //     keyed on the component name, so a generated project never asks Dependabot
  //     to watch an app directory it doesn't have.
  for (const c of remove) stripSentinelBlocks('.github/dependabot.yml', c);
  stripSentinelBlocks('.github/dependabot.yml', 'scaffold'); // drop the scaffold-only note
  stripSentinelMarkers('.github/dependabot.yml');
  console.log('  pruned dependabot.yml to the kept apps');

  // 6. Rename the @clevrook scope across all text files.
  let renamed = 0;
  for (const file of walkTextFiles(ROOT)) {
    if (RENAME_SKIP_FILES.has(path.basename(file))) continue;
    const before = readFileSync(file, 'utf8');
    if (!before.includes(OLD_SCOPE)) continue;
    writeFileSync(file, before.split(OLD_SCOPE).join(scope));
    renamed++;
  }
  console.log(`  renamed ${OLD_SCOPE} → ${scope} in ${renamed} file(s)`);

  // 6b. Record the choices + scaffold provenance so scripts/add.mjs and
  //     scripts/new-app.mjs (which stay in the project) can evolve it later.
  writeJson('.clevscaffold.json', {
    scaffoldOrigin: origin,
    scaffoldCommit: commit,
    generatedAt: new Date().toISOString(),
    name,
    scope,
    orm,
    frontend,
    mobile,
    minimal,
    capabilities: [...caps].filter((c) => c !== 'tasks').sort(),
  });
  console.log('  wrote .clevscaffold.json (used by scripts/add.mjs + scripts/new-app.mjs)');

  // 7. Remove the initializer + the scaffold-only matrix workflow. add.mjs,
  //    new-app.mjs, and scaffold-manifest.mjs stay — they power later evolution.
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

  const summary = minimal ? `minimal (${[...caps].join(', ') || 'core only'})` : 'full reference';
  console.log(`\n✅  ${name} is ready — ${summary}. See docs/GETTING_STARTED.md.`);
  console.log(
    '    Evolve later: node scripts/add.mjs <capability> · node scripts/new-app.mjs (docs/EVOLVING.md)',
  );
}

main().catch((err) => {
  console.error(`\n✗ init failed: ${err.message}`);
  process.exit(1);
});
