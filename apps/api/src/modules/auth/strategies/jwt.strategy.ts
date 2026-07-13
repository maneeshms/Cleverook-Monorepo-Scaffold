import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from '../services/token.service';

/**
 * Validates the access token signature + expiry, then returns the payload which
 * NestJS attaches to req.user. Deliberately stateless — no DB hit on the hot
 * path. Session revocation is enforced on refresh, and access tokens are
 * short-lived (15m) to bound the blast radius.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    // passport-jwt's types now require secretOrKey to be defined (string | Buffer);
    // env validation guarantees it at boot, so assert here for the type + safety.
    const secretOrKey = config.get<string>('jwt.accessSecret');
    if (!secretOrKey) throw new Error('jwt.accessSecret is not configured');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey,
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
