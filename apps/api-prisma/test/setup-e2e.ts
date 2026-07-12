/**
 * e2e environment bootstrap for the Prisma reference app. Uses its own
 * disposable database (clevscaffold_prisma_test) — create + migrate it first:
 * `npm run e2e:setup`.
 */
process.env.NODE_ENV = 'test';
process.env.PRISMA_DATABASE_URL =
  process.env.E2E_PRISMA_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/clevscaffold_prisma_test';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'e2e_access_secret_at_least_32_characters_long';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'e2e_refresh_secret_at_least_32_characters_long';
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ?? '4';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS ?? '*';
delete process.env.REDIS_URL;
process.env.THROTTLE_DISABLED = 'true';
// Prevent the layered loader from picking up the api app's config dir.
process.env.CONFIG_DIR = 'apps/api-prisma/config';

jest.setTimeout(30_000);
