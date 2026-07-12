import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';
import { HTTP_DURATION_HISTOGRAM, METRICS_REGISTRY } from './metrics.constants';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsController } from './metrics.controller';

/**
 * Prometheus observability: default Node.js process metrics + an HTTP request
 * duration histogram, exposed at GET /metrics (see MetricsController for the
 * enable/token gates). Import once per app:
 *
 *   @Module({ imports: [MetricsModule, ...] })
 *
 * Each import builds its own Registry (no prom-client global state), so unit
 * tests and multi-app workspaces never collide on metric names.
 */
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: METRICS_REGISTRY,
      useFactory: (): Registry => {
        const registry = new Registry();
        collectDefaultMetrics({ register: registry });
        return registry;
      },
    },
    {
      provide: HTTP_DURATION_HISTOGRAM,
      useFactory: (registry: Registry): Histogram<string> =>
        new Histogram({
          name: 'http_request_duration_seconds',
          help: 'HTTP request duration in seconds',
          labelNames: ['method', 'route', 'status'],
          buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
          registers: [registry],
        }),
      inject: [METRICS_REGISTRY],
    },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [METRICS_REGISTRY, HTTP_DURATION_HISTOGRAM],
})
export class MetricsModule {}
