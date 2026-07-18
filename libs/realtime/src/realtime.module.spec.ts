import { RealtimeModule } from './realtime.module';
import { REALTIME_OPTIONS } from './realtime.options';
import { RealtimeService } from './realtime.service';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeModule.forRootAsync', () => {
  const dynamicModule = RealtimeModule.forRootAsync({
    inject: ['SOME_CONFIG' as never],
    useFactory: () => ({ accessSecret: 's3cret', redisUrl: null }),
  });

  it('registers globally with the options provider wired to the host factory', () => {
    expect(dynamicModule.global).toBe(true);
    const optionsProvider = (dynamicModule.providers as { provide?: unknown }[]).find(
      (p) => p.provide === REALTIME_OPTIONS,
    ) as { inject: unknown[]; useFactory: () => unknown };
    expect(optionsProvider.inject).toEqual(['SOME_CONFIG']);
    expect(optionsProvider.useFactory()).toEqual({ accessSecret: 's3cret', redisUrl: null });
  });

  it('defaults imports/inject when omitted', () => {
    const bare = RealtimeModule.forRootAsync({ useFactory: () => ({ accessSecret: 'x' }) });
    const optionsProvider = (bare.providers as { provide?: unknown }[]).find(
      (p) => p.provide === REALTIME_OPTIONS,
    ) as { inject: unknown[] };
    expect(optionsProvider.inject).toEqual([]);
    expect(bare.imports?.length).toBeGreaterThan(0); // JwtModule for handshake verification
  });

  it('provides the gateway and exports only the emit surface', () => {
    expect(dynamicModule.providers).toContain(RealtimeGateway);
    expect(dynamicModule.exports).toEqual([RealtimeService]);
  });
});
