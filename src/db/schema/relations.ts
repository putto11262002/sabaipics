import { relations } from 'drizzle-orm';
import { photographers } from './photographers';
import { creditLedger } from './credit-ledger';
import { creditAllocations } from './credit-allocations';
import { events } from './events';
import { photos } from './photos';
import { faceEmbeddings } from './face-embeddings';
import { consentRecords } from './consent-records';
import { participantSessions } from './participant-sessions';
import { selfies } from './selfies';
import { participantSearches } from './participant-searches';
import { downloads } from './downloads';
import { giftCodes, giftCodeRedemptions } from './gift-codes';
import { photoLuts } from './photo-luts';
import { lineDeliveries } from './line-deliveries';
import { uploadIntents } from './upload-intents';
import { photoJobs } from './photo-jobs';

// Photographer relations
export const photographersRelations = relations(photographers, ({ many }) => ({
  creditLedgerEntries: many(creditLedger),
  events: many(events),
  consentRecords: many(consentRecords),
  photoLuts: many(photoLuts),
  lineDeliveries: many(lineDeliveries),
  photoJobs: many(photoJobs),
}));

// Credit ledger relations
export const creditLedgerRelations = relations(creditLedger, ({ one, many }) => ({
  photographer: one(photographers, {
    fields: [creditLedger.photographerId],
    references: [photographers.id],
  }),
  debitAllocations: many(creditAllocations, { relationName: 'debitEntry' }),
  creditAllocations: many(creditAllocations, { relationName: 'creditEntry' }),
}));

// Credit allocation relations
export const creditAllocationsRelations = relations(creditAllocations, ({ one }) => ({
  debitLedgerEntry: one(creditLedger, {
    fields: [creditAllocations.debitLedgerEntryId],
    references: [creditLedger.id],
    relationName: 'debitEntry',
  }),
  creditLedgerEntry: one(creditLedger, {
    fields: [creditAllocations.creditLedgerEntryId],
    references: [creditLedger.id],
    relationName: 'creditEntry',
  }),
}));

// Event relations
export const eventsRelations = relations(events, ({ one, many }) => ({
  photographer: one(photographers, {
    fields: [events.photographerId],
    references: [photographers.id],
  }),
  photos: many(photos),
  photoJobs: many(photoJobs),
  participantSearches: many(participantSearches),
  lineDeliveries: many(lineDeliveries),
}));

export const photoJobsRelations = relations(photoJobs, ({ one }) => ({
  uploadIntent: one(uploadIntents, {
    fields: [photoJobs.uploadIntentId],
    references: [uploadIntents.id],
  }),
  event: one(events, {
    fields: [photoJobs.eventId],
    references: [events.id],
  }),
  photographer: one(photographers, {
    fields: [photoJobs.photographerId],
    references: [photographers.id],
  }),
}));

// Photo LUT relations
export const photoLutsRelations = relations(photoLuts, ({ one }) => ({
  photographer: one(photographers, {
    fields: [photoLuts.photographerId],
    references: [photographers.id],
  }),
}));

// Photo relations
export const photosRelations = relations(photos, ({ one, many }) => ({
  event: one(events, {
    fields: [photos.eventId],
    references: [events.id],
  }),
  faceEmbeddings: many(faceEmbeddings),
}));

// Face embedding relations (pgvector)
export const faceEmbeddingsRelations = relations(faceEmbeddings, ({ one }) => ({
  photo: one(photos, {
    fields: [faceEmbeddings.photoId],
    references: [photos.id],
  }),
}));

// Consent records relations
export const consentRecordsRelations = relations(consentRecords, ({ one }) => ({
  photographer: one(photographers, {
    fields: [consentRecords.photographerId],
    references: [photographers.id],
  }),
}));

// Participant session relations
export const participantSessionsRelations = relations(participantSessions, ({ many }) => ({
  selfies: many(selfies),
  searches: many(participantSearches),
  downloads: many(downloads),
  lineDeliveries: many(lineDeliveries),
}));

// Selfie relations
export const selfiesRelations = relations(selfies, ({ one, many }) => ({
  session: one(participantSessions, {
    fields: [selfies.sessionId],
    references: [participantSessions.id],
  }),
  searches: many(participantSearches),
}));

// Participant searches relations
export const participantSearchesRelations = relations(participantSearches, ({ one, many }) => ({
  session: one(participantSessions, {
    fields: [participantSearches.sessionId],
    references: [participantSessions.id],
  }),
  selfie: one(selfies, {
    fields: [participantSearches.selfieId],
    references: [selfies.id],
  }),
  event: one(events, {
    fields: [participantSearches.eventId],
    references: [events.id],
  }),
  lineDeliveries: many(lineDeliveries),
  downloads: many(downloads),
}));

// Download relations
export const downloadsRelations = relations(downloads, ({ one }) => ({
  session: one(participantSessions, {
    fields: [downloads.sessionId],
    references: [participantSessions.id],
  }),
  search: one(participantSearches, {
    fields: [downloads.searchId],
    references: [participantSearches.id],
  }),
  event: one(events, {
    fields: [downloads.eventId],
    references: [events.id],
  }),
}));

// Gift code relations
export const giftCodesRelations = relations(giftCodes, ({ many }) => ({
  redemptions: many(giftCodeRedemptions),
}));

// Gift code redemption relations
export const giftCodeRedemptionsRelations = relations(giftCodeRedemptions, ({ one }) => ({
  giftCode: one(giftCodes, {
    fields: [giftCodeRedemptions.giftCodeId],
    references: [giftCodes.id],
  }),
  photographer: one(photographers, {
    fields: [giftCodeRedemptions.photographerId],
    references: [photographers.id],
  }),
  creditLedgerEntry: one(creditLedger, {
    fields: [giftCodeRedemptions.creditLedgerEntryId],
    references: [creditLedger.id],
  }),
}));

// LINE delivery relations
export const lineDeliveriesRelations = relations(lineDeliveries, ({ one }) => ({
  session: one(participantSessions, {
    fields: [lineDeliveries.sessionId],
    references: [participantSessions.id],
  }),
  photographer: one(photographers, {
    fields: [lineDeliveries.photographerId],
    references: [photographers.id],
  }),
  event: one(events, {
    fields: [lineDeliveries.eventId],
    references: [events.id],
  }),
  search: one(participantSearches, {
    fields: [lineDeliveries.searchId],
    references: [participantSearches.id],
  }),
  creditLedgerEntry: one(creditLedger, {
    fields: [lineDeliveries.creditLedgerEntryId],
    references: [creditLedger.id],
  }),
}));
