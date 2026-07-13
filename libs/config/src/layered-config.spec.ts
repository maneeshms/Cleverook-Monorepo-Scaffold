import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createEnvValidator, loadLayeredConfig } from './layered-config';

describe('loadLayeredConfig', () => {
  let dir: string;
  const originalEnv = process.env;

  const writeLayer = (name: string, content: unknown) =>
    fs.writeFileSync(path.join(dir, name), JSON.stringify(content));

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layered-config-'));
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  it('returns process.env values when no config files exist', () => {
    process.env.SOME_KEY = 'from-env';
    const merged = loadLayeredConfig({ configDir: dir, env: 'test', loadDotenv: false });
    expect(merged.SOME_KEY).toBe('from-env');
  });

  it('uses default.json for keys missing from the environment', () => {
    delete process.env.MY_SETTING;
    writeLayer('default.json', { MY_SETTING: 'from-default' });
    const merged = loadLayeredConfig({ configDir: dir, env: 'test', loadDotenv: false });
    expect(merged.MY_SETTING).toBe('from-default');
    expect(process.env.MY_SETTING).toBe('from-default');
  });

  it('lets <env>.json override default.json', () => {
    delete process.env.MY_SETTING;
    writeLayer('default.json', { MY_SETTING: 'from-default' });
    writeLayer('test.json', { MY_SETTING: 'from-test' });
    const merged = loadLayeredConfig({ configDir: dir, env: 'test', loadDotenv: false });
    expect(merged.MY_SETTING).toBe('from-test');
  });

  it('lets process.env override every file layer', () => {
    process.env.MY_SETTING = 'from-env';
    writeLayer('default.json', { MY_SETTING: 'from-default' });
    writeLayer('test.json', { MY_SETTING: 'from-test' });
    const merged = loadLayeredConfig({ configDir: dir, env: 'test', loadDotenv: false });
    expect(merged.MY_SETTING).toBe('from-env');
  });

  it('stringifies non-string primitives from JSON layers', () => {
    delete process.env.MY_PORT;
    delete process.env.MY_FLAG;
    writeLayer('default.json', { MY_PORT: 3005, MY_FLAG: true });
    const merged = loadLayeredConfig({ configDir: dir, env: 'test', loadDotenv: false });
    expect(merged.MY_PORT).toBe('3005');
    expect(merged.MY_FLAG).toBe('true');
  });

  it('ignores null values in JSON layers', () => {
    delete process.env.NULLABLE;
    writeLayer('default.json', { NULLABLE: null });
    const merged = loadLayeredConfig({ configDir: dir, env: 'test', loadDotenv: false });
    expect(merged.NULLABLE).toBeUndefined();
  });

  it('rejects secret-looking keys in JSON layers', () => {
    writeLayer('default.json', { JWT_ACCESS_SECRET: 'oops' });
    expect(() => loadLayeredConfig({ configDir: dir, env: 'test', loadDotenv: false })).toThrow(
      /secret-looking key "JWT_ACCESS_SECRET"/,
    );
  });

  it.each(['MY_PASSWORD', 'STRIPE_API_KEY', 'GITHUB_TOKEN', 'PRIVATE_PEM', 'DB_CREDENTIALS'])(
    'rejects %s in JSON layers',
    (key) => {
      writeLayer('test.json', { [key]: 'x' });
      expect(() => loadLayeredConfig({ configDir: dir, env: 'test', loadDotenv: false })).toThrow(
        /secret-looking/,
      );
    },
  );

  it('rejects nested objects in JSON layers', () => {
    writeLayer('default.json', { NESTED: { a: 1 } });
    expect(() => loadLayeredConfig({ configDir: dir, env: 'test', loadDotenv: false })).toThrow(
      /is nested/,
    );
  });

  it('rejects a layer that is not a JSON object', () => {
    fs.writeFileSync(path.join(dir, 'default.json'), '["array"]');
    expect(() => loadLayeredConfig({ configDir: dir, env: 'test', loadDotenv: false })).toThrow(
      /flat JSON object/,
    );
  });

  it('rejects malformed JSON with a helpful message', () => {
    fs.writeFileSync(path.join(dir, 'default.json'), '{ not json');
    expect(() => loadLayeredConfig({ configDir: dir, env: 'test', loadDotenv: false })).toThrow(
      /Invalid JSON/,
    );
  });

  it('throws when required keys are missing after layering', () => {
    delete process.env.NEEDED_KEY;
    expect(() =>
      loadLayeredConfig({
        configDir: dir,
        env: 'test',
        require: ['NEEDED_KEY'],
        loadDotenv: false,
      }),
    ).toThrow(/Missing required configuration: NEEDED_KEY/);
  });

  it('treats empty strings as missing for required keys', () => {
    process.env.NEEDED_KEY = '';
    expect(() =>
      loadLayeredConfig({
        configDir: dir,
        env: 'test',
        require: ['NEEDED_KEY'],
        loadDotenv: false,
      }),
    ).toThrow(/NEEDED_KEY/);
  });

  it('passes when required keys are satisfied by a file layer', () => {
    delete process.env.NEEDED_KEY;
    writeLayer('default.json', { NEEDED_KEY: 'present' });
    const merged = loadLayeredConfig({
      configDir: dir,
      env: 'test',
      require: ['NEEDED_KEY'],
      loadDotenv: false,
    });
    expect(merged.NEEDED_KEY).toBe('present');
  });

  it('resolves env name from NODE_ENV when not passed explicitly', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ONLY_IN_TEST;
    writeLayer('test.json', { ONLY_IN_TEST: 'yes' });
    const merged = loadLayeredConfig({ configDir: dir });
    expect(merged.ONLY_IN_TEST).toBe('yes');
  });

  it('falls back to ./config when neither configDir nor CONFIG_DIR is set', () => {
    delete process.env.CONFIG_DIR;
    // No config/ dir in the cwd during tests — loader must simply pass through env.
    process.env.PASSTHROUGH = 'still-here';
    const merged = loadLayeredConfig({ env: 'test', loadDotenv: false });
    expect(merged.PASSTHROUGH).toBe('still-here');
  });

  it('resolves configDir from CONFIG_DIR when not passed explicitly', () => {
    process.env.CONFIG_DIR = dir;
    delete process.env.FROM_CONFIG_DIR;
    writeLayer('default.json', { FROM_CONFIG_DIR: 'yes' });
    const merged = loadLayeredConfig({ env: 'test', loadDotenv: false });
    expect(merged.FROM_CONFIG_DIR).toBe('yes');
  });
});

