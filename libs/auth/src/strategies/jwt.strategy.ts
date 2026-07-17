import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from '../services/token.service';
import { AUTH_OPTIONS, AuthModuleOptions } from '../auth.options';

/**
 * Validates the access token signature + expiry, then returns the payload which
 * NestJS attaches to req.user. Deliberately stateless — no DB hit on the hot
 * path. Session revocation is enforced on refresh, and access tokens are
 * short-lived (15m) to bound the blast radius.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(@Inject(AUTH_OPTIONS) options: AuthModuleOptions) {
    // The host must supply a real secret — fail at boot, never at first request.
    if (!options.accessSecret) throw new Error('AuthModule: accessSecret is not configured');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: options.accessSecret,
      // Pin the algorithm explicitly — never accept 'none' or an attacker-chosen
      // alg (algorithm-confusion defense-in-depth).
      algorithms: ['HS256'],
    });
  }

  validate(payload: AccessTokenPayload): AccessTokenPayload {
    if (!payload?.sub) throw new UnauthorizedException('Malformed token');
    return payload;
  }
}
