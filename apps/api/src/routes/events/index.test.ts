/**
 * Events API Tests
 *
 * Uses Hono's testClient for type-safe testing.
 * See: https://hono.dev/guides/testing
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { eventsRouter } from "./index";
import type { Database } from "@sabaipics/db";
import type { PhotographerVariables } from "../../middleware";

// Minimal R2Bucket type for testing
type R2Bucket = {
  put: (key: string, value: Uint8Array, options?: { httpMetadata?: { contentType: string } }) => Promise<void>;
};

// =============================================================================
// Test Setup
// =============================================================================

const MOCK_PHOTOGRAPHER_ID = "11111111-1111-1111-1111-111111111111";
const MOCK_CLERK_ID = "clerk_123";
const MOCK_SESSION_ID = "session_123";
const MOCK_EVENT_ID = "22222222-2222-2222-2222-222222222222";

const mockPhotographer = {
  id: MOCK_PHOTOGRAPHER_ID,
  pdpaConsentAt: "2026-01-01T00:00:00Z",
};

const mockEvent = {
  id: MOCK_EVENT_ID,
  photographerId: MOCK_PHOTOGRAPHER_ID,
  name: "Test Event",
  startDate: null,
  endDate: null,
  accessCode: "ABC123",
  qrCodeR2Key: "qr/ABC123.png",
  rekognitionCollectionId: null,
  expiresAt: "2026-02-10T00:00:00Z",
  createdAt: "2026-01-10T00:00:00Z",
};

// Mock R2 bucket factory
const createMockR2Bucket = () => ({
  put: vi.fn().mockResolvedValue(undefined),
});

// Create mock DB functions
function createMockDb() {
  // For count queries (no .limit() call)
  const countResult = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count: 0 }]),
  });

  // Limit result that supports .offset() and is directly awaitable
  const createLimitResult = (data: unknown[]) => {
    const promise = Promise.resolve(data);
    return {
      offset: vi.fn().mockReturnValue(promise),
      then: promise.then.bind(promise),
    };
  };

  const mockDb = {
    select: vi.fn().mockImplementation((...args) => {
      // Check if this is a count query (selecting count(*)::int)
      if (args.length > 0 && typeof args[0] === "object" && "count" in (args[0] as any)) {
        return countResult(...args);
      }
      // Regular select - return mockDb for chaining
      return mockDb;
    }),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue(createLimitResult([])),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockEvent]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return mockDb;
}

// Create test app with mocked dependencies
function createTestApp(options: {
  mockDb?: ReturnType<typeof createMockDb>;
  photographer?: { id: string; pdpaConsentAt: string | null } | null;
  hasAuth?: boolean;
  mockBucket?: R2Bucket;
}) {
  const {
    mockDb = createMockDb(),
    photographer = mockPhotographer,
    hasAuth = true,
    mockBucket = createMockR2Bucket() as unknown as R2Bucket,
  } = options;

  type Env = {
    Bindings: {
      APP_BASE_URL: string;
      PHOTOS_BUCKET: R2Bucket;
    };
    Variables: PhotographerVariables;
  };

  const app = new Hono<Env>()
    // Mock auth context (simulates Clerk middleware)
    .use("/*", (c, next) => {
      if (hasAuth) {
        c.set("auth", { userId: MOCK_CLERK_ID, sessionId: MOCK_SESSION_ID });
      }
      return next();
    })
    // Mock DB
    .use("/*", (c, next) => {
      c.set("db", () => mockDb as unknown as Database);
      return next();
    })
    // Mock photographer lookup for requirePhotographer middleware
    .use("/*", (c, next) => {
      // Store the original limit mock
      const originalLimit = mockDb.limit;
      // Override limit for the requirePhotographer query (it calls .limit(1))
      // Then restore original for subsequent DB calls
      let hasBeenCalled = false;
      mockDb.limit = vi.fn().mockImplementation((...args) => {
        if (!hasBeenCalled && typeof args[0] === "number") {
          // This is the requirePhotographer middleware calling .limit(1)
          hasBeenCalled = true;
          mockDb.limit = originalLimit; // Restore original for next calls
          // Return a thenable that behaves like a Promise resolving to photographer array
          return {
            offset: vi.fn().mockResolvedValue(photographer ? [photographer] : []),
            then: (resolve: (value: unknown) => void) => resolve(photographer ? [photographer] : []),
          };
        }
        return originalLimit(...args);
      });
      return next();
    })
    .route("/events", eventsRouter);

  return { app, mockDb, mockBucket };
}

const MOCK_ENV = (mockBucket: R2Bucket) => ({
  APP_BASE_URL: "https://sabaipics.com",
  PHOTOS_BUCKET: mockBucket,
});

// =============================================================================
// Auth Tests
// =============================================================================

describe("POST /events - Auth", () => {
  it("returns 401 without authentication", async () => {
    const mockBucket = createMockR2Bucket();
    const { app } = createTestApp({ hasAuth: false });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events.$post({
      json: { name: "Test Event" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    if ("error" in body) {
      expect(body.error.code).toBe("UNAUTHENTICATED");
    } else {
      throw new Error("Expected error response");
    }
  });

  it("returns 403 when photographer not found", async () => {
    const mockBucket = createMockR2Bucket();
    const { app } = createTestApp({ photographer: null });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events.$post({
      json: { name: "Test Event" },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    if ("error" in body) {
      expect(body.error.code).toBe("FORBIDDEN");
    } else {
      throw new Error("Expected error response");
    }
  });

  it("returns 403 without PDPA consent", async () => {
    const mockBucket = createMockR2Bucket();
    const { app } = createTestApp({
      photographer: { id: MOCK_PHOTOGRAPHER_ID, pdpaConsentAt: null },
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events.$post({
      json: { name: "Test Event" },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    if ("error" in body) {
      expect(body.error.code).toBe("FORBIDDEN");
    } else {
      throw new Error("Expected error response");
    }
  });
});

// =============================================================================
// POST /events Tests
// =============================================================================

describe("POST /events - Success", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates event with valid input", async () => {
    const mockBucket = createMockR2Bucket();
    const mockDb = createMockDb();
    const { app, mockBucket: bucket } = createTestApp({
      mockDb,
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(bucket));

    const res = await client.events.$post({
      json: { name: "Test Event" },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    if ("data" in body) {
      expect(body.data.name).toBe("Test Event");
      expect(body.data.accessCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(body.data.qrCodeUrl).toBeTruthy();
      expect(body.data.rekognitionCollectionId).toBeNull();
      expect(mockBucket.put).toHaveBeenCalledWith(
        expect.stringMatching(/^qr\/[A-Z0-9]{6}\.png$/),
        expect.any(Uint8Array),
        expect.objectContaining({
          httpMetadata: expect.objectContaining({
            contentType: "image/png",
          }),
        })
      );
    } else {
      throw new Error("Expected data response");
    }
  });

  it("creates event with dates", async () => {
    const mockBucket = createMockR2Bucket();
    const eventWithDates = { ...mockEvent, startDate: "2026-01-15T10:00:00Z", endDate: "2026-01-15T18:00:00Z" };
    const mockDb = createMockDb();
    mockDb.returning = vi.fn().mockResolvedValueOnce([eventWithDates]);
    const { app } = createTestApp({
      mockDb,
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const startDate = "2026-01-15T10:00:00Z";
    const endDate = "2026-01-15T18:00:00Z";

    const res = await client.events.$post({
      json: { name: "Test Event", startDate, endDate },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    if ("data" in body) {
      expect(body.data.startDate).toBe(startDate);
      expect(body.data.endDate).toBe(endDate);
    } else {
      throw new Error("Expected data response");
    }
  });
});

describe("POST /events - Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty name", async () => {
    const mockBucket = createMockR2Bucket();
    const { app } = createTestApp({
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events.$post({
      json: { name: "" },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("rejects name too long", async () => {
    const mockBucket = createMockR2Bucket();
    const { app } = createTestApp({
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events.$post({
      json: { name: "a".repeat(201) },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("rejects invalid date format", async () => {
    const mockBucket = createMockR2Bucket();
    const { app } = createTestApp({
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events.$post({
      json: { name: "Test Event", startDate: "not-a-date" },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("rejects start date after end date", async () => {
    const mockBucket = createMockR2Bucket();
    const { app } = createTestApp({
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events.$post({
      json: {
        name: "Test Event",
        startDate: "2026-01-20T10:00:00Z",
        endDate: "2026-01-15T10:00:00Z",
      },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    if ("error" in body) {
      expect(body.error.code).toBe("INVALID_DATE_RANGE");
    } else {
      throw new Error("Expected error response");
    }
  });
});

// =============================================================================
// GET /events Tests (with pagination)
// =============================================================================

describe("GET /events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns photographer's events with pagination metadata", async () => {
    const mockBucket = createMockR2Bucket();
    const mockDb = createMockDb();
    // Override limit to return events
    mockDb.limit = vi.fn().mockReturnValue({
      offset: vi.fn().mockResolvedValue([mockEvent]),
      then: (resolve: (value: unknown) => void) => resolve([mockEvent]),
    });
    const { app } = createTestApp({
      mockDb,
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events.$get({
      query: { page: 0, limit: 20 },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    if ("data" in body) {
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0].name).toBe("Test Event");
    } else {
      throw new Error("Expected data response");
    }
  });

  it("returns empty array for new photographer", async () => {
    const mockBucket = createMockR2Bucket();
    const mockDb = createMockDb();
    mockDb.limit = vi.fn().mockReturnValue({
      offset: vi.fn().mockResolvedValue([]),
      then: (resolve: (value: unknown) => void) => resolve([]),
    });
    const { app } = createTestApp({
      mockDb,
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events.$get({
      query: {},
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    if ("data" in body) {
      expect(body.data).toEqual([]);
    } else {
      throw new Error("Expected data response");
    }
  });

  it("uses default page=0 and limit=20 when not provided", async () => {
    const mockBucket = createMockR2Bucket();
    const mockDb = createMockDb();
    mockDb.limit = vi.fn().mockReturnValue({
      offset: vi.fn().mockResolvedValue([mockEvent]),
      then: (resolve: (value: unknown) => void) => resolve([mockEvent]),
    });
    const { app } = createTestApp({
      mockDb,
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events.$get({
      query: {},
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    if ("data" in body) {
      expect(Array.isArray(body.data)).toBe(true);
    } else {
      throw new Error("Expected data response");
    }
  });

  it("limits results to max 100", async () => {
    const mockBucket = createMockR2Bucket();
    const { app } = createTestApp({
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events.$get({
      query: { limit: 200 }, // Schema rejects > 100 with validation error
    });

    // Schema has .max(100), so values > 100 return 400 validation error
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("orders by createdAt desc", async () => {
    const mockBucket = createMockR2Bucket();
    const mockDb = createMockDb();
    mockDb.limit = vi.fn().mockReturnValue({
      offset: vi.fn().mockResolvedValue([mockEvent]),
      then: (resolve: (value: unknown) => void) => resolve([mockEvent]),
    });
    const { app } = createTestApp({
      mockDb,
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    await client.events.$get({
      query: {},
    });

    expect(mockDb.orderBy).toHaveBeenCalled();
  });
});

// =============================================================================
// GET /events/:id Tests
// =============================================================================

describe("GET /events/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns event if photographer owns it", async () => {
    const mockBucket = createMockR2Bucket();
    const mockDb = createMockDb();
    // Track limit calls - the createTestApp mock handles the first call (requirePhotographer)
    // We need to handle the second call (event query) which also calls .limit(1)
    let testLimitCallCount = 0;
    const testLimitMock = vi.fn().mockImplementation((...args) => {
      testLimitCallCount++;
      if (testLimitCallCount === 1) {
        // First call - pass through to original (which is the createTestApp mock)
        // The createTestApp mock will see it's the first call and return photographer
        const createTestAppMock = mockDb.limit;
        // Save the createTestApp mock
        const original = createTestAppMock(...args);
        // Replace with our mock for subsequent calls
        mockDb.limit = testLimitMock;
        return original;
      }
      // Second call - return the event
      return {
        offset: vi.fn().mockResolvedValue([mockEvent]),
        then: (resolve: (value: unknown) => void) => resolve([mockEvent]),
      };
    });
    // Replace the base mock with our tracking mock
    mockDb.limit = testLimitMock;

    const { app } = createTestApp({
      mockDb,
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events[":id"].$get({
      param: { id: MOCK_EVENT_ID },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    if ("data" in body) {
      expect(body.data.id).toBe(MOCK_EVENT_ID);
      expect(body.data.name).toBe("Test Event");
      expect(body.data.qrCodeUrl).toBeTruthy();
    } else {
      throw new Error("Expected data response");
    }
  });

  it("returns 404 if event not found", async () => {
    const mockBucket = createMockR2Bucket();
    const mockDb = createMockDb();
    const originalLimit = mockDb.limit;
    let limitCallCount = 0;
    mockDb.limit = vi.fn().mockImplementation((...args) => {
      limitCallCount++;
      if (limitCallCount === 1) {
        return originalLimit(...args);
      }
      return {
        offset: vi.fn().mockResolvedValue([]),
        then: (resolve: (value: unknown) => void) => resolve([]),
      };
    });
    const { app } = createTestApp({
      mockDb,
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events[":id"].$get({
      param: { id: "00000000-0000-0000-0000-000000000000" },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    if ("error" in body) {
      expect(body.error.code).toBe("NOT_FOUND");
    } else {
      throw new Error("Expected error response");
    }
  });

  it("returns 404 if photographer doesn't own event", async () => {
    // Event owned by different photographer
    const otherEvent = { ...mockEvent, photographerId: "33333333-3333-3333-3333-333333333333" };
    const mockBucket = createMockR2Bucket();
    const mockDb = createMockDb();
    const originalLimit = mockDb.limit;
    let limitCallCount = 0;
    mockDb.limit = vi.fn().mockImplementation((...args) => {
      limitCallCount++;
      if (limitCallCount === 1) {
        return originalLimit(...args);
      }
      return {
        offset: vi.fn().mockResolvedValue([otherEvent]),
        then: (resolve: (value: unknown) => void) => resolve([otherEvent]),
      };
    });
    const { app } = createTestApp({
      mockDb,
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events[":id"].$get({
      param: { id: MOCK_EVENT_ID },
    });

    // Should return NOT_FOUND, not FORBIDDEN (prevents enumeration)
    expect(res.status).toBe(404);
    const body = await res.json();
    if ("error" in body) {
      expect(body.error.code).toBe("NOT_FOUND");
    } else {
      throw new Error("Expected error response");
    }
  });

  it("rejects invalid UUID", async () => {
    const mockBucket = createMockR2Bucket();
    const { app } = createTestApp({
      mockBucket: mockBucket as unknown as R2Bucket,
    });
    const client = testClient(app, MOCK_ENV(mockBucket));

    const res = await client.events[":id"].$get({
      param: { id: "not-a-uuid" },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
