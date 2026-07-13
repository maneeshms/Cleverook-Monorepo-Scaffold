/**
 * Idempotent seed: one admin account for local exploration.
 * Run: npm run prisma:seed   (override credentials via SEED_ADMIN_EMAIL/_PASSWORD)
 */
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

// Prisma 7 opens connections through a driver adapter (schema `url` is gone).
const url = process.env.PRISMA_DATABASE_URL;
if (!url) throw new Error('PRISMA_DATABASE_URL is not configured');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Adm1n!ChangeMe';
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, displayName: 'Admin', role: Role.ADMIN },
  });
  console.log(`seeded admin ${admin.email} (change the password!)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
