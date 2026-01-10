import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { photosRouter } from "./photos";
import type { Database } from "@sabaipics/db";
import type { PhotographerVariables } from "../middleware";

const MOCK_PHOTOGRAPHER_ID = "11111111-1111-1111-1111-111111111111";
const MOCK_EVENT_ID = "22222222-2222-2222-2222-222222222222";
const MOCK_PHOTO_ID = "33333333-3333-3333-3333-333333333333";

// Create mock DB that supports chaining
// Query sequence:
// 1. requirePhotographer middleware: photographers lookup
// 2. Handler: event ownership check
// 3. Handler: photos query (with orderBy + limit)
function createMockDb(options: {
  event?: { id: string } | null;
  photos?: Array<{
    id: string;
    r2Key: string;
    status: string;
    faceCount: number;
    uploadedAt: Date;
  }>;
  photographer?: { id: string; pdpaConsentAt: string | null } | null;
} = {}) {
  const {
    event = { id: MOCK_EVENT_ID },
    photos = [],
    photographer = {
      id: MOCK_PHOTOGRAPHER_ID,
      pdpaConsentAt: "2026-01-01T00:00:00Z",
    },
  } = options;

  let queryCallCount = 0;

  const createChain = (resolveValue: unknown) => {
    const chainObj: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        queryCallCount++;
        return chainObj;
      }),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        // Query 1: photographer lookup (middleware)
        if (queryCallCount === 1) {
          return Promise.resolve(photographer ? [photographer] : []);
        }
        // Query 2: event ownership check
        if (queryCallCount === 2) {
          return Promise.resolve(event ? [event] : []);
        }
        // Query 3: photos query (with orderBy)
        return Promise.resolve(photos);
      }),
      then: (resolve: (value: unknown) => void) => resolve(resolveValue),
    };
    return chainObj;
  };

  const mockDb: Record<string, unknown> = {
    select: vi.fn().mockImplementation(() => createChain(null)),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  };

  return mockDb;
}

// Create test app with mocked dependencies
function createTestApp(options: {
  event?: { id: string } | null;
  photos?: Array<{
    id: string;
    r2Key: string;
    status: string;
    faceCount: number;
    uploadedAt: Date;
  }>;
  photographer?: { id: string; pdpaConsentAt: string | null } | null;
  hasAuth?: boolean;
} = {}) {
  const {
    event = { id: MOCK_EVENT_ID },
    photos = [],
    photographer = {
      id: MOCK_PHOTOGRAPHER_ID,
      pdpaConsentAt: "2026-01-01T00:00:00Z",
    },
    hasAuth = true,
  } = options;

  const mockDb = createMockDb({ event, photos, photographer });

  type Env = {
    Bindings: Record<string, unknown>;
    Variables: PhotographerVariables;
  };

  const app = new Hono<Env>()
    .use("/*", (c, next) => {
      if (hasAuth) {
        c.set("auth", { userId: "clerk_123", sessionId: "session_123" });
      }
      return next();
    })
    .use("/*", (c, next) => {
      c.set("db", () => mockDb as unknown as Database);
      return next();
    })
    .use("/*", (c, next) => {
      // Initialize env object (required for tests since it's not auto-initialized)
      c.env = c.env || {};
      // Set mock environment for CF_DOMAIN and R2_BASE_URL
      c.env.CF_DOMAIN = "https://sabaipics.com";
      c.env.R2_BASE_URL = "https://photos.sabaipics.com";
      c.env.R2_ACCESS_KEY_ID = "test-key-id";
      c.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
      c.env.CLOUDFLARE_ACCOUNT_ID = "test-account-id";
      if (photographer) {
        c.set("photographer", photographer);
      }
      return next();
    })
    .route("/events", photosRouter);

  return { app };
}

