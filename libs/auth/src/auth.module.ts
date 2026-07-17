import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSession } from './entities/user-session.entity';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { SessionCleanupService } from './services/session-cleanup.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthController } from './controllers/auth.controller';
import { AUTH_USER_STORE } from './interfaces/auth-user-store.interface';
import { AUTH_OPTIONS, AuthModuleAsyncOptions } from './auth.options';

/**
 * Reusable JWT auth as a library: register/login with constant-work compare +
 * progressive lockout, rotating opaque hashed refresh tokens with reuse
 * detection, stateless HS256 access tokens, hourly session purge.
 *
 * The host app registers it with `AuthModule.forRootAsync({...})`, supplying:
 *   - runtime options built from its own ConfigService (secrets/TTLs/rounds);
 *   - its user store (`userStore: UsersService` + the exporting module in
 *     `imports`) — the host owns the users table, the library owns sessions;
 *   - optionally an `AuthService` subclass (`authService: MyAuthService`) to
 *     override the protected hooks (onRegistered/onLoggedIn) or whole flows;
 *   - optionally `controller: false` to mount its own controller instead.
 *
 * Registered global so guards/consumers can inject AuthService/TokenService
 * without re-importing. Needs the host to run migrations (user_sessions) and
 * `ScheduleModule.forRoot()` for the cleanup cron.
 */
@Global()
@Module({})
export class AuthModule {
  static forRootAsync(options: AuthModuleAsyncOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: AUTH_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      // The host's user store, under the token the services inject.
      { provide: AUTH_USER_STORE, useExisting: options.userStore },
      // The extension seam: a host subclass replaces the base implementation
      // everywhere (controller included) via ordinary Nest DI.
      { provide: AuthService, useClass: options.authService ?? AuthService },
      TokenService,
      SessionCleanupService,
      JwtStrategy,
    ];

    return {
      module: AuthModule,
      global: true,
      imports: [
        ...(options.imports ?? []),
        PassportModule,
        JwtModule.register({}),
        TypeOrmModule.forFeature([UserSession]),
      ],
      providers,
      controllers: options.controller === false ? [] : [AuthController],
      exports: [AuthService, TokenService],
    };
  }
}
