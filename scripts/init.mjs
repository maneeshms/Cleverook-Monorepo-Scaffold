#!/usr/bin/env node
/**
 * ClevScaffold initializer — tailors a fresh clone to one project.
 *
 * Zero dependencies. Prunes the ORM(s) and frontend(s) you don't want, renames
 * the @clevrook scope, removes itself + the init-matrix workflow, regenerates
 * the lockfile, and verifies the result builds + tests green.
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
import { existsSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// fileURLToPath (not URL.pathname) so paths containing spaces resolve correctly.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD_SCOPE = '@clevrook';

// ── Component manifest ──────────────────────────────────────────────────────
// Each removable component lists what to delete when it is NOT selected. Runtime
// deps live in each package's own package.json (npm workspaces), so removing a
// component's directory removes its dependencies with it — no root-dep pruning.
const COMPONENTS = {
  typeorm: {
    dirs: [
      'apps/api',
      'libs/database',
      'libs/auth',
      'libs/feature-flags',
      'libs/messaging',
      'scripts/seed-api.mjs',
    ],
    scripts: [
      'dev:api',
      'migration:generate',
      'migration:create',
      'migration:run',
      'migration:revert',
      'seed:api',
    ],
    tsPaths: [
      `${OLD_SCOPE}/database`,
      `${OLD_SCOPE}/auth`,
      `${OLD_SCOPE}/feature-flags`,
      `${OLD_SCOPE}/messaging`,
    ],
    sentinel: 'typeorm',
    dockerApps: ['api'],
  },
  prisma: {
    dirs: ['apps/api-prisma', 'prisma.config.ts'],
    scripts: [
      'dev:api-prisma',
      'prisma:generate',
      'prisma:migrate',
      'prisma:deploy',
      'prisma:seed',
      'prisma:studio',
    ],
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
  // Expo React Native app — standalone (own lockfile), no Docker image (ships
  // through app stores / EAS, not containers), hence no dockerApps entry.
  expo: {
    dirs: ['apps/mobile'],
    scripts: ['dev:mobile'],
    tsPaths: [],
    excludes: ['apps/mobile'],
    auditDirs: ['apps/mobile'],
  },
};

// ── Capability manifest (minimal-app generator) ─────────────────────────────
// Capabilities layer on top of the core skeleton. `--minimal` starts core-only;
// `--with-*` flags re-add them. Dropping a capability strips its <token> sentinel
// blocks from the shared files below and deletes its module dirs / migrations /
// lib path aliases / package deps. `tasks` is a reference-only demo — always
// dropped in a minimal app, never re-addable via a flag. Tokens are single
// lowercase words (the marker-cleanup regex is [a-z]+).
const ALL_CAPS = ['auth', 'messaging', 'featureflags', 'metrics', 'compliance', 'tasks'];
const MIGRATIONS_DIR = 'libs/database/src/migrations';
const CAPABILITIES = {
  auth: {
    flag: 'with-auth',
    dirs: [
      'libs/auth',
      'apps/api/src/modules/auth',
      'apps/api/src/modules/users',
      'apps/api-prisma/src/modules/auth',
      'apps/api-prisma/src/modules/users',
      'apps/api-prisma/prisma/migrations/20260711222513_init',
    ],
    files: ['apps/api-prisma/prisma/seed.ts'],
    migrations: ['1750000000000-InitUsersAndSessions.ts'],
    tsPaths: [`${OLD_SCOPE}/auth`],
    pkgDeps: [{ file: 'apps/api/package.json', dep: `${OLD_SCOPE}/auth` }],
    scripts: ['prisma:seed'],
  },
  messaging: {
    flag: 'with-messaging',
    requires: ['auth'], // notifications.user_id FK → users
    dirs: ['apps/api/src/modules/notifications', 'libs/messaging'],
    migrations: [
      '1750000000001-AddMessagingTables.ts',
      '1750000000002-AddNotifications.ts',
      '1750000000006-AddDeviceTokens.ts',
    ],
    tsPaths: [`${OLD_SCOPE}/messaging`],
    pkgDeps: [{ file: 'apps/api/package.json', dep: `${OLD_SCOPE}/messaging` }],
  },
  featureflags: {
    flag: 'with-feature-flags',
    dirs: ['libs/feature-flags'],
    migrations: ['1750000000003-AddFeatureFlags.ts'],
    tsPaths: [`${OLD_SCOPE}/feature-flags`],
    pkgDeps: [{ file: 'apps/api/package.json', dep: `${OLD_SCOPE}/feature-flags` }],
  },
  // MetricsModule lives in libs/common (kept); only app wiring + env are gated.
  metrics: { flag: 'with-metrics' },
  compliance: {
    flag: 'with-compliance',
    requires: ['auth'], // wiring reads the users table; personal data is per-user
    dirs: ['libs/compliance', 'apps/api/src/modules/compliance'],
    migrations: ['1750000000005-AddCompliance.ts'],
    tsPaths: [`${OLD_SCOPE}/compliance`],
    pkgDeps: [{ file: 'apps/api/package.json', dep: `${OLD_SCOPE}/compliance` }],
  },
  // Reference-only CRUD demo. Never user-selectable; always dropped in --minimal.
  tasks: { dirs: ['apps/api/src/modules/tasks'], migrations: ['1750000000004-AddTasks.ts'] },
};
// Shared files that carry capability <token> sentinel blocks.
const CAP_SENTINEL_FILES = [
  'apps/api/src/app.module.ts',
  'apps/api/src/main.ts',
  'apps/api/src/modules/auth/app-auth.service.ts',
  'apps/api/src/modules/auth/app-auth.service.spec.ts',
  // Compliance wiring carries internal tasks/messaging sentinels (it registers
  // those modules' personal data) — prune them when those capabilities are off.
  'apps/api/src/modules/compliance/compliance-wiring.service.ts',
  'apps/api/src/modules/compliance/compliance-wiring.service.spec.ts',
  'apps/api/src/modules/compliance/compliance-wiring.module.ts',
  'apps/api-prisma/src/app.module.ts',
  'apps/api-prisma/prisma/schema.prisma',
  '.env.example',
];

const TEXT_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.mdc',
  '.yml',
  '.yaml',
  '.prisma',
  '.conf',
  '.template',
  '.example',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'tmp', '.next', 'coverage', '.nx']);
const RENAME_SKIP_FILES = new Set(['package-lock.json', 'init.mjs']);

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

/** Remove a dependency from a package.json (used when a capability's lib is dropped). */
function removePkgDep(rel, dep) {
  const full = path.join(ROOT, rel);
  if (!existsSync(full)) return;
  const pkg = JSON.parse(readFileSync(full, 'utf8'));
  let changed = false;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (pkg[field] && dep in pkg[field]) {
      delete pkg[field][dep];
      changed = true;
    }
  }
  if (changed) writeFileSync(full, JSON.stringify(pkg, null, 2) + '\n');
}

