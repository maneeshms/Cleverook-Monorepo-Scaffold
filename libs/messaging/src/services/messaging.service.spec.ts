import { Test, TestingModule } from '@nestjs/testing';
import { MessagingService } from './messaging.service';
import { MessagingConfigService } from './messaging-config.service';
import { TemplateService } from './template.service';
import { DeliveryQueueService } from './delivery-queue.service';
import { DeviceTokenService } from './device-token.service';
import { MessageType } from '../enums/message-type';
import { Channel } from '../enums/channel.enum';

describe('MessagingService', () => {
  let service: MessagingService;
  let config: { routeFor: jest.Mock };
  let templates: { render: jest.Mock };
  let queue: { enqueue: jest.Mock };
  let deviceTokens: { tokensForUser: jest.Mock };

  beforeEach(async () => {
    config = {
      routeFor: jest.fn().mockResolvedValue({ primary: 'resend', fallback: 'console-email' }),
    };
    templates = {
      render: jest.fn().mockResolvedValue({ subject: 'S', html: '<b>H</b>', text: 'T' }),
    };
    queue = { enqueue: jest.fn() };
    deviceTokens = { tokensForUser: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: MessagingConfigService, useValue: config },
        { provide: TemplateService, useValue: templates },
        { provide: DeliveryQueueService, useValue: queue },
        { provide: DeviceTokenService, useValue: deviceTokens },
      ],
    }).compile();

    service = module.get(MessagingService);
  });

  it('renders + routes + enqueues one job for an email message type', async () => {
    await service.dispatch({
      messageType: MessageType.EMAIL_VERIFICATION,
      userId: 'u1',
      recipient: { email: 'a@b.com' },
      variables: { code: '123456' },
    });

    expect(templates.render).toHaveBeenCalledWith(
      'EMAIL_VERIFICATION',
      Channel.EMAIL,
      { code: '123456' },
      'en',
    );
    expect(config.routeFor).toHaveBeenCalledWith(Channel.EMAIL);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: 'resend',
        fallbackProviderKey: 'console-email',
        delivery: expect.objectContaining({ channel: Channel.EMAIL, to: 'a@b.com' }),
      }),
    );
  });

  it('skips a channel with no contact point (no enqueue)', async () => {
    await service.dispatch({
      messageType: MessageType.PHONE_OTP,
      userId: 'u1',
      recipient: {}, // no phone
      variables: { code: '999' },
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('fans out to every channel of a multi-channel type', async () => {
    // TASK_ASSIGNED → [EMAIL, IN_APP, PUSH]; no registered devices ⇒ PUSH skipped.
    await service.dispatch({
      messageType: MessageType.TASK_ASSIGNED,
      userId: 'u1',
      recipient: { email: 'a@b.com' },
      variables: { assignerName: 'Sam', taskTitle: 'Ship it', link: 'x' },
    });
    expect(queue.enqueue).toHaveBeenCalledTimes(2); // EMAIL + IN_APP
  });

  it('PUSH fans out to every device registered for the user', async () => {
    deviceTokens.tokensForUser.mockResolvedValue(['tok-android', 'tok-iphone', 'tok-web']);
    await service.dispatch({
      messageType: MessageType.TASK_ASSIGNED,
      userId: 'u1',
      channelOverride: Channel.PUSH,
      variables: { assignerName: 'Sam', taskTitle: 'Ship it' },
    });
    expect(deviceTokens.tokensForUser).toHaveBeenCalledWith('u1');
    expect(queue.enqueue).toHaveBeenCalledTimes(3);
    const targets = queue.enqueue.mock.calls.map((c) => c[0].delivery.to);
    expect(targets).toEqual(['tok-android', 'tok-iphone', 'tok-web']);
    // One render + one route lookup for the whole fan-out, not per device.
    expect(templates.render).toHaveBeenCalledTimes(1);
  });

  it('an explicit recipient.pushToken targets that single device (no registry lookup)', async () => {
    await service.dispatch({
      messageType: MessageType.TASK_ASSIGNED,
      userId: 'u1',
      channelOverride: Channel.PUSH,
      recipient: { pushToken: 'tok-explicit' },
      variables: {},
    });
    expect(deviceTokens.tokensForUser).not.toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ delivery: expect.objectContaining({ to: 'tok-explicit' }) }),
    );
  });

  it('warns and returns for an unknown message type', async () => {
    await service.dispatch({ messageType: 'NOT_A_TYPE' as MessageType });
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(templates.render).not.toHaveBeenCalled();
  });

  it('resolves destinations per channel (push token, in-app userId, unknown)', async () => {
    const resolve = (channel: Channel, input: Record<string, unknown>): Promise<string[]> =>
      (service as any).resolveDestinations(channel, input);
    await expect(resolve(Channel.PUSH, { recipient: { pushToken: 'tok-1' } })).resolves.toEqual([
      'tok-1',
    ]);
    await expect(resolve(Channel.PUSH, { recipient: {} })).resolves.toEqual([]);
    await expect(resolve(Channel.IN_APP, { userId: 'u7' })).resolves.toEqual(['u7']);
    await expect(resolve(Channel.IN_APP, {})).resolves.toEqual([]);
    await expect(resolve(Channel.WHATSAPP, { recipient: { phone: '+1555' } })).resolves.toEqual([
      '+1555',
    ]);
    await expect(resolve('SMOKE_SIGNAL' as Channel, { recipient: {} })).resolves.toEqual([]);
  });

  it('channelOverride narrows the fan-out set', async () => {
    await service.dispatch({
      messageType: MessageType.TASK_ASSIGNED,
      userId: 'u1',
      channelOverride: Channel.IN_APP,
      recipient: { email: 'a@b.com' },
      variables: {},
    });
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ delivery: expect.objectContaining({ channel: Channel.IN_APP }) }),
    );
  });
});
