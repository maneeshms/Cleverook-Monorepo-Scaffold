import { Test, TestingModule } from '@nestjs/testing';
import { MessagingService } from './messaging.service';
import { MessagingConfigService } from './messaging-config.service';
import { TemplateService } from './template.service';
import { DeliveryQueueService } from './delivery-queue.service';
import { MessageType } from '../enums/message-type';
import { Channel } from '../enums/channel.enum';

describe('MessagingService', () => {
  let service: MessagingService;
  let config: { routeFor: jest.Mock };
  let templates: { render: jest.Mock };
  let queue: { enqueue: jest.Mock };

  beforeEach(async () => {
    config = {
      routeFor: jest.fn().mockResolvedValue({ primary: 'resend', fallback: 'console-email' }),
    };
    templates = {
      render: jest.fn().mockResolvedValue({ subject: 'S', html: '<b>H</b>', text: 'T' }),
    };
    queue = { enqueue: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: MessagingConfigService, useValue: config },
        { provide: TemplateService, useValue: templates },
        { provide: DeliveryQueueService, useValue: queue },
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
    // TASK_ASSIGNED → [EMAIL, IN_APP]
    await service.dispatch({
      messageType: MessageType.TASK_ASSIGNED,
      userId: 'u1',
      recipient: { email: 'a@b.com' },
      variables: { assignerName: 'Sam', taskTitle: 'Ship it', link: 'x' },
    });
    expect(queue.enqueue).toHaveBeenCalledTimes(2); // EMAIL + IN_APP
  });

  it('warns and returns for an unknown message type', async () => {
    await service.dispatch({ messageType: 'NOT_A_TYPE' as MessageType });
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(templates.render).not.toHaveBeenCalled();
  });

  it('resolves destinations per channel (push token, in-app userId, unknown)', () => {
    const resolve = (channel: Channel, input: Record<string, unknown>) =>
      (service as any).resolveDestination(channel, input);
    expect(resolve(Channel.PUSH, { recipient: { pushToken: 'tok-1' } })).toBe('tok-1');
    expect(resolve(Channel.PUSH, { recipient: {} })).toBeNull();
    expect(resolve(Channel.IN_APP, { userId: 'u7' })).toBe('u7');
    expect(resolve(Channel.IN_APP, {})).toBeNull();
    expect(resolve(Channel.WHATSAPP, { recipient: { phone: '+1555' } })).toBe('+1555');
    expect(resolve('SMOKE_SIGNAL' as Channel, { recipient: {} })).toBeNull();
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