describe('createEnvValidator', () => {
  let dir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layered-config-'));
    process.env = {
      ...originalEnv,
      JWT_ACCESS_SECRET: 'a'.repeat(40),
      JWT_REFRESH_SECRET: 'b'.repeat(40),
    };
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  it('returns validated config merged from all layers', () => {
    delete process.env.PORT;
    fs.writeFileSync(path.join(dir, 'default.json'), JSON.stringify({ PORT: 3111 }));
    const validate = createEnvValidator({ configDir: dir, env: 'test', loadDotenv: false });
    const result = validate({});
    expect(result.PORT).toBe(3111);
    expect(result.JWT_ACCESS_SECRET).toBe('a'.repeat(40));
  });

  it('propagates validation failures (fail-fast boot)', () => {
    // A provided-but-invalid value must still crash the boot (MinLength on JWT).
    process.env.JWT_ACCESS_SECRET = 'too-short';
    const validate = createEnvValidator({ configDir: dir, env: 'test', loadDotenv: false });
    expect(() => validate({})).toThrow(/at least 32 characters/);
    delete process.env.JWT_ACCESS_SECRET;
  });

  it('enforces per-app required keys', () => {
    delete process.env.DATABASE_URL;
    const validate = createEnvValidator({
      configDir: dir,
      env: 'test',
      require: ['DATABASE_URL'],
      loadDotenv: false,
    });
    expect(() => validate({})).toThrow(/Missing required configuration: DATABASE_URL/);
  });
});
