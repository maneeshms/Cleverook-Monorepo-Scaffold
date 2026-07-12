import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Options factory (exported for unit tests). Reads the validated `database.*`
 * namespace, so the connection works unchanged against local Docker,
 * self-hosted Postgres, or managed hosts (Supabase/Neon/RDS) — SSL mode and
 * pool size are pure configuration (see docs/DATABASE.md).
 */
export function typeOrmOptionsFactory(config: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres' as const,
    url: config.get<string>('database.url'),
    ssl: config.get<boolean | { rejectUnauthorized: boolean }>('database.ssl'),
    autoLoadEntities: true,
    synchronize: false, // hard-off — schema changes go through migrations
    logging: config.get<boolean>('database.logging'),
    migrationsRun: false,
    // node-postgres pool sizing. With pgbouncer/transaction pooling in front,
    // keep this modest — see docs/DATABASE.md.
    extra: { max: config.get<number>('database.poolMax') ?? 20 },
  };
}

/**
 * Runtime database connection. Entities are auto-loaded per feature module via
 * TypeOrmModule.forFeature(...), so we set autoLoadEntities and never enumerate
 * entities here.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: typeOrmOptionsFactory,
    }),
  ],
})
export class DatabaseModule {}
