import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { LoggerService } from '@clevrook/logger';
import { REALTIME_OPTIONS, RealtimeModuleOptions } from './realtime.options';
import { RealtimeService } from './realtime.service';

/** Claims the gateway trusts after verifying the access JWT. */
export interface RealtimeUser {
  sub: string;
  email?: string;
  role?: string;
  sessionId?: string;
}

/**
 * Authenticated socket.io gateway.
 *
 * - **Handshake auth**: clients connect with `auth: { token: <access JWT> }`
 *   (or an `Authorization: Bearer` header). The token is verified HS256-pinned
 *   against the SAME secret as the REST API — an unauthenticated connection is
 *   refused before any event flows. No cookies, no ambient credentials, which
 *   is also why the permissive ws CORS below is safe.
 * - **Rooms**: each socket joins `user:<sub>`, so `RealtimeService.emitToUser`
 *   reaches every device/tab of that user and nothing else.
 * - **Scale-out**: with `redisUrl` set, the Redis adapter (dedicated pub/sub
 *   connections — subscriber connections can't run normal commands) fans
 *   emits out across instances; without it, the in-memory adapter is correct
 *   for a single instance.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  private pub: IORedis | null = null;
  private sub: IORedis | null = null;

  constructor(
    @Inject(REALTIME_OPTIONS) private readonly options: RealtimeModuleOptions,
    private readonly jwt: JwtService,
    private readonly realtime: RealtimeService,
    private readonly logger: LoggerService,
  ) {}

  afterInit(server: Server): void {
    if (this.options.redisUrl) {
      this.pub = new IORedis(this.options.redisUrl, { maxRetriesPerRequest: null });
      this.sub = this.pub.duplicate();
      for (const client of [this.pub, this.sub]) {
        client.on('error', (err) => this.logger.error(`Realtime redis error: ${err.message}`));
      }
      server.adapter(createAdapter(this.pub, this.sub));
      this.logger.log('Realtime gateway using the Redis adapter (multi-instance).', 'Realtime');
    }

    // Handshake middleware — runs BEFORE the connection is accepted.
    server.use((socket, next) => {
      try {
        socket.data.user = this.authenticate(socket);
        next();
      } catch {
        // Uniform refusal: no detail leaks about why the token failed.
        next(new Error('unauthorized'));
      }
    });

    this.realtime.bind(server);
  }

  handleConnection(socket: Socket): void {
    const user = socket.data.user as RealtimeUser;
    void socket.join(RealtimeService.userRoom(user.sub));
  }

  /** Verify the handshake token (auth payload first, Bearer header fallback). */
  private authenticate(socket: Socket): RealtimeUser {
    const fromAuth = (socket.handshake.auth as Record<string, unknown>)?.token;
    const header = socket.handshake.headers.authorization;
    const token =
      typeof fromAuth === 'string' && fromAuth
        ? fromAuth
        : typeof header === 'string' && header.startsWith('Bearer ')
          ? header.slice('Bearer '.length)
          : null;
    if (!token) throw new Error('missing token');
    if (!this.options.accessSecret) throw new Error('accessSecret not configured');
    const payload = this.jwt.verify<RealtimeUser>(token, {
      secret: this.options.accessSecret,
      algorithms: ['HS256'], // pinned — same policy as the REST JwtStrategy
    });
    if (!payload?.sub) throw new Error('invalid payload');
    return payload;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.pub?.quit(), this.sub?.quit()].map((p) => p?.catch(() => undefined)));
    this.pub = null;
    this.sub = null;
  }
}
