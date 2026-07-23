import { createParamDecorator, ExecutionContext, PipeTransform, Type } from '@nestjs/common';

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
 *
 * The return type is written out rather than inferred: under pnpm's isolated
 * node_modules, an inferred type here would name `apps/api/node_modules/...`
 * and TypeScript rejects it as non-portable (TS2742).
 */
export const CurrentUser: (
  ...dataOrPipes: (Type<PipeTransform> | PipeTransform | keyof AuthenticatedUser | undefined)[]
) => ParameterDecorator = createParamDecorator(currentUserFactory);
