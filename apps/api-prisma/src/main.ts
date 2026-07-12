import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { correlationId } from '@clevscaffold/common';
import { LoggerService } from '@clevscaffold/logger';
import { AppModule } from './app.module';

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
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger: isProduction ? ['error', 'warn'] : ['error', 'warn', 'log'],
  });

  app.useLogger(app.get(LoggerService));

  const config = app.get(ConfigService);
  const env = config.get<string>('app.env');
  const port = config.get<number>('app.port') ?? 3010;
  const corsOrigins = config.get<string[]>('app.corsOrigins') ?? ['*'];

  app.set('trust proxy', 1);
  app.use(correlationId());
  app.use(helmet());
  app.useBodyParser('json', { limit: '1mb' });

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

  app.enableShutdownHooks();

  const swaggerEnabled = env !== 'production' || process.env.ENABLE_SWAGGER === 'true';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ClevScaffold API (Prisma)')
      .setDescription(
        'ClevScaffold compact reference API (Prisma).\n\n' +
          '**Authentication:** Bearer JWT via `Authorization: Bearer <token>`.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addTag('auth')
      .addTag('users')
      .addTag('health')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port, '0.0.0.0');
  console.log(`ClevScaffold API (Prisma) listening on :${port} (${env})`);
}

void bootstrap();
