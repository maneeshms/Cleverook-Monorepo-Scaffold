import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Histogram } from 'prom-client';
import { HTTP_DURATION_HISTOGRAM } from './metrics.constants';

/**
 * Observes every HTTP request into the `http_request_duration_seconds`
 * histogram, labelled by method / route template / status code. Uses the route
 * template (`/api/v1/tasks/:id`), not the raw URL, to keep label cardinality
 * bounded. Status reflects the code at stream completion; errors mapped later
 * by the exception filter are recorded with the pre-filter status.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(@Inject(HTTP_DURATION_HISTOGRAM) private readonly histogram: Histogram<string>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const start = process.hrtime.bigint();
    return next.handle().pipe(
      finalize(() => {
        const req = context.switchToHttp().getRequest();
        const res = context.switchToHttp().getResponse();
        const seconds = Number(process.hrtime.bigint() - start) / 1e9;
        const route: string =
          (req.route && req.route.path) || (req.url ? String(req.url).split('?')[0] : 'unknown');
        this.histogram.observe(
          { method: req.method, route, status: String(res.statusCode) },
          seconds,
        );
      }),
    );
  }
}
