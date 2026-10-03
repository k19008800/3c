/**
 * 平台总账服务 — 复式记账分录写入 / 查询 / 科目汇总（PRD §29.1）
 *
 * 职责：
 * - postLedgerEntries：把一笔业务的「借/贷」成对分录写入 platform_ledger，
 *   强校验会计恒等式 SUM(debit)=SUM(credit)，不等则拒绝写入。
 * - recordRecharge / recordConsumption / recordRefund：主链路埋点便捷封装，
 *   内部 try/catch，失败只 log error、绝不向上抛（副作用，不阻断资金主流程）。
 * - listLedger / ledgerSummary：admin 财务查询（分页 + 按科目汇总 + 恒等式校验）。
 *
 * 金额单位：所有对外入参接受「元」（与 balance_transactions 的 numeric 一致），
 * 内部统一换算为「分」（bigint amount_cents）：cents = round(yuan*100)。
 * ≤0 分的分录直接跳过（无会计意义，避免 0 行污染科目余额表）。
 *
 * @module services/finance
 */

import { db, schema } from '../../db/index.js';
import { and, eq, gte, lte, desc, sql, type SQL } from 'drizzle-orm';

/** Drizzle 事务上下文（与 balance.ts creditBalance 同一类型约定） */
type TxContext = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** 可执行 insert 的句柄：db 实例或事务 tx */
type DbLike = typeof db | TxContext;

/** 单条分录线（amountCents 恒为正数，方向由 direction 表达） */
export interface LedgerLine {
  /** 会计科目：user_balance / revenue / cost / agent_commission / recharge / withdraw / refund */
  account: string;
  direction: 'debit' | 'credit';
  /** 金额（分，正数） */
  amountCents: number;
  /** 关联用户（可空） */
  userId?: number | null;
  description: string;
}

/** 元 → 分（四舍五入到分，杜绝浮点误差） */
export function yuanToCents(yuan: string | number): number {
  return Math.round(Number(yuan) * 100);
}

/**
 * 写入一组平衡分录（同一业务事件，借=贷）。
 *
 * 可在调用方事务内执行（与余额变更同提交，保证原子）；也可在事务外用 db 调用。
 * 调用方负责「失败不阻断」——本函数不吞异常，由便捷封装 record* 包 try/catch。
 *
 * @throws {Error} 借贷不平衡（debitSum !== creditSum）时拒绝写入
 */
export async function postLedgerEntries(
  dbLike: DbLike,
  opts: {
    refType: string;
    refId: number | string;
    userId?: number | null;
    description?: string;
    lines: LedgerLine[];
  },
): Promise<void> {
  const debitSum = opts.lines.filter(l => l.direction === 'debit').reduce((s, l) => s + l.amountCents, 0);
  const creditSum = opts.lines.filter(l => l.direction === 'credit').reduce((s, l) => s + l.amountCents, 0);
  if (debitSum !== creditSum) {
    throw new Error(`[platform-ledger] imbalance: debit=${debitSum} credit=${creditSum} (ref=${opts.refType}#${opts.refId})`);
  }
  if (opts.lines.length === 0 || debitSum === 0) return;

  const rows = opts.lines.map(l => ({
    account: l.account,
    direction: l.direction,
    amountCents: l.amountCents,
    currency: 'CNY',
    refType: opts.refType,
    refId: typeof opts.refId === 'string' ? parseInt(opts.refId, 10) || null : opts.refId,
    userId: l.userId ?? opts.userId ?? null,
    description: l.description ?? opts.description ?? null,
  }));
  await dbLike.insert(schema.platformLedger).values(rows);
}

/**
 * 充值到账分录（副作用封装，失败仅 log）：
 *   debit user_balance / credit revenue
 */
export async function recordRechargeLedger(
  dbLike: DbLike,
  opts: { userId: number; amountYuan: string | number; refType: string; refId: number | string; description: string },
): Promise<void> {
  try {
    const cents = yuanToCents(opts.amountYuan);
    if (cents <= 0) return;
    await postLedgerEntries(dbLike, {
      refType: opts.refType,
      refId: opts.refId,
      userId: opts.userId,
      lines: [
        { account: 'user_balance', direction: 'debit', amountCents: cents, userId: opts.userId, description: opts.description },
        { account: 'revenue', direction: 'credit', amountCents: cents, userId: opts.userId, description: opts.description },
      ],
    });
  } catch (e) {
    // 副作用：不阻断充值主流程，balance_transactions 仍是权威流水
    console.error('[platform-ledger] recharge post failed:', e instanceof Error ? e.message : e);
  }
}

/**
 * 用户消费结算分录（副作用封装，失败仅 log）：
 *   debit cost / credit user_balance
 */
