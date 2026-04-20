import {
  pgTable,
  uuid,
  varchar,
  date,
  integer,
  pgEnum,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { chat } from './chat';
import { user } from './user';
import { group } from './group';
import { room } from './room';
import { payment } from './payment';

export const memberCampRole = pgEnum('member_camp_role', [
  'Owner',
  'Staff',
  'Camper',
  'Pending',
]);

export const camp = pgTable('camps', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  minGroupSize: integer('min_group_size'),
  chatId: uuid('chat_id').references(() => chat.id),
  staffChatId: uuid('staff_chat_id').references(() => chat.id),
  joinCode: varchar('join_code', { length: 12 }).unique(),
});

export const campRelations = relations(camp, ({ one, many }) => ({
  chat: one(chat, {
    fields: [camp.chatId, camp.staffChatId],
    references: [chat.id, chat.id],
  }),
  groups: many(group),
  rooms: many(room),
  payments: many(payment),
  members: many(memberToCamp),
}));

export const memberToCamp = pgTable('member_to_camp', {
  userId: uuid('user_id').references(() => user.id),
  campId: uuid('camp_id').references(() => camp.id),
  roomId: uuid('room_id').references(() => room.id),
  groupId: uuid('group_id').references(() => group.id),
  role: memberCampRole('role').default('Pending'),
});

export const memberToCampRelations = relations(memberToCamp, ({ one }) => ({
  user: one(user, {
    fields: [memberToCamp.userId],
    references: [user.id],
  }),
  camp: one(camp, {
    fields: [memberToCamp.campId],
    references: [camp.id],
  }),
  room: one(room, {
    fields: [memberToCamp.roomId],
    references: [room.id],
  }),
  group: one(group, {
    fields: [memberToCamp.groupId],
    references: [group.id],
  }),
}));
