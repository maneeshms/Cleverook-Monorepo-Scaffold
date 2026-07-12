import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/e2e-app';

describe('Health & observability (e2e)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health — liveness without touching dependencies', async () => {
    const res = await api().get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/ready — readiness includes a database ping', async () => {
    const res = await api().get('/api/v1/health/ready').expect(200);
    expect(res.body.details.database.status).toBe('up');
  });

  it('GET /health/info — uptime/memory snapshot', async () => {
    const res = await api().get('/api/v1/health/info').expect(200);
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('GET /metrics — Prometheus exposition incl. http histogram', async () => {
    await api().get('/api/v1/health').expect(200); // generate at least one sample
    const res = await api().get('/api/v1/metrics').expect(200);
    expect(res.text).toContain('process_cpu_user_seconds_total');
    expect(res.text).toContain('http_request_duration_seconds_bucket');
  });
});
