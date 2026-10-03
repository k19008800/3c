import {
  pgTable, serial, bigint, integer, text, timestamp, index,
} from 'drizzle-orm/pg-core';

/**
 * 平台总账（复式记账，PRD §29.1）
 *
 * 与 balance_transactions（用户视角资金流水）互补：本表是平台视角的会计分录，
 * 每笔业务成对写入「借/贷」两行，满足会计恒等式 SUM(debit) = SUM(credit)。
 *
 * 设计要点：
 * - 金额统一存「分」（bigint amount_cents），杜绝浮点误差；与 balance_transactions
 *   的 numeric(18,8) 元换算：cents = round(yuan * 100)。
 * - 写入是主链路（充值入账 / 消费结算）的**副作用**：失败只 log error，不回滚资金主流程
 *   （balance_transactions 仍是权威流水，本表用于对账与科目余额表）。
 * - 无外键级联：refId/userId 可空，单据删除后分录仍保留（审计留痕）。
 *
 * 科目（account）约定：
 *   user_balance    用户余额（平台对用户的负债）
 *   revenue         平台收入（充值确认）
 *   cost            平台成本（上游算力采购，用户消费确认）
 *   agent_commission 代理佣金应付
 *   recharge        充值在途/汇总
 *   withdraw        提现在途
 *   refund          退款冲销
 *
 * @see coding-standards-api-db-test.md §2 数据库规范
 * @module db/schema
 */
export const platformLedger = pgTable('platform_ledger', {
  id: serial('id').primaryKey(),
  /** 分录日期（业务发生时间，默认 now()） */
  entryDate: timestamp('entry_date', { withTimezone: true }).defaultNow().notNull(),
  /** 会计科目：user_balance / revenue / cost / agent_commission / recharge / withdraw / refund */
  account: text('account').notNull(),
  /** 记账方向：debit（借） | credit（贷） */
  direction: text('direction', { enum: ['debit', 'credit'] }).notNull(),
  /** 金额（分，整数；恒为正数，方向由 direction 表达） */
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  currency: text('currency').default('CNY').notNull(),
  /** 关联单据类型：recharge_order / consumption / commission / settlement / refund ... */
  refType: text('ref_type').notNull(),
  /** 关联单据 ID */
  refId: integer('ref_id'),
  /** 关联用户（可空，平台级分录无用户） */
  userId: integer('user_id'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  accountIdx: index('idx_platform_ledger_account').on(table.account),
  entryDateIdx: index('idx_platform_ledger_entry_date').on(table.entryDate),
  userIdx: index('idx_platform_ledger_user').on(table.userId),
  refIdx: index('idx_platform_ledger_ref').on(table.refType, table.refId),
}));

export type PlatformLedger = typeof platformLedger.$inferSelect;
export type NewPlatformLedger = typeof platformLedger.$inferInsert;
