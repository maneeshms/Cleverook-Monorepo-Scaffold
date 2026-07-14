import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, paginate, Paginated } from '@clevrook/common';
import { User } from './entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ListUsersDto } from './dto/list-users.dto';

export interface CreateUserData {
  email: string;
  passwordHash?: string | null;
  displayName?: string | null;
  role?: Role;
}

/** Safe projection returned by list/detail endpoints — never the entity itself. */
export interface UserSummary {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
  createdAt: Date;
  lastLoginAt: Date | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  findByEmail(email: string, withPassword = false): Promise<User | null> {
    const qb = this.users
      .createQueryBuilder('user')
      .where('user.email = :email', { email: email.toLowerCase() });
    if (withPassword) qb.addSelect('user.passwordHash');
    return qb.getOne();
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async getByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(data: CreateUserData): Promise<User> {
    const user = this.users.create({ ...data, email: data.email.toLowerCase() });
    return this.users.save(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.getByIdOrFail(id);
    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    return this.users.save(user);
  }

  /** GDPR export: everything we hold about the user, in one JSON document. */
  async exportUserData(id: string): Promise<Record<string, unknown>> {
    const user = await this.users.findOne({ where: { id }, relations: { sessions: true } });
    if (!user) throw new NotFoundException('User not found');
    return {
      profile: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
      sessions: user.sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
      })),
      exportedAt: new Date().toISOString(),
    };
  }

  /** Soft delete (deleted_at) — user-facing data is never hard-deleted. */
  async softDeleteAccount(id: string): Promise<void> {
    const user = await this.getByIdOrFail(id);
    await this.users.softRemove(user);
  }

  async recordSuccessfulLogin(id: string): Promise<void> {
    await this.users.update(id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });
  }

  /** Progressive lockout: 5 failures locks for 1 min, growing to a 15-min cap. */
  async recordFailedLogin(user: User, maxAttempts = 5): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    user.failedLoginAttempts = attempts;
    if (attempts >= maxAttempts) {
      const lockMinutes = Math.min(attempts - maxAttempts + 1, 15);
      user.lockedUntil = new Date(Date.now() + lockMinutes * 60_000);
    }
    await this.users.save(user);
  }

  isLocked(user: User): boolean {
    return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
  }

  /** Admin listing — standard paginated envelope, safe projection. */
  async findAllPaginated(query: ListUsersDto): Promise<Paginated<UserSummary>> {
    const qb = this.users.createQueryBuilder('user');
    if (query.search) {
      qb.where('user.email ILIKE :search OR user.display_name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    qb.orderBy('user.createdAt', 'DESC').skip(query.skip).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    return paginate(rows.map(toSummary), total, query);
  }
}

function toSummary(user: User): UserSummary {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}