/** Minimal frontend: replace the coupled auth+tasks Vite sample with a health page. */
function writeMinimalVite(appName) {
  const app = `import { useEffect, useState } from 'react';
import { api } from './api';

export default function App() {
  const [apiUp, setApiUp] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .health()
      .then((h) => setApiUp(h.status === 'ok'))
      .catch(() => setApiUp(false));
  }, []);

  return (
    <main className="shell">
      <header>
        <h1>${appName}</h1>
        <span className={\`badge \${apiUp ? 'up' : 'down'}\`}>
          API {apiUp === null ? '…' : apiUp ? 'up' : 'down'}
        </span>
      </header>
      <section className="card">
        <h2>Your app shell is ready</h2>
        <p>This page checks the backend health endpoint. Start building your UI here.</p>
      </section>
    </main>
  );
}
`;
  const client = `/**
 * Minimal API client — just the health check. Add your own endpoints here.
 * Requests are same-origin to /api/v1/* (see the Vite dev proxy).
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Normalize via Headers so a caller passing a Headers instance, a plain
  // object, or an entries array (all valid RequestInit.headers) works the same.
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(\`/api/v1\${path}\`, { ...init, headers });
  if (!res.ok) throw new Error(\`Request failed (\${res.status})\`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  health: () => request<{ status: string }>('/health'),
};
`;
  if (existsSync(path.join(ROOT, 'apps/web/src/App.tsx'))) {
    writeFileSync(path.join(ROOT, 'apps/web/src/App.tsx'), app);
    writeFileSync(path.join(ROOT, 'apps/web/src/api.ts'), client);
    console.log('  wrote minimal apps/web (health landing page)');
  }
}

/**
 * Minimal mobile: replace the coupled auth+tasks+push Expo sample with a health
 * screen. Deps stay untouched (pruning them would desync apps/mobile's own
 * package-lock.json and break `npm ci`); expo-secure-store / expo-notifications /
 * expo-device are simply unused until you add auth or push back —
 * `npm uninstall` them in apps/mobile if you never will.
 */
function writeMinimalMobile(appName) {
  const app = `import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from './src/api';

export default function App() {
  const [apiUp, setApiUp] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .health()
      .then((h) => setApiUp(h.status === 'ok'))
      .catch(() => setApiUp(false));
  }, []);

  return (
    <View style={styles.shell}>
      <StatusBar style="dark" />
      <Text style={styles.title}>${appName}</Text>
      <Text style={styles.badge}>API {apiUp === null ? '…' : apiUp ? 'up' : 'down'}</Text>
      <Text style={styles.muted}>
        This screen checks the backend health endpoint. Start building your app here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 24, fontWeight: '700' },
  badge: { fontSize: 16, fontWeight: '600' },
  muted: { color: '#7a828c', textAlign: 'center' },
});
`;
  const client = `/**
 * Minimal API client — just the health check. Add your own endpoints here.
 * Point EXPO_PUBLIC_API_URL at your API's LAN address (see .env.example).
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(\`\${BASE_URL}/api/v1\${path}\`, { ...init, headers });
  if (!res.ok) throw new Error(\`Request failed (\${res.status})\`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  health: () => request<{ status: string }>('/health'),
};
`;
  if (existsSync(path.join(ROOT, 'apps/mobile/App.tsx'))) {
    writeFileSync(path.join(ROOT, 'apps/mobile/App.tsx'), app);
    writeFileSync(path.join(ROOT, 'apps/mobile/src/api.ts'), client);
    rmSync(path.join(ROOT, 'apps/mobile/src/push.ts'), { force: true });
    console.log('  wrote minimal apps/mobile (health screen)');
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
    if (!skipping && line.includes(startTok)) {
      skipping = true;
      continue;
    }
    if (skipping && line.includes(endTok)) {
      skipping = false;
      continue;
    }
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

  // 4d. Minimal frontend: swap the coupled auth+tasks Vite sample for a health page.
  if (minimal && keep.has('vite')) writeMinimalVite(name);
  if (minimal && keep.has('expo')) writeMinimalMobile(name);

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

  const summary = minimal ? `minimal (${[...caps].join(', ') || 'core only'})` : 'full reference';
  console.log(`\n✅  ${name} is ready — ${summary}. See docs/GETTING_STARTED.md.`);
}

main().catch((err) => {
  console.error(`\n✗ init failed: ${err.message}`);
  process.exit(1);
});
