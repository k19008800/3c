/**
 * CRM 销售漏斗三表（2026-10-03 补齐，对齐 SPEC-§11.2 线索 / §11.4 商机与报价）
 *
 * 覆盖差距矩阵 G：线索 / 商机 / 报价单此前缺失，仅客户/跟进/业绩看板已实现。
 *
 * - sales_leads：潜在客户线索（官网注册/展会/转介绍），业务员录入，管理员可分配。
 *   status: new(新线索) / contacted(已联系) / qualified(意向客户) / lost(无效)。
 *   assigned_to 指向 users.id（业务员）；sales 只看 assigned_to=自己，admin 看全部。
 * - sales_opportunities：由线索转换而来的商机，按 stage 流转（Kanban 看板）。
 *   stage: proposal(方案) / negotiation(谈判) / closed_won(成交) / closed_lost(丢单)。
 *   sales_user_id 冗余业务员归属（便于直接查"我的商机"，与 follow_reminders.sales_user_id 一致）。
 * - sales_quotes：商机下的报价单，items 为行项 jsonb，total_cents 为合计（分）。
 *   status: draft(草稿) / sent(已发送) / accepted(客户接受) / rejected(客户拒绝)。
 *
 * @see docs/SPEC-§11-业务员支撑模块.md §11.2 / §11.4
 * @module db/schema/sales-crm
 */
import { pgTable, serial, integer, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/** 报价单行项：模型/服务名称 + 单价(分) + 数量；total_cents 由后端汇总落库 */
export interface QuoteItem {
  /** 行项名称（模型名/服务名/套餐名） */
  name: string;
  /** 单价（分） */
  unitPriceCents: number;
  /** 数量（月数/调用量单位） */
  quantity: number;
  /** 行项小计（分）= unitPriceCents * quantity */
  subtotalCents: number;
}

export const salesLeads = pgTable('sales_leads', {
  id: serial('id').primaryKey(),
  company: varchar('company', { length: 200 }).notNull(),
  contactName: varchar('contact_name', { length: 100 }).notNull(),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  /** 来源：website/exhibition/referral/cold_call/other */
  source: varchar('source', { length: 50 }).notNull().default('other'),
  /** new / contacted / qualified / lost */
  status: varchar('status', { length: 20 }).notNull().default('new'),
  /** 归属业务员（users.id）；null 表示公海线索，admin 可分配 */
  assignedTo: integer('assigned_to').references(() => users.id),
  /** 备注数组（自由文本，按时间顺序追加） */
  notes: jsonb('notes').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  assignedIdx: index('idx_sales_leads_assigned').on(t.assignedTo, t.status),
  companyIdx: index('idx_sales_leads_company').on(t.company),
}));

export const salesOpportunities = pgTable('sales_opportunities', {
  id: serial('id').primaryKey(),
  /** 来源线索（转换时写入；允许 null 表示直接录入的商机） */
  leadId: integer('lead_id').references(() => salesLeads.id),
  /** 归属业务员（冗余自线索 assigned_to，便于直接查"我的商机"） */
  salesUserId: integer('sales_user_id').notNull().references(() => users.id),
  name: varchar('name', { length: 200 }).notNull(),
  /** 预估合同额（分） */
  expectedValueCents: integer('expected_value_cents').notNull().default(0),
  /** proposal / negotiation / closed_won / closed_lost */
  stage: varchar('stage', { length: 20 }).notNull().default('proposal'),
  expectedCloseDate: timestamp('expected_close_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  salesStageIdx: index('idx_sales_opp_sales_stage').on(t.salesUserId, t.stage),
  leadIdx: index('idx_sales_opp_lead').on(t.leadId),
}));

export const salesQuotes = pgTable('sales_quotes', {
  id: serial('id').primaryKey(),
  opportunityId: integer('opportunity_id').notNull().references(() => salesOpportunities.id),
  /** 归属业务员（冗余，便于直接查"我的报价"） */
  salesUserId: integer('sales_user_id').notNull().references(() => users.id),
  /** 同一商机下的报价版本号（自增，v1/v2...） */
  version: integer('version').notNull().default(1),
  /** 报价行项 */
  items: jsonb('items').$type<QuoteItem[]>().notNull().default([]),
  /** 报价合计（分）= Σ items.subtotal_cents，后端汇总落库 */
  totalCents: integer('total_cents').notNull().default(0),
  validUntil: timestamp('valid_until'),
  /** draft / sent / accepted / rejected */
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  oppIdx: index('idx_sales_quotes_opp').on(t.opportunityId),
  salesStatusIdx: index('idx_sales_quotes_sales_status').on(t.salesUserId, t.status),
}));

export type SalesLead = typeof salesLeads.$inferSelect;
export type NewSalesLead = typeof salesLeads.$inferInsert;
export type SalesOpportunity = typeof salesOpportunities.$inferSelect;
export type NewSalesOpportunity = typeof salesOpportunities.$inferInsert;
export type SalesQuote = typeof salesQuotes.$inferSelect;
export type NewSalesQuote = typeof salesQuotes.$inferInsert;
