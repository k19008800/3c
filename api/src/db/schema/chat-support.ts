import { pgTable, serial, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * 在线客服会话（管理端会话列表）
 *
 * status 取值 open（等待/进行中）| closed（已关闭）。
 * last_message 冗余最近一条消息，便于会话列表直接展示。
 */
export const chatConversations = pgTable('chat_conversations', {
  id: serial('id').primaryKey(),
  /** 发起会话的用户 id */
  userId: integer('user_id').notNull(),
  /** 会话状态：open / closed */
  status: varchar('status', { length: 20 }).notNull().default('open'),
  /** 最近一条消息内容（冗余） */
  lastMessage: text('last_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * 在线客服会话消息
 *
 * role 取值 user（用户）| staff（客服）。
 */
export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull(),
  /** 消息角色：user / staff */
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
