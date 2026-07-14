import { Channel } from '../enums/channel.enum';
import { ConsoleEmailProvider } from './console-email.provider';
import { ConsoleSmsProvider } from './console-sms.provider';
import { InAppProvider } from './in-app.provider';
import { ResendEmailProvider } from './resend-email.provider';

const mockResendSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockResendSend } })),
}));

describe('ConsoleEmailProvider', () => {
  it('prints instead of sending and reports success', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const provider = new ConsoleEmailProvider();
    expect(provider.channels).toEqual([Channel.EMAIL]);
    const result = await provider.send({
      channel: Channel.EMAIL,
      to: 'a@b.co',
      subject: 'Hi',
      text: 'Hello',
    });
    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toMatch(/^console-/);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('a@b.co'));
    logSpy.mockRestore();
  });

  it('handles missing subject/text gracefully', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const result = await new ConsoleEmailProvider().send({ channel: Channel.EMAIL, to: 'a@b.co' });
    expect(result.ok).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('(no subject)'));
    logSpy.mockRestore();
  });
});

describe('ConsoleSmsProvider', () => {
  it('prints the body (or text fallback) and succeeds', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const provider = new ConsoleSmsProvider();
    expect(provider.channels).toEqual([Channel.SMS]);
    const withBody = await provider.send({
      channel: Channel.SMS,
      to: '+15550001',
      body: 'code 1234',
    });
    expect(withBody.ok).toBe(true);
    const withText = await provider.send({ channel: Channel.SMS, to: '+15550001', text: 'txt' });
    expect(withText.ok).toBe(true);
    const empty = await provider.send({ channel: Channel.SMS, to: '+15550001' });
    expect(empty.ok).toBe(true);
    logSpy.mockRestore();
  });
});

describe('InAppProvider', () => {
  it('fails honestly when no sink is registered (no-mock-data rule)', async () => {
    const result = await new InAppProvider(undefined).send({ channel: Channel.IN_APP, to: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No in-app sink/);
  });

  it('delegates to the host sink with metadata mapping', async () => {
    const sink = { deliver: jest.fn().mockResolvedValue('notif-1') };
    const result = await new InAppProvider(sink).send({
      channel: Channel.IN_APP,
      to: 'user-9',
      body: 'You were assigned a task',
      metadata: { notificationType: 'TASK_ASSIGNED', title: 'New task', payload: { taskId: 't1' } },
    });
    expect(sink.deliver).toHaveBeenCalledWith({
      userId: 'user-9',
      type: 'TASK_ASSIGNED',
      title: 'New task',
      body: 'You were assigned a task',
      payload: { taskId: 't1' },
    });
    expect(result).toEqual({ ok: true, providerMessageId: 'notif-1' });
  });

  it('defaults title/payload and tolerates non-string sink ids', async () => {
    const sink = { deliver: jest.fn().mockResolvedValue(42) };
    const result = await new InAppProvider(sink).send({ channel: Channel.IN_APP, to: 'u1' });
    expect(sink.deliver).toHaveBeenCalledWith({
      userId: 'u1',
      type: undefined,
      title: '',
      body: undefined,
      payload: null,
    });
    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBeUndefined();
  });
});

describe('ResendEmailProvider', () => {
  const makeProvider = (
    dbProvider: unknown,
    options: Record<string, unknown> = {},
  ): ResendEmailProvider =>
    new ResendEmailProvider(
      { getProvider: jest.fn().mockResolvedValue(dbProvider) } as never,
      { encryptionKey: 'k', ...options } as never,
    );

  const delivery = { channel: Channel.EMAIL, to: 'a@b.co', subject: 'S', html: '<p>x</p>' };

  beforeEach(() => mockResendSend.mockReset());

  it('fails explicitly when unconfigured — never a fake success', async () => {
    const result = await makeProvider(null).send(delivery);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not configured/);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('sends via env fallback credentials', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null });
    const provider = makeProvider(null, {
      resend: { apiKey: 're_key', fromEmail: 'noreply@x.co', fromName: 'X' },
    });
    const result = await provider.send(delivery);
    expect(result).toEqual({ ok: true, providerMessageId: 'msg-1' });
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'X <noreply@x.co>', to: 'a@b.co', subject: 'S' }),
    );
  });

  it('prefers DB credentials over env fallback', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-2' }, error: null });
    const provider = makeProvider(
      {
        credentials: { apiKey: 'db_key', fromEmail: 'db@x.co', fromName: 'DB' },
        config: {},
      },
      { resend: { apiKey: 'env_key', fromEmail: 'env@x.co' } },
    );
    const result = await provider.send(delivery);
    expect(result.ok).toBe(true);
    expect(mockResendSend).toHaveBeenCalledWith(expect.objectContaining({ from: 'DB <db@x.co>' }));
  });

  it('reads fromEmail/fromName from provider config when creds omit them', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-3' }, error: null });
    const provider = makeProvider({
      credentials: { apiKey: 'db_key' },
      config: { fromEmail: 'cfg@x.co', fromName: 'Cfg' },
    });
    const result = await provider.send(delivery);
    expect(result.ok).toBe(true);
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Cfg <cfg@x.co>' }),
    );
  });

  it('propagates provider errors', async () => {
    mockResendSend.mockResolvedValue({ data: null, error: { message: 'domain not verified' } });
    const provider = makeProvider(null, { resend: { apiKey: 'k', fromEmail: 'n@x.co' } });
    const result = await provider.send(delivery);
    expect(result).toEqual({ ok: false, error: 'domain not verified' });
  });

  it('catches thrown SDK errors', async () => {
    mockResendSend.mockRejectedValue(new Error('network down'));
    const provider = makeProvider(null, { resend: { apiKey: 'k', fromEmail: 'n@x.co' } });
    const result = await provider.send(delivery);
    expect(result).toEqual({ ok: false, error: 'network down' });
  });

  it('normalises non-Error throwables', async () => {
    mockResendSend.mockRejectedValue('boom');
    const provider = makeProvider(null, { resend: { apiKey: 'k', fromEmail: 'n@x.co' } });
    const result = await provider.send(delivery);
    expect(result).toEqual({ ok: false, error: 'Unknown Resend error' });
  });
});
