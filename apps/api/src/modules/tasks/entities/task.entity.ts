import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@clevrook/database';

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

/**
 * Demo domain entity — the reference for how a feature module looks in this
 * scaffold: BaseEntity (uuid/timestamps/soft delete), varchar-backed enum
 * (avoids the Postgres CREATE TYPE migration gotcha), ownership columns,
 * and indexes on every foreign key used in queries.
 */
@Entity('tasks')
export class Task extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: TaskStatus.TODO })
  status: TaskStatus;

  @Index()
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Index()
  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId: string | null;

  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate: Date | null;
}
