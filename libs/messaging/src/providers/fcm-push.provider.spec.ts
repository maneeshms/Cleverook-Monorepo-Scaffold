import { generateKeyPairSync } from 'node:crypto';
import { Channel } from '../enums/channel.enum';
import { FcmPushProvider } from './fcm-push.provider';

// A real (throwaway) RSA key so createSign works — never a production secret.
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'test-project',
  client_email: 'svc@test-project.iam.gserviceaccount.com',
  private_key: privateKey,
});

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const makeProvider = ({
  envJson = '' as string,
  dbCreds = null as Record<string, string> | null,
} = {}) => {
  const messagingConfig = {
    getProvider: jest
      .fn()
      .mockResolvedValue(dbCreds ? { credentials: dbCreds, config: {}, enabled: true } : null),
  };
  const provider = new FcmPushProvider(
    messagingConfig as never,
    {
      encryptionKey: 'k',
      fcm: { serviceAccountJson: envJson },
    } as never,
  );
  return { provider, messagingConfig };
};

const delivery = (to = 'device-token-1') => ({
  channel: Channel.PUSH,
  to,
  subject: 'New task from Sam',
  body: 'Ship it',
  metadata: { payload: { taskId: 't1', count: 2 } },
});

describe('FcmPushProvider', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('declares the PUSH channel under the fcm key', () => {
    const { provider } = makeProvider();
    expect(provider.key).toBe('fcm');
    expect(provider.channels).toEqual([Channel.PUSH]);
  });

  it('fails explicitly (never fake success) when unconfigured', async () => {
    const { provider } = makeProvider();
    const result = await provider.send(delivery());
    expect(result.ok).toBe(false);
    expect(result.error).toContain('FCM not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails explicitly on malformed / incomplete service-account JSON', async () => {
    const { provider: bad } = makeProvider({ envJson: 'not-json-at-all' });
    await expect(bad.send(delivery())).resolves.toMatchObject({ ok: false });

    const { provider: incomplete } = makeProvider({
      envJson: JSON.stringify({ project_id: 'p' }), // missing email + key
    });
    await expect(incomplete.send(delivery())).resolves.toMatchObject({ ok: false });
  });

  it('mints an OAuth token and sends via the HTTP v1 API (raw JSON credentials)', async () => {
    const { provider } = makeProvider({ envJson: SERVICE_ACCOUNT });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'at-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'projects/test-project/messages/m1' }));

    const result = await provider.send(delivery());

    expect(result).toEqual({ ok: true, providerMessageId: 'projects/test-project/messages/m1' });
    // First call: the OAuth JWT-bearer grant.
    const [oauthUrl, oauthInit] = fetchMock.mock.calls[0];
    expect(oauthUrl).toBe('https://oauth2.googleapis.com/token');
    expect(oauthInit.body).toContain('grant_type=');
    // Second call: the FCM send with the bearer token and string-only data.
    const [sendUrl, sendInit] = fetchMock.mock.calls[1];
    expect(sendUrl).toBe('https://fcm.googleapis.com/v1/projects/test-project/messages:send');
    expect(sendInit.headers.authorization).toBe('Bearer at-1');
    const sent = JSON.parse(sendInit.body);
    expect(sent.message).toEqual({
      token: 'device-token-1',
      notification: { title: 'New task from Sam', body: 'Ship it' },
      data: { taskId: 't1', count: '2' }, // non-strings stringified
    });
  });

  it('accepts base64-encoded service-account JSON', async () => {
    const { provider } = makeProvider({
      envJson: Buffer.from(SERVICE_ACCOUNT).toString('base64'),
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'at-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'm2' }));
    await expect(provider.send(delivery())).resolves.toMatchObject({ ok: true });
  });

  it('DB-stored credentials take precedence over the env fallback', async () => {
    const dbAccount = JSON.parse(SERVICE_ACCOUNT);
    dbAccount.project_id = 'db-project';
    const { provider } = makeProvider({
      envJson: SERVICE_ACCOUNT,
      dbCreds: { serviceAccountJson: JSON.stringify(dbAccount) },
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'at-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'm3' }));
    await provider.send(delivery());
    expect(fetchMock.mock.calls[1][0]).toContain('/projects/db-project/');
  });

  it('caches the OAuth token across sends until near-expiry', async () => {
    const { provider } = makeProvider({ envJson: SERVICE_ACCOUNT });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'at-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'm1' }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'm2' }));

    await provider.send(delivery());
    await provider.send(delivery('device-token-2'));

    // 3 fetches total: ONE oauth exchange + two sends.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('marks dead tokens with the UNREGISTERED prefix (404 and invalid-token 400)', async () => {
    const { provider } = makeProvider({ envJson: SERVICE_ACCOUNT });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'at-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(404, { error: { status: 'NOT_FOUND' } }));
    const gone = await provider.send(delivery());
    expect(gone.ok).toBe(false);
    expect(gone.error).toMatch(/^UNREGISTERED:/);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: { message: 'The registration token is not a valid FCM registration token' },
      }),
    );
    const invalid = await provider.send(delivery());
    expect(invalid.error).toMatch(/^UNREGISTERED:/);
  });

  it('reports other FCM errors without the prune prefix', async () => {
    const { provider } = makeProvider({ envJson: SERVICE_ACCOUNT });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'at-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(500, { error: { message: 'backend unavailable' } }));
    const result = await provider.send(delivery());
    expect(result.ok).toBe(false);
    expect(result.error).toContain('FCM send failed (500)');
    expect(result.error).not.toMatch(/^UNREGISTERED/);
  });

  it('surfaces OAuth exchange failures as a failed delivery', async () => {
    const { provider } = makeProvider({ envJson: SERVICE_ACCOUNT });
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'invalid_grant' }));
    const result = await provider.send(delivery());
    expect(result.ok).toBe(false);
    expect(result.error).toContain('FCM OAuth exchange failed (401)');
  });

  it('fails when the OAuth exchange returns no access_token', async () => {
    const { provider } = makeProvider({ envJson: SERVICE_ACCOUNT });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    const result = await provider.send(delivery());
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no access_token');
  });

  it('omits the data field when the dispatch metadata has no payload', async () => {
    const { provider } = makeProvider({ envJson: SERVICE_ACCOUNT });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'at-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'm1' }));
    await provider.send({ channel: Channel.PUSH, to: 't', subject: 'S', text: 'fallback body' });
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent.message.data).toBeUndefined();
    expect(sent.message.notification.body).toBe('fallback body'); // text fallback
  });
});
