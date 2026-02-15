/**
 * Dashboard API Tests
 *
 * Uses Hono's testClient for type-safe testing.
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { testClient } from 'hono/testing';
import { dashboardRouter } from './route';
import type { Database } from '@/db';
import type { PhotographerVariables } from '../../middleware';

// Type for error responses
type ErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

// =============================================================================
// Test Setup
// =============================================================================

const MOCK_PHOTOGRAPHER_ID = '11111111-1111-1111-1111-111111111111';
const MOCK_CLERK_ID = 'clerk_123';
const MOCK_SESSION_ID = 'session_123';
const MOCK_EVENT_ID = '33333333-3333-3333-3333-333333333333';

// Create mock DB that tracks query calls and returns appropriate data
// This mock supports both chaining (.where().limit()) and direct await (.where())
function createMockDb(
  options: {
    balance?: number;
    nearestExpiry?: string | null;
    totalPhotos?: number;
    totalFaces?: number;
    events?: Array<{
      id: string;
      name: string;
      createdAt: string;
      expiresAt: string;
      startDate: string | null;
      endDate: string | null;
      photoCount: number;
      faceCount: number;
    }>;
    photographer?: { id: string; pdpaConsentAt: string | null } | null;
  } = {},
) {
  const {
    balance = 0,
    nearestExpiry = null,
    totalPhotos = 0,
    totalFaces = 0,
    events = [],
    photographer = {
      id: MOCK_PHOTOGRAPHER_ID,
      pdpaConsentAt: '2026-01-01T00:00:00Z',
    },
  } = options;

  let whereCallCount = 0;

  // Create a thenable chain object that can be both chained and awaited
  // Uses a real Promise so ResultAsync.fromPromise works correctly
  const createChain = (resolveValue: unknown) => {
    const promise = Promise.resolve(resolveValue);
    const chainObj: Record<string, unknown> = {
      limit: vi.fn().mockImplementation(() => {
        // For stats query (whereCallCount === 4), return stats
        // For events query (whereCallCount === 5), return events
        if (whereCallCount === 4) {
          return Promise.resolve([{ totalPhotos, totalFaces }]);
        }
        if (whereCallCount === 5) {
          return Promise.resolve(events);
        }
        // Default: photographer lookup
        return Promise.resolve(photographer ? [photographer] : []);
      }),
      orderBy: vi.fn().mockReturnThis(),
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
    };
    return chainObj;
  };

  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() => {
      whereCallCount++;
      // Query 0 (from middleware): photographer lookup - chains to .limit()
      if (whereCallCount === 1) {
        return createChain(photographer ? [photographer] : []);
      }
      // Query 1: balance (awaited directly)
      if (whereCallCount === 2) {
        return createChain([{ balance }]);
      }
      // Query 2: nearest expiry (awaited directly)
      if (whereCallCount === 3) {
        return createChain([{ nearestExpiry }]);
      }
      // Query 3: stats - chains to .limit()
      if (whereCallCount === 4) {
        return createChain([{ totalPhotos, totalFaces }]);
      }
      // Query 4: events - chains to .orderBy().limit()
      return createChain(events);
    }),
    limit: vi.fn().mockResolvedValue(photographer ? [photographer] : []),
  };

  return mockDb;
}

// Create test app with mocked dependencies
function createTestApp(options: {
  balance?: number;
  nearestExpiry?: string | null;
  totalPhotos?: number;
  totalFaces?: number;
  events?: Array<{
    id: string;
    name: string;
    createdAt: string;
    expiresAt: string;
    startDate: string | null;
    endDate: string | null;
    photoCount: number;
    faceCount: number;
  }>;
  photographer?: { id: string; pdpaConsentAt: string | null } | null;
  hasAuth?: boolean;
}) {
  const {
    balance = 0,
    nearestExpiry = null,
    totalPhotos = 0,
    totalFaces = 0,
    events = [],
    photographer = {
      id: MOCK_PHOTOGRAPHER_ID,
      pdpaConsentAt: '2026-01-01T00:00:00Z',
    },
    hasAuth = true,
  } = options;

  // Create mock with all options
  const mockDb = createMockDb({
    balance,
    nearestExpiry,
    totalPhotos,
    totalFaces,
    events,
    photographer,
  });

  type Env = {
    Bindings: Record<string, unknown>;
    Variables: PhotographerVariables;
  };

  const app = new Hono<Env>()
    // Mock auth context (simulates Clerk middleware)
    .use('/*', (c, next) => {
      if (hasAuth) {
        c.set('auth', { userId: MOCK_CLERK_ID, sessionId: MOCK_SESSION_ID });
      }
      return next();
    })
    // Mock DB
    .use('/*', (c, next) => {
      c.set('db', () => mockDb as unknown as Database);
      return next();
    })
    .route('/dashboard', dashboardRouter);

  return { app, mockDb };
}

// =============================================================================
// Auth Tests
// =============================================================================

describe('GET /dashboard - Auth', () => {
  it('returns 401 without authentication', async () => {
    const { app } = createTestApp({ hasAuth: false });
    const client = testClient(app);

    const res = await client.dashboard.$get();

    expect(res.status).toBe(401);
    const body = (await res.json()) as unknown as ErrorResponse;
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 403 when photographer not found in DB', async () => {
    const { app } = createTestApp({ photographer: null });
    const client = testClient(app);

    const res = await client.dashboard.$get();

    expect(res.status).toBe(403);
    const body = (await res.json()) as unknown as ErrorResponse;
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

// =============================================================================
// Empty State Tests
// =============================================================================

describe('GET /dashboard - Empty State', () => {
  it('returns empty dashboard for new user', async () => {
    const { app } = createTestApp({
      balance: 0,
      nearestExpiry: null,
      totalPhotos: 0,
      totalFaces: 0,
      events: [],
    });
    const client = testClient(app);

    const res = await client.dashboard.$get();

    expect(res.status).toBe(200);
    const body = await res.json();
    if ('data' in body) {
      expect(body.data.credits.balance).toBe(0);
      expect(body.data.credits.nearestExpiry).toBeNull();
      expect(body.data.events).toEqual([]);
      expect(body.data.stats.totalPhotos).toBe(0);
      expect(body.data.stats.totalFaces).toBe(0);
    } else {
      throw new Error('Expected data response');
    }
  });
});

// =============================================================================
// Credit Balance Tests
// =============================================================================

describe('GET /dashboard - Credits', () => {
  it('returns correct credit balance', async () => {
    const { app } = createTestApp({
      balance: 100,
      nearestExpiry: '2026-07-01T00:00:00Z',
      events: [],
    });
    const client = testClient(app);

    const res = await client.dashboard.$get();

    expect(res.status).toBe(200);
    const body = await res.json();
    if ('data' in body) {
      expect(body.data.credits.balance).toBe(100);
      expect(body.data.credits.nearestExpiry).toBe('2026-07-01T00:00:00Z');
    } else {
      throw new Error('Expected data response');
    }
  });
});

// =============================================================================
// Events Tests
// =============================================================================

describe('GET /dashboard - Events', () => {
  it('returns events with photo and face counts', async () => {
    const mockEvents = [
      {
        id: MOCK_EVENT_ID,
        name: 'Wedding 2026',
        createdAt: '2026-01-10T12:00:00Z',
        expiresAt: '2026-02-09T12:00:00Z',
        startDate: '2026-01-15T10:00:00Z',
        endDate: '2026-01-15T18:00:00Z',
        photoCount: 50,
        faceCount: 120,
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Corporate Event',
        createdAt: '2026-01-05T12:00:00Z',
        expiresAt: '2026-02-04T12:00:00Z',
        startDate: null,
        endDate: null,
        photoCount: 30,
        faceCount: 45,
      },
    ];

    const { app } = createTestApp({
      balance: 50,
      nearestExpiry: '2026-07-01T00:00:00Z',
      events: mockEvents,
    });
    const client = testClient(app);

    const res = await client.dashboard.$get();

    expect(res.status).toBe(200);
    const body = await res.json();
    if ('data' in body) {
      expect(body.data.events).toHaveLength(2);
      expect(body.data.events[0].name).toBe('Wedding 2026');
      expect(body.data.events[0].photoCount).toBe(50);
      expect(body.data.events[0].faceCount).toBe(120);
      expect(body.data.events[1].name).toBe('Corporate Event');
    } else {
      throw new Error('Expected data response');
    }
  });
});

// =============================================================================
// Stats Tests
// =============================================================================

describe('GET /dashboard - Stats', () => {
  it('returns total stats from separate query (not limited events)', async () => {
    const mockEvents = [
      {
        id: MOCK_EVENT_ID,
        name: 'Event 1',
        createdAt: '2026-01-10T12:00:00Z',
        expiresAt: '2026-02-09T12:00:00Z',
        startDate: null,
        endDate: null,
        photoCount: 50,
        faceCount: 120,
      },
    ];

    // Stats are from ALL events, not just the limited ones
    const { app } = createTestApp({
      balance: 0,
      nearestExpiry: null,
      totalPhotos: 500, // Total across all events
      totalFaces: 1200,
      events: mockEvents, // Only 1 event returned (limited)
    });
    const client = testClient(app);

    const res = await client.dashboard.$get();

    expect(res.status).toBe(200);
    const body = await res.json();
    if ('data' in body) {
      // Stats reflect ALL events, not just the limited ones
      expect(body.data.stats.totalPhotos).toBe(500);
      expect(body.data.stats.totalFaces).toBe(1200);
      // Events list is limited
      expect(body.data.events).toHaveLength(1);
    } else {
      throw new Error('Expected data response');
    }
  });
});
