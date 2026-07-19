#!/usr/bin/env node
/**
 * Create a NEW app with a custom name — in the pristine scaffold or in a
 * generated project (see docs/EVOLVING.md).
 *
 * Copies the matching reference app from a pristine scaffold, reduces it to a
 * bare shell (backend: core-only NestJS — config/logger/database/health/
 * throttler, no capabilities; clients: health-check page/screen), renames
 * every path/name/port, and registers it everywhere: root scripts, npm
 * workspaces (backend), tsconfig/eslint excludes (clients), CI docker/audit
 * matrices, and dependabot.
 *
 * Usage:
 *   node scripts/new-app.mjs --type api|vite|next|expo --name <kebab>
 *        [--port <n>] [--from <path|git-url>] [--ref <sha|branch>] [--no-install]
 *
 * Examples:
 *   node scripts/new-app.mjs --type api  --name billing --port 3002
 *   node scripts/new-app.mjs --type vite --name storefront --port 5174
 *   node scripts/new-app.mjs --type expo --name driver-app
 *
 * Notes:
 *   - `--type api` produces a TypeORM core app (requires libs/database in this
 *     project).
 *   - New backend apps share DATABASE_URL and the shared migrations in
 *     libs/database. Point them at their own database via env/config when the
 *     service needs isolation.
 *
 * Zero dependencies.
 */
import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  OLD_SCOPE as LOCAL_SCOPE,
  readJson,
  writeJson,
  fetchPristine,
  copyDir,
  appendToArrayLiteral,
  stripSentinelMarkers,
  stripSentinelBlocksFromText,
  writeMinimalVite,
  writeMinimalMobile,
} from './scaffold-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  api: { template: 'apps/api', run: 'serve', docker: true, standalone: false, defaultPort: 3002 },
  vite: { template: 'apps/web', run: 'dev', docker: true, standalone: true, defaultPort: 5174 },
  next: {
    template: 'apps/web-next',
    run: 'dev',
    docker: true,
    standalone: true,
    defaultPort: 3006,
  },
  expo: { template: 'apps/mobile', run: 'dev', docker: false, standalone: true, defaultPort: null },
};

function parseArgs(argv) {
  const out = { opts: {}, flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-install') out.flags.add('no-install');
    else if (a.startsWith('--')) out.opts[a.slice(2)] = argv[++i];
  }
  return out;
}

function walkFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo', '.next', 'coverage'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else if (entry.isFile() && !entry.name.endsWith('.png')) acc.push(full);
  }
  return acc;
}

/** Replace template path references (`apps/api` → `apps/<name>`), boundary-safe. */
function renamePaths(appDir, templateRel, name) {
  const base = templateRel.replace('apps/', '');
  const re = new RegExp(`apps/${base}(?![\\w-])`, 'g');
  for (const file of walkFiles(appDir)) {
    const text = readFileSync(file, 'utf8');
    const next = text.replace(re, `apps/${name}`);
    if (next !== text) writeFileSync(file, next);
  }
}

