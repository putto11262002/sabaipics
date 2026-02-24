import { createDbTx, photographers, events, consentRecords, uploadIntents } from '@/db';
import { and, lt, isNotNull, eq } from 'drizzle-orm';
import type { Bindings } from '../types';
import { hardDeleteEvents } from '../lib/services/events/hard-delete';
import { createFaceProvider } from '../lib/rekognition';
import { createStripeClient } from '../lib/stripe/client';
import { deleteAllCredits } from '../lib/credits';

interface PhotographerCleanupResult {
  photographersHardDeleted: number;
  photographerIds: string[];
  eventsDeleted: number;
}

/**
 * Photographer Hard Delete Cleanup (PERMANENT DELETE):
 * 1. Query soft-deleted photographers older than grace period (default: 30 days)
 * 2. For each photographer, permanently delete:
 *    - All their events (using hardDeleteEvents - includes R2, Rekognition)
 *    - Credit ledger entries
 *    - Consent records
 *    - Upload intents
 *    - Stripe customer (if exists)
 *    - Photographer record
 * 3. Process in batches to avoid timeouts
 *
 * Runs daily at 5 AM Bangkok time (10 PM UTC)
 *
 * WARNING: This is irreversible. Photographers and their events are permanently deleted after the grace period.
 */
export async function photographerCleanup(env: Bindings): Promise<PhotographerCleanupResult> {
  const startTime = Date.now();
  const graceDays = env.HARD_DELETE_GRACE_DAYS ? parseInt(env.HARD_DELETE_GRACE_DAYS, 10) : 30;
  const batchSize = env.HARD_DELETE_BATCH_SIZE ? parseInt(env.HARD_DELETE_BATCH_SIZE, 10) : 5;

  console.log('[PhotographerCleanup] Cron started', {
    timestamp: new Date().toISOString(),
    graceDays,
    batchSize,
  });

  const db = createDbTx(env.DATABASE_URL);

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - graceDays);

  // Find soft-deleted photographers older than grace period
  const candidates = await db
    .select({
      id: photographers.id,
      clerkId: photographers.clerkId,
      stripeCustomerId: photographers.stripeCustomerId,
    })
    .from(photographers)
    .where(
      and(
        isNotNull(photographers.deletedAt),
        lt(photographers.deletedAt, cutoffDate.toISOString()),
      ),
    )
    .limit(batchSize);

  if (candidates.length === 0) {
    console.log('[PhotographerCleanup] No photographers to hard-delete');
    return {
      photographersHardDeleted: 0,
      photographerIds: [],
      eventsDeleted: 0,
    };
  }

  console.log('[PhotographerCleanup] Found candidates for hard deletion', {
    count: candidates.length,
    photographerIds: candidates.map((p) => p.id),
  });

  // Create providers
  const faceProvider = createFaceProvider(env);
  const deleteRekognition = async (collectionId: string): Promise<void> => {
    await faceProvider.deleteCollection(collectionId).match(
      () => undefined,
      (error) => {
        throw new Error(`Rekognition deletion failed: ${error.type}`);
      },
    );
  };

  const stripe = env.STRIPE_SECRET_KEY ? createStripeClient(env) : null;

  // Track results
  const photographersDeleted: string[] = [];
  let totalEventsDeleted = 0;

  // Process each photographer
  for (const photographer of candidates) {
    try {
      console.log('[PhotographerCleanup] Processing photographer', {
        photographerId: photographer.id,
        clerkId: photographer.clerkId,
      });

      // Step 1: Find all their events (soft-deleted or not)
      const photographerEvents = await db
        .select({ id: events.id })
        .from(events)
        .where(eq(events.photographerId, photographer.id));

      // Step 2: Hard delete all events (if any)
      if (photographerEvents.length > 0) {
        const eventIds = photographerEvents.map((e) => e.id);
        console.log('[PhotographerCleanup] Deleting photographer events', {
          photographerId: photographer.id,
          eventCount: eventIds.length,
          eventIds,
        });

        const eventDeleteResult = await hardDeleteEvents({
          db,
          eventIds,
          r2Bucket: env.PHOTOS_BUCKET,
          deleteRekognition,
        });

        // Check if event deletion succeeded
        await eventDeleteResult.match(
          (results) => {
            const successes = results.filter((r) => r.success);
            const failures = results.filter((r) => !r.success);

            if (failures.length > 0) {
              console.error('[PhotographerCleanup] Some events failed to delete', {
                photographerId: photographer.id,
                succeeded: successes.length,
                failed: failures.length,
                failedEventIds: failures.map((r) => r.eventId),
              });
              throw new Error(
                `Failed to delete ${failures.length}/${eventIds.length} events for photographer ${photographer.id}`,
              );
            }

            totalEventsDeleted += successes.length;
            console.log('[PhotographerCleanup] Events deleted successfully', {
              photographerId: photographer.id,
              eventsDeleted: successes.length,
            });
          },
          (error) => {
            throw new Error(`Event deletion failed: ${error.type}`);
          },
        );
      }

      // Step 3: Delete photographer dependencies and record (in transaction)
      await db.transaction(async (tx) => {
        // Delete in FK order (credit_allocations → credit_ledger)
        const creditDeletedCount = await deleteAllCredits(tx, photographer.id).match(
          (count) => count,
          (e) => {
            throw e.cause ?? new Error(`Credit cleanup failed: ${e.type}`);
          },
        );

        const consentDeleted = await tx
          .delete(consentRecords)
          .where(eq(consentRecords.photographerId, photographer.id))
          .returning({ id: consentRecords.id });

        const uploadsDeleted = await tx
          .delete(uploadIntents)
          .where(eq(uploadIntents.photographerId, photographer.id))
          .returning({ id: uploadIntents.id });

        await tx.delete(photographers).where(eq(photographers.id, photographer.id));

        console.log('[PhotographerCleanup] Photographer dependencies deleted', {
          photographerId: photographer.id,
          creditLedger: creditDeletedCount,
          consentRecords: consentDeleted.length,
          uploadIntents: uploadsDeleted.length,
        });
      });

      // Step 4: Cancel Stripe customer (outside transaction, best effort)
      if (stripe && photographer.stripeCustomerId) {
        try {
          await stripe.customers.del(photographer.stripeCustomerId);
          console.log('[PhotographerCleanup] Stripe customer deleted', {
            photographerId: photographer.id,
            stripeCustomerId: photographer.stripeCustomerId,
          });
        } catch (stripeError) {
          console.warn('[PhotographerCleanup] Stripe customer deletion failed (non-fatal)', {
            photographerId: photographer.id,
            stripeCustomerId: photographer.stripeCustomerId,
            error: stripeError instanceof Error ? stripeError.message : String(stripeError),
          });
        }
      }

      photographersDeleted.push(photographer.id);
      console.log('[PhotographerCleanup] Photographer hard deleted', {
        photographerId: photographer.id,
        clerkId: photographer.clerkId,
      });
    } catch (error) {
      // Log error but continue with other photographers
      console.error('[PhotographerCleanup] Photographer deletion failed', {
        photographerId: photographer.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Final summary
  const duration = Date.now() - startTime;
  console.log('[PhotographerCleanup] Cron completed', {
    photographersHardDeleted: photographersDeleted.length,
    photographerIds: photographersDeleted,
    eventsDeleted: totalEventsDeleted,
    durationMs: duration,
  });

  return {
    photographersHardDeleted: photographersDeleted.length,
    photographerIds: photographersDeleted,
    eventsDeleted: totalEventsDeleted,
  };
}
