import { Hono } from "hono";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { creditPackages } from "@sabaipics/db";
import { requireAdmin } from "../../middleware";
import { zValidator } from "@hono/zod-validator";
import type { Env } from "../../types";

// =============================================================================
// Validation Schemas
// =============================================================================

const createPackageSchema = z.object({
  name: z.string().min(1).max(100),
  credits: z.number().int().positive(),
  priceThb: z.number().int().positive(),
  active: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

const updatePackageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  credits: z.number().int().positive().optional(),
  priceThb: z.number().int().positive().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const uuidSchema = z.string().uuid();

// =============================================================================
// Error Helpers
// =============================================================================

function validationError(message: string, details?: z.ZodIssue[]) {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message,
      ...(details && { details }),
    },
  };
}

function notFoundError(message: string) {
  return {
    error: {
      code: "NOT_FOUND",
      message,
    },
  };
}

// =============================================================================
// Routes
// =============================================================================

export const adminCreditPackagesRouter = new Hono<Env>()
  .use("/*", requireAdmin())
  // GET / - List all packages
  .get("/", async (c) => {
    const db = c.var.db();
    const packages = await db
      .select()
      .from(creditPackages)
      .orderBy(asc(creditPackages.sortOrder));

    return c.json({ data: packages });
  })
  // POST / - Create package
  .post(
    "/",
    zValidator("json", createPackageSchema),
    async (c) => {
      const data = c.req.valid("json");

      const db = c.var.db();
      const [created] = await db
        .insert(creditPackages)
        .values({
          name: data.name,
          credits: data.credits,
          priceThb: data.priceThb,
          active: data.active,
          sortOrder: data.sortOrder,
        })
        .returning();

      return c.json({ data: created }, 201);
    }
  )
  // PATCH /:id - Update package
  .patch(
    "/:id",
    zValidator("json", updatePackageSchema),
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const data = c.req.valid("json");

      const db = c.var.db();

      // Check if package exists
      const [existing] = await db
        .select({ id: creditPackages.id })
        .from(creditPackages)
        .where(eq(creditPackages.id, id))
        .limit(1);

      if (!existing) {
        return c.json(notFoundError("Credit package not found"), 404);
      }

      // Update package
      const [updated] = await db
        .update(creditPackages)
        .set(data)
        .where(eq(creditPackages.id, id))
        .returning();

      return c.json({ data: updated });
    },
  );
