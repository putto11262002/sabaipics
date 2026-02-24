/**
 * Hard Delete Event (DEV ONLY)
 *
 * Permanently deletes an event and all related data:
 * - Database: 7 tables (face_embeddings cascade, faces, photos, participants, uploads, ftp, event)
 * - R2: Photos, logos, QR codes, selfies
 *
 * Face embeddings cascade-delete with photos (ON DELETE CASCADE).
 * No external service calls needed.
 *
 * WARNING: This is irreversible. Only use in development.
 */

import type { Database } from '@/db';
import {
  events,
  photos,
  faces,
  participantSearches,
  uploadIntents,
  logoUploadIntents,
  ftpCredentials,
} from '@/db';
import { eq, inArray } from 'drizzle-orm';

export interface HardDeleteResult {
  success: boolean;
  eventId: string;
  deleted: {
    database: {
      faces: number;
      photos: number;
      participantSearches: number;
      uploadIntents: number;
      logoUploadIntents: number;
      ftpCredentials: number;
      events: number;
    };
    r2Objects: number;
  };
}

export interface HardDeleteEventsOptions {
  db: Database;
  eventIds: string[];
  r2Bucket: R2Bucket;
}

/**
 * Hard delete multiple events and all related data in parallel.
 *
 * Order of operations (per event):
 * 1. Collect R2 keys from database
 * 2. Delete database records (transaction)
 * 3. Delete R2 objects (parallel, best effort)
 *
 * Events are deleted in parallel using Promise.allSettled for optimal performance.
 */
export async function hardDeleteEvents(options: HardDeleteEventsOptions): Promise<HardDeleteResult[]> {
  const { db, eventIds, r2Bucket } = options;

  // Query events
  const eventDetails = await db
    .select({ id: events.id })
    .from(events)
    .where(inArray(events.id, eventIds));

  // Delete all events in parallel
  const deletionResults = await Promise.allSettled(
    eventDetails.map(async (event) => {
      const eventId = event.id;

      // Step 1: Collect R2 keys before deleting from database
      const [eventPhotos, eventSearches, eventData] = await Promise.all([
        db.select({ r2Key: photos.r2Key })
          .from(photos)
          .where(eq(photos.eventId, eventId)),

        db.select({ selfieR2Key: participantSearches.selfieR2Key })
          .from(participantSearches)
          .where(eq(participantSearches.eventId, eventId)),

        db.select({
          logoR2Key: events.logoR2Key,
          qrCodeR2Key: events.qrCodeR2Key
        })
          .from(events)
          .where(eq(events.id, eventId))
          .limit(1)
          .then(rows => rows[0]),
      ]);

      // Collect all R2 keys (filter out nulls)
      const r2Keys = [
        eventData?.logoR2Key,
        eventData?.qrCodeR2Key,
        ...eventPhotos.map(p => p.r2Key),
        ...eventSearches.map(s => s.selfieR2Key),
      ].filter((key): key is string => Boolean(key));

      // Step 2: Delete from database (transaction for atomicity)
      // face_embeddings cascade-delete with photos (ON DELETE CASCADE)
      // Old faces table still uses RESTRICT, so delete explicitly
      const dbCounts = await db.transaction(async (tx) => {
        const photoRecords = await tx.select({ id: photos.id })
          .from(photos)
          .where(eq(photos.eventId, eventId));
        const photoIdList = photoRecords.map(p => p.id);

        // Delete in dependency order
        const facesDeleted = photoIdList.length > 0
          ? await tx.delete(faces).where(inArray(faces.photoId, photoIdList)).returning({ id: faces.id })
          : [];

        const photosDeleted = await tx.delete(photos)
          .where(eq(photos.eventId, eventId))
          .returning({ id: photos.id });

        const searchesDeleted = await tx.delete(participantSearches)
          .where(eq(participantSearches.eventId, eventId))
          .returning({ id: participantSearches.id });

        const uploadsDeleted = await tx.delete(uploadIntents)
          .where(eq(uploadIntents.eventId, eventId))
          .returning({ id: uploadIntents.id });

        const logoUploadsDeleted = await tx.delete(logoUploadIntents)
          .where(eq(logoUploadIntents.eventId, eventId))
          .returning({ id: logoUploadIntents.id });

        const ftpDeleted = await tx.delete(ftpCredentials)
          .where(eq(ftpCredentials.eventId, eventId))
          .returning({ id: ftpCredentials.id });

        const eventsDeleted = await tx.delete(events)
          .where(eq(events.id, eventId))
          .returning({ id: events.id });

        return {
          faces: facesDeleted.length,
          photos: photosDeleted.length,
          participantSearches: searchesDeleted.length,
          uploadIntents: uploadsDeleted.length,
          logoUploadIntents: logoUploadsDeleted.length,
          ftpCredentials: ftpDeleted.length,
          events: eventsDeleted.length,
        };
      });

      // Step 3: Delete R2 objects (parallel, best effort)
      const r2Results = await Promise.allSettled(
        r2Keys.map(key => r2Bucket.delete(key))
      );

      const r2SuccessCount = r2Results.filter(r => r.status === 'fulfilled').length;

      if (r2Results.some(r => r.status === 'rejected')) {
        console.warn('[HardDelete] Some R2 deletions failed (non-fatal)', {
          eventId,
          total: r2Keys.length,
          succeeded: r2SuccessCount,
          failed: r2Keys.length - r2SuccessCount,
        });
      }

      return {
        success: true,
        eventId,
        deleted: {
          database: dbCounts,
          r2Objects: r2SuccessCount,
        },
      };
    })
  );

  // Handle both successful and failed deletions
  const results: HardDeleteResult[] = deletionResults.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      const eventId = eventDetails[index]?.id || eventIds[index] || 'unknown';
      console.error('[HardDelete] Event deletion failed', {
        eventId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      return {
        success: false,
        eventId,
        deleted: {
          database: {
            faces: 0,
            photos: 0,
            participantSearches: 0,
            uploadIntents: 0,
            logoUploadIntents: 0,
            ftpCredentials: 0,
            events: 0,
          },
          r2Objects: 0,
        },
      };
    }
  });

  return results;
}
