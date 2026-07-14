import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { correlationId } from '@clevscaffold/common';
import { LoggerService } from '@clevscaffold/logger';
import { AppModule } from './app.module';

// Catch anything that escapes NestJS's own error handling so crashes are
// visible in platform logs instead of silently killing the process.
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';

  // In production, suppress NestJS's chatty bootstrap messages (route maps,
  // provider registrations) — they flood platform log limits during a
  // crash-restart loop. All structured logs go through Winston.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger: isProduction ? ['error', 'warn'] : ['error', 'warn', 'log'],
  });

  app.useLogger(app.get(LoggerService));

  const config = app.get(ConfigService);
  const env = config.get<string>('app.env');
  const port = config.get<number>('app.port') ?? 3000;
  const corsOrigins = config.get<string[]>('app.corsOrigins') ?? ['*'];

  app.set('trust proxy', 1);
  app.use(correlationId());
  app.use(helmet());
  // DoS guard: bound request bodies (backoffice hardening pattern).
  app.useBodyParser('json', { limit: '1mb' });

  // Never reflect an arbitrary Origin together with credentials. With a wildcard
  // we emit a literal '*' and disable credentials (browsers reject '*'+credentials
  // anyway). Set an explicit CORS_ORIGINS allowlist in production to re-enable
  // credentialed cross-origin requests.
  const allowAllOrigins = corsOrigins.includes('*');
  app.enableCors({
    origin: allowAllOrigins ? '*' : corsOrigins,
    credentials: !allowAllOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Graceful shutdown: lets Terminus/TypeORM/Redis/queues close cleanly on
  // SIGTERM — required for zero-downtime rolling deploys.
  app.enableShutdownHooks();

  // Swagger is opt-in in production (ENABLE_SWAGGER=true) to avoid the memory
  // spike from reflecting all decorators at startup in a constrained container.
  const swaggerEnabled = env !== 'production' || process.env.ENABLE_SWAGGER === 'true';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ClevScaffold API')
      .setDescription(
        'ClevScaffold reference API (TypeORM).\n\n' +
          // clevscaffold:auth:start
          '**Authentication:** Bearer JWT via `Authorization: Bearer <token>`.\n' +
          'Obtain tokens via POST /api/v1/auth/login or /api/v1/auth/register.\n\n' +
          // clevscaffold:auth:end
          // clevscaffold:metrics:start
          'Prometheus metrics: GET /api/v1/metrics (see METRICS_* config).' +
          // clevscaffold:metrics:end
          '',
      )
      .setVersion('1.0.0')
      // clevscaffold:auth:start
      .addBearerAuth()
      .addTag('auth', 'Registration, login, token refresh, logout')
      .addTag('users', 'Profile, GDPR export, account deletion, admin listing')
      // clevscaffold:auth:end
      // clevscaffold:tasks:start
      .addTag('tasks', 'Demo CRUD: pagination, ownership, caching, messaging hooks')
      // clevscaffold:tasks:end
      // clevscaffold:messaging:start
      .addTag('notifications', 'In-app notification feed (messaging IN_APP sink)')
      // clevscaffold:messaging:end
      .addTag('health', 'Liveness and readiness probes')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port, '0.0.0.0');
  console.log(`ClevScaffold API listening on :${port} (${env})`);
}

void bootstrap();
