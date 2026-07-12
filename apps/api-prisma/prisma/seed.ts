/**
 * Idempotent seed: one admin account for local exploration.
 * Run: npm run prisma:seed   (override credentials via SEED_ADMIN_EMAIL/_PASSWORD)
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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
