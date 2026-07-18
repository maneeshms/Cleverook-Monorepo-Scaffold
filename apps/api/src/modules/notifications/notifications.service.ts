import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { paginate, Paginated, PaginationQueryDto } from '@clevrook/common';
import { InAppMessage, InAppSink } from '@clevrook/messaging';
// clevscaffold:realtime:start
import { RealtimeService } from '@clevrook/realtime';
// clevscaffold:realtime:end
import { Notification } from './entities/notification.entity';

/**
 * In-app notification feed. Doubles as the messaging library's IN_APP sink:
 * MessagingService.dispatch(...) with an IN_APP channel ends up in deliver().
 */
@Injectable()
export class NotificationsService implements InAppSink {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    // clevscaffold:realtime:start
    private readonly realtime: RealtimeService,
    // clevscaffold:realtime:end
  ) {}

  /** InAppSink contract — called by the messaging engine's in-app provider. */
  async deliver(message: InAppMessage): Promise<string> {
    const saved = await this.notifications.save(
      this.notifications.create({
        userId: message.userId,
        type: message.type ?? null,
        title: message.title,
        body: message.body ?? null,
        payload: message.payload ?? null,
      }),
    );
    // clevscaffold:realtime:start
    // Live push to the user's connected sockets — best-effort by design: the
    // notification row above is the durable record, the socket emit is UX.
    this.realtime.emitToUser(saved.userId, 'notification', {
      id: saved.id,
      type: saved.type,
      title: saved.title,
      body: saved.body,
      createdAt: saved.createdAt,
    });
    // clevscaffold:realtime:end
    return saved.id;
  }

  async list(userId: string, query: PaginationQueryDto): Promise<Paginated<Notification>> {
    const [rows, total] = await this.notifications.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginate(rows, total, query);
  }

  unreadCount(userId: string): Promise<number> {
    return this.notifications.count({ where: { userId, readAt: IsNull() } });
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    // Scoped by userId — a user can never touch another user's notification (IDOR guard).
    const notification = await this.notifications.findOne({ where: { id, userId } });
    if (!notification) throw new NotFoundException('Notification not found');
    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notifications.save(notification);
    }
    return notification;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notifications.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }
}