async function main() {
  const { opts, flags } = parseArgs(process.argv.slice(2));
  const type = opts.type;
  const name = opts.name;
  if (!type || !name || !TYPES[type]) {
    console.error(
      'usage: node scripts/new-app.mjs --type api|vite|next|expo --name <kebab> [--port <n>] [--from <path|git-url>]',
    );
    process.exit(2);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`--name "${name}" must be kebab-case`);
  const appDirRel = `apps/${name}`;
  if (existsSync(path.join(ROOT, appDirRel))) throw new Error(`${appDirRel} already exists`);

  // Generated project (has .clevscaffold.json) or the pristine scaffold itself.
  const scaffoldMode = existsSync(path.join(ROOT, 'scripts/init.mjs'));
  const manifest = existsSync(path.join(ROOT, '.clevscaffold.json'))
    ? readJson(ROOT, '.clevscaffold.json')
    : { scope: LOCAL_SCOPE, name: readJson(ROOT, 'package.json').name };
  const scope = manifest.scope ?? LOCAL_SCOPE;

  if (type === 'api' && !existsSync(path.join(ROOT, 'libs/database'))) {
    throw new Error(
      '--type api needs the TypeORM stack (libs/database), which is missing from this project.',
    );
  }

  const { dir: pristine, cleanup } = scaffoldMode
    ? { dir: ROOT, cleanup: () => {} }
    : fetchPristine(ROOT, opts.from, opts.ref, manifest);
  try {
    const pm = await import(
      pathToFileURL(path.join(pristine, 'scripts/scaffold-manifest.mjs')).href
    );
    const spec = TYPES[type];
    const templateSrc = path.join(pristine, spec.template);
    if (!existsSync(templateSrc)) {
      throw new Error(`template ${spec.template} not found in the pristine scaffold`);
    }

    console.log(`\nCreating ${appDirRel} (${type}, from ${spec.template})\n`);
    copyDir(templateSrc, path.join(ROOT, appDirRel));
    const appDir = path.join(ROOT, appDirRel);

    // ── Reduce to a bare shell ──────────────────────────────────────────────
    if (type === 'api') {
      // Strip every capability: sentinel blocks in copied files, module dirs,
      // lib deps — leaving the hardened core (config/logger/db/health/throttle).
      for (const file of walkFiles(appDir)) {
        let text = readFileSync(file, 'utf8');
        for (const c of pm.ALL_CAPS) text = stripSentinelBlocksFromText(text, c);
        writeFileSync(file, text);
        stripSentinelMarkers(ROOT, path.relative(ROOT, file));
      }
      for (const c of pm.ALL_CAPS) {
        for (const d of pm.CAPABILITIES[c].dirs ?? []) {
          if (d.startsWith(`${spec.template}/`)) {
            rmSync(path.join(appDir, d.slice(spec.template.length + 1)), {
              recursive: true,
              force: true,
            });
          }
        }
        for (const f of pm.CAPABILITIES[c].files ?? []) {
          if (f.startsWith(`${spec.template}/`)) {
            rmSync(path.join(appDir, f.slice(spec.template.length + 1)), { force: true });
          }
        }
      }
      // Drop capability lib deps from the new app's package.json.
      const appPkg = readJson(ROOT, `${appDirRel}/package.json`);
      for (const c of pm.ALL_CAPS) {
        for (const pd of pm.CAPABILITIES[c].pkgDeps ?? []) {
          delete appPkg.dependencies?.[pd.dep];
          delete appPkg.dependencies?.[pd.dep.replace(pm.OLD_SCOPE, scope)];
        }
      }
      writeJson(ROOT, `${appDirRel}/package.json`, appPkg);
      // Keep only the capability-free e2e surface (health + generic helpers).
      for (const spec2 of readdirSync(path.join(appDir, 'test'))) {
        if (spec2.endsWith('.e2e-spec.ts') && spec2 !== 'health.e2e-spec.ts') {
          rmSync(path.join(appDir, 'test', spec2), { force: true });
        }
      }
    } else if (type === 'vite') {
      writeMinimalVite(ROOT, name, appDirRel);
    } else if (type === 'expo') {
      writeMinimalMobile(ROOT, name, appDirRel);
    }
    // next: the reference is already an uncoupled landing page — kept as-is.

    // ── Rename: paths, package/project names, ports, scope ─────────────────
    renamePaths(appDir, spec.template, name);
    for (const file of walkFiles(appDir)) {
      const text = readFileSync(file, 'utf8');
      if (text.includes(pm.OLD_SCOPE)) {
        writeFileSync(file, text.split(pm.OLD_SCOPE).join(scope));
      }
    }
    const appPkg = readJson(ROOT, `${appDirRel}/package.json`);
    appPkg.name = spec.standalone ? name : `${scope}/${name}`;
    writeJson(ROOT, `${appDirRel}/package.json`, appPkg);
    if (existsSync(path.join(appDir, 'project.json'))) {
      const proj = readJson(ROOT, `${appDirRel}/project.json`);
      proj.name = name;
      writeJson(ROOT, `${appDirRel}/project.json`, proj);
    }

    const port = opts.port ?? spec.defaultPort;
    if (port) {
      if (type === 'api') {
        const cfg = readJson(ROOT, `${appDirRel}/config/default.json`);
        cfg.PORT = Number(port);
        writeJson(ROOT, `${appDirRel}/config/default.json`, cfg);
      } else if (type === 'vite') {
        const vc = path.join(appDir, 'vite.config.ts');
        writeFileSync(vc, readFileSync(vc, 'utf8').replace(/port:\s*\d+/, `port: ${port}`));
      } else if (type === 'next') {
        const pkg = readJson(ROOT, `${appDirRel}/package.json`);
        for (const s of ['dev', 'start']) {
          if (pkg.scripts?.[s]) pkg.scripts[s] = pkg.scripts[s].replace(/-p \d+/, `-p ${port}`);
        }
        writeJson(ROOT, `${appDirRel}/package.json`, pkg);
      }
      console.log(`  port → ${port}`);
    }
    if (type === 'expo') {
      const appJson = readJson(ROOT, `${appDirRel}/app.json`);
      appJson.expo.name = name;
      appJson.expo.slug = name;
      const id = `com.${(manifest.name ?? 'app').replace(/-/g, '')}.${name.replace(/-/g, '')}`;
      if (appJson.expo.ios) appJson.expo.ios.bundleIdentifier = id;
      if (appJson.expo.android) appJson.expo.android.package = id;
      writeJson(ROOT, `${appDirRel}/app.json`, appJson);
    }

    // ── Register everywhere ─────────────────────────────────────────────────
    const notes = [];
    const rootPkg = readJson(ROOT, 'package.json');
    rootPkg.scripts[`dev:${name}`] = `nx ${spec.run} ${name}`;
    if (!spec.standalone && Array.isArray(rootPkg.workspaces)) {
      rootPkg.workspaces = [...new Set([...rootPkg.workspaces, appDirRel])];
    }
    writeJson(ROOT, 'package.json', rootPkg);
    console.log(`  registered root script dev:${name}${spec.standalone ? '' : ' + workspace'}`);

    if (spec.docker) {
      for (const wf of ['.github/workflows/ci.yml', '.github/workflows/image-scan.yml']) {
        if (!appendToArrayLiteral(ROOT, wf, 'app', name)) notes.push(`add ${name} to ${wf} matrix`);
      }
    }
    if (spec.standalone) {
      if (!appendToArrayLiteral(ROOT, '.github/workflows/security.yml', 'dir', appDirRel, true)) {
        notes.push(`add ${appDirRel} to security.yml audit matrix`);
      }
      const ts = readJson(ROOT, 'tsconfig.base.json');
      ts.exclude = [...new Set([...(ts.exclude ?? []), appDirRel])];
      writeJson(ROOT, 'tsconfig.base.json', ts);
      if (!appendToArrayLiteral(ROOT, 'eslint.config.mjs', 'ignores', `${appDirRel}/**`, true)) {
        notes.push(`add '${appDirRel}/**' to eslint.config.mjs ignores`);
      }
      // Dependabot: watch the new standalone app's own lockfile.
      const db = path.join(ROOT, '.github/dependabot.yml');
      if (existsSync(db)) {
        const text = readFileSync(db, 'utf8');
        const anchor = '  # GitHub Actions';
        const block = `  - package-ecosystem: npm
    directory: '/${appDirRel}'
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      minor-patch:
        patterns: ['*']
        update-types: ['minor', 'patch']
      major-updates:
        patterns: ['*']
        update-types: ['major']

`;
        if (text.includes(anchor)) {
          writeFileSync(db, text.replace(anchor, block + anchor));
          console.log('  registered in dependabot.yml');
        } else {
          notes.push(`add a npm block for /${appDirRel} to .github/dependabot.yml`);
        }
      }
    }
    if (spec.docker && existsSync(path.join(ROOT, '.github/dependabot.yml'))) {
      const db = path.join(ROOT, '.github/dependabot.yml');
      const text = readFileSync(db, 'utf8');
      const m = text.match(/(- package-ecosystem: docker\n\s*directories:\n)/);
      if (m) {
        writeFileSync(db, text.replace(m[1], `${m[1]}      - '/${appDirRel}'\n`));
      } else {
        notes.push(`add '/${appDirRel}' to the dependabot docker directories`);
      }
    }

    if (!flags.has('no-install')) {
      console.log('\nInstalling dependencies…');
      execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
      if (spec.standalone) {
        execSync('npm install --no-audit --no-fund', { cwd: appDir, stdio: 'inherit' });
      }
    }

    console.log(`\n✅  ${appDirRel} is ready.`);
    console.log(`    run:    npm run dev:${name}`);
    console.log(`    verify: npx nx build ${name} && npx nx lint ${name}`);
    if (type === 'api') {
      console.log(
        '    note: shares DATABASE_URL + libs/database migrations — point it at its own DB via config when needed.',
      );
    }
    if (notes.length) {
      console.log('\nManual follow-ups (anchors not found):');
      for (const n of notes) console.log(`  - ${n}`);
    }
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(`\n✗ new-app failed: ${err.message}`);
  process.exit(1);
});
