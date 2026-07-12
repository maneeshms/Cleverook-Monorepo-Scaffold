import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
}

/** Exported separately so the extraction logic is unit-testable. */
export const currentUserFactory = (
  data: keyof AuthenticatedUser | undefined,
  ctx: ExecutionContext,
): AuthenticatedUser | string | undefined => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.user as AuthenticatedUser | undefined;
  return data ? user?.[data] : user;
};

/**
 * Injects the authenticated user (the validated JWT payload) into a handler.
 * Usage: someHandler(@CurrentUser() user: AuthenticatedUser)
 */
export const CurrentUser = createParamDecorator(currentUserFactory);
