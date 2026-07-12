/**
 * e2e environment bootstrap. Runs before the Nest app is created so that
 * config validation (fail-fast) sees a complete, valid environment.
 *
 * The database points at a disposable test database. Override with
 * E2E_DATABASE_URL in CI; locally it defaults to a `clevscaffold_test` DB on
 * the standard Postgres port. Create + migrate it first: `npm run e2e:setup`.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/clevscaffold_test';
process.env.DATABASE_SSL = 'disable';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'e2e_access_secret_at_least_32_characters_long';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'e2e_refresh_secret_at_least_32_characters_long';
process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '15m';
process.env.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? '30d';
// Cheap hashing so the suite is fast; production uses 12.
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ?? '4';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS ?? '*';
// No Redis in e2e: in-memory throttling, inline messaging delivery.
delete process.env.REDIS_URL;
// Throttling off for deterministic functional flows; the OWASP spec flips it
// on around its burst assertions (skipIf reads the env per request).
process.env.THROTTLE_DISABLED = 'true';

jest.setTimeout(30_000);
