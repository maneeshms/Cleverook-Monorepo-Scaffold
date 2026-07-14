import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { EnvironmentVariables, validateEnv } from './env.validation';

/**
 * Layered configuration loader.
 *
 * Resolution order for every key (first hit wins):
 *   1. process.env (real environment; `.env` is folded in here via dotenv)
 *   2. <configDir>/<NODE_ENV>.json   e.g. config/production.json
 *   3. <configDir>/default.json
 *   4. code default (declared on EnvironmentVariables / the registerAs namespaces)
 *
 * The JSON files are FLAT maps whose keys are the exact env-var names
 * (`{ "PORT": 3001, "LOG_LEVEL": "debug" }`), so a value has one name
 * everywhere. File values are written into process.env (only where unset),
 * which keeps ConfigService, registerAs namespaces, and third-party tooling
 * working unchanged.
 *
 * SECURITY: secrets are rejected in JSON files — they belong in the real
 * environment only.
 */

export interface LayeredConfigOptions {
  /** Directory holding default.json / <env>.json. Default: $CONFIG_DIR or ./config */
  configDir?: string;
  /** Environment name. Default: $NODE_ENV or 'development'. */
  env?: string;
  /** Keys that must be present after layering (per-app hard requirements). */
  require?: string[];
  /** Load `.env` into process.env first. Default true; tests pass false for isolation. */
  loadDotenv?: boolean;
}

/** Key-name patterns that must never appear in JSON config files. */
const SECRET_KEY_PATTERN = /(SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|TOKEN|PRIVATE|CREDENTIAL)/i;

function readJsonLayer(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid JSON in config layer ${file}: ${(err as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Config layer ${file} must be a flat JSON object of KEY: value pairs`);
  }
  const layer = parsed as Record<string, unknown>;
  for (const [key, value] of Object.entries(layer)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(
        `Config layer ${file} contains secret-looking key "${key}". ` +
          'Secrets must be provided via environment variables, never JSON files.',
      );
    }
    if (value !== null && typeof value === 'object') {
      throw new Error(
        `Config layer ${file}: key "${key}" is nested. Layers are flat maps of env-var names.`,
      );
    }
  }
  return layer;
}

/**
 * Merge the JSON layers underneath process.env and return the full merged map.
 * File-sourced values are also written into process.env (only for keys the
 * environment did not already define).
 */
export function loadLayeredConfig(options: LayeredConfigOptions = {}): Record<string, string> {
  if (options.loadDotenv !== false) dotenv.config(); // .env → process.env, never overriding real env
  const configDir =
    options.configDir ?? process.env.CONFIG_DIR ?? path.join(process.cwd(), 'config');
  const env = options.env ?? process.env.NODE_ENV ?? 'development';

  const defaults = readJsonLayer(path.join(configDir, 'default.json'));
  const envLayer = readJsonLayer(path.join(configDir, `${env}.json`));
  const fileLayer = { ...defaults, ...envLayer };

  for (const [key, value] of Object.entries(fileLayer)) {
    if (process.env[key] === undefined && value !== null && value !== undefined) {
      process.env[key] = String(value);
    }
  }

  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) merged[key] = value;
  }

  const missing = (options.require ?? []).filter(
    (key) => merged[key] === undefined || merged[key] === '',
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.join(', ')}. ` +
        'Provide via environment variables (secrets) or the config/*.json layers.',
    );
  }

  return merged;
}

/**
 * Factory for ConfigModule.forRoot({ validate }). Runs the layered loader,
 * then class-validator validation — the app refuses to boot on bad config.
 *
 *   ConfigModule.forRoot({
 *     isGlobal: true,
 *     ignoreEnvFile: true, // the loader owns .env handling
 *     load: [appConfig, databaseConfig, jwtConfig, throttleConfig],
 *     validate: createEnvValidator({ configDir: 'apps/api/config', require: ['DATABASE_URL'] }),
 *   })
 */
export function createEnvValidator(options: LayeredConfigOptions = {}) {
  return (_nestProvidedEnv: Record<string, unknown>): EnvironmentVariables => {
    const merged = loadLayeredConfig(options);
    return validateEnv(merged);
  };
}
