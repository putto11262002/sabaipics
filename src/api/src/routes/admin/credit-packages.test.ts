/**
 * Admin Credit Packages API Tests
 *
 * Uses Hono's testClient for type-safe testing.
 * See: https://hono.dev/docs/guides/testing
 */

import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { adminCreditPackagesRouter } from "./credit-packages";
import type { Database } from "@/db";

// =============================================================================
// Test Setup
// =============================================================================

const TEST_API_KEY = "test-admin-key";

// Mock credit package data - use valid UUIDs
const MOCK_UUID_1 = "11111111-1111-1111-1111-111111111111";
const MOCK_UUID_2 = "22222222-2222-2222-2222-222222222222";

const mockPackages = [
  {
    id: MOCK_UUID_1,
    name: "Basic",
    credits: 100,
    priceThb: 299,
    active: true,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: MOCK_UUID_2,
    name: "Pro",
    credits: 500,
    priceThb: 999,
    active: true,
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

// Create mock DB functions
function createMockDb(
  overrides: Partial<ReturnType<typeof createBaseMockDb>> = {},
) {
  const base = createBaseMockDb();
  return { ...base, ...overrides };
}

function createBaseMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(mockPackages),
    limit: vi.fn().mockResolvedValue([mockPackages[0]]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mockPackages[0]]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
}

// Create test app with mock DB
function createTestApp(
  mockDb: ReturnType<typeof createMockDb> = createMockDb(),
) {
  type Env = {
    Bindings: { ADMIN_API_KEY: string };
    Variables: { db: () => Database };
  };

  return new Hono<Env>()
    .use("/*", (c, next) => {
      c.set("db", () => mockDb as unknown as Database);
      return next();
    })
    .route("/credit-packages", adminCreditPackagesRouter);
}

const MOCK_ENV = {
  ADMIN_API_KEY: TEST_API_KEY,
};

// =============================================================================
// Auth Tests
// =============================================================================

describe("Admin Auth", () => {
  it("rejects request without API key", async () => {
    const app = createTestApp();
    const client = testClient(app, MOCK_ENV);

    const res = await client["credit-packages"].$get();

    expect(res.status).toBe(401);
    const body = await res.json();
    if ("error" in body) {
      expect(body.error.code).toBe("UNAUTHENTICATED");
    } else {
      throw new Error("Expected error response");
    }
  });

  it("rejects request with invalid API key", async () => {
    const app = createTestApp();
    const client = testClient(app, MOCK_ENV);

    const res = await client["credit-packages"].$get(undefined, {
      headers: { "X-Admin-API-Key": "wrong-key" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    if ("error" in body) {
      expect(body.error.code).toBe("UNAUTHENTICATED");
    } else {
      throw new Error("Expected error response");
    }
  });

  it("accepts request with valid API key", async () => {
    const app = createTestApp();
    const client = testClient(app, MOCK_ENV);

    const res = await client["credit-packages"].$get(undefined, {
      headers: { "X-Admin-API-Key": TEST_API_KEY },
    });

    expect(res.status).toBe(200);
  });
});

// =============================================================================
// GET /credit-packages Tests
// =============================================================================

describe("GET /credit-packages", () => {
  it("returns all packages ordered by sortOrder", async () => {
    const mockDb = createMockDb();
    const app = createTestApp(mockDb);
    const client = testClient(app, MOCK_ENV);

    const res = await client["credit-packages"].$get(undefined, {
      headers: { "X-Admin-API-Key": TEST_API_KEY },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    if ("data" in body) {
      expect(body.data).toEqual(mockPackages);
    } else {
      throw new Error("Expected data response");
    }
    expect(mockDb.orderBy).toHaveBeenCalled();
  });

  it("returns empty array when no packages", async () => {
    const mockDb = createMockDb();
    mockDb.orderBy = vi.fn().mockResolvedValue([]);
    const app = createTestApp(mockDb);
    const client = testClient(app, MOCK_ENV);

    const res = await client["credit-packages"].$get(undefined, {
      headers: { "X-Admin-API-Key": TEST_API_KEY },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    if ("data" in body) {
      expect(body.data).toEqual([]);
    } else {
      throw new Error("Expected data response");
    }
  });
});

// =============================================================================
// POST /credit-packages Tests
// =============================================================================

describe("POST /credit-packages", () => {
  it("creates package with all fields", async () => {
    const newPackage = {
      id: "pkg-new",
      name: "New Package",
      credits: 200,
      priceThb: 499,
      active: false,
      sortOrder: 5,
      createdAt: "2026-01-10T00:00:00Z",
    };

    const mockDb = createMockDb();
    mockDb.returning = vi.fn().mockResolvedValue([newPackage]);
    const app = createTestApp(mockDb);
    const client = testClient(app, MOCK_ENV);

    const res = await client["credit-packages"].$post(
      {
        json: {
          name: "New Package",
          credits: 200,
          priceThb: 499,
          active: false,
          sortOrder: 5,
        },
      },
      {
        headers: { "X-Admin-API-Key": TEST_API_KEY },
      },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    if ("data" in body) {
      expect(body.data).toEqual(newPackage);
    } else {
      throw new Error("Expected data response");
    }
  });

  it("creates package with defaults (active=true, sortOrder=0)", async () => {
    const mockDb = createMockDb();
    const app = createTestApp(mockDb);
    const client = testClient(app, MOCK_ENV);

    const res = await client["credit-packages"].$post(
      {
        json: {
          name: "Basic",
          credits: 100,
          priceThb: 299,
        },
      },
      {
        headers: { "X-Admin-API-Key": TEST_API_KEY },
      },
    );

    expect(res.status).toBe(201);
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Basic",
        credits: 100,
        priceThb: 299,
        active: true,
        sortOrder: 0,
      }),
    );
  });
});

// =============================================================================
// PATCH /credit-packages/:id Tests
// =============================================================================

describe("PATCH /credit-packages/:id", () => {
  it("updates single field", async () => {
    const updatedPackage = { ...mockPackages[0], name: "Updated Name" };

    const mockDb = createMockDb();
    mockDb.limit = vi.fn().mockResolvedValue([mockPackages[0]]);
    mockDb.returning = vi.fn().mockResolvedValue([updatedPackage]);
    const app = createTestApp(mockDb);
    const client = testClient(app, MOCK_ENV);

    const res = await client["credit-packages"][":id"].$patch(
      {
        param: { id: MOCK_UUID_1 },
        json: { name: "Updated Name" },
      },
      {
        headers: { "X-Admin-API-Key": TEST_API_KEY },
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    if ("data" in body) {
      expect(body.data.name).toBe("Updated Name");
    } else {
      throw new Error("Expected data response");
    }
  });

  it("updates multiple fields", async () => {
    const updatedPackage = {
      ...mockPackages[0],
      name: "Updated",
      credits: 500,
      active: false,
    };

    const mockDb = createMockDb();
    mockDb.limit = vi.fn().mockResolvedValue([mockPackages[0]]);
    mockDb.returning = vi.fn().mockResolvedValue([updatedPackage]);
    const app = createTestApp(mockDb);
    const client = testClient(app, MOCK_ENV);

    const res = await client["credit-packages"][":id"].$patch(
      {
        param: { id: MOCK_UUID_1 },
        json: {
          name: "Updated",
          credits: 500,
          active: false,
        },
      },
      {
        headers: { "X-Admin-API-Key": TEST_API_KEY },
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    if ("data" in body) {
      expect(body.data).toEqual(updatedPackage);
    } else {
      throw new Error("Expected data response");
    }
  });

  it("returns 404 for non-existent package", async () => {
    const mockDb = createMockDb();
    mockDb.limit = vi.fn().mockResolvedValue([]);
    const app = createTestApp(mockDb);
    const client = testClient(app, MOCK_ENV);

    const res = await client["credit-packages"][":id"].$patch(
      {
        param: { id: "00000000-0000-0000-0000-000000000000" },
        json: { name: "Updated" },
      },
      {
        headers: { "X-Admin-API-Key": TEST_API_KEY },
      },
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    if ("error" in body) {
      expect(body.error.code).toBe("NOT_FOUND");
    } else {
      throw new Error("Expected error response");
    }
  });
});
