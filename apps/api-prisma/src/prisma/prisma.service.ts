import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

/**
 * Single shared PrismaClient for the app. The connection URL comes through the
 * layered config (PRISMA_DATABASE_URL) rather than Prisma's own env lookup so
 * config/*.json files work here too. For Supabase/pgbouncer specifics see
 * docs/DATABASE.md.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    const url = config.get<string>('PRISMA_DATABASE_URL');
    if (!url) {
      // createEnvValidator({ require: ['PRISMA_DATABASE_URL'] }) fails boot first;
      // this is defence in depth for direct instantiation (tests, scripts).
      throw new Error('PRISMA_DATABASE_URL is not configured');
    }
    super({ datasourceUrl: url });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
