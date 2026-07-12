# Scaling

The scaffold is built for high-traffic products: the apps are stateless and
scale horizontally behind a load balancer. This page is the checklist for getting
there.

## Stateless by design

- **No in-process session state.** Auth is JWT + DB-backed refresh sessions, so any
  instance can serve any request.
- **Redis for shared state.** Set `REDIS_URL` and both the rate limiter and the
  message delivery queue become **global across instances**:
  - Throttler uses Redis storage → per-IP/user limits are enforced fleet-wide, not
    per-instance.
  - Messaging uses a BullMQ queue + worker → sends survive restarts, retry with
    backoff, and don't duplicate across instances.
  - Without Redis both fall back to single-instance-correct behavior (in-memory
    throttling, inline sends) — fine for one instance, **not** for scale-out.

## Horizontal scale-out checklist

- [ ] `REDIS_URL` set (shared throttling + queue) before running >1 instance.
- [ ] Database connection pool sized per instance: `DATABASE_POOL_MAX × instances`
      must stay under the server/pooler limit. Use a **transaction pooler**
      (pgbouncer / Supabase pooled) and a smaller per-instance pool at high fan-out.
- [ ] Migrations are expand/contract (backward-compatible) for rolling deploys.
- [ ] `enableShutdownHooks()` + readiness probe (`/health/ready`) let the LB drain
      an instance cleanly on deploy/scale-down.
- [ ] Long/async work goes through the queue, not the request path.
- [ ] `trust proxy` is set so rate limiting and logging see real client IPs behind
      Railway/Cloudflare.

## Database

- Prefer a pooler for many app instances (connection multiplexing).
- Add indexes for hot query paths; keep migrations reviewed.
- Read replicas can be introduced behind the repository/Prisma layer without
  touching controllers.

## Observability at scale

- **Metrics:** `/api/v1/metrics` (prom-client) exposes default process metrics + an
  HTTP request-duration histogram. Scrape with Prometheus; gate with
  `METRICS_ENABLED` + `METRICS_TOKEN`.
- **Logs:** structured Winston with correlation IDs threaded request→log→response,
  so you can trace a single request across instances. Ship to a central sink.
- **Alerts:** `logger.alert()` / `alertSecurity()` emit on security-critical events
  (e.g. refresh-token reuse) — route these to your on-call channel.

## Workers

The delivery queue worker runs in-process by default. To scale sends
independently, run dedicated worker instances consuming the same Redis queue — the
`RedisModule` + queue abstraction already support it.
