import { Module } from '@nestjs/common';
import { IN_APP_SINK } from '@clevscaffold/messaging';
import { NotificationsModule } from './notifications.module';
import { NotificationsService } from './notifications.service';

/**
 * Bridges the messaging library's IN_APP channel to this app's notifications
 * feed. Passed into MessagingModule.forRootAsync({ imports: [...] }) so the
 * library resolves the host-owned sink without knowing the app's schema.
 */
@Module({
  imports: [NotificationsModule],
  providers: [{ provide: IN_APP_SINK, useExisting: NotificationsService }],
  exports: [IN_APP_SINK],
})
export class InAppSinkModule {}
