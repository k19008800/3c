import { pgTable, serial, integer, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * 代理商通知偏好 — AgentSettingsPage（/me/agent/notif-prefs）
 * 每用户一行；prefs 为 { [key: string]: boolean }，key 例：
 *   customer_alert 客户消费告警 / commission_notify 佣金到账通知 / audit_notify 审批结果通知
 */
export const agentNotifPrefs = pgTable('agent_notif_prefs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  prefs: jsonb('prefs').notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('agent_notif_prefs_user_id_idx').on(t.userId),
]);
