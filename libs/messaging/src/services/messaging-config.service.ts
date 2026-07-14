import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SecretCipher } from '@clevscaffold/common';
import { MessagingProviderConfig } from '../entities/messaging-provider-config.entity';
import { MessagingChannelRoute } from '../entities/messaging-channel-route.entity';
import { Channel } from '../enums/channel.enum';
import { MESSAGING_OPTIONS, MessagingModuleOptions } from '../messaging.options';

export interface ChannelRoute {
  primary: string;
  fallback: string | null;
}

export interface ProviderRuntime {
  providerKey: string;
  enabled: boolean;
  config: Record<string, unknown>;
  credentials: Record<string, string>;
}

/**
 * Resolves messaging routing + provider credentials from the DB, with a 60s
 * cache (mirrors OAuthConfigService). Credentials are AES-256-GCM decrypted via
 * the shared SecretCipher. Providers apply their own env fallback on top.
 */
@Injectable()
export class MessagingConfigService implements OnModuleInit {
  private readonly cipher: SecretCipher;
  private providers = new Map<string, ProviderRuntime>();
  private routes = new Map<string, ChannelRoute>(); // key: `${channel}|${useCase ?? ''}`
  private cacheExpiry = 0;
  private readonly CACHE_TTL_MS = 60_000;

  constructor(
    @InjectRepository(MessagingProviderConfig)
    private readonly providerRepo: Repository<MessagingProviderConfig>,
    @InjectRepository(MessagingChannelRoute)
    private readonly routeRepo: Repository<MessagingChannelRoute>,
    @Inject(MESSAGING_OPTIONS)
    private readonly options: MessagingModuleOptions,
  ) {
    // No dev fallback: SecretCipher throws on a weak/empty key rather than
    // encrypting provider credentials under a public constant. The host wires
    // encryptionKey from MESSAGING_ENCRYPTION_KEY (JWT_ACCESS_SECRET fallback).
    this.cipher = new SecretCipher(this.options.encryptionKey);
  }

  async onModuleInit() {
    // Wrap so a missing table (migration not yet run) never crashes the bootstrap.
    try {
      await this.refresh();
    } catch (err) {
      console.warn(
        '[MessagingConfigService] Skipped initial config load (table may not exist yet):',
        (err as Error).message,
      );
    }
  }

  async refresh(): Promise<void> {
    const providerRows = await this.providerRepo
      .createQueryBuilder('p')
      .addSelect('p.credentialsEnc')
      .orderBy('p.sortOrder', 'ASC')
      .getMany();

    const providers = new Map<string, ProviderRuntime>();
    for (const row of providerRows) {
      let credentials: Record<string, string> = {};
      const decrypted = this.cipher.decrypt(row.credentialsEnc);
      if (decrypted) {
        try {
          credentials = JSON.parse(decrypted);
        } catch {
          credentials = {};
        }
      }
      providers.set(row.providerKey, {
        providerKey: row.providerKey,
        enabled: row.enabled,
        config: row.config ?? {},
        credentials,
      });
    }
    this.providers = providers;

    const routeRows = await this.routeRepo.find();
    const routes = new Map<string, ChannelRoute>();
    for (const r of routeRows) {
      routes.set(`${r.channel}|${r.useCase ?? ''}`, {
        primary: r.primaryProviderKey,
        fallback: r.fallbackProviderKey,
      });
    }
    this.routes = routes;
    this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;
  }

  private async ensureFresh() {
    if (Date.now() > this.cacheExpiry) {
      try {
        await this.refresh();
      } catch {
        // Keep stale cache. Back off 5 seconds before the next retry so a DB
        // blip doesn't hammer the database on every incoming request.
        this.cacheExpiry = Date.now() + 5_000;
      }
    }
  }

  /**
   * Provider(s) to use for a channel. Resolution order:
   *  1. DB route row (use_case-specific, then global)
   *  2. env override for EMAIL (MESSAGING_EMAIL_PROVIDER)
   *  3. built-in default
   */
  async routeFor(channel: Channel, useCase?: string): Promise<ChannelRoute> {
    await this.ensureFresh();

    const scoped = useCase ? this.routes.get(`${channel}|${useCase}`) : undefined;
    const global = this.routes.get(`${channel}|`);
    let route = scoped ?? global;

    if (channel === Channel.EMAIL) {
      const override = this.options.emailProviderOverride;
      if (override) route = { primary: override, fallback: route?.fallback ?? 'console-email' };
    }

    if (!route) {
      route = this.defaultRoute(channel);
    }
    return route;
  }

  private defaultRoute(channel: Channel): ChannelRoute {
    switch (channel) {
      case Channel.EMAIL: {
        const hasResend = !!this.options.resend?.apiKey;
        return { primary: hasResend ? 'resend' : 'console-email', fallback: 'console-email' };
      }
      case Channel.SMS:
        return { primary: 'console-sms', fallback: null };
      case Channel.IN_APP:
        return { primary: 'in-app', fallback: null };
      default:
        return { primary: 'console-email', fallback: null };
    }
  }

  async getProvider(providerKey: string): Promise<ProviderRuntime | null> {
    await this.ensureFresh();
    return this.providers.get(providerKey) ?? null;
  }
}
