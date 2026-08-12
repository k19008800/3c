import { pgTable, serial, integer, varchar, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * 实名认证邀请记录
 * 原型 admin-verification.html「未认证」Tab：管理员可向未认证用户发送实名认证邀请。
 * channel: email / sms / system(站内信)
 */
export const realNameInvites = pgTable(
  'real_name_invites',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    channel: varchar('channel', { length: 20 }).notNull().default('email'),
    sentBy: integer('sent_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_rni_user').on(table.userId)],
);

export type RealNameInvite = typeof realNameInvites.$inferSelect;
export type NewRealNameInvite = typeof realNameInvites.$inferInsert;
