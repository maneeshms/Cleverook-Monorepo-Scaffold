import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '@clevrook/common';
import { DeviceToken, DeviceTokenService } from '@clevrook/messaging';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';

interface DeviceResponse {
  id: string;
  platform: string;
  tokenPreview: string;
  lastSeenAt: Date;
  createdAt: Date;
}

/**
 * Push-device registry endpoints. Clients register their FCM token after login
 * (and on token rotation) and unregister on logout; the messaging PUSH channel
 * fans out to every registered device of the recipient.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications/devices')
export class DevicesController {
  constructor(private readonly devices: DeviceTokenService) {}

  @Post()
  @ApiOperation({ summary: 'Register this device for push notifications (idempotent upsert)' })
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<DeviceResponse> {
    return this.toResponse(await this.devices.register(user.sub, dto.token, dto.platform));
  }

  @Get()
  @ApiOperation({ summary: 'List my registered devices (tokens masked)' })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<DeviceResponse[]> {
    return (await this.devices.listForUser(user.sub)).map((t) => this.toResponse(t));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unregister one of my devices (e.g. on logout). Idempotent.' })
  async unregister(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UnregisterDeviceDto,
  ): Promise<void> {
    await this.devices.unregister(user.sub, dto.token);
  }

  /** Never echo the full token back — it is a send-capability credential. */
  private toResponse(t: DeviceToken): DeviceResponse {
    return {
      id: t.id,
      platform: t.platform,
      tokenPreview: `${t.token.slice(0, 6)}…`,
      lastSeenAt: t.lastSeenAt,
      createdAt: t.createdAt,
    };
  }
}
