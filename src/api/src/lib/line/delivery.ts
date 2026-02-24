/**
 * LINE Photo Delivery
 *
 * Core orchestration for pushing event photos to participants via LINE Messaging API.
 * Handles photo cap, monthly allowance, credit charging, and message batching.
 */

import type { Database, DatabaseTx } from '@/db';
import {
  participantSearches,
  events,
  photographers,
  photos,
  lineDeliveries,
} from '@/db';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { ResultAsync, ok, err } from 'neverthrow';
import type { messagingApi } from '@line/bot-sdk';
import { getMonthlyUsage, FREE_MONTHLY_LINE_MESSAGES } from './allowance';
import { debitCredits } from '../credits/debit';
import type { PhotographerSettings } from '@/db/schema/photographers';

// =============================================================================
// Types
// =============================================================================

export type DeliveryError =
  | { type: 'not_found'; resource: string }
  | { type: 'already_delivered'; existing: { photoCount: number; messageCount: number } }
  | { type: 'no_friendship' }
  | { type: 'overage_disabled' }
  | { type: 'insufficient_credits' }
  | { type: 'rate_limited' }
  | { type: 'line_api'; cause: unknown }
  | { type: 'database'; cause: unknown };

export interface DeliverPhotosParams {
  searchId: string;
  lineUserId: string;
  db: Database;
  dbTx: DatabaseTx;
  lineClient: messagingApi.MessagingApiClient;
  r2BaseUrl: string;
  cfZone: string;
  isDev: boolean;
}

export interface DeliveryResult {
  status: 'sent' | 'partial';
  photoCount: number;
  messageCount: number;
  creditCharged: boolean;
}

// =============================================================================
// Image URL Helpers
// =============================================================================

function buildOriginalUrl(r2Key: string, cfZone: string, r2BaseUrl: string, isDev: boolean): string {
  if (isDev) return `${r2BaseUrl}/${r2Key}`;
  return `https://${cfZone}/cdn-cgi/image/width=2048,fit=contain,format=jpeg,quality=90/${r2BaseUrl}/${r2Key}`;
}

function buildPreviewUrl(r2Key: string, cfZone: string, r2BaseUrl: string, isDev: boolean): string {
  if (isDev) return `${r2BaseUrl}/${r2Key}`;
  return `https://${cfZone}/cdn-cgi/image/width=460,fit=cover,format=jpeg,quality=75/${r2BaseUrl}/${r2Key}`;
}

// =============================================================================
// Message Builder
// =============================================================================

interface PhotoRecord {
  id: string;
  r2Key: string;
}

/**
 * Build LINE image messages from photo records, batched in groups of 5.
 * LINE Push API allows max 5 messages per pushMessage call.
 */
export function buildImageMessageBatches(
  photoRecords: PhotoRecord[],
  cfZone: string,
  r2BaseUrl: string,
  isDev: boolean,
): messagingApi.ImageMessage[][] {
  const messages: messagingApi.ImageMessage[] = photoRecords.map((photo) => ({
    type: 'image' as const,
    originalContentUrl: buildOriginalUrl(photo.r2Key, cfZone, r2BaseUrl, isDev),
    previewImageUrl: buildPreviewUrl(photo.r2Key, cfZone, r2BaseUrl, isDev),
  }));

  const batches: messagingApi.ImageMessage[][] = [];
  for (let i = 0; i < messages.length; i += 5) {
    batches.push(messages.slice(i, i + 5));
  }
  return batches;
}

// =============================================================================
// Core Delivery
// =============================================================================

/**
 * Deliver photos to a LINE user via push messages.
 *
 * Flow:
 * 1. Look up search → matchedPhotoIds
 * 2. Look up event → photographerId
 * 3. Look up photographer settings → photoCap, overageEnabled
 * 4. Apply photo cap
 * 5. Fetch photo records
 * 6. Build image messages in batches of 5
 * 7. Calculate message count
 * 8. Check monthly allowance
 * 9. Handle paid messages (credit debit)
 * 10. Push messages via LINE API
 * 11. Insert line_deliveries record
 */
