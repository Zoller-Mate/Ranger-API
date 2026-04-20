import { pgTable, uuid, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './user';
import { camp } from './camp';

export const location = pgTable('locations', {
  userId: uuid('user_id')
    .references(() => user.id)
    .unique(),
  campId: uuid('camp_id').references(() => camp.id),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  lastUpdated: timestamp('last_updated', { withTimezone: true }),
});

export const locationRelations = relations(location, ({ one }) => ({
  user: one(user, {
    fields: [location.userId],
    references: [user.id],
  }),
  camp: one(camp, {
    fields: [location.campId],
    references: [camp.id],
  }),
}));
