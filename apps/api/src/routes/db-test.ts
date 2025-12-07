import { Hono } from "hono";
import { createDb } from "@sabaipics/db/client";
import { dbTest } from "@sabaipics/db/schema";

type Bindings = {
  DATABASE_URL: string;
};

export const dbTestRouter = new Hono<{ Bindings: Bindings }>().get("/", async (c) => {
  try {
    const db = createDb(c.env.DATABASE_URL);
    const results = await db.select().from(dbTest);

    return c.json({
      success: true,
      message: "Database connection successful",
      rowCount: results.length,
      data: results,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});
