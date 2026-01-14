import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleServerless } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * HTTP adapter - for non-transactional queries (90% of cases)
 *
 * Characteristics:
 * - Fast, stateless connection via HTTP fetch
 * - No transaction support
 * - Ideal for: reads, simple writes, non-critical operations
 *
 * @param connectionString - Neon database connection string from env bindings
 * @returns Drizzle database instance with schema
 */
export function createDbHttp(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

/**
 * Serverless adapter - for transactional queries only
 *
 * Characteristics:
 * - Supports transactions via Neon's serverless driver
 * - Uses HTTP connection with transaction semantics
 * - Uses singleton pattern for connection reuse in CF Workers
 * - Ideal for: multi-step atomic operations
 *
 * Note: This uses drizzle-orm/neon-serverless which accepts a connection
 * string directly and wraps the Neon serverless driver with transaction support.
 *
 * @param connectionString - Neon database connection string from env bindings
 * @returns Drizzle database instance with schema (supports .transaction())
 */
let serverlessDbCache: ReturnType<typeof drizzleServerless> | null = null;

export function createDbTx(connectionString: string) {
  if (serverlessDbCache) return serverlessDbCache;

  // neon-serverless adapter expects connection string directly, not neon() result
  serverlessDbCache = drizzleServerless(connectionString, { schema });
  return serverlessDbCache;
}

/**
 * @deprecated Use createDbHttp() for clarity. Kept for backward compatibility.
 */
export const createDb = createDbHttp;

// Type exports
export type Database = ReturnType<typeof createDbHttp>;
export type DatabaseTx = ReturnType<typeof createDbTx>;
