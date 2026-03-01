import { pgTable, text, index, uuid, jsonb, pgView } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz, createdAtCol } from './common';
import { photographers } from './photographers';

/**
 * Slideshow Configuration Types
 *
 * Defines the structure for event slideshow configurations stored in events.slideshow_config (JSONB).
 */

export interface SlideshowBlock {
  id: string; // Unique block identifier (e.g., "header-1", "gallery-1")
  type: string; // Extensible block type: 'header', 'gallery', 'qr', 'stats', 'social', 'layout', etc.
  enabled: boolean; // Toggle block visibility
  props: Record<string, any>; // Block-specific configuration properties
  children?: SlideshowBlock[]; // Optional: nested blocks for layout containers
}

export interface SlideshowConfig {
  theme: {
    primary: string; // Primary theme color (hex format, e.g., "#0ea5e9")
    background: string; // Background color (hex format, e.g., "#ffffff")
  };
  blocks: SlideshowBlock[]; // Array of blocks to render in the slideshow
}

/**
 * Event Settings
 *
 * Flexible settings blob for per-event configuration that can evolve over time.
 */
export interface EventSettings {
  colorGrade?: {
    autoEdit: boolean;
    autoEditPresetId: string | null;
    autoEditIntensity: number;
    lutId: string | null;
    lutIntensity: number;
    includeLuminance: boolean;
  };
  theme?: {
    primary: string;
    background: string;
  };
  slideshow?: {
    template: string;
  };
}

/**
 * Default slideshow configuration
 * Used when events.slideshow_config is NULL
 */
export const DEFAULT_SLIDESHOW_CONFIG: SlideshowConfig = {
  theme: {
    primary: '#0ea5e9',
    background: '#ffffff',
  },
  blocks: [],
};

export const events = pgTable(
  'events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    photographerId: uuid('photographer_id')
      .notNull()
      .references(() => photographers.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    subtitle: text('subtitle'), // Nullable: Short tagline/slogan for slideshow
    startDate: timestamptz('start_date'),
    endDate: timestamptz('end_date'),
    qrCodeR2Key: text('qr_code_r2_key'), // R2 key for generated QR PNG
    slideshowConfig: jsonb('slideshow_config').$type<SlideshowConfig>(), // Nullable: Slideshow configuration (theme + blocks)
    logoR2Key: text('logo_r2_key'), // Nullable: R2 key for event logo (used in slideshow)
    settings: jsonb('settings').$type<EventSettings>(), // Nullable: Flexible per-event settings (typed at app level)
    expiresAt: timestamptz('expires_at').notNull(),
    deletedAt: timestamptz('deleted_at'), // Nullable: Soft delete timestamp (null = active, set = deleted)
    createdAt: createdAtCol(),
  },
  (table) => [
    index('events_photographer_id_idx').on(table.photographerId),
    index('events_deleted_at_idx').on(table.deletedAt),
    index('events_deleted_at_expires_at_idx').on(table.deletedAt, table.expiresAt),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

/**
 * Active Events View
 *
 * Filters out soft-deleted events (where deleted_at IS NOT NULL).
 * Use this view for all application queries to automatically exclude deleted events.
 * Query the base `events` table directly only for admin/debugging purposes.
 */
export const activeEvents = pgView('active_events').as((qb) =>
  qb
    .select()
    .from(events)
    .where(sql`${events.deletedAt} IS NULL`),
);

export type ActiveEvent = typeof activeEvents.$inferSelect;
