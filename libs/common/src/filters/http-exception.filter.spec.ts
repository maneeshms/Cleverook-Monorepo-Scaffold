import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let response: { status: jest.Mock; json: jest.Mock };
  let host: any;

  const request = {
    method: 'GET',
    url: '/api/v1/things',
    headers: { 'x-request-id': 'req-1' },
  };

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
    };
  });

  const sentBody = () => response.json.mock.calls[0][0];

  it('normalises HttpExceptions with object responses', () => {
    filter.catch(new NotFoundException('Thing not found'), host);
    expect(response.status).toHaveBeenCalledWith(404);
    const body = sentBody();
    expect(body.statusCode).toBe(404);
    expect(body.message).toBe('Thing not found');
    expect(body.path).toBe('/api/v1/things');
    expect(body.requestId).toBe('req-1');
    expect(body.timestamp).toBeDefined();
  });

  it('passes through validation error arrays', () => {
    filter.catch(new BadRequestException(['email must be an email', 'name too short']), host);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(sentBody().message).toEqual(['email must be an email', 'name too short']);
  });

  it('handles HttpExceptions carrying a plain-string response', () => {
    class StringException extends BadRequestException {
      getResponse(): string {
        return 'just a string';
      }
    }
    filter.catch(new StringException(), host);
    expect(sentBody().message).toBe('just a string');
  });

  it('maps Multer size-limit errors to 413', () => {
    const err = new Error('File too large') as Error & { code?: string };
    err.name = 'MulterError';
    err.code = 'LIMIT_FILE_SIZE';
    filter.catch(err, host);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(sentBody().error).toBe('UploadError');
  });

  it('maps other Multer errors to 400', () => {
    const err = new Error('Too many files') as Error & { code?: string };
    err.name = 'MulterError';
    err.code = 'LIMIT_FILE_COUNT';
    filter.catch(err, host);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(sentBody().message).toMatch(/Too many files/);
  });

  it('maps unknown Multer codes to a generic upload message', () => {
    const err = new Error('weird') as Error & { code?: string };
    err.name = 'MulterError';
    err.code = 'SOMETHING_ELSE';
    filter.catch(err, host);
    expect(sentBody().message).toMatch(/could not be processed/);
  });

  it('hides internals for unknown errors and returns 500', () => {
    filter.catch(new Error('secret database detail'), host);
    expect(response.status).toHaveBeenCalledWith(500);
    const body = sentBody();
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret database detail');
  });

  it('handles non-Error throwables', () => {
    filter.catch('boom', host);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(sentBody().message).toBe('Internal server error');
  });
});
