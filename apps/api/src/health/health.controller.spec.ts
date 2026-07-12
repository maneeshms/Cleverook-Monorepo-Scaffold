import { HealthController } from './health.controller';

describe('HealthController', () => {
  const health = { check: jest.fn(async (checks: (() => unknown)[]) => Promise.all(checks.map((c) => c()))) };
  const db = { pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }) };
  const controller = new HealthController(health as never, db as never);

  it('liveness answers without touching dependencies', () => {
    const result = controller.liveness();
    expect(result.status).toBe('ok');
    expect(db.pingCheck).not.toHaveBeenCalled();
  });

  it('readiness pings the database', async () => {
    await controller.readiness();
    expect(db.pingCheck).toHaveBeenCalledWith('database', { timeout: 3000 });
  });

  it('info reports uptime and memory', () => {
    const info = controller.info();
    expect(info.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(info.memoryMB.rss).toBeGreaterThan(0);
    expect(info.nodeVersion).toBe(process.version);
  });
});
