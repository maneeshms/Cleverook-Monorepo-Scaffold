import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { DevicesController } from './devices.controller';

// DevicesController's DeviceTokenService comes from the global MessagingModule.
@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  providers: [NotificationsService],
  controllers: [NotificationsController, DevicesController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
