import { Logger } from '@nestjs/common';
import { of } from 'rxjs';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  it('logs id, method, path, status and duration', (done) => {
    const interceptor = new LoggingInterceptor();
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/api/v1/health',
          headers: { [CORRELATION_ID_HEADER]: 'req-9' },
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as any;

    interceptor.intercept(context, { handle: () => of('ok') }).subscribe(() => {
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\[req-9\] GET \/api\/v1\/health 200 \d+ms$/),
      );
      logSpy.mockRestore();
      done();
    });
  });

  it('falls back to "-" when no correlation id is present', (done) => {
    const interceptor = new LoggingInterceptor();
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', url: '/x', headers: {} }),
        getResponse: () => ({ statusCode: 201 }),
      }),
    } as any;

    interceptor.intercept(context, { handle: () => of('ok') }).subscribe(() => {
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[-] POST /x 201'));
      logSpy.mockRestore();
      done();
    });
  });
});
