import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from './token.service';

/** Stateless access-token validation — see the TypeORM app's strategy for the rationale. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    // passport-jwt's types now require secretOrKey to be defined; env validation
    // guarantees it at boot, so assert here for the type + safety.
    const secretOrKey = config.get<string>('jwt.accessSecret');
    if (!secretOrKey) throw new Error('jwt.accessSecret is not configured');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey,
      // Pin the algorithm explicitly (algorithm-confusion defense-in-depth).
      algorithms: ['HS256'],
    });
  }

  validate(payload: AccessTokenPayload): AccessTokenPayload {
    if (!payload?.sub) throw new UnauthorizedException('Malformed token');
    return payload;
  }
}
