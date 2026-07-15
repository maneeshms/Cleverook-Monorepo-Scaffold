import { Inject, Injectable, Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';
import { Channel } from '../enums/channel.enum';
import {
  ChannelProvider,
  DeliveryResult,
  OutboundDelivery,
} from '../interfaces/channel-provider.interface';
import { MessagingConfigService } from '../services/messaging-config.service';
import { MESSAGING_OPTIONS, MessagingModuleOptions } from '../messaging.options';

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/**
 * Live push provider — Firebase Cloud Messaging HTTP v1, which delivers to
 * Android natively, iOS via Google's APNs relay, and browsers. Credentials
 * resolve from the DB provider row ('fcm', encrypted) first, then env fallback
 * (FCM_SERVICE_ACCOUNT_JSON — raw or base64 service-account JSON). OAuth2 access
 * tokens are minted with a hand-rolled RS256 JWT grant (node:crypto + fetch), so
 * no Google SDK dependency. Unconfigured ⇒ explicit failure, never fake success.
 *
 * A dead token (uninstalled app / rotated token) is reported with an
 * `UNREGISTERED:` error prefix — the delivery pipeline prunes its registration.
 */
@Injectable()
export class FcmPushProvider implements ChannelProvider {
  readonly key = 'fcm';
  readonly channels = [Channel.PUSH];
  private readonly logger = new Logger('FcmPush');
  private cached: { token: string; exp: number; account: string } | null = null;

  constructor(
    private readonly messagingConfig: MessagingConfigService,
    @Inject(MESSAGING_OPTIONS)
    private readonly options: MessagingModuleOptions,
  ) {}

  private async resolveServiceAccount(): Promise<ServiceAccount | null> {
    const provider = await this.messagingConfig.getProvider('fcm');
    const raw =
      (provider?.credentials?.serviceAccountJson as string) ||
      this.options.fcm?.serviceAccountJson ||
      '';
    if (!raw) return null;
    try {
      const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const sa = JSON.parse(json) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
      return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key };
    } catch {
      return null;
    }
  }

  /** Mint (and cache until near-expiry) an OAuth2 access token via the RS256 JWT grant. */
  private async getAccessToken(sa: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cached && this.cached.account === sa.clientEmail && now < this.cached.exp - 60) {
      return this.cached.token;
    }

    const enc = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
      iss: sa.clientEmail,
      scope: FCM_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.privateKey, 'base64url');

    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }).toString(),
    });
    if (!res.ok) {
      throw new Error(
        `FCM OAuth exchange failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
      );
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('FCM OAuth exchange returned no access_token');
    this.cached = {
      token: body.access_token,
      exp: now + (body.expires_in ?? 3600),
      account: sa.clientEmail,
    };
    return body.access_token;
  }

  async send(d: OutboundDelivery): Promise<DeliveryResult> {
    const sa = await this.resolveServiceAccount();
    if (!sa) {
      return {
        ok: false,
        error:
          'FCM not configured (missing/invalid service-account JSON). Set FCM_SERVICE_ACCOUNT_JSON or configure the provider.',
      };
    }

    try {
      const accessToken = await this.getAccessToken(sa);

      // FCM `data` values must all be strings — stringify anything structured.
      const payload = (d.metadata?.payload ?? {}) as Record<string, unknown>;
      const data: Record<string, string> = {};
      for (const [k, v] of Object.entries(payload)) {
        data[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }

      const message = {
        token: d.to,
        notification: { title: d.subject ?? '', body: d.body ?? d.text ?? '' },
        ...(Object.keys(data).length > 0 ? { data } : {}),
      };

      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ message }),
        },
      );
      if (res.ok) {
        const j = (await res.json()) as { name?: string };
        return { ok: true, providerMessageId: j.name };
      }

      const text = (await res.text()).slice(0, 500);
      // 404/UNREGISTERED (and the invalid-token 400) mean the token is dead —
      // the UNREGISTERED: prefix tells the delivery pipeline to prune it.
      const dead =
        res.status === 404 ||
        text.includes('UNREGISTERED') ||
        text.includes('not a valid FCM registration token');
      return {
        ok: false,
        error: dead
          ? `UNREGISTERED: FCM rejected the token (${res.status})`
          : `FCM send failed (${res.status}): ${text}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown FCM error';
      this.logger.error(`FCM send failed: ${message}`);
      return { ok: false, error: message };
    }
  }
}
