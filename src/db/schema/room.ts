import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { camp } from './camp';
import { chat } from './chat';

export const room = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  campId: uuid('camp_id').references(() => camp.id),
  chatId: uuid('chat_id').references(() => chat.id),
  name: varchar('name', { length: 255 }),
  joinCode: varchar('join_code', { length: 12 }).unique(),
  color: varchar('color', { length: 7 }),
});

export const roomRelations = relations(room, ({ one }) => ({
  camp: one(camp, {
    fields: [room.campId],
    references: [camp.id],
  }),
  chat: one(chat, {
    fields: [room.chatId],
    references: [chat.id],
  }),
}));
