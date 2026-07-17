import { AuthModule } from './auth.module';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { AUTH_OPTIONS } from './auth.options';
import { AUTH_USER_STORE } from './interfaces/auth-user-store.interface';

class FakeStore {}
class CustomAuthService extends AuthService {}

const findProvider = (mod: ReturnType<typeof AuthModule.forRootAsync>, token: unknown) =>
  (mod.providers as any[]).find((p) => p === token || p?.provide === token);

describe('AuthModule.forRootAsync', () => {
  const base = {
    useFactory: () => ({ accessSecret: 's'.repeat(40) }),
    userStore: FakeStore,
  };

  it('registers globally with options wired to the host factory', () => {
    const mod = AuthModule.forRootAsync(base);
    expect(mod.global).toBe(true);
    const opts = findProvider(mod, AUTH_OPTIONS);
    expect(opts.useFactory().accessSecret).toBe('s'.repeat(40));
    expect(opts.inject).toEqual([]);
  });

  it('exposes the host user store under AUTH_USER_STORE (useExisting)', () => {
    const mod = AuthModule.forRootAsync(base);
    const store = findProvider(mod, AUTH_USER_STORE);
    expect(store.useExisting).toBe(FakeStore);
  });

  it('uses the base AuthService by default and a subclass when provided', () => {
    const def = findProvider(AuthModule.forRootAsync(base), AuthService);
    expect(def.useClass).toBe(AuthService);

    const custom = findProvider(
      AuthModule.forRootAsync({ ...base, authService: CustomAuthService }),
      AuthService,
    );
    expect(custom.useClass).toBe(CustomAuthService);
  });

  it('mounts the built-in controller unless opted out', () => {
    expect(AuthModule.forRootAsync(base).controllers).toEqual([AuthController]);
    expect(AuthModule.forRootAsync({ ...base, controller: false }).controllers).toEqual([]);
  });

  it('exports the extendable service surface and passes host imports through', () => {
    class HostModule {}
    const mod = AuthModule.forRootAsync({ ...base, imports: [HostModule] });
    expect(mod.exports).toEqual(expect.arrayContaining([AuthService]));
    expect(mod.imports).toEqual(expect.arrayContaining([HostModule]));
  });
});
