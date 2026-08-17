/**
 * 供应商结算单表 — 月度按供应商聚合消费的结算单据（P1-3）
 *
 * 平台按消费记录（consumption_records）按 (supplier_id, period) 聚合生成月度结算单：
 * - vendor_settlements：结算单主表（唯一约束 (supplier_id, period) 保证幂等）
 * - vendor_settlement_items：结算单明细（按模型聚合：调用次数 / 成本）
 *
 * 状态流转：draft → confirmed（确认后不再重新生成）
 *
 * @module db/schema/vendor-settlements
 * @see docs/iteration-plan-v2.md P1-3
 * @see services/finance/vendor-settlement.ts
 */

import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { suppliers } from './suppliers';

export const vendorSettlements = pgTable(
  'vendor_settlements',
  {
    id: serial('id').primaryKey(),
    /** 供应商（suppliers.id） */
    supplierId: integer('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    /** 结算月份 YYYY-MM */
    period: varchar('period', { length: 7 }).notNull(),
    /** 应付金额（元，numeric(18,4)） */
    totalAmount: numeric('total_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    /** 明细条数（聚合到的模型数） */
    itemCount: integer('item_count').notNull().default(0),
    /** draft | confirmed */
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    /** 生成人（管理员 user id） */
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    /** 幂等约束：同 (supplier_id, period) 只允许一张结算单 */
    supplierPeriodUnique: uniqueIndex('uq_vendor_settlements_supplier_period').on(
      table.supplierId,
      table.period,
    ),
    periodIdx: index('idx_vendor_settlements_period').on(table.period),
    statusIdx: index('idx_vendor_settlements_status').on(table.status),
  }),
);

export const vendorSettlementItems = pgTable(
  'vendor_settlement_items',
  {
    id: serial('id').primaryKey(),
    /** 所属结算单（vendor_settlements.id），结算单删除时明细一并删除 */
    settlementId: integer('settlement_id')
      .notNull()
      .references(() => vendorSettlements.id, { onDelete: 'cascade' }),
    /** 平台模型名（consumption_records.model） */
    modelName: varchar('model_name', { length: 200 }).notNull(),
    /** 调用次数 */
    callCount: integer('call_count').notNull().default(0),
    /** 该模型成本（元，numeric(18,4)） */
    cost: numeric('cost', { precision: 18, scale: 4 }).notNull().default('0'),
  },
  (table) => ({
    settlementIdx: index('idx_vendor_settlement_items_settlement_id').on(table.settlementId),
  }),
);

export type VendorSettlement = typeof vendorSettlements.$inferSelect;
export type NewVendorSettlement = typeof vendorSettlements.$inferInsert;
export type VendorSettlementItem = typeof vendorSettlementItems.$inferSelect;
export type NewVendorSettlementItem = typeof vendorSettlementItems.$inferInsert;