export async function recordConsumptionLedger(
  dbLike: DbLike,
  opts: { userId: number; amountYuan: string | number; refType: string; refId: number | string; requestId?: string },
): Promise<void> {
  try {
    const cents = yuanToCents(opts.amountYuan);
    if (cents <= 0) return;
    const desc = `消费结算 ${opts.requestId ?? ''}`.trim();
    await postLedgerEntries(dbLike, {
      refType: opts.refType,
      refId: opts.refId,
      userId: opts.userId,
      lines: [
        { account: 'cost', direction: 'debit', amountCents: cents, userId: opts.userId, description: desc },
        { account: 'user_balance', direction: 'credit', amountCents: cents, userId: opts.userId, description: desc },
      ],
    });
  } catch (e) {
    console.error('[platform-ledger] consumption post failed:', e instanceof Error ? e.message : e);
  }
}

/**
 * 退款冲销分录（副作用封装，失败仅 log）：冲回原消费
 *   debit refund / credit user_balance
 */
export async function recordRefundLedger(
  dbLike: DbLike,
  opts: { userId: number; amountYuan: string | number; refType: string; refId: number | string },
): Promise<void> {
  try {
    const cents = yuanToCents(opts.amountYuan);
    if (cents <= 0) return;
    await postLedgerEntries(dbLike, {
      refType: opts.refType,
      refId: opts.refId,
      userId: opts.userId,
      lines: [
        { account: 'refund', direction: 'debit', amountCents: cents, userId: opts.userId, description: '退款冲销' },
        { account: 'user_balance', direction: 'credit', amountCents: cents, userId: opts.userId, description: '退款冲销' },
      ],
    });
  } catch (e) {
    console.error('[platform-ledger] refund post failed:', e instanceof Error ? e.message : e);
  }
}

export interface LedgerListParams {
  account?: string;
  direction?: 'debit' | 'credit';
  userId?: number;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

/** admin 分页查询分录（按 entry_date 倒序） */
export async function listLedger(params: LedgerListParams) {
  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 200);
  const conds: SQL<unknown>[] = [];
  if (params.account) conds.push(eq(schema.platformLedger.account, params.account));
  if (params.direction) conds.push(eq(schema.platformLedger.direction, params.direction));
  if (params.userId != null) conds.push(eq(schema.platformLedger.userId, params.userId));
  if (params.startDate) conds.push(gte(schema.platformLedger.entryDate, params.startDate));
  if (params.endDate) conds.push(lte(schema.platformLedger.entryDate, params.endDate));
  const where = conds.length ? and(...conds) : undefined;

  const [items, totalRow] = await Promise.all([
    db.select({
      id: schema.platformLedger.id,
      entryDate: schema.platformLedger.entryDate,
      account: schema.platformLedger.account,
      direction: schema.platformLedger.direction,
      amountCents: schema.platformLedger.amountCents,
      currency: schema.platformLedger.currency,
      refType: schema.platformLedger.refType,
      refId: schema.platformLedger.refId,
      userId: schema.platformLedger.userId,
      description: schema.platformLedger.description,
    }).from(schema.platformLedger)
      .where(where)
      .orderBy(desc(schema.platformLedger.entryDate), desc(schema.platformLedger.id))
      .limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.platformLedger).where(where),
  ]);

  return {
    items,
    total: Number(totalRow[0]?.count ?? 0),
    page,
    pageSize,
  };
}

export interface LedgerSummaryParams {
  startDate?: Date;
  endDate?: Date;
}

/**
 * 按科目汇总余额 + 会计恒等式校验。
 *
 * 每个科目返回 debitSum/creditSum 与净额 netCents（借-贷）；
 * 顶层返回 totalDebit/totalCredit 与 balanced（全平台借贷是否平衡）。
 */
export async function ledgerSummary(params: LedgerSummaryParams = {}) {
  const conds: SQL<unknown>[] = [];
  if (params.startDate) conds.push(gte(schema.platformLedger.entryDate, params.startDate));
  if (params.endDate) conds.push(lte(schema.platformLedger.entryDate, params.endDate));
  const where = conds.length ? and(...conds) : undefined;

  const rows = await db.select({
    account: schema.platformLedger.account,
    debitCents: sql<number>`COALESCE(SUM(${schema.platformLedger.amountCents}) FILTER (WHERE ${schema.platformLedger.direction}='debit'), 0)::bigint`,
    creditCents: sql<number>`COALESCE(SUM(${schema.platformLedger.amountCents}) FILTER (WHERE ${schema.platformLedger.direction}='credit'), 0)::bigint`,
    entries: sql<number>`COUNT(*)::int`,
  }).from(schema.platformLedger)
    .where(where)
    .groupBy(schema.platformLedger.account)
    .orderBy(schema.platformLedger.account);

  const accounts = rows.map(r => ({
    account: r.account,
    debitCents: Number(r.debitCents),
    creditCents: Number(r.creditCents),
    netCents: Number(r.debitCents) - Number(r.creditCents),
    entries: Number(r.entries),
  }));

  const totalDebit = accounts.reduce((s, a) => s + a.debitCents, 0);
  const totalCredit = accounts.reduce((s, a) => s + a.creditCents, 0);

  return {
    accounts,
    totalDebitCents: totalDebit,
    totalCreditCents: totalCredit,
    /** 会计恒等式：全部分录借方合计 == 贷方合计 */
    balanced: totalDebit === totalCredit,
  };
}
