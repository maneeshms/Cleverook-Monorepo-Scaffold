import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const makeContext = () =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({}) }),
    }) as any;

  it('short-circuits @Public() routes without touching passport', () => {
    const guard = new JwtAuthGuard({ getAllAndOverride: jest.fn().mockReturnValue(true) } as any);
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('delegates to the jwt passport strategy otherwise', () => {
    const guard = new JwtAuthGuard({
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as any);
    const superProto = Object.getPrototypeOf(JwtAuthGuard.prototype);
    const superSpy = jest.spyOn(superProto, 'canActivate').mockReturnValue(true);
    expect(guard.canActivate(makeContext())).toBe(true);
    expect(superSpy).toHaveBeenCalled();
    superSpy.mockRestore();
  });
});
