import {
  pgTable,
  uuid,
  varchar,
  date,
  integer,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { camp } from './camp';
import { user } from './user';

export const payment = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  campId: uuid('camp_id').references(() => camp.id),
  name: varchar('name', { length: 255 }).notNull(),
  dueDate: date('due_date'),
  amount: integer('amount'),
  currency: varchar('currency', { length: 3 }).notNull().default('HUF'),
});

export const paymentRelations = relations(payment, ({ one, many }) => ({
  camp: one(camp, {
    fields: [payment.campId],
    references: [camp.id],
  }),
  userPayments: many(userPayment),
}));

export const userPayment = pgTable('user_payments', {
  userId: uuid('user_id').references(() => user.id),
  paymentId: uuid('payment_id').references(() => payment.id),
  isPaid: boolean('is_paid').default(false),
});

export const userPaymentRelations = relations(userPayment, ({ one }) => ({
  user: one(user, {
    fields: [userPayment.userId],
    references: [user.id],
  }),
  payment: one(payment, {
    fields: [userPayment.paymentId],
    references: [payment.id],
  }),
}));
