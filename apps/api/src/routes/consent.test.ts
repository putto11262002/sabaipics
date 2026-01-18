/**
 * Consent Endpoint Integration Test
 *
 * Tests the consent endpoint transaction using app.request() pattern.
 *
 * - Transaction: insert consent_records + update photographers.pdpa_consent_at
 * - Both operations must succeed atomically or rollback together
 *
 * Uses process.process.env.DATABASE_URL! for DB connection.
 *
 * Run: pnpm test -- consent
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { createDb, createDbTx } from "@sabaipics/db";
import { photographers, consentRecords } from "@sabaipics/db";
import { eq } from "drizzle-orm";
import { consentRouter } from "./consent";
import { randomUUID } from "crypto";
import type { Bindings } from "../types";

// =============================================================================
// Test Setup
// =============================================================================

const TEST_PHOTOGRAPHER_ID = randomUUID();
// Must match the userId injected by createClerkAuth middleware when NODE_ENV=test
const TEST_CLERK_ID = "test_clerk_user_integration";

/**
 * Create a test photographer in the database.
 * Uses process.env.DATABASE_URL! which is automatically loaded from .dev.vars in workers pool.
 */
async function createTestPhotographer() {
  const db = createDb(process.env.DATABASE_URL!);
  const [photographer] = await db
    .insert(photographers)
    .values({
      id: TEST_PHOTOGRAPHER_ID,
      clerkId: TEST_CLERK_ID,
      email: `test-workers-${Date.now()}@sabaipics.com`,
      name: "Workers Runtime Test",
    })
    .returning();
  return photographer;
}

/**
 * Cleanup test data (delete consent_records first due to FK constraint).
 */
async function cleanupTestData() {
  const db = createDb(process.env.DATABASE_URL!);
  await db
    .delete(consentRecords)
    .where(eq(consentRecords.photographerId, TEST_PHOTOGRAPHER_ID));
  await db
    .delete(photographers)
    .where(eq(photographers.id, TEST_PHOTOGRAPHER_ID));
}

// =============================================================================
// Test
// =============================================================================

describe("POST /consent - Framework-Level (Hono Router)", () => {
  beforeAll(async () => {
    await createTestPhotographer();
  }, 30000);

  afterAll(async () => {
    await cleanupTestData();
  }, 30000);

  it(
    "atomically inserts consent record and updates photographer",
    async () => {
      // Build the Hono app with proper env types
      type Env = {
        Bindings: Bindings;
        Variables: {
          auth: { userId: string; sessionId: string };
          photographer: { id: string; clerkId: string; email: string; pdpaConsentAt: string | null };
          db: () => ReturnType<typeof createDb>;
          dbTx: () => ReturnType<typeof createDbTx>;
        };
      };

      const app = new Hono<Env>()
        // Mock auth middleware is bypassed when NODE_ENV=test in createClerkAuth
        // But we still need to set up the context variables for downstream middleware
        .use("/*", (c, next) => {
          c.set("auth", { userId: TEST_CLERK_ID, sessionId: "test_session" });
          return next();
        })
        // Set up DB using c.env.DATABASE_URL (from third param of app.request)
        .use("/*", (c, next) => {
          const dbUrl = c.env.DATABASE_URL;
          c.set("db", () => createDb(dbUrl));
          c.set("dbTx", () => createDbTx(dbUrl));
          return next();
        })
        // Mock photographer context
        .use("/*", (c, next) => {
          c.set("photographer", {
            id: TEST_PHOTOGRAPHER_ID,
            clerkId: TEST_CLERK_ID,
            email: `test@workers.com`,
            pdpaConsentAt: null,
          });
          return next();
        })
        // Mount consent router
        .route("/consent", consentRouter);

      // Make request using app.request() - pass mock env with DATABASE_URL
      const res = await app.request("/consent", {
        method: "POST",
        headers: {
          "CF-Connecting-IP": "203.0.113.1",
          "Content-Type": "application/json",
        },
      }, { DATABASE_URL: process.env.DATABASE_URL! }); // Pass env bindings - c.env.DATABASE_URL will be available

      // Verify response
      expect(res.status).toBe(201);

      const body = await res.json() as { data: { consentType: string } };
      expect(body.data.consentType).toBe("pdpa");

      // Verify DB state - both tables should be updated atomically
      const db = createDb(process.env.DATABASE_URL!);

      // 1. Check consent_record was created
      const [consent] = await db
        .select()
        .from(consentRecords)
        .where(eq(consentRecords.photographerId, TEST_PHOTOGRAPHER_ID))
        .limit(1);

      expect(consent).toBeDefined();
      expect(consent?.consentType).toBe("pdpa");
      expect(consent?.ipAddress).toBe("203.0.113.1");

      // 2. Check photographers.pdpa_consent_at was updated
      const [photographer] = await db
        .select()
        .from(photographers)
        .where(eq(photographers.id, TEST_PHOTOGRAPHER_ID))
        .limit(1);

      expect(photographer?.pdpaConsentAt).not.toBeNull();

      console.log(`✓ Neon transactions work in framework-level test`);
    },
    30000
  );
});

// =============================================================================
// Testing Notes
// =============================================================================

/**
 * NODE_ENV Convention:
 * -------------------
 * Vitest automatically sets process.env.NODE_ENV to 'test' during test runs.
 * The createClerkAuth middleware checks for this and injects mock auth:
 *   userId: "test_clerk_user_integration"
 *   sessionId: "test_session_integration"
 *
 * This is the standard testing convention - no custom env vars needed.
 *
 * app.request() vs SELF.fetch():
 * -----------------------------
 * app.request() - Creates test-specific Hono app instance
 * - Can mock middleware individually
 * - Good for unit testing specific routes
 * - Works with vitest workers pool when main entry has Node.js dependencies
 *
 * SELF.fetch() - Calls the actual Worker's default export (src/index.ts)
 * - Tests full request pipeline including all middleware
 * - Most realistic integration test
 * - Requires main entry to work in workers pool (AWS SDK is problematic)
 *
 * For our case, app.request() is sufficient to prove transactions work
 * in the workers runtime, which is the primary goal.
 */
