import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  numeric,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 营销活动表
 * 对齐 ref-4.5-marketing.md §1
 * 状态机: draft → active → ended → archived
 */
export const campaigns = pgTable(
  "campaigns",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    // 状态: draft/active/ended/archived
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    autoEnd: boolean("auto_end").notNull().default(true),
    // 预算（元，活动中直发余额总额上限）
    budgetAmount: numeric("budget_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    // 活动类型: recharge_gift(充值赠送)/new_user(新用户礼)/discount(折扣)
    type: varchar("type", { length: 30 }).notNull().default("recharge_gift"),
    createdBy: integer("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_camp_status").on(table.status),
    index("idx_camp_created_by").on(table.createdBy),
    index("idx_camp_start_end").on(table.startAt, table.endAt),
  ],
);

/**
 * 活动参与/发放记录（统计用）
 * 每次活动发放余额奖励记一条
 */
export const campaignParticipants = pgTable(
  "campaign_participants",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id),
    // 发放金额（元）
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    // 触发场景
    triggerType: varchar("trigger_type", { length: 30 }).notNull().default("recharge"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_cp_campaign").on(table.campaignId),
    index("idx_cp_user").on(table.userId),
  ],
);

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type CampaignParticipant = typeof campaignParticipants.$inferSelect;
