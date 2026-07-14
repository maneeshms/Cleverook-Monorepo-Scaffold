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

  it('rejects a malformed inbound id (control chars / log forging) and mints a UUID', () => {
    const { req } = run({ [CORRELATION_ID_HEADER]: 'evil\n[ADMIN] forged log line' });
    expect(req.headers[CORRELATION_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects an over-long inbound id and mints a UUID', () => {
    const { req } = run({ [CORRELATION_ID_HEADER]: 'a'.repeat(129) });
    expect(req.headers[CORRELATION_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('accepts a well-formed inbound id at the length limit', () => {
    const ok = 'a'.repeat(128);
    const { req } = run({ [CORRELATION_ID_HEADER]: ok });
    expect(req.headers[CORRELATION_ID_HEADER]).toBe(ok);
  });
});
