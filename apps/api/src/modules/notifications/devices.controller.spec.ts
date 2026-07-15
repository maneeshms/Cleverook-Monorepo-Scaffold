import { Test, TestingModule } from '@nestjs/testing';
import { DevicePlatform, DeviceToken, DeviceTokenService } from '@clevrook/messaging';
import { AuthenticatedUser } from '@clevrook/common';
import { DevicesController } from './devices.controller';

const user = { sub: 'u1', email: 'a@b.co', role: 'USER' } as unknown as AuthenticatedUser;

const row = (overrides: Partial<DeviceToken> = {}): DeviceToken =>
  ({
    id: 'row1',
    userId: 'u1',
    token: 'fcm-registration-token-abcdef',
    platform: DevicePlatform.ANDROID,
    lastSeenAt: new Date('2026-07-15T10:00:00Z'),
    createdAt: new Date('2026-07-01T10:00:00Z'),
    ...overrides,
  }) as DeviceToken;

describe('DevicesController', () => {
  let controller: DevicesController;
  let devices: { register: jest.Mock; listForUser: jest.Mock; unregister: jest.Mock };

  beforeEach(async () => {
    devices = {
      register: jest.fn().mockResolvedValue(row()),
      listForUser: jest.fn().mockResolvedValue([row()]),
      unregister: jest.fn().mockResolvedValue(1),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevicesController],
      providers: [{ provide: DeviceTokenService, useValue: devices }],
    }).compile();
    controller = module.get(DevicesController);
  });

  it('register delegates with the JWT identity, never a body-supplied user id', async () => {
    const result = await controller.register(user, {
      token: 'fcm-registration-token-abcdef',
      platform: DevicePlatform.ANDROID,
    });
    expect(devices.register).toHaveBeenCalledWith(
      'u1',
      'fcm-registration-token-abcdef',
      DevicePlatform.ANDROID,
    );
    expect(result.id).toBe('row1');
  });

  it('responses mask the token — the full credential is never echoed back', async () => {
    const result = await controller.register(user, {
      token: 'fcm-registration-token-abcdef',
      platform: DevicePlatform.ANDROID,
    });
    expect(result.tokenPreview).toBe('fcm-re…');
    expect(JSON.stringify(result)).not.toContain('fcm-registration-token-abcdef');
  });

  it('list returns only the caller’s devices, masked', async () => {
    const result = await controller.list(user);
    expect(devices.listForUser).toHaveBeenCalledWith('u1');
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe(DevicePlatform.ANDROID);
    expect(JSON.stringify(result)).not.toContain('fcm-registration-token-abcdef');
  });

  it('unregister is scoped to the caller and resolves void (204)', async () => {
    await expect(
      controller.unregister(user, { token: 'fcm-registration-token-abcdef' }),
    ).resolves.toBeUndefined();
    expect(devices.unregister).toHaveBeenCalledWith('u1', 'fcm-registration-token-abcdef');
  });
});
