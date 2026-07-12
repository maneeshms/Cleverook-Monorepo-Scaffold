import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import { buildWinstonOptions } from './logger.module';

const configService = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('buildWinstonOptions', () => {
  it('defaults to console-only at info level', () => {
    const options = buildWinstonOptions(configService({}));
    expect(options.level).toBe('info');
    const transports = options.transports as winston.transport[];
    expect(transports).toHaveLength(1);
    expect(transports[0]).toBeInstanceOf(winston.transports.Console);
    expect(options.exceptionHandlers).toBeUndefined();
    expect(options.rejectionHandlers).toBeUndefined();
  });

  it('honours LOG_LEVEL', () => {
    const options = buildWinstonOptions(configService({ LOG_LEVEL: 'debug' }));
    expect(options.level).toBe('debug');
  });

  it('adds file transports and handlers when LOG_TO_FILE=true', () => {
    const options = buildWinstonOptions(
      configService({ LOG_TO_FILE: 'true', LOG_DIR: '/tmp/test-logs' }),
    );
    const transports = options.transports as winston.transport[];
    // console + error.log + combined.log + audit.log + alert.log
    expect(transports).toHaveLength(5);
    expect(options.exceptionHandlers).toHaveLength(1);
    expect(options.rejectionHandlers).toHaveLength(1);
    const filenames = transports
      .filter((t): t is winston.transports.FileTransportInstance => 'filename' in t)
      .map((t) => t.filename);
    expect(filenames).toEqual(
      expect.arrayContaining(['error.log', 'combined.log', 'audit.log', 'alert.log']),
    );
  });

  it('routes entries into the category-filtered file streams', () => {
    const options = buildWinstonOptions(
      configService({ LOG_TO_FILE: 'true', LOG_DIR: '/tmp/test-logs' }),
    );
    const transports = options.transports as winston.transports.FileTransportInstance[];
    const byName = (name: string) => transports.find((t) => t.filename === name)!;

    const entry = (fields: Record<string, unknown>) =>
      ({
        level: 'info',
        message: 'm',
        [Symbol.for('level')]: 'info',
        ...fields,
      }) as winston.Logform.TransformableInfo;

    // audit.log keeps only category=audit
    expect(byName('audit.log').format!.transform(entry({ category: 'audit' }))).toBeTruthy();
    expect(byName('audit.log').format!.transform(entry({ category: 'alert' }))).toBe(false);
    // alert.log keeps only category=alert
    expect(byName('alert.log').format!.transform(entry({ category: 'alert' }))).toBeTruthy();
    expect(byName('alert.log').format!.transform(entry({}))).toBe(false);
    // error.log keeps only level=error
    expect(
      byName('error.log').format!.transform({
        level: 'error',
        message: 'm',
        [Symbol.for('level')]: 'error',
      } as winston.Logform.TransformableInfo),
    ).toBeTruthy();
    expect(byName('error.log').format!.transform(entry({}))).toBe(false);
    // combined.log keeps everything
    expect(byName('combined.log').format!.transform(entry({}))).toBeTruthy();
  });

  it('stays console-only for any LOG_TO_FILE value other than "true"', () => {
    const options = buildWinstonOptions(configService({ LOG_TO_FILE: 'yes' }));
    expect(options.transports as winston.transport[]).toHaveLength(1);
  });

  it('produces a readable console line including context, meta and trace', () => {
    const options = buildWinstonOptions(configService({}));
    const console = (options.transports as winston.transport[])[0] as winston.transport;
    const info = {
      level: 'info',
      message: 'hello',
      context: 'Spec',
      trace: 'stack-trace',
      requestId: 'r-1',
      category: 'audit',
      [Symbol.for('level')]: 'info',
    } as winston.Logform.TransformableInfo;
    const line = (console.format as winston.Logform.Format).transform(
      info,
    ) as winston.Logform.TransformableInfo;
    const output = line[Symbol.for('message') as unknown as string] as string;
    expect(output).toContain('[Spec] hello');
    expect(output).toContain('"requestId":"r-1"');
    expect(output).not.toContain('"category"');
    expect(output).toContain('stack-trace');
  });

  it('renders a bare line without context, meta or trace', () => {
    const options = buildWinstonOptions(configService({}));
    const console = (options.transports as winston.transport[])[0] as winston.transport;
    const info = {
      level: 'info',
      message: 'plain',
      [Symbol.for('level')]: 'info',
    } as winston.Logform.TransformableInfo;
    const line = (console.format as winston.Logform.Format).transform(
      info,
    ) as winston.Logform.TransformableInfo;
    const output = line[Symbol.for('message') as unknown as string] as string;
    expect(output).toContain('plain');
    expect(output).not.toContain('[Spec]');
  });
});
