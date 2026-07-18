/**
 * Shared scaffold manifest + helpers — the single source of truth for what the
 * scaffold is made of, used by three tools:
 *
 *   - scripts/init.mjs     (one-shot tailoring of a fresh clone; deletes itself)
 *   - scripts/add.mjs      (enable a capability later in a generated project)
 *   - scripts/new-app.mjs  (create a new api/vite/next/expo app with a custom name)
 *
 * Unlike init.mjs, THIS file (and add/new-app) stays in generated projects so
 * they can evolve. add/new-app import the PRISTINE scaffold's copy of this file
 * (fetched via .clevscaffold.json origin or --from) as the source of truth for
 * what to copy — the local copy only provides helpers and local paths.
 *
 * Zero dependencies. All helpers take the workspace root explicitly.
 */
import {
  existsSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  cpSync,
  mkdtempSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const OLD_SCOPE = '@clevrook';

// ── Component manifest ──────────────────────────────────────────────────────
// Each removable component lists what to delete when it is NOT selected. Runtime
// deps live in each package's own package.json (npm workspaces), so removing a
// component's directory removes its dependencies with it — no root-dep pruning.
export const COMPONENTS = {
  typeorm: {
    dirs: [
      'apps/api',
      'libs/database',
      'libs/auth',
      'libs/feature-flags',
      'libs/messaging',
      'libs/realtime',
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
      `${OLD_SCOPE}/realtime`,
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

// ── Capability manifest (minimal-app generator + add.mjs) ───────────────────
// Capabilities layer on top of the core skeleton. `--minimal` starts core-only;
// `--with-*` flags re-add them; `add.mjs` enables them later. Dropping a
// capability strips its <token> sentinel blocks from the shared files below and
// deletes its module dirs / migrations / lib path aliases / package deps.
// `tasks` is a reference-only demo — always dropped in a minimal app, never
// re-addable. Tokens are single lowercase words (marker-cleanup regex is [a-z]+).
export const ALL_CAPS = [
  'auth',
  'messaging',
  'realtime',
  'featureflags',
  'metrics',
  'compliance',
  'tasks',
];
export const MIGRATIONS_DIR = 'libs/database/src/migrations';
export const CAPABILITIES = {
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
  realtime: {
    flag: 'with-realtime',
    requires: ['auth'], // the socket handshake verifies the access JWT
    dirs: ['libs/realtime'],
    tsPaths: [`${OLD_SCOPE}/realtime`],
    pkgDeps: [{ file: 'apps/api/package.json', dep: `${OLD_SCOPE}/realtime` }],
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
export const CAP_SENTINEL_FILES = [
  'apps/api/src/app.module.ts',
  'apps/api/src/main.ts',
  'apps/api/src/modules/auth/app-auth.service.ts',
  'apps/api/src/modules/auth/app-auth.service.spec.ts',
  // The in-app sink carries realtime sentinels (live socket emit on deliver).
  'apps/api/src/modules/notifications/notifications.service.ts',
  'apps/api/src/modules/notifications/notifications.service.spec.ts',
  // Compliance wiring carries internal tasks/messaging sentinels (it registers
  // those modules' personal data) — prune them when those capabilities are off.
  'apps/api/src/modules/compliance/compliance-wiring.service.ts',
  'apps/api/src/modules/compliance/compliance-wiring.service.spec.ts',
  'apps/api/src/modules/compliance/compliance-wiring.module.ts',
  'apps/api-prisma/src/app.module.ts',
  'apps/api-prisma/prisma/schema.prisma',
  '.env.example',
];

export const TEXT_EXT = new Set([
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
export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'tmp',
  '.next',
  'coverage',
  '.nx',
  '.expo',
]);
export const RENAME_SKIP_FILES = new Set(['package-lock.json', 'init.mjs']);

// ── fs helpers ──────────────────────────────────────────────────────────────
export function walkTextFiles(dir, acc = []) {
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

export function rmrf(root, rel) {
  const full = path.join(root, rel);
  if (existsSync(full)) {
    rmSync(full, { recursive: true, force: true });
    console.log(`  removed ${rel}`);
  }
}

/** Copy a directory tree, skipping build/dependency artifacts. */
export function copyDir(srcDir, destDir) {
  cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => !SKIP_DIRS.has(path.basename(src)),
  });
}

export function readJson(root, rel) {
  return JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
}
export function writeJson(root, rel, obj) {
  writeFileSync(path.join(root, rel), JSON.stringify(obj, null, 2) + '\n');
}

/** Remove a dependency from a package.json (used when a capability's lib is dropped). */
export function removePkgDep(root, rel, dep) {
  const full = path.join(root, rel);
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

/** Pure text transform: drop every `clevscaffold:<name>:start/end` block (inclusive). */
export function stripSentinelBlocksFromText(text, name) {
  const startTok = `clevscaffold:${name}:start`;
  const endTok = `clevscaffold:${name}:end`;
  const kept = [];
  let skipping = false;
  for (const line of text.split('\n')) {
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
  return kept.join('\n');
}

/** Remove every line block delimited by `clevscaffold:<name>:start/end` (inclusive). */
export function stripSentinelBlocks(root, rel, name) {
  const full = path.join(root, rel);
  if (!existsSync(full)) return;
  writeFileSync(full, stripSentinelBlocksFromText(readFileSync(full, 'utf8'), name));
  console.log(`  pruned ${name} block(s) in ${rel}`);
}

/** Extract the content of `clevscaffold:<name>:start/end` blocks (markers excluded). */
export function extractSentinelBlocks(root, rel, name) {
  const full = path.join(root, rel);
  if (!existsSync(full)) return [];
  const startTok = `clevscaffold:${name}:start`;
  const endTok = `clevscaffold:${name}:end`;
  const blocks = [];
  let current = null;
  for (const line of readFileSync(full, 'utf8').split('\n')) {
    if (current === null && line.includes(startTok)) {
      current = [];
      continue;
    }
    if (current !== null && line.includes(endTok)) {
      blocks.push(current.join('\n'));
      current = null;
      continue;
    }
    if (current !== null) current.push(line);
  }
  return blocks;
}

/** Remove any lingering `clevscaffold:*:start/end` marker lines (content kept). */
export function stripSentinelMarkers(root, rel) {
  const full = path.join(root, rel);
  if (!existsSync(full)) return;
  const kept = readFileSync(full, 'utf8')
    .split('\n')
    .filter((line) => !/clevscaffold:[a-z]+:(start|end)/.test(line));
  writeFileSync(full, kept.join('\n'));
}

/** Replace a YAML/JS inline array literal `key: [a, b, c]` with a filtered set. */
export function rewriteArrayLiteral(root, rel, matchKey, keepValues, quote = false) {
  const full = path.join(root, rel);
  if (!existsSync(full)) return;
  let text = readFileSync(full, 'utf8');
  const re = new RegExp(`(${matchKey}:\\s*)\\[[^\\]]*\\]`);
  const rendered = keepValues.map((v) => (quote ? `'${v}'` : v)).join(', ');
  text = text.replace(re, `$1[${rendered}]`);
  writeFileSync(full, text);
}

/** Read the values of a YAML/JS inline array literal `key: [a, b, c]`. */
export function readArrayLiteral(root, rel, matchKey) {
  const full = path.join(root, rel);
  if (!existsSync(full)) return null;
  const m = readFileSync(full, 'utf8').match(new RegExp(`${matchKey}:\\s*\\[([^\\]]*)\\]`));
  if (!m) return null;
  return m[1]
    .split(',')
    .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/** Append a value to an inline array literal if not already present. */
export function appendToArrayLiteral(root, rel, matchKey, value, quote = false) {
  const current = readArrayLiteral(root, rel, matchKey);
  if (current === null) return false;
  if (current.includes(value)) return true;
  rewriteArrayLiteral(root, rel, matchKey, [...current, value], quote);
  return true;
}

/** Rename the npm scope across all text files under root. Returns files changed. */
export function renameScope(root, fromScope, toScope, skipFiles = RENAME_SKIP_FILES) {
  let renamed = 0;
  for (const file of walkTextFiles(root)) {
    if (skipFiles.has(path.basename(file))) continue;
    const before = readFileSync(file, 'utf8');
    if (!before.includes(fromScope)) continue;
    writeFileSync(file, before.split(fromScope).join(toScope));
    renamed++;
  }
  return renamed;
}

// ── App renaming (init.mjs applies it at generation; rename-app.mjs later) ──

// Files the rename walk must never rewrite: lockfiles (regenerated) and the
// evolution machinery itself (its manifests must keep pristine-scaffold names).
export const RENAME_APP_SKIP_FILES = new Set([
  'package-lock.json',
  'init.mjs',
  'scaffold-manifest.mjs',
  'add.mjs',
  'new-app.mjs',
  'rename-app.mjs',
]);

/**
 * Rename an app directory and EVERY hardcoded reference to it — the scaffold's
 * per-app files (Dockerfile COPY/CMD, railway.json, project.json commands,
 * workflow matrices, docs) deliberately carry concrete paths and are treated as
 * rewritable references:
 *
 *   - `apps/<from>` path references in all text files (boundary-safe: `api`
 *     never bleeds into `api-prisma`)
 *   - bare Nx names (`nx build <from>`, root `dev:<from>` script, project.json
 *     name, jest displayName, CI `app:` matrices)
 *   - the app package name (`@scope/<from>` → `@scope/<to>`)
 */
export function renameApp(root, from, to) {
  const pathRe = new RegExp(`apps/${from}(?![\\w-])`, 'g');
  const nxRe = new RegExp(`\\b(nx (?:build|serve|dev|test|e2e|lint)) ${from}(?![\\w-])`, 'g');

  for (const file of walkTextFiles(root)) {
    if (RENAME_APP_SKIP_FILES.has(path.basename(file))) continue;
    const before = readFileSync(file, 'utf8');
    const after = before.replace(pathRe, `apps/${to}`).replace(nxRe, `$1 ${to}`);
    if (after !== before) writeFileSync(file, after);
  }

  renameSync(path.join(root, `apps/${from}`), path.join(root, `apps/${to}`));

  const projPath = `apps/${to}/project.json`;
  if (existsSync(path.join(root, projPath))) {
    const proj = readJson(root, projPath);
    if (proj.name === from) proj.name = to;
    writeJson(root, projPath, proj);
  }
  const jestConfig = path.join(root, `apps/${to}/jest.config.ts`);
  if (existsSync(jestConfig)) {
    writeFileSync(
      jestConfig,
      readFileSync(jestConfig, 'utf8').replace(`displayName: '${from}'`, `displayName: '${to}'`),
    );
  }
  const appPkgPath = `apps/${to}/package.json`;
  if (existsSync(path.join(root, appPkgPath))) {
    const appPkg = readJson(root, appPkgPath);
    appPkg.name = appPkg.name.includes('/') ? appPkg.name.replace(`/${from}`, `/${to}`) : to;
    writeJson(root, appPkgPath, appPkg);
  }

  const rootPkg = readJson(root, 'package.json');
  for (const [key, value] of Object.entries({ ...rootPkg.scripts })) {
    const newKey = key === `dev:${from}` ? `dev:${to}` : key;
    const newValue = value.replace(nxRe, `$1 ${to}`);
    if (newKey !== key) delete rootPkg.scripts[key];
    rootPkg.scripts[newKey] = newValue;
  }
  writeJson(root, 'package.json', rootPkg);

  for (const wf of ['.github/workflows/ci.yml', '.github/workflows/image-scan.yml']) {
    const values = readArrayLiteral(root, wf, 'app');
    if (values?.includes(from)) {
      rewriteArrayLiteral(
        root,
        wf,
        'app',
        values.map((v) => (v === from ? to : v)),
      );
    }
  }

  console.log(`  renamed app ${from} → ${to}`);
}

// ── Pristine scaffold fetching (add.mjs / new-app.mjs) ──────────────────────

/**
 * Resolve a pristine scaffold working copy for evolution tools.
 * Priority: --from local path → --from git URL → manifest.scaffoldOrigin.
 * Returns { dir, cleanup } — call cleanup() when done (no-op for local paths).
 */
export function fetchPristine(projectRoot, fromOpt, refOpt, manifest) {
  const isPristine = (dir) => existsSync(path.join(dir, 'scripts/scaffold-manifest.mjs'));
  const looksLikeUrl = (s) => /^(git@|https?:\/\/|ssh:\/\/)/.test(s) || s.endsWith('.git');

  if (fromOpt && !looksLikeUrl(fromOpt)) {
    const dir = path.resolve(projectRoot, fromOpt);
    if (!isPristine(dir)) {
      throw new Error(
        `--from ${fromOpt}: not a scaffold checkout (scripts/scaffold-manifest.mjs missing)`,
      );
    }
    return { dir, cleanup: () => {} };
  }

  const url = fromOpt ?? manifest?.scaffoldOrigin;
  if (!url) {
    throw new Error(
      'no scaffold origin recorded in .clevscaffold.json — pass --from <path-to-scaffold-clone|git-url>',
    );
  }
  const tmp = mkdtempSync(path.join(tmpdir(), 'clevscaffold-'));
  console.log(`  fetching pristine scaffold from ${url} …`);
  execSync(`git clone --quiet ${url} ${tmp}`, { stdio: 'inherit' });
  const ref = refOpt ?? manifest?.scaffoldCommit;
  if (ref) {
    try {
      execSync(`git checkout --quiet ${ref}`, { cwd: tmp, stdio: 'pipe' });
      console.log(`  pinned to ${ref}`);
    } catch {
      console.warn(`  warn: could not checkout ${ref} — using the default branch instead`);
    }
  }
  if (!isPristine(tmp)) throw new Error('fetched repo is not a ClevScaffold checkout');
  return { dir: tmp, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

// ── Minimal client shells ───────────────────────────────────────────────────

/** Minimal frontend: replace the coupled auth+tasks Vite sample with a health page. */
export function writeMinimalVite(root, appName, appDir = 'apps/web') {
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
  if (existsSync(path.join(root, appDir, 'src/App.tsx'))) {
    writeFileSync(path.join(root, appDir, 'src/App.tsx'), app);
    writeFileSync(path.join(root, appDir, 'src/api.ts'), client);
    console.log(`  wrote minimal ${appDir} (health landing page)`);
  }
}

/**
 * Minimal mobile: replace the coupled auth+tasks+push Expo sample with a health
 * screen. Deps stay untouched (pruning them would desync the app's own
 * package-lock.json and break `npm ci`); expo-secure-store / expo-notifications /
 * expo-device are simply unused until you add auth or push back —
 * `npm uninstall` them in the app dir if you never will.
 */
export function writeMinimalMobile(root, appName, appDir = 'apps/mobile') {
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
  if (existsSync(path.join(root, appDir, 'App.tsx'))) {
    writeFileSync(path.join(root, appDir, 'App.tsx'), app);
    writeFileSync(path.join(root, appDir, 'src/api.ts'), client);
    rmSync(path.join(root, appDir, 'src/push.ts'), { force: true });
    console.log(`  wrote minimal ${appDir} (health screen)`);
  }
}
