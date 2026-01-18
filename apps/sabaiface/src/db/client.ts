import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Creates a database client instance for SabaiFace internal database.
 *
 * Uses Neon serverless driver optimized for Neon PostgreSQL.
 *
 * @param connectionString - PostgreSQL connection string (Neon DATABASE_URL)
 * @returns Drizzle database instance with schema
 */
export function createInternalDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

export type InternalDatabase = ReturnType<typeof createInternalDb>;
