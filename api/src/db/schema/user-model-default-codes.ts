import { pgTable, serial, integer, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * 用户默认模型编码偏好 — 「模型编码化改造」M-S-08（本期实现）。
 * 用户可为「逻辑模型（model_name）」保存默认模型编码（model_code），
 * 调用该逻辑模型时可默认使用目标编码（可改选）。
 * 唯一约束：(user_id, model_name)。
 */
export const userModelDefaultCodes = pgTable('user_model_default_codes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  modelName: varchar('model_name', { length: 200 }).notNull(),
  modelCode: varchar('model_code', { length: 200 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userModelUnique: uniqueIndex('uq_user_model_default_user_model').on(table.userId, table.modelName),
}));