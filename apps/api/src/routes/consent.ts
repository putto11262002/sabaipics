import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { consentRecords, photographers } from "@sabaipics/db";
import { requirePhotographer, type PhotographerVariables } from "../middleware";
import type { Bindings } from "../types";

// =============================================================================
// Types
// =============================================================================

type Env = {
  Bindings: Bindings;
  Variables: PhotographerVariables;
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

    const db = c.var.db();

    // Get client IP from Cloudflare header
    const ipAddress = c.req.header("CF-Connecting-IP") ?? null;

    // Insert consent record and update photographer
    const now = new Date().toISOString();

    const [consentRecord] = await db
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

    await db
      .update(photographers)
      .set({ pdpaConsentAt: now })
      .where(eq(photographers.id, photographer.id));

    return c.json({ data: consentRecord }, 201);
  });
