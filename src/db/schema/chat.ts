import {
  pgTable,
  uuid,
  timestamp,
  jsonb,
  boolean,
  varchar,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, InferSelectModel } from 'drizzle-orm';
import { user } from './user';
import { camp } from './camp';

export const chat = pgTable('chats', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
});

export const chatRelations = relations(chat, ({ many }) => ({
  members: many(chatMember),
  messages: many(message),
  camps: many(camp),
}));

export const message = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatId: uuid('chat_id').references(() => chat.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => user.id, { onDelete: 'cascade' }),
    body: jsonb('body').notNull(),
    replyToMessageId: uuid('reply_to_message_id').references(
      (): any => message.id,
      {
        onDelete: 'set null',
      },
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    chatCreatedIdx: index('idx_messages_chat_created').on(
      table.chatId,
      table.createdAt,
    ),
    replyToIdx: index('idx_messages_reply_to').on(table.replyToMessageId),
  }),
);

export const chatMember = pgTable('chat_members', {
  chatId: uuid('chat_id').references(() => chat.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => user.id, { onDelete: 'cascade' }).notNull(),
  lastViewed: timestamp('last_viewed', { withTimezone: true }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.chatId] }),
}));

export const chatMemberRelations = relations(chatMember, ({ one }) => ({
  chat: one(chat, {
    fields: [chatMember.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [chatMember.userId],
    references: [user.id],
  }),
}));

export const messageRelations = relations(message, ({ one }) => ({
  chat: one(chat, {
    fields: [message.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [message.userId],
    references: [user.id],
  }),
  replyToMessage: one(message, {
    fields: [message.replyToMessageId],
    references: [message.id],
  }),
}));
