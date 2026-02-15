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
 * - Uses WebSocket connection with transaction semantics
 * - Ideal for: multi-step atomic operations
 *
 * IMPORTANT: In Cloudflare Workers queue consumers, create a fresh connection
 * per message to avoid cross-request I/O errors. WebSocket connections cannot
 * be shared across request contexts.
 *
 * Note: This uses drizzle-orm/neon-serverless which accepts a connection
 * string directly and wraps the Neon serverless driver with transaction support.
 *
 * @param connectionString - Neon database connection string from env bindings
 * @returns Drizzle database instance with schema (supports .transaction())
 */
export function createDbTx(connectionString: string) {
  // No caching - each call creates a fresh connection
  // This is required for CF Workers queue consumers to avoid cross-request I/O errors
  return drizzleServerless(connectionString, { schema });
}

/**
 * @deprecated Use createDbHttp() for clarity. Kept for backward compatibility.
 */
export const createDb = createDbHttp;

// Type exports
export type Database = ReturnType<typeof createDbHttp>;
export type DatabaseTx = ReturnType<typeof createDbTx>;
