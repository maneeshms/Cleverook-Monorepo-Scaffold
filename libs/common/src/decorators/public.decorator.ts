import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as accessible without authentication. JwtAuthGuard skips it. */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
