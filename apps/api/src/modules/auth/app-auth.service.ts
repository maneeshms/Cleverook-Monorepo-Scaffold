import {
  Injectable,
  // clevscaffold:messaging:start
  Inject,
  // clevscaffold:messaging:end
} from '@nestjs/common';
import {
  AuthService,
  // clevscaffold:messaging:start
  AUTH_OPTIONS,
  AUTH_USER_STORE,
  AuthModuleOptions,
  AuthUserRecord,
  AuthUserStore,
  TokenService,
  // clevscaffold:messaging:end
} from '@clevrook/auth';
// clevscaffold:messaging:start
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '@clevrook/logger';
import { MessagingService, MessageType } from '@clevrook/messaging';
// clevscaffold:messaging:end

/**
 * This app's auth: the library's base flows, extended via the hook contract.
 * Wired in app.module.ts with `AuthModule.forRootAsync({ authService:
 * AppAuthService, ... })` — the reference example of how any project customises
 * auth without forking it (add hooks/claims here, never weaken the base).
 */
@Injectable()
export class AppAuthService extends AuthService {
  // clevscaffold:messaging:start
  constructor(
    @Inject(AUTH_USER_STORE) users: AuthUserStore,
    tokens: TokenService,
    @Inject(AUTH_OPTIONS) options: AuthModuleOptions,
    logger: LoggerService,
    private readonly messaging: MessagingService,
    private readonly appConfig: ConfigService,
  ) {
    super(users, tokens, options, logger);
  }

  /**
   * Welcome email through the messaging engine — deliberately fire-and-forget
   * inside the hook so a slow/failing provider never delays or blocks signup.
   * Without a Resend key this lands on the console-email provider.
   */
  protected override async onRegistered(user: AuthUserRecord): Promise<void> {
    this.messaging
      .dispatch({
        messageType: MessageType.WELCOME,
        userId: user.id,
        recipient: { email: user.email },
        variables: {
          displayName: user.displayName ?? '',
          displayNameComma: user.displayName ? `, ${user.displayName}!` : '!',
          link: this.appConfig.get<string>('messaging.appPublicUrl') ?? '',
        },
      })
      .catch((err) =>
        this.logger.error(`Welcome email dispatch failed: ${err.message}`, undefined, 'Auth'),
      );
  }
  // clevscaffold:messaging:end
}
