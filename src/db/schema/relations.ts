import { relations } from 'drizzle-orm';
import { photographers } from './photographers';
import { creditLedger } from './credit-ledger';
import { creditAllocations } from './credit-allocations';
import { events } from './events';
import { photos } from './photos';
import { faces } from './faces';
import { consentRecords } from './consent-records';
import { participantSearches } from './participant-searches';
import { giftCodes, giftCodeRedemptions } from './gift-codes';
import { photoLuts } from './photo-luts';
import { lineDeliveries } from './line-deliveries';

// Photographer relations
export const photographersRelations = relations(photographers, ({ many }) => ({
  creditLedgerEntries: many(creditLedger),
  events: many(events),
  consentRecords: many(consentRecords),
  photoLuts: many(photoLuts),
  lineDeliveries: many(lineDeliveries),
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
  participantSearches: many(participantSearches),
  lineDeliveries: many(lineDeliveries),
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
  faces: many(faces),
}));

// Face relations
export const facesRelations = relations(faces, ({ one }) => ({
  photo: one(photos, {
    fields: [faces.photoId],
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

// Participant searches relations
export const participantSearchesRelations = relations(participantSearches, ({ one, many }) => ({
  event: one(events, {
    fields: [participantSearches.eventId],
    references: [events.id],
  }),
  lineDeliveries: many(lineDeliveries),
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
