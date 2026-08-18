import { pgTable, serial, integer, varchar, timestamp, numeric } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns';
import { users } from './users';

/**
 * 营销活动参与记录（2026-08 补齐，对齐原型 admin-campaigns.html 参与者列表）
 *
 * 参与者来源：
 *   - auto   活动规则自动触发（如充值达标赠送，由发放逻辑写入）
 *   - manual 后台手动发放（POST /admin/campaigns/:id/grant）
 * amount 单位：元（与前端 Participant.amount 契约一致）。
 */
export const campaignParticipants = pgTable('campaign_participants', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull().default('0'),
  /** 触发方式：auto 自动 / manual 手动发放 */
  triggerType: varchar('trigger_type', { length: 20 }).notNull().default('auto'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type CampaignParticipant = typeof campaignParticipants.$inferSelect;
