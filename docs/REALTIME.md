# Realtime channel (`libs/realtime` — socket.io)

An **authenticated socket.io push channel** as a config-injected library:
features say "tell this user this happened" (`RealtimeService.emitToUser`) and
connected clients get it instantly — REST stays the only read/write surface,
the socket is delivery UX on top. The reference wiring pushes every in-app
notification live: task assignment → messaging IN_APP sink → durable
`notifications` row → `notification` event on the assignee's sockets.

Why socket.io (and not GraphQL subscriptions): the scaffold's API paradigm is
hardened REST; adopting GraphQL just for subscriptions would import a whole
schema/resolver attack surface for one feature. Socket.io adds rooms,
auto-reconnect, and acks over plain ws, has first-class Nest support, and its
Redis adapter matches the scaffold's Redis-optional posture exactly.

## Wiring (the reference in `apps/api/src/app.module.ts`)

```ts
RealtimeModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    accessSecret: config.get('jwt.accessSecret') ?? '', // SAME secret as REST
    redisUrl: config.get('REDIS_URL') ?? null, // multi-instance fan-out
  }),
});
```

No new env vars: the handshake verifies `JWT_ACCESS_SECRET`, and `REDIS_URL`
(when set) activates the socket.io Redis adapter with dedicated pub/sub
connections so emits reach sockets on other instances. Unset → in-memory
adapter, correct for a single instance — the same fallback pattern as
throttling and the email queue.

## Security model

- **Handshake auth, fail closed**: the connection is refused before any event
  flows unless a valid access JWT arrives via `auth: { token }` (or an
  `Authorization: Bearer` header). Verification is **HS256-pinned** against the
  same secret as the REST `JwtStrategy`; refusals are a uniform `unauthorized`
  (no oracle about why). An empty secret refuses everything.
- **Room isolation**: each socket joins only `user:<sub>` — `emitToUser` can
  reach that user's devices and nothing else (covered by e2e).
- **Token-based, not cookie-based**: no ambient credentials ride the socket,
  which is why the permissive ws CORS (`origin: true`) is safe.
- Access tokens expire in 15 min; socket.io's auto-reconnect performs a fresh
  handshake, so a client that refreshes its REST token keeps reconnecting
  seamlessly. (Mid-connection expiry is accepted: the socket only _receives_.)

## Emitting from a feature

```ts
constructor(private readonly realtime: RealtimeService) {} // global — no import needed

this.realtime.emitToUser(userId, 'notification', { id, title }); // → user's devices
this.realtime.emitToAll('announce', { msg });                    // → everyone
```

Best-effort by contract: `emitToUser` returns `false` (never throws) when the
server isn't up. Persist the durable record first (DB row), emit second — the
reference (`NotificationsService.deliver`) is the pattern.

## Connecting a client

```ts
import { io } from 'socket.io-client'; // browser, React Native, or Node

const socket = io(API_URL, { auth: { token: accessToken } });
socket.on('notification', (n) => {
  /* toast + refresh the feed */
});
socket.on('connect_error', (err) => {
  /* err.message === 'unauthorized' → re-login */
});
```

## Verification

- Lib unit tests: 22 (handshake accept/refuse paths incl. wrong secret,
  non-pinned algorithm, missing sub, empty secret; rooms; redis adapter on/off;
  shutdown) at 100% coverage.
- e2e (`apps/api/test/realtime.e2e-spec.ts`): boots the real app on a live
  port — unauthenticated refusals, JWT connect, **live task-assignment
  notification received over the socket**, room isolation, and parity with the
  durable `/notifications` feed.

## Generated projects

`realtime` is an init capability (`--with-realtime`, default-on in the full
reference; **implies auth**, rides the TypeORM app). `--minimal` without it
prunes the lib and strips the emit wiring from the notifications sink; enable
it later with `node scripts/add.mjs realtime` (see `docs/EVOLVING.md`).
Messaging and realtime are independent: realtime without messaging gives you
the raw `RealtimeService` for your own events; messaging without realtime keeps
the durable feed only.
