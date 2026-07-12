import { Role } from '../enums/role.enum';
import { currentUserFactory } from './current-user.decorator';
import { IS_PUBLIC_KEY, Public } from './public.decorator';
import { Roles, ROLES_KEY } from './roles.decorator';

describe('@Public()', () => {
  it('sets the isPublic metadata flag', () => {
    class Controller {
      @Public()
      handler(): void {}
    }
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, Controller.prototype.handler)).toBe(true);
  });
});

describe('@Roles()', () => {
  it('records the required roles as metadata', () => {
    class Controller {
      @Roles(Role.ADMIN, Role.SUPER_ADMIN)
      handler(): void {}
    }
    expect(Reflect.getMetadata(ROLES_KEY, Controller.prototype.handler)).toEqual([
      Role.ADMIN,
      Role.SUPER_ADMIN,
    ]);
  });
});

describe('currentUserFactory', () => {
  const user = { sub: 'u1', email: 'a@b.co', role: 'USER', sessionId: 's1' };
  const ctx = { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as any;
  const emptyCtx = { switchToHttp: () => ({ getRequest: () => ({}) }) } as any;

  it('returns the whole user without a data key', () => {
    expect(currentUserFactory(undefined, ctx)).toEqual(user);
  });

  it('plucks a single field with a data key', () => {
    expect(currentUserFactory('email', ctx)).toBe('a@b.co');
  });

  it('is undefined-safe when no user is attached', () => {
    expect(currentUserFactory(undefined, emptyCtx)).toBeUndefined();
    expect(currentUserFactory('sub', emptyCtx)).toBeUndefined();
  });
});
