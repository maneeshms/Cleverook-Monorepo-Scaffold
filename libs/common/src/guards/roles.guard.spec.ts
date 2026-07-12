import { ForbiddenException } from '@nestjs/common';
import { Role } from '../enums/role.enum';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const makeContext = (user: unknown) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  const guardWith = (required: Role[] | undefined) =>
    new RolesGuard({ getAllAndOverride: jest.fn().mockReturnValue(required) } as any);

  it('allows when no roles are required', () => {
    expect(guardWith(undefined).canActivate(makeContext(undefined))).toBe(true);
    expect(guardWith([]).canActivate(makeContext(undefined))).toBe(true);
  });

  it('rejects unauthenticated requests on protected routes', () => {
    expect(() => guardWith([Role.ADMIN]).canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a matching role', () => {
    expect(guardWith([Role.ADMIN]).canActivate(makeContext({ role: Role.ADMIN }))).toBe(true);
  });

  it('rejects an insufficient role', () => {
    expect(() => guardWith([Role.ADMIN]).canActivate(makeContext({ role: Role.USER }))).toThrow(
      /Insufficient role/,
    );
  });

  it('lets SUPER_ADMIN through any requirement', () => {
    expect(guardWith([Role.ADMIN]).canActivate(makeContext({ role: Role.SUPER_ADMIN }))).toBe(
      true,
    );
  });
});
