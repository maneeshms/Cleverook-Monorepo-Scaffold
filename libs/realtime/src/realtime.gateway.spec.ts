import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import type { RealtimeModuleOptions } from './realtime.options';

// The redis adapter path is unit-tested with mocked clients — no live Redis.
const quit = jest.fn().mockResolvedValue('OK');
const on = jest.fn();
const duplicate = jest.fn();
jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => {
    const client = { quit, on, duplicate };
    duplicate.mockReturnValue({ quit, on, duplicate });
    return client;
  }),
);
jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn().mockReturnValue('REDIS_ADAPTER'),
}));

const SECRET = 'unit-test-secret';

describe('RealtimeGateway', () => {
  const jwt = new JwtService({});
  let logger: { log: jest.Mock; error: jest.Mock };
  let realtime: RealtimeService;
  let server: { use: jest.Mock; adapter: jest.Mock; to: jest.Mock; emit: jest.Mock };

  const makeGateway = (options: Partial<RealtimeModuleOptions> = {}) =>
    new RealtimeGateway({ accessSecret: SECRET, ...options }, jwt, realtime, logger as never);

  const middleware = (gateway: RealtimeGateway): ((s: Socket, n: (e?: Error) => void) => void) => {
    gateway.afterInit(server as unknown as Server);
    return server.use.mock.calls[0][0];
  };

  const socket = (handshake: Record<string, unknown>): Socket =>
    ({ handshake: { headers: {}, auth: {}, ...handshake }, data: {}, join: jest.fn() }) as never;

  const sign = (payload: object, secret = SECRET, algorithm: 'HS256' | 'HS512' = 'HS256') =>
    jwt.sign(payload, { secret, algorithm });

  beforeEach(() => {
    jest.clearAllMocks();
    logger = { log: jest.fn(), error: jest.fn() };
    realtime = new RealtimeService();
    server = { use: jest.fn(), adapter: jest.fn(), to: jest.fn(), emit: jest.fn() };
  });

  describe('handshake authentication', () => {
    it('accepts a valid HS256 access token from the auth payload and attaches the user', () => {
      const next = jest.fn();
      const s = socket({ auth: { token: sign({ sub: 'u1', role: 'USER' }) } });
      middleware(makeGateway())(s, next);
      expect(next).toHaveBeenCalledWith(); // no error
      expect((s.data as { user: { sub: string } }).user.sub).toBe('u1');
    });

    it('falls back to the Authorization: Bearer header', () => {
      const next = jest.fn();
      const s = socket({ headers: { authorization: `Bearer ${sign({ sub: 'u2' })}` } });
      middleware(makeGateway())(s, next);
      expect(next).toHaveBeenCalledWith();
      expect((s.data as { user: { sub: string } }).user.sub).toBe('u2');
    });

    it('refuses a connection without a token — uniform "unauthorized" error', () => {
      const next = jest.fn();
      middleware(makeGateway())(socket({}), next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect((next.mock.calls[0][0] as Error).message).toBe('unauthorized');
    });

    it('refuses a token signed with the wrong secret — same uniform error', () => {
      const next = jest.fn();
      middleware(makeGateway())(
        socket({ auth: { token: sign({ sub: 'u1' }, 'other-secret') } }),
        next,
      );
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect((next.mock.calls[0][0] as Error).message).toBe('unauthorized');
    });

    it('refuses tokens signed with a non-pinned algorithm (HS512)', () => {
      const next = jest.fn();
      const s = socket({ auth: { token: sign({ sub: 'u1' }, SECRET, 'HS512') } });
      middleware(makeGateway())(s, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('refuses a token whose payload has no sub', () => {
      const next = jest.fn();
      middleware(makeGateway())(socket({ auth: { token: sign({ email: 'a@b.co' }) } }), next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('refuses every connection when accessSecret is not configured (fail closed)', () => {
      const next = jest.fn();
      const s = socket({ auth: { token: sign({ sub: 'u1' }) } });
      middleware(makeGateway({ accessSecret: '' }))(s, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it('joins the per-user room on connection and the service can then reach it', () => {
    const gateway = makeGateway();
    gateway.afterInit(server as unknown as Server);
    const s = socket({});
    (s.data as { user: unknown }).user = { sub: 'u7' };
    gateway.handleConnection(s);
    expect(s.join).toHaveBeenCalledWith('user:u7');

    // afterInit bound the server to the service — emits flow through it.
    server.to.mockReturnValue({ emit: jest.fn() });
    expect(realtime.emitToUser('u7', 'notification', {})).toBe(true);
    expect(server.to).toHaveBeenCalledWith('user:u7');
  });

  describe('redis adapter (multi-instance fan-out)', () => {
    it('stays on the in-memory adapter without redisUrl', () => {
      makeGateway().afterInit(server as unknown as Server);
      expect(server.adapter).not.toHaveBeenCalled();
    });

    it('attaches the redis adapter with dedicated pub/sub clients when redisUrl is set', () => {
      makeGateway({ redisUrl: 'redis://localhost:6379' }).afterInit(server as unknown as Server);
      expect(server.adapter).toHaveBeenCalledWith('REDIS_ADAPTER');
      expect(duplicate).toHaveBeenCalledTimes(1); // sub is a duplicate of pub
      expect(on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('logs redis client errors without crashing the gateway', () => {
      makeGateway({ redisUrl: 'redis://localhost:6379' }).afterInit(server as unknown as Server);
      const errorHandler = on.mock.calls.find(([event]) => event === 'error')?.[1] as (
        err: Error,
      ) => void;
      errorHandler(new Error('conn refused'));
      expect(logger.error).toHaveBeenCalledWith('Realtime redis error: conn refused');
    });

    it('closes both redis connections on shutdown, tolerating quit failures', async () => {
      const gateway = makeGateway({ redisUrl: 'redis://localhost:6379' });
      gateway.afterInit(server as unknown as Server);
      quit.mockRejectedValueOnce(new Error('already closed'));
      await expect(gateway.onModuleDestroy()).resolves.toBeUndefined();
      expect(quit).toHaveBeenCalledTimes(2);
    });

    it('shutdown is a no-op without redis', async () => {
      const gateway = makeGateway();
      gateway.afterInit(server as unknown as Server);
      await expect(gateway.onModuleDestroy()).resolves.toBeUndefined();
      expect(quit).not.toHaveBeenCalled();
    });
  });
});
