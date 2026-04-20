import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { camp } from './camp';
import { chat } from './chat';

export const group = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  campId: uuid('camp_id').references(() => camp.id),
  chatId: uuid('chat_id').references(() => chat.id),
  name: varchar('name', { length: 255 }).notNull(),
  color: varchar('color', { length: 7 }),
  joinCode: varchar('join_code', { length: 12 }).unique(),
});

export const groupRelations = relations(group, ({ one }) => ({
  camp: one(camp, {
    fields: [group.campId],
    references: [camp.id],
  }),
  chat: one(chat, {
    fields: [group.chatId],
    references: [chat.id],
  }),
}));