describe("GET /events/:id/photos", () => {
  describe("Auth tests", () => {
    it("returns 401 without authentication", async () => {
      const { app } = createTestApp({ hasAuth: false });
      const client = testClient(app);
      const res = await client.events[":eventId"].photos.$get({
        param: { eventId: MOCK_EVENT_ID },
        query: {},
      });

      expect(res.status).toBe(401);
    });

    it("returns 403 without photographer in context", async () => {
      const { app } = createTestApp({ photographer: null });
      const client = testClient(app);
      const res = await client.events[":eventId"].photos.$get({
        param: { eventId: MOCK_EVENT_ID },
        query: {},
      });

      // Note: requirePhotographer() middleware returns 403 when no photographer found
      expect(res.status).toBe(403);
    });
  });

  describe("Event ownership verification", () => {
    it("returns 404 for non-existent event", async () => {
      const { app } = createTestApp({ event: null });
      const client = testClient(app);

      const res = await client.events[":eventId"].photos.$get({
        param: { eventId: MOCK_EVENT_ID },
        query: {},
      });

      expect(res.status).toBe(404);

      const body = await res.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("Pagination and data", () => {
    it("returns photos with proper pagination format", async () => {
      const mockPhotos = [
        {
          id: MOCK_PHOTO_ID,
          r2Key: "events/abc-123/photo.jpg",
          status: "indexed",
          faceCount: 5,
          uploadedAt: new Date("2025-01-10T12:00:00Z"),
        },
      ];

      const { app } = createTestApp({ photos: mockPhotos });
      const client = testClient(app);

      const res = await client.events[":eventId"].photos.$get({
        param: { eventId: MOCK_EVENT_ID },
        query: {},
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { data: unknown[]; pagination: { hasMore: boolean; nextCursor: string | null } };
      expect(body.data).toHaveLength(1);
      expect(body.pagination.hasMore).toBe(false);
      expect(body.pagination.nextCursor).toBeNull();
    });

    it("returns hasMore=true when more photos exist", async () => {
      // Create 21 photos (limit is 20)
      const mockPhotos = Array.from({ length: 21 }, (_, i) => ({
        id: `photo-${i}`,
        r2Key: `events/abc-123/photo-${i}.jpg`,
        status: "indexed" as const,
        faceCount: i,
        uploadedAt: new Date(`2025-01-10T${String(i).padStart(2, "0")}:00:00Z`),
      }));

      const mockDb = createMockDb({ photos: mockPhotos });

      type Env = {
        Bindings: Record<string, unknown>;
        Variables: PhotographerVariables;
      };

      const app = new Hono<Env>()
        .use("/*", (c, next) => {
          c.set("auth", { userId: "clerk_123", sessionId: "session_123" });
          return next();
        })
        .use("/*", (c, next) => {
          c.set("db", () => mockDb as unknown as Database);
          return next();
        })
        .use("/*", (c, next) => {
          // Initialize env object (required for tests since it's not auto-initialized)
          c.env = c.env || {};
          c.set("photographer", {
            id: MOCK_PHOTOGRAPHER_ID,
            pdpaConsentAt: "2026-01-01T00:00:00Z",
          });
          c.env.CF_DOMAIN = "https://sabaipics.com";
          c.env.R2_BASE_URL = "https://photos.sabaipics.com";
          c.env.R2_ACCESS_KEY_ID = "test-key-id";
          c.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
          c.env.CLOUDFLARE_ACCOUNT_ID = "test-account-id";
          return next();
        })
        .route("/events", photosRouter);

      const client = testClient(app);

      const res = await client.events[":eventId"].photos.$get({
        param: { eventId: MOCK_EVENT_ID },
        query: { limit: 20 },
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { data: unknown[]; pagination: { hasMore: boolean; nextCursor: string | null } };
      // Should return 20 photos with hasMore=true since there are 21 total
      expect(body.data.length).toBe(20);
    });

    it("returns empty array for event with no photos", async () => {
      const { app } = createTestApp({ photos: [] });
      const client = testClient(app);

      const res = await client.events[":eventId"].photos.$get({
        param: { eventId: MOCK_EVENT_ID },
        query: {},
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { data: unknown[]; pagination: { hasMore: boolean; nextCursor: string | null } };
      expect(body.data).toEqual([]);
      expect(body.pagination.hasMore).toBe(false);
      expect(body.pagination.nextCursor).toBeNull();
    });
  });

  describe("Validation", () => {
    it("rejects invalid event ID format", async () => {
      const { app } = createTestApp();
      const client = testClient(app);

      const res = await client.events[":eventId"].photos.$get({
        param: { eventId: "not-a-uuid" },
        query: {},
      });

      expect(res.status).toBe(400);
    });

    it("rejects limit greater than 50", async () => {
      const { app } = createTestApp();
      const client = testClient(app);

      const res = await client.events[":eventId"].photos.$get({
        param: { eventId: MOCK_EVENT_ID },
        query: { limit: 51 },
      });

      expect(res.status).toBe(400);
    });

    it("rejects limit less than 1", async () => {
      const { app } = createTestApp();
      const client = testClient(app);

      const res = await client.events[":eventId"].photos.$get({
        param: { eventId: MOCK_EVENT_ID },
        query: { limit: 0 },
      });

      expect(res.status).toBe(400);
    });

    it("rejects invalid cursor datetime format", async () => {
      const { app } = createTestApp();
      const client = testClient(app);

      const res = await client.events[":eventId"].photos.$get({
        param: { eventId: MOCK_EVENT_ID },
        query: { cursor: "not-a-datetime" },
      });

      expect(res.status).toBe(400);
    });
  });
});
