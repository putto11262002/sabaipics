import { createDb as createDbClient } from "@sabaipics/db/client";

/**
 * Get database client from Hono context
 * @param c - Hono context with DATABASE_URL binding
 * @returns Drizzle database instance
 */
export function getDb(c: { env: { DATABASE_URL: string } }) {
  return createDbClient(c.env.DATABASE_URL);
}
