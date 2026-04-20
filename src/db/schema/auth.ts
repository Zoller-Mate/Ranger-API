import { pgTable, uuid, text, pgEnum, timestamp } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { user } from './user';

export const passwordReset = pgTable('password_resets', {
  userId: uuid('user_id').references(() => user.id),
  token: text('token').primaryKey(),
  expiresAt: timestamp('expires_at').default(
    sql`NOW() + INTERVAL '10 minutes'`,
  ),
});

export const passwordResetRelations = relations(passwordReset, ({ one }) => ({
  user: one(user, {
    fields: [passwordReset.userId],
    references: [user.id],
  }),
}));

export const token = pgTable('tokens', {
  userId: uuid('user_id').references(() => user.id),
  token: text('token').primaryKey(),
});

export const tokenRelations = relations(token, ({ one }) => ({
  user: one(user, {
    fields: [token.userId],
    references: [user.id],
  }),
}));

export const registerToken = pgTable('register_tokens', {
  userId: uuid('user_id').references(() => user.id),
  token: text('token').primaryKey(),
  expiresAt: timestamp('expires_at').default(
    sql`NOW() + INTERVAL '15 minutes'`,
  ),
});

export const registerTokenRelations = relations(registerToken, ({ one }) => ({
  user: one(user, {
    fields: [registerToken.userId],
    references: [user.id],
  })
}))