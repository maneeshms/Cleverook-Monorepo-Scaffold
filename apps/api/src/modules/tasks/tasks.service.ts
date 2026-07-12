import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate, Paginated, RedisService } from '@clevscaffold/common';
import { LoggerService } from '@clevscaffold/logger';
import { MessageType, MessagingService } from '@clevscaffold/messaging';
import { UsersService } from '../users/users.service';
import { Task, TaskStatus } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';

export interface TaskStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
}

const STATS_CACHE_TTL_SECONDS = 30;

/**
 * Demo feature service — the reference for the scaffold's core patterns:
 * ownership checks on every read/write, the paginated list envelope,
 * Redis cache-aside (null-safe when Redis is off), and messaging fan-out
 * (email + in-app) on assignment.
 */
@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasks: Repository<Task>,
    private readonly users: UsersService,
    private readonly messaging: MessagingService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async create(ownerId: string, dto: CreateTaskDto): Promise<Task> {
    if (dto.assigneeId) {
      await this.users.getByIdOrFail(dto.assigneeId); // 404 on unknown assignee
    }
    const task = await this.tasks.save(
      this.tasks.create({
        title: dto.title,
        description: dto.description ?? null,
        ownerId,
        assigneeId: dto.assigneeId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      }),
    );
    await this.invalidateStats(ownerId, task.assigneeId);
    if (task.assigneeId && task.assigneeId !== ownerId) {
      await this.notifyAssignment(task, ownerId);
    }
    return task;
  }

  /** Tasks the user owns or is assigned to — never anyone else's. */
  async findAllForUser(userId: string, query: ListTasksDto): Promise<Paginated<Task>> {
    const qb = this.tasks
      .createQueryBuilder('task')
      .where('(task.owner_id = :userId OR task.assignee_id = :userId)', { userId });
    if (query.status) qb.andWhere('task.status = :status', { status: query.status });
    if (query.search) qb.andWhere('task.title ILIKE :search', { search: `%${query.search}%` });
    qb.orderBy('task.createdAt', 'DESC').skip(query.skip).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    return paginate(rows, total, query);
  }

  async findOneForUser(id: string, userId: string): Promise<Task> {
    const task = await this.tasks.findOne({ where: { id } });
    // 404 for both "missing" and "not yours": don't leak which ids exist (BOLA guard).
    if (!task || (task.ownerId !== userId && task.assigneeId !== userId)) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async update(id: string, userId: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOneForUser(id, userId);
    if (task.ownerId !== userId) {
      // Assignees may update status only; everything else is owner-only.
      const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateTaskDto] !== undefined);
      if (keys.some((k) => k !== 'status')) {
        throw new ForbiddenException('Only the owner can edit task fields');
      }
    }

    const previousAssignee = task.assigneeId;
    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId) await this.users.getByIdOrFail(dto.assigneeId);
      task.assigneeId = dto.assigneeId ?? null;
    }
    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description ?? null;
    if (dto.status !== undefined) task.status = dto.status;
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const saved = await this.tasks.save(task);
    await this.invalidateStats(saved.ownerId, saved.assigneeId, previousAssignee);
    if (saved.assigneeId && saved.assigneeId !== previousAssignee && saved.assigneeId !== userId) {
      await this.notifyAssignment(saved, userId);
    }
    return saved;
  }

  async remove(id: string, userId: string): Promise<void> {
    const task = await this.findOneForUser(id, userId);
    if (task.ownerId !== userId) {
      throw new ForbiddenException('Only the owner can delete a task');
    }
    await this.tasks.softRemove(task);
    await this.invalidateStats(task.ownerId, task.assigneeId);
  }

  /**
   * Cache-aside example. With Redis: stats served from cache for 30s and
   * invalidated on writes. Without Redis: always computed — same answer,
   * no fake cache (explicit fallback, not a mock).
   */
  async getStats(userId: string): Promise<TaskStats> {
    const cacheKey = this.statsKey(userId);
    if (this.redis.isEnabled()) {
      const cached = await this.redis.client!.get(cacheKey);
      if (cached) return JSON.parse(cached) as TaskStats;
    }

    const rows: { status: TaskStatus; count: string }[] = await this.tasks
      .createQueryBuilder('task')
      .select('task.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('(task.owner_id = :userId OR task.assignee_id = :userId)', { userId })
      .groupBy('task.status')
      .getRawMany();

    const byStatus = {
      [TaskStatus.TODO]: 0,
      [TaskStatus.IN_PROGRESS]: 0,
      [TaskStatus.DONE]: 0,
    };
    let total = 0;
    for (const row of rows) {
      const count = parseInt(row.count, 10);
      byStatus[row.status] = count;
      total += count;
    }
    const stats: TaskStats = { total, byStatus };

    if (this.redis.isEnabled()) {
      await this.redis
        .client!.set(cacheKey, JSON.stringify(stats), 'EX', STATS_CACHE_TTL_SECONDS)
        .catch(() => undefined);
    }
    return stats;
  }

  private statsKey(userId: string): string {
    return `tasks:stats:${userId}`;
  }

  private async invalidateStats(...userIds: (string | null | undefined)[]): Promise<void> {
    if (!this.redis.isEnabled()) return;
    const keys = [...new Set(userIds.filter((id): id is string => !!id))].map((id) =>
      this.statsKey(id),
    );
    if (keys.length) await this.redis.client!.del(...keys).catch(() => undefined);
  }

  /** Fan-out on assignment: email + in-app via the messaging engine (best-effort). */
  private async notifyAssignment(task: Task, assignerId: string): Promise<void> {
    const [assignee, assigner] = await Promise.all([
      this.users.findById(task.assigneeId!),
      this.users.findById(assignerId),
    ]);
    if (!assignee) return;

    const appUrl = this.config.get<string>('messaging.appPublicUrl') ?? '';
    await this.messaging
      .dispatch({
        messageType: MessageType.TASK_ASSIGNED,
        userId: assignee.id,
        recipient: { email: assignee.email },
        variables: {
          assignerName: assigner?.displayName ?? assigner?.email ?? 'Someone',
          taskTitle: task.title,
          link: `${appUrl}/tasks/${task.id}`,
        },
        metadata: {
          notificationType: 'TASK_ASSIGNED',
          title: `New task: ${task.title}`,
          payload: { taskId: task.id },
        },
      })
      .catch((err) =>
        this.logger.error(`Task-assignment dispatch failed: ${err.message}`, undefined, 'Tasks'),
      );
  }
}
