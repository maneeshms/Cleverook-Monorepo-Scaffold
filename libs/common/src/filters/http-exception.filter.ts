import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId?: string;
}

/**
 * Normalises every error into a single JSON shape and ensures internal details
 * (stack traces, DB errors) are logged but never returned to the client in prod.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    // Multer surfaces upload-limit violations as a `MulterError` (a plain Error,
    // not an HttpException) — without this it would masquerade as a 500. Map the
    // size limit to 413 and the rest (too many files, unexpected field) to 400.
    const isMulter =
      exception instanceof Error && exception.name === 'MulterError';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    if (isHttp) status = exception.getStatus();
    else if (isMulter) {
      status =
        (exception as Error & { code?: string }).code === 'LIMIT_FILE_SIZE'
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : HttpStatus.BAD_REQUEST;
    }

    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';

    if (isHttp) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        message = (r.message as string | string[]) ?? exception.message;
        error = (r.error as string) ?? exception.name;
      }
    } else if (isMulter) {
      const code = (exception as Error & { code?: string }).code;
      error = 'UploadError';
      message =
        code === 'LIMIT_FILE_SIZE'
          ? 'Uploaded file exceeds the maximum allowed size.'
          : code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Too many files or an unexpected file field was uploaded.'
            : 'The uploaded file could not be processed.';
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId: (request.headers['x-request-id'] as string) ?? undefined,
    };

    response.status(status).json(body);
  }
}
