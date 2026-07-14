import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'x-request-id';

// Bound an inbound id so a hostile client can't bloat logs or smuggle control
// characters (log forging) through the correlation id. Anything outside this
// safe, generous set is rejected and a fresh UUID is minted instead.
const MAX_CORRELATION_ID_LENGTH = 128;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * NFR-OBS-1: every request carries a correlation ID so logs, error responses,
 * and downstream calls can be tied together. Honours an inbound `x-request-id`
 * (e.g. propagated from Cloudflare or a client) when it's well-formed, otherwise
 * mints a UUID. Returned to the caller on the response so they can quote it.
 */
export function correlationId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.headers[CORRELATION_ID_HEADER];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
    const id =
      candidate &&
      candidate.length <= MAX_CORRELATION_ID_LENGTH &&
      SAFE_CORRELATION_ID.test(candidate)
        ? candidate
        : randomUUID();
    req.headers[CORRELATION_ID_HEADER] = id;
    res.setHeader(CORRELATION_ID_HEADER, id);
    next();
  };
}
