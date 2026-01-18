import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { consentRecords, photographers, type DatabaseTx } from "@sabaipics/db";
import { requirePhotographer, type PhotographerVariables } from "../middleware";
import type { Bindings } from "../types";

// =============================================================================
// Types
// =============================================================================

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables & {
    dbTx: () => DatabaseTx;
  };
};

// =============================================================================
// Error Helpers
// =============================================================================

function alreadyConsentedError() {
  return {
    error: {
      code: "ALREADY_CONSENTED",
      message: "PDPA consent already recorded",
    },
  };
}

// =============================================================================
// Routes
// =============================================================================

export const consentRouter = new Hono<Env>()
  // GET / - Check consent status
  .get("/", requirePhotographer(), (c) => {
    const photographer = c.var.photographer;
    return c.json({
      data: {
        isConsented: !!photographer.pdpaConsentAt,
        consentedAt: photographer.pdpaConsentAt,
      },
    });
  })
  // POST / - Record PDPA consent
  .post("/", requirePhotographer(), async (c) => {
    const photographer = c.var.photographer;

    // Check if already consented
    if (photographer.pdpaConsentAt) {
      return c.json(alreadyConsentedError(), 409);
    }

    const dbTx = c.var.dbTx();

    // Get client IP from Cloudflare header
    const ipAddress = c.req.header("CF-Connecting-IP") ?? null;

    // Transaction: Insert consent record + update photographer
    const now = new Date().toISOString();

    const consentRecord = await dbTx.transaction(async (tx) => {
      // Insert consent record
      const [record] = await tx
        .insert(consentRecords)
        .values({
          photographerId: photographer.id,
          consentType: "pdpa",
          ipAddress,
        })
        .returning({
          id: consentRecords.id,
          consentType: consentRecords.consentType,
          createdAt: consentRecords.createdAt,
        });

      // Update photographer with consent timestamp
      await tx
        .update(photographers)
        .set({ pdpaConsentAt: now })
        .where(eq(photographers.id, photographer.id));

      return record;
    });

    return c.json({ data: consentRecord }, 201);
  });
