import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { AccessTokenPayload } from '../services/token.service';

describe('JwtStrategy', () => {
  const strategy = new JwtStrategy({ get: () => 's'.repeat(40) } as never);

  it('passes a well-formed payload through to req.user', () => {
    const payload: AccessTokenPayload = {
      sub: 'u1',
      email: 'a@b.co',
      role: 'USER',
      sessionId: 's1',
    };
    expect(strategy.validate(payload)).toBe(payload);
  });

  it('rejects payloads without a subject', () => {
    expect(() => strategy.validate({} as AccessTokenPayload)).toThrow(UnauthorizedException);
    expect(() => strategy.validate(null as never)).toThrow(UnauthorizedException);
  });
});