export function deliverPhotosViaLine(
  params: DeliverPhotosParams,
): ResultAsync<DeliveryResult, DeliveryError> {
  const { searchId, lineUserId, db, dbTx, lineClient, r2BaseUrl, cfZone, isDev } = params;

  return ResultAsync.fromPromise(
    (async (): Promise<DeliveryResult> => {
      // Step 1: Look up search
      const [search] = await db
        .select({
          id: participantSearches.id,
          eventId: participantSearches.eventId,
          matchedPhotoIds: participantSearches.matchedPhotoIds,
        })
        .from(participantSearches)
        .where(eq(participantSearches.id, searchId))
        .limit(1);

      if (!search) throw makeError('not_found', 'search');
      if (!search.matchedPhotoIds || search.matchedPhotoIds.length === 0) {
        throw makeError('not_found', 'photos');
      }

      // Idempotency: check if already delivered for this searchId + lineUserId
      const [existingDelivery] = await db
        .select({
          status: lineDeliveries.status,
          photoCount: lineDeliveries.photoCount,
          messageCount: lineDeliveries.messageCount,
        })
        .from(lineDeliveries)
        .where(
          and(
            eq(lineDeliveries.searchId, searchId),
            eq(lineDeliveries.lineUserId, lineUserId),
            eq(lineDeliveries.status, 'sent'),
          ),
        )
        .limit(1);

      if (existingDelivery) {
        throw {
          type: 'already_delivered' as const,
          existing: {
            photoCount: existingDelivery.photoCount,
            messageCount: existingDelivery.messageCount,
          },
        };
      }

      // Step 2: Look up event → photographerId
      const [event] = await db
        .select({
          id: events.id,
          photographerId: events.photographerId,
        })
        .from(events)
        .where(eq(events.id, search.eventId))
        .limit(1);

      if (!event) throw makeError('not_found', 'event');

      // Step 3: Look up photographer settings
      const [photographer] = await db
        .select({ settings: photographers.settings })
        .from(photographers)
        .where(eq(photographers.id, event.photographerId))
        .limit(1);

      const lineSettings = (photographer?.settings as PhotographerSettings | null)?.lineSettings;
      const photoCap = lineSettings?.photoCap ?? null;
      const overageEnabled = lineSettings?.overageEnabled ?? false;

      // Step 4: Apply photo cap
      let photoIds = [...new Set(search.matchedPhotoIds)];
      if (photoCap !== null && photoIds.length > photoCap) {
        photoIds = photoIds.slice(0, photoCap);
      }

      console.log('[LINE deliver] matchedPhotoIds:', search.matchedPhotoIds.length, 'deduped:', photoIds.length);

      // Step 5: Fetch photo records
      const photoRecords = await db
        .select({ id: photos.id, r2Key: photos.r2Key })
        .from(photos)
        .where(
          and(
            inArray(photos.id, photoIds),
            eq(photos.status, 'indexed'),
            isNull(photos.deletedAt),
          ),
        );

      console.log('[LINE deliver] photoRecords from DB:', photoRecords.length);

      if (photoRecords.length === 0) throw makeError('not_found', 'photos');

      // Step 6: Build message batches
      const batches = buildImageMessageBatches(photoRecords, cfZone, r2BaseUrl, isDev);
      const messageCount = batches.length;

      // Step 7: Check monthly allowance
      const usage = await getMonthlyUsage(db, event.photographerId).match(
        (u) => u,
        (e) => { throw e; },
      );

      const freeRemaining = usage.remaining;
      const paidMessages = Math.max(0, messageCount - freeRemaining);

      // Step 8: Handle paid messages
      let creditCharged = false;
      let creditLedgerEntryId: string | null = null;

      if (paidMessages > 0) {
        if (!overageEnabled) {
          throw { type: 'overage_disabled' as const };
        }

        // Debit credits in a transaction
        const debitResult = await dbTx.transaction(async (tx) => {
          return debitCredits(tx, {
            photographerId: event.photographerId,
            amount: paidMessages,
            operationType: 'line_delivery',
            operationId: searchId,
            source: 'line_delivery',
          }).match(
            (r) => r,
            (e) => { throw e; },
          );
        });

        creditCharged = true;
        creditLedgerEntryId = debitResult.debitLedgerEntryId;
      }

      // Step 9: Push messages
      let sentMessages = 0;
      let sentPhotos = 0;

      for (const batch of batches) {
        try {
          await lineClient.pushMessage({
            to: lineUserId,
            messages: batch,
          });
          sentMessages++;
          sentPhotos += batch.length;
        } catch (e: any) {
          // If this is a 429, record partial and surface rate limit
          if (e?.statusCode === 429) {
            if (sentMessages > 0) {
              await insertDeliveryRecord(db, {
                photographerId: event.photographerId,
                eventId: event.id,
                searchId,
                lineUserId,
                messageCount: sentMessages,
                photoCount: sentPhotos,
                creditCharged,
                creditLedgerEntryId,
                status: 'partial',
                errorMessage: 'Rate limited by LINE API',
              });
              return { status: 'partial', photoCount: sentPhotos, messageCount: sentMessages, creditCharged };
            }
            throw { type: 'rate_limited' as const };
          }
          // Other errors: if we sent some, record partial
          if (sentMessages > 0) {
            await insertDeliveryRecord(db, {
              photographerId: event.photographerId,
              eventId: event.id,
              searchId,
              lineUserId,
              messageCount: sentMessages,
              photoCount: sentPhotos,
              creditCharged,
              creditLedgerEntryId,
              status: 'partial',
              errorMessage: e instanceof Error ? e.message : 'LINE API error',
            });
            return { status: 'partial', photoCount: sentPhotos, messageCount: sentMessages, creditCharged };
          }
          throw { type: 'line_api' as const, cause: e };
        }
      }

      // Step 10: Record delivery
      await insertDeliveryRecord(db, {
        photographerId: event.photographerId,
        eventId: event.id,
        searchId,
        lineUserId,
        messageCount: sentMessages,
        photoCount: sentPhotos,
        creditCharged,
        creditLedgerEntryId,
        status: 'sent',
        errorMessage: null,
      });

      return { status: 'sent', photoCount: sentPhotos, messageCount: sentMessages, creditCharged };
    })(),
    (cause): DeliveryError => {
      // Pass through typed errors
      if (cause && typeof cause === 'object' && 'type' in cause) {
        return cause as DeliveryError;
      }
      return { type: 'database', cause };
    },
  );
}

// =============================================================================
// Helpers
// =============================================================================

function makeError(type: 'not_found', resource: string): DeliveryError {
  return { type, resource };
}

interface InsertDeliveryParams {
  photographerId: string;
  eventId: string;
  searchId: string;
  lineUserId: string;
  messageCount: number;
  photoCount: number;
  creditCharged: boolean;
  creditLedgerEntryId: string | null;
  status: 'sent' | 'partial' | 'failed';
  errorMessage: string | null;
}

async function insertDeliveryRecord(db: Database, params: InsertDeliveryParams): Promise<void> {
  await db.insert(lineDeliveries).values({
    photographerId: params.photographerId,
    eventId: params.eventId,
    searchId: params.searchId,
    lineUserId: params.lineUserId,
    messageCount: params.messageCount,
    photoCount: params.photoCount,
    creditCharged: params.creditCharged,
    creditLedgerEntryId: params.creditLedgerEntryId,
    status: params.status,
    errorMessage: params.errorMessage,
  });
}
