import { CORRELATION_ID_HEADER, correlationId } from './correlation-id.middleware';

describe('correlationId middleware', () => {
  const run = (headers: Record<string, unknown>) => {
    const req = { headers } as any;
    const res = { setHeader: jest.fn() } as any;
    const next = jest.fn();
    correlationId()(req, res, next);
    return { req, res, next };
  };

  it('honours an inbound x-request-id', () => {
    const { req, res, next } = run({ [CORRELATION_ID_HEADER]: 'client-id-1' });
    expect(req.headers[CORRELATION_ID_HEADER]).toBe('client-id-1');
    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, 'client-id-1');
    expect(next).toHaveBeenCalled();
  });

  it('uses the first value of an array header', () => {
    const { req } = run({ [CORRELATION_ID_HEADER]: ['a', 'b'] });
    expect(req.headers[CORRELATION_ID_HEADER]).toBe('a');
  });

  it('mints a UUID when no id is provided', () => {
    const { req, res } = run({});
    const id = req.headers[CORRELATION_ID_HEADER];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, id);
  });
});
