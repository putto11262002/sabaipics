import { timestamp } from 'drizzle-orm/pg-core';

/**
 * Create a timestamptz column per DBSCHEMA-004.
 * Uses string mode with timezone for consistent handling.
 */
export const timestamptz = (name: string) =>
  timestamp(name, { mode: 'string', withTimezone: true });

/**
 * Create a standard createdAt column - non-null with default now().
 */
export const createdAtCol = () =>
  timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow().notNull();
