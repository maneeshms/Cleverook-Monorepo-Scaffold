import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Client,
  EvaluationContext,
  JsonValue,
  OpenFeature,
  Provider,
} from '@openfeature/server-sdk';
import { Repository } from 'typeorm';
import { LoggerService } from '@clevrook/logger';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FEATURE_FLAGS_OPTIONS, FeatureFlagsModuleOptions } from './feature-flags.options';
import { DatabaseFlagProvider } from './providers/database-flag.provider';
import { EnvFlagProvider } from './providers/env-flag.provider';

/**
 * Thin, provider-agnostic facade over OpenFeature. Call sites use `isEnabled()`
 * etc. and never know which backend is configured — swap the `provider` option
 * (env | database) or plug a hosted provider without changing a single call site.
 *
 * The library reads no env/app-config itself: everything comes from the injected
 * {@link FeatureFlagsModuleOptions}, which is what keeps it portable across projects.
 */
@Injectable()
export class FeatureFlagsService implements OnModuleInit, OnModuleDestroy {
  private client!: Client;
  private provider!: Provider;

  constructor(
    @Inject(FEATURE_FLAGS_OPTIONS) private readonly options: FeatureFlagsModuleOptions,
    private readonly logger: LoggerService,
    @InjectRepository(FeatureFlag)
    private readonly repo: Repository<FeatureFlag>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.provider = this.buildProvider();
    await OpenFeature.setProviderAndWait(this.provider);
    this.client = OpenFeature.getClient();
    this.logger.log(`Feature flags using ${this.provider.metadata.name}`, 'FeatureFlags');
  }

  async onModuleDestroy(): Promise<void> {
    await OpenFeature.close();
  }

  private buildProvider(): Provider {
    const name = (this.options.provider ?? 'env').toLowerCase();
    if (name === 'database') {
      return new DatabaseFlagProvider(this.repo, this.options.cacheTtlMs ?? 30_000);
    }
    // Route env reads through the host getter (layered config), not raw process.env.
    const get = this.options.envGetter ?? (() => undefined);
    return new EnvFlagProvider(get);
  }

  /** Drop the database provider's cache so an admin write is visible immediately. */
  invalidateCache(): void {
    if (this.provider instanceof DatabaseFlagProvider) this.provider.invalidate();
  }

  isEnabled(key: string, defaultValue = false, context?: EvaluationContext): Promise<boolean> {
    return this.client.getBooleanValue(key, defaultValue, context);
  }

  getString(key: string, defaultValue: string, context?: EvaluationContext): Promise<string> {
    return this.client.getStringValue(key, defaultValue, context);
  }

  getNumber(key: string, defaultValue: number, context?: EvaluationContext): Promise<number> {
    return this.client.getNumberValue(key, defaultValue, context);
  }

  getObject<T extends JsonValue>(
    key: string,
    defaultValue: T,
    context?: EvaluationContext,
  ): Promise<T> {
    return this.client.getObjectValue<T>(key, defaultValue, context);
  }

  // ── Admin store (the `feature_flags` table; used by the database provider) ──

  listFlags(): Promise<FeatureFlag[]> {
    return this.repo.find({ order: { key: 'ASC' } });
  }

  async upsertFlag(input: {
    key: string;
    enabled: boolean;
    value?: unknown;
    description?: string | null;
  }): Promise<FeatureFlag> {
    const existing = await this.repo.findOne({ where: { key: input.key } });
    const flag = this.repo.merge(existing ?? this.repo.create(), {
      key: input.key,
      enabled: input.enabled,
      value: input.value ?? null,
      description: input.description ?? null,
    });
    const saved = await this.repo.save(flag);
    this.invalidateCache();
    return saved;
  }

  async deleteFlag(key: string): Promise<void> {
    await this.repo.delete({ key });
    this.invalidateCache();
  }
}
