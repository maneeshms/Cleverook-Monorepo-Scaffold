import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { PersonalDataRegistry, RetentionRegistry } from '@clevrook/compliance';
import { User } from '../users/entities/user.entity';
// clevscaffold:tasks:start
import { Task } from '../tasks/entities/task.entity';
// clevscaffold:tasks:end
// clevscaffold:messaging:start
import { Notification } from '../notifications/entities/notification.entity';
// clevscaffold:messaging:end

/**
 * Wires this app's modules into the compliance library's extension points, so
 * GDPR export/erasure and retention stay COMPLETE and DECOUPLED: each module's
 * personal data is declared here (or, in a larger app, inside each module), and
 * the library never imports feature modules.
 *
 * Erasure anonymises rather than hard-deletes where a tombstone must survive for
 * referential integrity (the user row) and hard-deletes where it need not (tasks,
 * notifications). The audit trail itself is retained as erasure proof.
 */
@Injectable()
export class ComplianceWiringService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly personalData: PersonalDataRegistry,
    private readonly retention: RetentionRegistry,
    // clevscaffold:tasks:start
    @InjectRepository(Task)
    private readonly tasks: Repository<Task>,
    // clevscaffold:tasks:end
    // clevscaffold:messaging:start
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    // clevscaffold:messaging:end
  ) {}

  onModuleInit(): void {
    this.registerProfile();
    // clevscaffold:tasks:start
    this.registerTasks();
    // clevscaffold:tasks:end
    // clevscaffold:messaging:start
    this.registerNotifications();
    // clevscaffold:messaging:end
  }

  /** Anonymise a user's PII to a per-id tombstone (kept for referential integrity). */
  private async anonymiseUser(userId: string): Promise<number> {
    const res = await this.users.update(
      { id: userId },
      {
        email: `erased-${userId}@erased.invalid`,
        displayName: null,
        passwordHash: null,
      },
    );
    return res.affected ?? 0;
  }

  private registerProfile(): void {
    this.personalData.register({
      key: 'profile',
      collect: async (userId) => {
        // passwordHash has { select: false } so it never loads — safe to return.
        return this.users.findOne({ where: { id: userId } });
      },
      erase: async (userId) => {
        const affected = await this.anonymiseUser(userId);
        await this.users.softDelete({ id: userId });
        return affected;
      },
    });

    // Storage limitation: users soft-deleted past the grace window get their PII
    // scrubbed (the skeleton row survives for FK integrity / audit references).
    this.retention.register({
      key: 'soft-deleted-users',
      windowDays: (p) => p.softDeletedUserGraceDays,
      purge: async (olderThan) => {
        const stale = await this.users.find({
          withDeleted: true,
          where: { deletedAt: LessThan(olderThan) },
        });
        let n = 0;
        // Skip rows already tombstoned so the run is idempotent.
        for (const u of stale) {
          if (!u.email.startsWith('erased-')) n += await this.anonymiseUser(u.id);
        }
        return n;
      },
    });
  }

  // clevscaffold:tasks:start
  private registerTasks(): void {
    this.personalData.register({
      key: 'tasks',
      collect: (userId) =>
        this.tasks.find({ where: [{ ownerId: userId }, { assigneeId: userId }] }),
      erase: async (userId) => {
        // Owned tasks are the subject's data → delete. Assigned-only tasks belong
        // to their owner → just detach the erased subject.
        await this.tasks.update({ assigneeId: userId }, { assigneeId: null });
        const res = await this.tasks.delete({ ownerId: userId });
        return res.affected ?? 0;
      },
    });
  }
  // clevscaffold:tasks:end

  // clevscaffold:messaging:start
  private registerNotifications(): void {
    this.personalData.register({
      key: 'notifications',
      collect: (userId) => this.notifications.find({ where: { userId } }),
      erase: async (userId) => {
        const res = await this.notifications.delete({ userId });
        return res.affected ?? 0;
      },
    });

    this.retention.register({
      key: 'notifications',
      windowDays: (p) => p.notificationDays,
      purge: async (olderThan) => {
        const res = await this.notifications.delete({ createdAt: LessThan(olderThan) });
        return res.affected ?? 0;
      },
    });
  }
  // clevscaffold:messaging:end
}
