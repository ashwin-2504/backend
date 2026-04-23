import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('Firebase Keep Alive Cron', () => {
  const CRON_SECRET = 'test-cron-secret';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  it('returns 200 when the database ping succeeds', async () => {
    const response = await request(app)
      .get('/api/cron/firebase-keepalive')
      .set('Authorization', `Bearer ${CRON_SECRET}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.collection).toBeDefined();
  });

  it('returns 401 when CRON_SECRET is configured and missing from the request', async () => {
    const response = await request(app).get('/api/cron/firebase-keepalive');
    expect(response.status).toBe(401);
  });

  it('returns 401 when the CRON_SECRET bearer token is incorrect', async () => {
    const response = await request(app)
      .get('/api/cron/firebase-keepalive')
      .set('Authorization', 'Bearer wrong-secret');

    expect(response.status).toBe(401);
  });
});
