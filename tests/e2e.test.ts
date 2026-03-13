import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { ondcClient } from '../src/integrations/ondcClient.js';

// Mock ONDC Client to simulate successful flow
vi.mock('../src/integrations/ondcClient.js', () => ({
  ondcClient: {
    startFlow: vi.fn(),
    proceedFlow: vi.fn(),
    checkHealth: vi.fn().mockResolvedValue({ status: 'OK' }),
  }
}));

// Mock Supabase to simulate persistence
const mockSingle = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: mockSingle
          }),
          single: mockSingle
        })
      }),
      insert: () => Promise.resolve({ error: null }),
      update: () => ({
        eq: () => Promise.resolve({ error: null })
      })
    })
  })
}));

describe('E2E Flow Orchestration', () => {
  const sessionId = 'session-123';
  const flowId = 'default-flow';
  let transactionId: string;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete a full Search -> Select -> Init -> Confirm journey', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { session_id: sessionId }, error: null })
      .mockResolvedValueOnce({ data: { session_id: sessionId }, error: null })
      .mockResolvedValueOnce({ data: { session_id: sessionId }, error: null });

    // 1. Search
    (ondcClient.startFlow as any).mockResolvedValue({ 
      transactionId: 'txn-001', 
      status: 'INITIATED' 
    });
    
    const searchRes = await request(app)
      .post('/api/search')
      .send({ sessionId, flowId });
    
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.transactionId).toBe('txn-001');
    transactionId = searchRes.body.data.transactionId;

    // 2. Select
    (ondcClient.proceedFlow as any).mockResolvedValue({ 
      status: 'SELECTED' 
    });
    
    const selectRes = await request(app)
      .post('/api/select')
      .send({ transactionId, inputs: { items: [1] } });
    
    expect(selectRes.status).toBe(200);
    expect(selectRes.body.data.status).toBe('SELECTED');

    // 3. Init
    (ondcClient.proceedFlow as any).mockResolvedValue({ 
      status: 'INITIALIZED' 
    });
    
    const initRes = await request(app)
      .post('/api/init')
      .send({ transactionId, inputs: { address: 'Delhi' } });
    
    expect(initRes.status).toBe(200);
    expect(initRes.body.data.status).toBe('INITIALIZED');

    // 4. Confirm
    (ondcClient.proceedFlow as any).mockResolvedValue({ 
      status: 'CONFIRMED' 
    });
    
    const confirmRes = await request(app)
      .post('/api/confirm')
      .send({ transactionId });
    
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('CONFIRMED');
  });

  it('should handle idempotency on duplicate search', async () => {
    // Mock Supabase to return an existing record
    mockSingle.mockResolvedValueOnce({ 
      data: { transaction_id: 'test-txn', status: 'INITIATED' }, 
      error: null 
    });
    
    const res = await request(app)
      .post('/api/search')
      .send({ sessionId, flowId });
    
    expect(res.status).toBe(200);
    expect(res.body.data.transactionId).toBe('test-txn');
    expect(res.body.data.fromCache).toBe(true);
  });
});
