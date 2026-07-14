import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
// clevscaffold:tasks:start
import { Task } from '../tasks/entities/task.entity';
// clevscaffold:tasks:end
// clevscaffold:messaging:start
import { Notification } from '../notifications/entities/notification.entity';
// clevscaffold:messaging:end
import { ComplianceWiringService } from './compliance-wiring.service';

/**
 * App-side glue between this app's entities and `@clevrook/compliance`'s
 * extension registries. Kept separate from the library so the library stays
 * generic; kept separate from each feature module so a small app has one place
 * to see what personal data is subject to export/erasure/retention.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      // clevscaffold:tasks:start
      Task,
      // clevscaffold:tasks:end
      // clevscaffold:messaging:start
      Notification,
      // clevscaffold:messaging:end
    ]),
  ],
  providers: [ComplianceWiringService],
})
export class ComplianceWiringModule {}
