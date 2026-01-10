/**
 * Consent API Tests
 *
 * Uses Hono's testClient for type-safe testing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { consentRouter } from "./consent";
import type { Database } from "@sabaipics/db";
import type { PhotographerVariables } from "../middleware";

// =============================================================================
// Test Setup
// =============================================================================

const MOCK_PHOTOGRAPHER_ID = "11111111-1111-1111-1111-111111111111";
const MOCK_CLERK_ID = "clerk_123";
const MOCK_SESSION_ID = "session_123";
const MOCK_CONSENT_ID = "22222222-2222-2222-2222-222222222222";

// Create mock DB functions
function createMockDb(
  overrides: Partial<ReturnType<typeof createBaseMockDb>> = {}
) {
  const base = createBaseMockDb();
  return { ...base, ...overrides };
}

function createBaseMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      {
        id: MOCK_CONSENT_ID,
        consentType: "pdpa",
        createdAt: new Date("2026-01-10T00:00:00Z"),
      },
    ]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
}

// Create test app with mocked dependencies
function createTestApp(options: {
  mockDb?: ReturnType<typeof createMockDb>;
  photographer?: { id: string; pdpaConsentAt: string | null } | null;
  hasAuth?: boolean;
}) {
  const {
    mockDb = createMockDb(),
    photographer = { id: MOCK_PHOTOGRAPHER_ID, pdpaConsentAt: null },
    hasAuth = true,
  } = options;

  type Env = {
    Bindings: Record<string, unknown>;
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
      if (photographer) {
        // Override the DB query to return our mock photographer
        mockDb.limit = vi.fn().mockResolvedValue([photographer]);
      } else {
        mockDb.limit = vi.fn().mockResolvedValue([]);
      }
      return next();
    })
    .route("/consent", consentRouter);

  return { app, mockDb };
}

// =============================================================================
// Auth Tests
// =============================================================================

describe("POST /consent - Auth", () => {
  it("returns 401 without authentication", async () => {
    const { app } = createTestApp({ hasAuth: false });
    const client = testClient(app);

    const res = await client.consent.$post();

    expect(res.status).toBe(401);
    const body = await res.json();
    if ("error" in body) {
      expect(body.error.code).toBe("UNAUTHENTICATED");
    } else {
      throw new Error("Expected error response");
    }
  });

  it("returns 403 when photographer not found in DB", async () => {
    const { app } = createTestApp({ photographer: null });
    const client = testClient(app);

    const res = await client.consent.$post();

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
// Consent Recording Tests
// =============================================================================

describe("POST /consent - Happy Path", () => {
  it("creates consent record and returns 201", async () => {
    const { app, mockDb } = createTestApp({});
    const client = testClient(app);

    const res = await client.consent.$post();

    expect(res.status).toBe(201);
    const body = await res.json();
    if ("data" in body) {
      expect(body.data.id).toBe(MOCK_CONSENT_ID);
      expect(body.data.consentType).toBe("pdpa");
    } else {
      throw new Error("Expected data response");
    }

    // Verify insert was called with correct values
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        photographerId: MOCK_PHOTOGRAPHER_ID,
        consentType: "pdpa",
      })
    );

    // Verify photographer update was called
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        pdpaConsentAt: expect.any(String),
      })
    );
  });

  it("captures IP address from CF-Connecting-IP header", async () => {
    const { app, mockDb } = createTestApp({});
    const client = testClient(app);

    await client.consent.$post(undefined, {
      headers: { "CF-Connecting-IP": "203.0.113.1" },
    });

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: "203.0.113.1",
      })
    );
  });

  it("stores null IP when header is missing", async () => {
    const { app, mockDb } = createTestApp({});
    const client = testClient(app);

    await client.consent.$post();

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: null,
      })
    );
  });
});

// =============================================================================
// Idempotency Tests
// =============================================================================

describe("POST /consent - Idempotency", () => {
  it("returns 409 when already consented", async () => {
    const { app } = createTestApp({
      photographer: {
        id: MOCK_PHOTOGRAPHER_ID,
        pdpaConsentAt: "2026-01-09T00:00:00Z",
      },
    });
    const client = testClient(app);

    const res = await client.consent.$post();

    expect(res.status).toBe(409);
    const body = await res.json();
    if ("error" in body) {
      expect(body.error.code).toBe("ALREADY_CONSENTED");
      expect(body.error.message).toBe("PDPA consent already recorded");
    } else {
      throw new Error("Expected error response");
    }
  });
});
