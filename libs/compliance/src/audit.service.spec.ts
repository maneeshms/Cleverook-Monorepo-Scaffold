import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';
import { computeChainHash } from './hash-chain';

const SECRET = 'unit-test-audit-secret';

/** Re-derive the hashed payload exactly as the service does (for building chains). */
function payload(row: Partial<AuditLog>) {
  return {
    action: row.action,
    actorId: row.actorId ?? null,
    actorType: row.actorType ?? 'user',
    resourceType: row.resourceType ?? null,
    resourceId: row.resourceId ?? null,
    outcome: row.outcome ?? 'success',
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
    requestId: row.requestId ?? null,
    metadata: row.metadata ?? null,
  };
}

function link(prevHash: string, row: Partial<AuditLog>): AuditLog {
  // Materialise every nullable field the way create() does, so the stored row
  // and the hash input agree (null, never undefined).
  const full = {
    action: row.action,
    actorId: row.actorId ?? null,
    actorType: row.actorType ?? 'user',
    resourceType: row.resourceType ?? null,
    resourceId: row.resourceId ?? null,
    outcome: row.outcome ?? 'success',
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
    requestId: row.requestId ?? null,
    metadata: row.metadata ?? null,
    sequence: row.sequence,
  } as AuditLog;
  full.prevHash = prevHash;
  full.hash = computeChainHash(SECRET, prevHash, payload(full));
  return full;
}

describe('AuditService', () => {
  let logger: { log: jest.Mock; error: jest.Mock };
  let saved: AuditLog[];
  let tip: AuditLog | null;
  let repo: any;

  const qb = (result: { one?: AuditLog | null; many?: AuditLog[] }) => ({
    orderBy: () => qb(result),
    limit: () => qb(result),
    getOne: async () => result.one ?? null,
    getMany: async () => result.many ?? [],
  });

  function make() {
    logger = { log: jest.fn(), error: jest.fn() };
    saved = [];
    tip = null;
    const logRepo = {
      createQueryBuilder: () => qb({ one: tip }),
      create: (o: Partial<AuditLog>) => o as AuditLog,
      save: async (r: AuditLog) => {
        saved.push(r);
        return r;
      },
    };
    repo = {
      createQueryBuilder: () => qb({ many: saved }),
      manager: {
        transaction: async (cb: (em: unknown) => Promise<void>) =>
          cb({ query: jest.fn().mockResolvedValue(undefined), getRepository: () => logRepo }),
      },
    };
    return new AuditService(repo, { auditHmacSecret: SECRET }, logger as never);
  }

  it('appends a genesis row (empty prevHash) with a valid chain hash', async () => {
    const service = make();
    await service.record({ action: 'auth.login', actorId: 'u1' });
    expect(saved).toHaveLength(1);
    expect(saved[0].prevHash).toBe('');
    expect(saved[0].hash).toBe(computeChainHash(SECRET, '', payload(saved[0])));
    expect(logger.log).toHaveBeenCalled();
  });

  it('chains a new row onto the current tip', async () => {
    const service = make();
    tip = link('', { action: 'auth.login', actorId: 'u1' });
    await service.record({ action: 'data.export', actorId: 'u1' });
    expect(saved[0].prevHash).toBe(tip.hash);
    expect(saved[0].hash).toBe(computeChainHash(SECRET, tip.hash, payload(saved[0])));
  });

  it('never throws to the caller and logs when the write fails', async () => {
    const service = make();
    repo.manager.transaction = jest.fn().mockRejectedValue(new Error('db down'));
    await expect(service.record({ action: 'x' })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Audit write failed'),
      expect.anything(),
      'Compliance',
    );
  });

  it('verifyChain passes for an untampered chain', async () => {
    const service = make();
    const r0 = link('', { action: 'a' });
    const r1 = link(r0.hash, { action: 'b' });
    const r2 = link(r1.hash, { action: 'c' });
    saved = [r0, r1, r2];
    const result = await service.verifyChain();
    expect(result).toEqual({ ok: true, checked: 3 });
  });

  it('verifyChain flags the first row whose contents were tampered with', async () => {
    const service = make();
    const r0 = link('', { action: 'a' });
    const r1 = link(r0.hash, { action: 'b' });
    r1.sequence = '2';
    r1.action = 'b-TAMPERED'; // hash no longer matches contents
    saved = [r0, r1];
    const result = await service.verifyChain();
    expect(result.ok).toBe(false);
    expect(result.brokenAtSequence).toBe('2');
  });

  it('verifyChain flags a broken link (deleted/reordered row)', async () => {
    const service = make();
    const r0 = link('', { action: 'a' });
    const r1 = link(r0.hash, { action: 'b' });
    const r2 = link(r1.hash, { action: 'c' });
    r2.sequence = '3';
    saved = [r0, r2]; // r1 removed → r2.prevHash no longer matches r0.hash
    const result = await service.verifyChain();
    expect(result.ok).toBe(false);
    expect(result.brokenAtSequence).toBe('3');
  });
});
