import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule, WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';
import { LoggerService } from './logger.service';

/** Keep only entries whose `category` matches (used to split audit/alert files). */
const onlyCategory = (category: string) =>
  winston.format((info) => (info.category === category ? info : false))();

const jsonFile = (dir: string, filename: string, extra?: winston.Logform.Format) =>
  new winston.transports.File({
    filename: `${dir}/${filename}`,
    format: winston.format.combine(
      ...(extra ? [extra] : []),
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
  });

/**
 * Build the Winston options from validated config. Reading LOG_* through
 * ConfigService (not import-time process.env) keeps the layered config files
 * (config/default.json etc.) effective for logging too.
 *
 * File logging is opt-in (LOG_TO_FILE=true). Default is console-only, which
 * suits platforms that capture stdout (Railway, containers running non-root).
 * When enabled, files land under LOG_DIR:
 *   error.log · combined.log · audit.log · alert.log · exceptions.log · rejections.log
 */
export function buildWinstonOptions(config: ConfigService): WinstonModuleOptions {
  const level = config.get<string>('LOG_LEVEL') || 'info';
  const dir = config.get<string>('LOG_DIR') || 'logs';
  const toFile = config.get<string>('LOG_TO_FILE') === 'true';

  return {
    level,
    transports: [
      new winston.transports.Console({
        level,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.errors({ stack: true }),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level: lvl, message, context, trace, ...meta }) => {
            const ctx = context ? `[${context}] ` : '';
            // Drop noisy/non-printable keys from the inline meta summary.
            const { category: _category, ...rest } = meta as Record<string, unknown>;
            const metaStr = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
            const traceStr = trace ? `\n${trace}` : '';
            return `${timestamp} ${lvl}: ${ctx}${message}${metaStr}${traceStr}`;
          }),
        ),
      }),
      ...(toFile
        ? [
            jsonFile(dir, 'error.log', winston.format((i) => (i.level === 'error' ? i : false))()),
            jsonFile(dir, 'combined.log'),
            jsonFile(dir, 'audit.log', onlyCategory('audit')),
            jsonFile(dir, 'alert.log', onlyCategory('alert')),
          ]
        : []),
    ],
    ...(toFile
      ? {
          exceptionHandlers: [new winston.transports.File({ filename: `${dir}/exceptions.log` })],
          rejectionHandlers: [new winston.transports.File({ filename: `${dir}/rejections.log` })],
        }
      : {}),
  };
}

/**
 * Global Winston logger with console (+ opt-in file) transports and dedicated
 * audit/alert streams. Set as the Nest app logger via
 * `app.useLogger(app.get(LoggerService))`.
 */
@Global()
@Module({
  imports: [
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildWinstonOptions,
    }),
  ],
  providers: [LoggerService],
  exports: [WinstonModule, LoggerService],
})
export class LoggerModule {}
