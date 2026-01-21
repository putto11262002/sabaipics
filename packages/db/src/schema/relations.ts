import { relations } from "drizzle-orm";
import { photographers } from "./photographers";
import { creditLedger } from "./credit-ledger";
import { events } from "./events";
import { photos } from "./photos";
import { faces } from "./faces";
import { consentRecords } from "./consent-records";
import { participantSearches } from "./participant-searches";

// Photographer relations
export const photographersRelations = relations(photographers, ({ many }) => ({
  creditLedgerEntries: many(creditLedger),
  events: many(events),
  consentRecords: many(consentRecords),
}));

// Credit ledger relations
export const creditLedgerRelations = relations(creditLedger, ({ one }) => ({
  photographer: one(photographers, {
    fields: [creditLedger.photographerId],
    references: [photographers.id],
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
export const participantSearchesRelations = relations(participantSearches, ({ one }) => ({
  event: one(events, {
    fields: [participantSearches.eventId],
    references: [events.id],
  }),
}));
