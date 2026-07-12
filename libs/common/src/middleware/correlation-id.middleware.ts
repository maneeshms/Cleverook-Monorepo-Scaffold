import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'x-request-id';

/**
 * NFR-OBS-1: every request carries a correlation ID so logs, error responses,
 * and downstream calls can be tied together. Honours an inbound `x-request-id`
 * (e.g. propagated from Cloudflare or a client) and otherwise mints a UUID.
 * Returned to the caller on the response so they can quote it in support requests.
 */
export function correlationId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.headers[CORRELATION_ID_HEADER];
    const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    req.headers[CORRELATION_ID_HEADER] = id;
    res.setHeader(CORRELATION_ID_HEADER, id);
    next();
  };
}
