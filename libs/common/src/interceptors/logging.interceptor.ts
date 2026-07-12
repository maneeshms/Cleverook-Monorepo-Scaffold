import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';

/** Structured request logging with duration and correlation ID. No PII — only id, method, path, status, ms. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;
    const reqId = req.headers?.[CORRELATION_ID_HEADER] ?? '-';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        this.logger.log(`[${reqId}] ${method} ${url} ${res.statusCode} ${Date.now() - start}ms`);
      }),
    );
  }
}
