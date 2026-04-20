import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { passwordReset, registerToken, token } from './auth';
import { location } from './location';
import { memberToCamp } from './camp';
import { chatMember, message } from './chat';
import { userPayment } from './payment';

export const user = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  profilePic: text('profile_pic'),
  dateOfBirth: date('date_of_birth'),
  phoneNumber: text('phone_number'),
  emergencyContact: text('emergency_contact'),
  passwordResetAt: timestamp('password_reset_at', {
    withTimezone: true,
  }).defaultNow(),
  validated: boolean("validated").default(false),
});

export const userRelations = relations(user, ({ one, many }) => ({
  passwordReset: one(passwordReset, {
    fields: [user.id],
    references: [passwordReset.userId],
  }),
  tokens: many(token),
  location: one(location, {
    fields: [user.id],
    references: [location.userId],
  }),
  memberToCamps: many(memberToCamp),
  chatMembers: many(chatMember),
  messages: many(message),
  userPayments: many(userPayment),
  onlineStatus: one(userOnlineStatus, {
    fields: [user.id],
    references: [userOnlineStatus.userId],
  }),
  registerToken: one(registerToken, {
    fields: [user.id],
    references: [registerToken.userId],
  }),
}));


// Online status tracking table
export const userOnlineStatus = pgTable(
  'user_online_status',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    isOnline: boolean('is_online').default(false).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    updatedIdx: index('idx_online_status_updated').on(table.updatedAt),
    isOnlineIdx: index('idx_online_status_is_online').on(table.isOnline),
  }),
);

export const userOnlineStatusRelations = relations(
  userOnlineStatus,
  ({ one }) => ({
    user: one(user, {
      fields: [userOnlineStatus.userId],
      references: [user.id],
    }),
  }),
);
