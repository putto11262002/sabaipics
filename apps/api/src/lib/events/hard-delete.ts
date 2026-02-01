/**
 * Hard Delete Event (DEV ONLY)
 *
 * Permanently deletes an event and all related data:
 * - Database: 7 tables (faces, photos, participants, uploads, ftp, event)
 * - R2: Photos, logos, QR codes, selfies
 * - AWS: Rekognition collection
 *
 * WARNING: This is irreversible. Only use in development.
 */

import type { Database } from '@sabaipics/db';
import {
  events,
  photos,
  faces,
  participantSearches,
  uploadIntents,
  logoUploadIntents,
  ftpCredentials,
} from '@sabaipics/db';
import { eq, inArray } from 'drizzle-orm';

export interface HardDeleteResult {
  success: boolean;
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
    rekognitionCollection: boolean;
  };
}

export interface HardDeleteOptions {
  db: Database;
  eventId: string;
  r2Bucket: R2Bucket;
  rekognitionCollectionId?: string | null;
  deleteRekognition: (collectionId: string) => Promise<void>;
}

/**
 * Hard delete an event and all related data.
 *
 * Order of operations:
 * 1. Collect R2 keys from database
 * 2. Delete database records (transaction)
 * 3. Delete R2 objects (parallel, best effort)
 * 4. Delete Rekognition collection (best effort)
 */
export async function hardDeleteEvent(options: HardDeleteOptions): Promise<HardDeleteResult> {
  const { db, eventId, r2Bucket, rekognitionCollectionId, deleteRekognition } = options;

  // Step 1: Collect R2 keys before deleting from database
  const [eventPhotos, eventSearches, event] = await Promise.all([
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
    event?.logoR2Key,
    event?.qrCodeR2Key,
    ...eventPhotos.map(p => p.r2Key),
    ...eventSearches.map(s => s.selfieR2Key),
  ].filter((key): key is string => Boolean(key));

  // Step 2: Delete from database (transaction for atomicity)
  const dbCounts = await db.transaction(async (tx) => {
    // Get photo IDs for faces deletion
    const photoIds = eventPhotos.map(p => p.r2Key).filter(Boolean);
    const photoRecords = await tx.select({ id: photos.id })
      .from(photos)
      .where(eq(photos.eventId, eventId));
    const photoIdList = photoRecords.map(p => p.id);

    // Delete in dependency order (all FKs are RESTRICT)
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

  // Step 3: Delete R2 objects (parallel, best effort - don't fail if R2 delete fails)
  const r2Results = await Promise.allSettled(
    r2Keys.map(key => r2Bucket.delete(key))
  );

  const r2SuccessCount = r2Results.filter(r => r.status === 'fulfilled').length;

  if (r2Results.some(r => r.status === 'rejected')) {
    console.warn('[HardDelete] Some R2 deletions failed (non-fatal)', {
      total: r2Keys.length,
      succeeded: r2SuccessCount,
      failed: r2Keys.length - r2SuccessCount,
    });
  }

  // Step 4: Delete Rekognition collection (best effort)
  let rekognitionDeleted = false;
  if (rekognitionCollectionId) {
    try {
      await deleteRekognition(rekognitionCollectionId);
      rekognitionDeleted = true;
      console.log('[HardDelete] Rekognition collection deleted', { collectionId: rekognitionCollectionId });
    } catch (error) {
      console.warn('[HardDelete] Rekognition deletion failed (non-fatal)', {
        collectionId: rekognitionCollectionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    success: true,
    deleted: {
      database: dbCounts,
      r2Objects: r2SuccessCount,
      rekognitionCollection: rekognitionDeleted,
    },
  };
}
