import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateUserData {
  email: string;
  passwordHash?: string | null;
  displayName?: string | null;
}

/** Safe projection for API responses — the passwordHash never leaves the service. */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export function toProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    // Only matches live accounts. Note: Prisma has no partial-unique-index support,
    // so the DB keeps a FULL unique index on email — a soft-deleted address stays
    // reserved (unlike the TypeORM app, which frees it via a partial index). create()
    // translates the resulting unique violation into a clean 409.
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  async getByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(data: CreateUserData): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: { ...data, email: data.email.toLowerCase() },
      });
    } catch (err) {
      // P2002 = unique constraint violation. Surface a clean 409 instead of a
      // leaked 500 (e.g. re-registering a soft-deleted account's email).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email is already registered');
      }
      throw err;
    }
  }

  async updateProfile(id: string, data: { displayName?: string }): Promise<User> {
    await this.getByIdOrFail(id);
    return this.prisma.user.update({ where: { id }, data });
  }

  /** Soft delete — sets deleted_at; queries above filter it out. */
  async softDeleteAccount(id: string): Promise<void> {
    await this.getByIdOrFail(id);
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async recordSuccessfulLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }

  /** Progressive lockout: 5 failures locks for 1 min, growing to a 15-min cap. */
  async recordFailedLogin(user: User, maxAttempts = 5): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const lockedUntil =
      attempts >= maxAttempts
        ? new Date(Date.now() + Math.min(attempts - maxAttempts + 1, 15) * 60_000)
        : user.lockedUntil;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: attempts, lockedUntil },
    });
    user.failedLoginAttempts = attempts;
    user.lockedUntil = lockedUntil;
  }

  isLocked(user: User): boolean {
    return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
  }
}
