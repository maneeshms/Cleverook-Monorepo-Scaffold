# Deployment (Railway)

Each deployable app ships a `Dockerfile` + `railway.json`. Images are multi-stage,
run as a non-root user, gate on `npm audit`, and (for the APIs) run migrations
before starting.

## Per-app services

| App | Port | Health check | Start (CMD) |
|-----|------|--------------|-------------|
| `api` (TypeORM) | 3000 | `/api/v1/health` | migrate then `node …/main.js` |
| `api-prisma` | 3010 | `/api/v1/health` | `prisma migrate deploy` then start |
| `web` (Vite) | 80 | `/` | nginx serving the build + `/api` proxy |
| `web-next` | 3005 | `/` | Next standalone server |

Create one Railway service per app, each pointing at its `railway.json`
(`build.dockerfilePath`, `deploy.healthcheckPath`, restart policy).

## Configuration on Railway

- **Secrets** (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL` /
  `PRISMA_DATABASE_URL`, provider keys) → set as **service variables**. Never commit.
- **Non-secret, env-specific values** → the baked `config/production.json`. The
  images set `CONFIG_DIR=/app/config` so it's picked up. Set `NODE_ENV=production`.
- **Database:** provision Postgres (Railway plugin or Supabase). Set
  `DATABASE_SSL=require` for managed hosts. See [DATABASE.md](DATABASE.md).
- **Redis (optional):** set `REDIS_URL` to enable distributed rate limiting + the
  async delivery queue. Without it the app is single-instance correct.

## Migrations

Both API images run migrations as part of their start command, so a deploy applies
schema changes before serving traffic. Keep migrations backward-compatible for
zero-downtime rolling deploys (expand/contract pattern).

## Frontends

- **`web`**: nginx reverse-proxies `/api` to the API service (`API_URL` env,
  templated into the nginx conf) so the browser makes same-origin calls — no CORS.
- **`web-next`**: `output: 'standalone'`; set the API base via Next env and/or the
  `/api/v1` rewrites in `next.config.mjs`.

## Pre-deploy checklist

- [ ] Secrets set as service variables (not in JSON/repo)
- [ ] `NODE_ENV=production`, `CONFIG_DIR=/app/config`
- [ ] `DATABASE_SSL` correct for the host
- [ ] Explicit `CORS_ORIGINS` allowlist (not `*`) if the frontend needs credentials
- [ ] `METRICS_TOKEN` set if `/metrics` is exposed
- [ ] Health checks green; CI (build + e2e + security) green on `main`

For horizontal scale-out specifics, see [SCALING.md](SCALING.md).
