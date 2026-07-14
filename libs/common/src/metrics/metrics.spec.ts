import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { Histogram, Registry } from 'prom-client';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsController } from './metrics.controller';
import { MetricsModule } from './metrics.module';

const configService = (values: Record<string, unknown>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const moduleProviders = Reflect.getMetadata('providers', MetricsModule) as any[];
const registryFactory = moduleProviders.find((p) => p.provide === 'METRICS_REGISTRY').useFactory;
const histogramFactory = moduleProviders.find(
  (p) => p.provide === 'HTTP_DURATION_HISTOGRAM',
).useFactory;

describe('MetricsModule providers', () => {
  it('builds an isolated registry with default metrics and the http histogram', async () => {
    const registry: Registry = registryFactory();
    const histogram: Histogram<string> = histogramFactory(registry);
    histogram.observe({ method: 'GET', route: '/x', status: '200' }, 0.05);
    const output = await registry.metrics();
    expect(output).toContain('process_cpu_user_seconds_total');
    expect(output).toContain('http_request_duration_seconds_bucket');
  });
});

describe('MetricsController', () => {
  const registry = { contentType: 'text/plain', metrics: jest.fn().mockResolvedValue('# data') };
  const res = () => ({ setHeader: jest.fn(), send: jest.fn() }) as any;

  it('404s when metrics are disabled', async () => {
    const controller = new MetricsController(
      registry as any,
      configService({ 'metrics.enabled': false }),
    );
    await expect(controller.getMetrics({ headers: {} } as any, res())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('serves metrics when enabled and tokenless', async () => {
    const controller = new MetricsController(
      registry as any,
      configService({ 'metrics.enabled': true, 'metrics.token': '' }),
    );
    const response = res();
    await controller.getMetrics({ headers: {} } as any, response);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(response.send).toHaveBeenCalledWith('# data');
  });

  it('enforces the bearer token when configured', async () => {
    const controller = new MetricsController(
      registry as any,
      configService({ 'metrics.enabled': true, 'metrics.token': 's3cret' }),
    );
    await expect(
      controller.getMetrics({ headers: { authorization: 'Bearer wrong' } } as any, res()),
    ).rejects.toThrow(UnauthorizedException);
    // Same length as 'Bearer s3cret' but wrong content — exercises the constant-time
    // compare's mismatch path (not just the length shortcut).
    await expect(
      controller.getMetrics({ headers: { authorization: 'Bearer WRONG!' } } as any, res()),
    ).rejects.toThrow(UnauthorizedException);
    await expect(controller.getMetrics({ headers: {} } as any, res())).rejects.toThrow(
      UnauthorizedException,
    );
    const response = res();
    await controller.getMetrics({ headers: { authorization: 'Bearer s3cret' } } as any, response);
    expect(response.send).toHaveBeenCalled();
  });
});

describe('HttpMetricsInterceptor', () => {
  const makeContext = (req: Record<string, unknown>, statusCode = 200, type = 'http') =>
    ({
      getType: () => type,
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode }) }),
    }) as any;

  // finalize() runs on subscription teardown, so assertions attach via
  // subscription.add(), not the complete/error callbacks.
  it('observes method, route template and status', (done) => {
    const histogram = { observe: jest.fn() };
    const interceptor = new HttpMetricsInterceptor(histogram as any);
    const context = makeContext({
      method: 'GET',
      url: '/api/v1/tasks/42?x=1',
      route: { path: '/api/v1/tasks/:id' },
    });
    const subscription = interceptor.intercept(context, { handle: () => of('ok') }).subscribe();
    subscription.add(() => {
      expect(histogram.observe).toHaveBeenCalledWith(
        { method: 'GET', route: '/api/v1/tasks/:id', status: '200' },
        expect.any(Number),
      );
      done();
    });
  });

  it('falls back to the query-stripped URL when no route template exists', (done) => {
    const histogram = { observe: jest.fn() };
    const interceptor = new HttpMetricsInterceptor(histogram as any);
    const context = makeContext({ method: 'GET', url: '/unknown?a=1' }, 404);
    const subscription = interceptor.intercept(context, { handle: () => of('ok') }).subscribe();
    subscription.add(() => {
      expect(histogram.observe).toHaveBeenCalledWith(
        { method: 'GET', route: '/unknown', status: '404' },
        expect.any(Number),
      );
      done();
    });
  });

  it('still observes when the handler errors, even without a url', (done) => {
    const histogram = { observe: jest.fn() };
    const interceptor = new HttpMetricsInterceptor(histogram as any);
    const context = makeContext({ method: 'POST' }, 500);
    const subscription = interceptor
      .intercept(context, { handle: () => throwError(() => new Error('boom')) })
      .subscribe({ error: () => undefined });
    // finalize() runs on teardown, after the error notification completes.
    subscription.add(() => {
      expect(histogram.observe).toHaveBeenCalledWith(
        { method: 'POST', route: 'unknown', status: '500' },
        expect.any(Number),
      );
      done();
    });
  });

  it('ignores non-http execution contexts', (done) => {
    const histogram = { observe: jest.fn() };
    const interceptor = new HttpMetricsInterceptor(histogram as any);
    const context = makeContext({}, 200, 'rpc');
    interceptor.intercept(context, { handle: () => of('ok') }).subscribe({
      complete: () => {
        expect(histogram.observe).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
