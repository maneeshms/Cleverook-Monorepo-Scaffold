import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser, Public } from '@clevrook/common';
import { AuthService, RequestContext } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshDto } from '../dto/refresh.dto';

/**
 * Structural view of the incoming request — just what auth needs. Keeps the
 * library free of an express type dependency (works behind Fastify too).
 */
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

/**
 * The built-in /auth surface. Opt out with `controller: false` and subclass —
 * `class MyAuthController extends AuthController` inherits every route; add or
 * override methods as needed (decorators are inherited per method).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(protected readonly auth: AuthService) {}

  protected context(req: AuthRequest): RequestContext {
    return {
      userAgent: (req.headers['user-agent'] as string) ?? null,
      ipAddress:
        (req.headers['cf-connecting-ip'] as string) ??
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        req.ip ??
        null,
    };
  }

  // Auth endpoints carry stricter per-IP rate limits than the global throttle
  // (default 120/min). These bound credential-stuffing and brute-force attempts
  // regardless of the account-lockout logic.

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Create an account and receive a token pair' })
  register(@Body() dto: RegisterDto, @Req() req: AuthRequest) {
    return this.auth.register(dto, this.context(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate and receive a token pair' })
  login(@Body() dto: LoginDto, @Req() req: AuthRequest) {
    return this.auth.login(dto, this.context(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and receive a new pair' })
  refresh(@Body() dto: RefreshDto, @Req() req: AuthRequest) {
    return this.auth.refresh(dto.refreshToken, this.context(req));
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session' })
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.logout(user.sessionId, user.sub);
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke all sessions for the current user' })
  logoutAll(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.logoutAll(user.sub);
  }
}
