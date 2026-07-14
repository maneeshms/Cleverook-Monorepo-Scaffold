import { Column, Entity, Index, OneToMany } from 'typeorm';
import { Role } from '@clevrook/common';
import { BaseEntity } from '@clevrook/database';
import { UserSession } from '../../auth/entities/user-session.entity';

@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 320 })
  email: string;

  // select:false — the hash never leaves the DB unless explicitly requested
  // (UsersService.findByEmail(email, true) on the login path only).
  @Column({ name: 'password_hash', type: 'varchar', nullable: true, select: false })
  passwordHash: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 120, nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', length: 50, default: Role.USER })
  role: Role;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @OneToMany(() => UserSession, (session) => session.user)
  sessions: UserSession[];
}
