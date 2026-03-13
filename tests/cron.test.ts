import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const selectMock = vi.fn();
const limitMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: fromMock
  })
}));

describe('Supabase Keep Alive Cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;

    limitMock.mockReset();
    selectMock.mockReset();
    fromMock.mockReset();

    selectMock.mockReturnValue({
      limit: limitMock
    });

    fromMock.mockReturnValue({
      select: selectMock
    });
  });

  it('returns 200 when the database ping succeeds', async () => {
    limitMock.mockResolvedValue({ error: null });

    const { default: app } = await import('../src/app.js');
    const response = await request(app).get('/api/cron/supabase-keepalive');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.table).toBe('products');
    expect(fromMock).toHaveBeenCalledWith('products');
  });

  it('returns 401 when CRON_SECRET is configured and missing from the request', async () => {
    process.env.CRON_SECRET = 'top-secret';
    limitMock.mockResolvedValue({ error: null });

    const { default: app } = await import('../src/app.js');
    const response = await request(app).get('/api/cron/supabase-keepalive');

    expect(response.status).toBe(401);
  });

  it('accepts the request when the CRON_SECRET bearer token matches', async () => {
    process.env.CRON_SECRET = 'top-secret';
    limitMock.mockResolvedValue({ error: null });

    const { default: app } = await import('../src/app.js');
    const response = await request(app)
      .get('/api/cron/supabase-keepalive')
      .set('Authorization', 'Bearer top-secret');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});
