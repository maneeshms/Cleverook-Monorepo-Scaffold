import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import helmet from 'helmet';
import { correlationId } from '@clevscaffold/common';
import { AppModule } from '../../src/app.module';

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
}

/**
 * Boots the real API application the same way main.ts does (correlation id,
 * helmet, URI versioning, /api prefix, whitelist validation) so e2e tests
 * exercise the production guard/pipe chain end-to-end.
 */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();

  app.use(correlationId());
  app.use(helmet());
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

  await app.init();

  const dataSource = app.get(DataSource);
  return { app, dataSource };
}

/** Removes all rows from domain tables, preserving schema, seeds, and the migration ledger. */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  const tables = ['message_deliveries', 'notifications', 'tasks', 'user_sessions', 'users'];
  await dataSource.query(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`);
}

let counter = 0;
/** Unique, policy-compliant credentials per call. */
export function uniqueUser(prefix = 'user') {
  counter += 1;
  return {
    email: `${prefix}.${Date.now()}.${counter}@example.com`,
    password: 'Str0ng!Pass1',
    displayName: `${prefix} ${counter}`,
  };
}
