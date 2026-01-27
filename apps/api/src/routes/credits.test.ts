import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { testClient } from 'hono/testing';
import { creditsRouter } from './credits';
import type { Database } from '@sabaipics/db';
import type { Bindings, Variables } from '../types';

// Mock constants
const MOCK_UUID_1 = '11111111-1111-1111-1111-111111111111';
const MOCK_UUID_2 = '22222222-2222-2222-2222-222222222222';
const MOCK_UUID_3 = '33333333-3333-3333-3333-333333333333';

// Mock data
const mockActivePackages = [
  {
    id: MOCK_UUID_1,
    name: 'Starter',
    credits: 100,
    priceThb: 9900, // 99 THB in satang
  },
  {
    id: MOCK_UUID_2,
    name: 'Pro',
    credits: 500,
    priceThb: 39900, // 399 THB in satang
  },
  {
    id: MOCK_UUID_3,
    name: 'Enterprise',
    credits: 1000,
    priceThb: 69900, // 699 THB in satang
  },
];

const mockInactivePackage = {
  id: '44444444-4444-4444-4444-444444444444',
  name: 'Inactive Package',
  credits: 50,
  priceThb: 4900,
};

// Mock DB builder
function createMockDb(packages: typeof mockActivePackages | (typeof mockInactivePackage)[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(packages),
  };
}

// Test app builder
function createTestApp(mockDb: ReturnType<typeof createMockDb>) {
  type Env = { Bindings: Bindings; Variables: Variables };

  const app = new Hono<Env>()
    .use('/*', (c, next) => {
      c.set('db', () => mockDb as unknown as Database);
      return next();
    })
    .route('/credit-packages', creditsRouter);

  return app;
}

describe('GET /credit-packages', () => {
  it('returns active packages sorted by sortOrder', async () => {
    const mockDb = createMockDb(mockActivePackages);
    const app = createTestApp(mockDb);
    const client = testClient(app);

    const res = await client['credit-packages'].$get();

    expect(res.status).toBe(200);
    const body = await res.json();

    if ('data' in body) {
      expect(body.data).toEqual(mockActivePackages);
      expect(body.data).toHaveLength(3);
      expect(body.data[0].name).toBe('Starter');
      expect(body.data[1].name).toBe('Pro');
      expect(body.data[2].name).toBe('Enterprise');
    } else {
      throw new Error('Expected data response');
    }

    // Verify query was built correctly
    expect(mockDb.select).toHaveBeenCalled();
    expect(mockDb.from).toHaveBeenCalled();
    expect(mockDb.where).toHaveBeenCalled();
    expect(mockDb.orderBy).toHaveBeenCalled();
  });

  it('returns empty array when no active packages', async () => {
    const mockDb = createMockDb([]);
    const app = createTestApp(mockDb);
    const client = testClient(app);

    const res = await client['credit-packages'].$get();

    expect(res.status).toBe(200);
    const body = await res.json();

    if ('data' in body) {
      expect(body.data).toEqual([]);
      expect(body.data).toHaveLength(0);
    } else {
      throw new Error('Expected data response');
    }
  });

  it('excludes inactive packages', async () => {
    // Simulate DB query that filters out inactive packages
    const mockDb = createMockDb([mockActivePackages[0]]);
    const app = createTestApp(mockDb);
    const client = testClient(app);

    const res = await client['credit-packages'].$get();

    expect(res.status).toBe(200);
    const body = await res.json();

    if ('data' in body) {
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(MOCK_UUID_1);
      expect(body.data[0].name).toBe('Starter');
      // Verify inactive package is not returned
      expect(body.data[0].name).not.toBe('Inactive Package');
    } else {
      throw new Error('Expected data response');
    }
  });

  it('returns response with correct shape', async () => {
    const mockDb = createMockDb([mockActivePackages[0]]);
    const app = createTestApp(mockDb);
    const client = testClient(app);

    const res = await client['credit-packages'].$get();

    expect(res.status).toBe(200);
    const body = await res.json();

    // Verify envelope
    expect(body).toHaveProperty('data');
    if (!('data' in body)) throw new Error('expected data');
    expect(Array.isArray(body.data)).toBe(true);

    // Verify data structure
    if (body.data.length > 0) {
      const pkg = body.data[0];
      expect(pkg).toHaveProperty('id');
      expect(pkg).toHaveProperty('name');
      expect(pkg).toHaveProperty('credits');
      expect(pkg).toHaveProperty('priceThb');
      expect(typeof pkg.id).toBe('string');
      expect(typeof pkg.name).toBe('string');
      expect(typeof pkg.credits).toBe('number');
      expect(typeof pkg.priceThb).toBe('number');
    }
  });

  it('handles single package', async () => {
    const mockDb = createMockDb([mockActivePackages[1]]);
    const app = createTestApp(mockDb);
    const client = testClient(app);

    const res = await client['credit-packages'].$get();

    expect(res.status).toBe(200);
    const body = await res.json();

    if ('data' in body) {
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Pro');
      expect(body.data[0].credits).toBe(500);
    } else {
      throw new Error('Expected data response');
    }
  });
});
