import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * Creates a database client instance for local development with standard PostgreSQL
 * @param connectionString - Standard PostgreSQL connection string (postgresql://user:password@host:port/dbname)
 * @returns Drizzle database instance with schema
 */
export function createLocalDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type LocalDatabase = ReturnType<typeof createLocalDb>;
