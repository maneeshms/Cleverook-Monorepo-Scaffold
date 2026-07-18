# Configuration

Configuration is **layered**. Every key is resolved in this order, first hit wins:

```
1. process.env               ← always wins (host env / .env / Railway variables)
2. config/{NODE_ENV}.json    ← per-app, per-environment overrides
3. config/default.json       ← per-app defaults
4. code default              ← last resort in libs/config
```

## Why layered

- **Secrets** (JWT secrets, DB passwords, API keys) live **only** in the
  environment — `.env` locally, host variables in production. The loader
  **rejects** secret-looking keys (`SECRET`, `PASSWORD`, `API_KEY`, `TOKEN`,
  `PRIVATE`, `CREDENTIAL`) if it finds them in a JSON file.
- **Non-secret, environment-specific values** (ports, log level, pool sizes,
  feature toggles) live in versioned JSON — reviewable, diffable, no `.env`
  sprawl across environments.
- **Code defaults** keep the app bootable with zero config in development.

## The JSON files

Each app owns a `config/` directory:

```
apps/api/config/
  default.json       # applied everywhere
  development.json    # NODE_ENV=development overrides
  production.json     # NODE_ENV=production overrides
  test.json           # NODE_ENV=test overrides
```

They are **flat maps whose keys are the exact env-var names**:

```json
{
  "PORT": 3000,
  "LOG_LEVEL": "info",
  "DATABASE_POOL_MAX": 20,
  "THROTTLE_LIMIT": 120
}
```

Non-string primitives are stringified into `process.env`. Nested objects, arrays,
and secret-looking keys are rejected (the loader throws at boot — fail fast).

## How it wires together (`libs/config`)

1. `loadLayeredConfig({ configDir, env, require })` merges the JSON layers beneath
   `process.env`, writes file values into `process.env` for keys not already set,
   and enforces `require`d keys are present.
2. `createEnvValidator(...)` runs that loader then the class-validator
   `validateEnv` on the merged result — the app refuses to boot on invalid config.
3. Typed `registerAs` namespaces (`app`, `database`, `jwt`, `throttle`,
   `messaging`, `metrics`) expose values via `ConfigService`.

In an app module:

```ts
ConfigModule.forRoot({
  isGlobal: true,
  ignoreEnvFile: true, // the loader owns .env
  load: [appConfig, databaseConfig, jwtConfig, throttleConfig],
  validate: createEnvValidator({
    configDir: 'apps/api/config',
    require: ['DATABASE_URL'],
  }),
});
```

Then read it — **never touch `process.env` directly** in app/lib code:

```ts
const port = this.config.get<number>('app.port');
```

## `CONFIG_DIR`

The loader resolves `configDir` from the option, else `$CONFIG_DIR`, else
`./config`. The Docker images set `CONFIG_DIR=/app/config` so the baked
`config/production.json` is picked up.

## A note on `NODE_ENV`

`.env` deliberately does **not** set `NODE_ENV` — Nx exports `.env` to every task,
and `next build` requires `NODE_ENV=production`. `NODE_ENV` defaults to
`development` via the loader; production hosts and the build set it explicitly.

## Reference

See `.env.example` for the full annotated variable list (core, database, JWT,
security/CORS, rate limiting, Redis, messaging, observability, logging).
