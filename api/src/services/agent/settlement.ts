/**
 * 代理商结算服务 — 月度结算单 + 业绩排名 + 邀请码（P1-2）
 *
 * 职责：
 *   - listAgentSettlements：按会计期（YYYY-MM）汇总已结算佣金，生成月度结算单列表
 *   - getAgentSettlementDetail：单期结算单明细（客户/消费金额/佣金/时间）+ 汇总
 *   - confirmAgentSettlement：确认结算（幂等；标记该期该代理已确认）
 *   - agentSettlementRanking：按已结算佣金累计排序的业绩 Top 榜（含自己的名次）
 *   - getActiveInviteCode / regenerateInviteCode / listInviteRecords：邀请码生命周期
 *
 * 口径约定：
 *   - 佣金归属期 = COALESCE(settled_at, created_at) 的 YYYY-MM（DB 存 UTC 墙钟，
 *     to_char 取期与 JS 的 toISOString().slice(0,7) 一致，避免时区错位）
 *   - 金额单位：DB 为「元」（numeric 18,4），API 输出为「分」（整数，四舍五入）
 *   - 结算确认标记：system_config KV（key = agent_settlement_confirm:{agentId}:{period}）。
 *     P1-2 约束下不改 schema/migration，用现成 KV 表承载"专用确认记录"，
 *     天然幂等（onConflictDoUpdate，重复确认只刷新时间戳，不重复生成任何东西）。
 *
 * @see docs/iteration-plan-v2.md P1-2
 * @module services/agent
 */

import crypto from 'crypto';
import { db, schema } from '../../db';
import { eq, and, sql, desc, inArray, like, type SQL } from 'drizzle-orm';
import { ValidationError, AppError } from '../../lib/errors';

/** 结算期格式：YYYY-MM */
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 邀请码字符集：大写字母 + 数字（规格 8~12 位） */
const INVITE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** 元 → 分（整数，四舍五入） */
const toCents = (v: unknown): number => Math.round(Number(v ?? 0) * 100);

/** 佣金归属期表达式：优先 settled_at，缺失回退 created_at */
function periodExpr(): SQL<string> {
  return sql<string>`to_char(coalesce(${schema.agentCommissions.settledAt}, ${schema.agentCommissions.createdAt}), 'YYYY-MM')`;
}

/** 当前会计期（UTC 墙钟，与 DB to_char 口径一致） */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** 结算确认标记的 system_config key */
export function settlementConfirmKey(agentId: number, period: string): string {
  return `agent_settlement_confirm:${agentId}:${period}`;
}

/** 校验结算期格式 */
export function isValidPeriod(p: string): boolean {
  return PERIOD_RE.test(p);
}

/** 该代理某期是否已确认（system_config KV 是否存在） */
async function isPeriodConfirmed(agentId: number, period: string): Promise<boolean> {
  const rows = await db
    .select({ key: schema.systemConfig.key })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, settlementConfirmKey(agentId, period)))
    .limit(1);
  return rows.length > 0;
}

/** 批量读取该代理若干期的确认集合（单次 KV 前缀查询） */
async function loadConfirmedPeriods(agentId: number, periods: string[]): Promise<Set<string>> {
  if (periods.length === 0) return new Set();
  const prefix = settlementConfirmKey(agentId, '');
  const rows = await db
    .select({ key: schema.systemConfig.key })
    .from(schema.systemConfig)
    .where(like(schema.systemConfig.key, `${prefix}%`));
  const confirmed = new Set(rows.map((r) => r.key.slice(prefix.length)));
  return new Set(periods.filter((p) => confirmed.has(p)));
}

export interface AgentSettlementItem {
  period: string;
  total_commission: number;
  status: string;
  settled_count: number;
  confirmable: boolean;
}

export interface AgentSettlementStats {
  /** 待确认期数（有佣金但未确认的期） */
  pending: number;
  /** 已确认期数 */
  settled: number;
  /** 本月累计佣金（分） */
  month_commission: number;
  /** 已确认期的累计佣金（分） */
  total_settled: number;
}

/**
 * 月度结算单列表：按会计期汇总该代理已结算（settled）佣金。
 *
 * 只返回有佣金记录的期（空态 → 空数组）；会计期状态取自 accounting_periods
 * （open/locked/unlocked，缺省 open）；confirmable = 该期未确认。
 *
 * @param agentId - 代理商 id
 * @param opts.status - 可选筛选：pending（待确认）/ settled（已确认）
 * @param opts.page / opts.pageSize - 分页（默认 1 / 20，pageSize 上限 100）
 * @returns rows + total + stats（stats 供前端统计卡片）
 */
export async function listAgentSettlements(
  agentId: number,
  opts: { status?: string; page?: number; pageSize?: number } = {},
): Promise<{ rows: AgentSettlementItem[]; total: number; stats: AgentSettlementStats }> {
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);

  // 1. 按归属期聚合已结算佣金
  const agg = await db
    .select({
      period: periodExpr(),
      totalCommission: sql<string>`coalesce(sum(${schema.agentCommissions.amount}), 0)`,
      settledCount: sql<number>`count(*)::int`,
    })
    .from(schema.agentCommissions)
    .where(and(
      eq(schema.agentCommissions.agentId, agentId),
      eq(schema.agentCommissions.status, 'settled'),
    ))
    .groupBy(periodExpr())
    .orderBy(desc(periodExpr()));

  if (agg.length === 0) {
    return { rows: [], total: 0, stats: { pending: 0, settled: 0, month_commission: 0, total_settled: 0 } };
  }

  // 2. 会计期状态（缺省 open）
  const periods = agg.map((r) => r.period);
  const apRows = await db
    .select({ period: schema.accountingPeriods.period, status: schema.accountingPeriods.status })
    .from(schema.accountingPeriods)
    .where(inArray(schema.accountingPeriods.period, periods));
  const apStatus = new Map(apRows.map((r) => [r.period, r.status]));

  // 3. 已确认期集合
  const confirmedSet = await loadConfirmedPeriods(agentId, periods);

  const rows: AgentSettlementItem[] = agg.map((r) => ({
    period: r.period,
    total_commission: toCents(r.totalCommission),
    status: apStatus.get(r.period) ?? 'open',
    settled_count: r.settledCount,
    confirmable: !confirmedSet.has(r.period),
  }));

  // 4. 状态筛选 + 分页
  const filtered =
    opts.status === 'pending' || opts.status === 'settled'
      ? rows.filter((r) => (opts.status === 'pending' ? r.confirmable : !r.confirmable))
      : rows;
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  // 5. 统计
  const [monthAgg] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.agentCommissions.amount}), 0)` })
    .from(schema.agentCommissions)
    .where(and(
      eq(schema.agentCommissions.agentId, agentId),
      eq(schema.agentCommissions.status, 'settled'),
      sql`to_char(coalesce(${schema.agentCommissions.settledAt}, ${schema.agentCommissions.createdAt}), 'YYYY-MM') = ${currentMonth()}`,
    ));

  const stats: AgentSettlementStats = {
    pending: rows.filter((r) => r.confirmable).length,
    settled: rows.filter((r) => !r.confirmable).length,
    month_commission: toCents(monthAgg?.total),
    total_settled: rows.filter((r) => !r.confirmable).reduce((s, r) => s + r.total_commission, 0),
  };

  return { rows: paged, total, stats };
}

export interface AgentSettlementDetailItem {
  id: number;
  customer_email: string;
  /** 消费金额（分） */
  amount: number;
  /** 佣金比例（%，如 15 表示 15%） */
  rate: number;
  /** 佣金金额（分） */
  commission: number;
  status: string;
  settled_at: string | null;
  created_at: string;
}

/**
 * 单期结算单详情：该期该代理的已结算佣金明细（客户/消费金额/佣金/时间，分）+ 汇总。
 *
 * 期不存在或该期无佣金 → 200 空明细 + 汇总零值（与列表空态口径一致，不抛 404）。
 *
 * @param agentId - 代理商 id
 * @param period - 会计期 YYYY-MM（由路由层先做格式校验）
 */
export async function getAgentSettlementDetail(
  agentId: number,
  period: string,
): Promise<{ items: AgentSettlementDetailItem[]; summary: AgentSettlementItem & { confirmed: boolean } }> {
  const items = await db
    .select({
      id: schema.agentCommissions.id,
      customerEmail: schema.users.email,
      amount: schema.consumptionRecords.cost,
      rate: schema.agentCommissions.rate,
      commission: schema.agentCommissions.amount,
      status: schema.agentCommissions.status,
      settledAt: schema.agentCommissions.settledAt,
      createdAt: schema.agentCommissions.createdAt,
    })
    .from(schema.agentCommissions)
    .innerJoin(schema.users, eq(schema.users.id, schema.agentCommissions.customerUserId))
    .leftJoin(schema.consumptionRecords, eq(schema.consumptionRecords.id, schema.agentCommissions.consumptionRecordId))
    .where(and(
      eq(schema.agentCommissions.agentId, agentId),
      eq(schema.agentCommissions.status, 'settled'),
      sql`to_char(coalesce(${schema.agentCommissions.settledAt}, ${schema.agentCommissions.createdAt}), 'YYYY-MM') = ${period}`,
    ))
    .orderBy(desc(schema.agentCommissions.id));

  const [ap] = await db
    .select({ status: schema.accountingPeriods.status })
    .from(schema.accountingPeriods)
    .where(eq(schema.accountingPeriods.period, period))
    .limit(1);

  const totalYuan = items.reduce((s, r) => s + Number(r.commission ?? 0), 0);
  const confirmed = await isPeriodConfirmed(agentId, period);
  const status = ap?.status ?? 'open';

  return {
    items: items.map((r) => ({
      id: r.id,
      customer_email: r.customerEmail,
      amount: toCents(r.amount),
      rate: Number(r.rate),
      commission: toCents(r.commission),
      status: r.status,
      settled_at: r.settledAt ? r.settledAt.toISOString() : null,
      created_at: r.createdAt.toISOString(),
    })),
    summary: {
      period,
      total_commission: toCents(totalYuan),
      status,
      settled_count: items.length,
      confirmable: !confirmed,
      confirmed,
    },
  };
}

/**
 * 确认结算：事务内写入该期该代理的确认标记（system_config KV）。
 *
 * 幂等：重复确认走 onConflictDoUpdate 只刷新时间戳，返回同样的已确认结果，不报错。
 * 已锁定（accounting_periods.status='locked'）的期允许确认——确认只做标记，
 * 不生成/重算任何佣金，天然满足"不可重复生成"。
 *
 * @param agentId - 代理商 id
 * @param period - 会计期 YYYY-MM（格式非法抛 ValidationError）
 * @returns 确认结果摘要（分）
 */
export async function confirmAgentSettlement(
  agentId: number,
  period: string,
): Promise<{ period: string; confirmed: true; total_commission: number; status: string; settled_count: number }> {
  if (!isValidPeriod(period)) {
    throw new ValidationError('结算期格式必须为 YYYY-MM');
  }

  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.systemConfig)
      .values({
        key: settlementConfirmKey(agentId, period),
        value: now,
        description: `代理商确认结算单：agentId=${agentId}, period=${period}`,
      })
      .onConflictDoUpdate({
        target: schema.systemConfig.key,
        set: { value: now, updatedAt: new Date() },
      });
  });

  const detail = await getAgentSettlementDetail(agentId, period);
  return {
    period,
    confirmed: true,
    total_commission: detail.summary.total_commission,
    status: detail.summary.status,
    settled_count: detail.summary.settled_count,
  };
}

export interface AgentRankingItem {
  rank: number;
  agent_id: number;
  agent_name: string;
  /** 累计已结算佣金（分） */
  total_commission: number;
  /** 名下客户数（去重） */
  customer_count: number;
  /** 名下客户消费总额（分） */
  month_consumption: number;
  /** 榜单口径：'YYYY-MM'（本月）或 'total'（累计） */
  period: string;
}

/**
 * 业绩排名：按已结算佣金累计排序的 Top 榜（金额降序），含当前代理商自己的名次。
 *
 * @param agentId - 当前登录代理商 id（用于 my_rank 定位）
 * @param opts.period - 'month'（本月，默认）| 'total'（累计）
 * @param opts.limit - 榜单条数（默认 50，上限 200；my_rank 不受 limit 截断影响）
 */
export async function agentSettlementRanking(
  agentId: number,
  opts: { period?: string; limit?: number } = {},
): Promise<{ list: AgentRankingItem[]; my_rank: AgentRankingItem | null }> {
  const scope = opts.period === 'total' ? 'total' : currentMonth();
  const conditions: SQL[] = [eq(schema.agentCommissions.status, 'settled')];
  if (scope !== 'total') {
    conditions.push(sql`to_char(coalesce(${schema.agentCommissions.settledAt}, ${schema.agentCommissions.createdAt}), 'YYYY-MM') = ${scope}`);
  }
  const whereClause = and(...conditions);

  const rows = await db
    .select({
      agentId: schema.agents.id,
      agentName: schema.users.name,
      agentEmail: schema.users.email,
      totalCommission: sql<string>`coalesce(sum(${schema.agentCommissions.amount}), 0)`,
      customerCount: sql<number>`count(distinct ${schema.agentCommissions.customerUserId})::int`,
      monthConsumption: sql<string>`coalesce(sum(coalesce(${schema.consumptionRecords.cost}, 0)), 0)`,
    })
    .from(schema.agentCommissions)
    .innerJoin(schema.agents, eq(schema.agents.id, schema.agentCommissions.agentId))
    .innerJoin(schema.users, eq(schema.users.id, schema.agents.userId))
    .leftJoin(schema.consumptionRecords, eq(schema.consumptionRecords.id, schema.agentCommissions.consumptionRecordId))
    .where(whereClause)
    .groupBy(schema.agents.id, schema.users.name, schema.users.email)
    .orderBy(desc(sql`sum(${schema.agentCommissions.amount})`));

  const ranked: AgentRankingItem[] = rows.map((r, i) => ({
    rank: i + 1,
    agent_id: r.agentId,
    agent_name: r.agentName || r.agentEmail,
    total_commission: toCents(r.totalCommission),
    customer_count: r.customerCount,
    month_consumption: toCents(r.monthConsumption),
    period: scope,
  }));

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  return {
    list: ranked.slice(0, limit),
    my_rank: ranked.find((r) => r.agent_id === agentId) ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// 邀请码（agent_invitations 表已建好，见 db/schema/agent-invitations.ts）
// ─────────────────────────────────────────────────────────────

/** 随机生成 8~12 位大写字母+数字邀请码 */
function randomInviteCode(): string {
  const length = 8 + crypto.randomInt(0, 5); // 8..12
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += INVITE_ALPHABET[bytes.readUInt8(i) % INVITE_ALPHABET.length];
  }
  return code;
}

/**
 * 生成唯一邀请码：查重冲突则重试（最多 10 次）。
 *
 * 碰撞概率极低（36^8+ 空间）；表上 code 唯一约束为最终兜底，
 * 极端并发下由 regenerateInviteCode 的 23505 捕获重试闭环。
 */
async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomInviteCode();
    const existing = await db
      .select({ id: schema.agentInvitations.id })
      .from(schema.agentInvitations)
      .where(eq(schema.agentInvitations.code, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  throw new AppError('邀请码生成失败，请重试', 500, 'INVITE_CODE_GENERATE_FAILED');
}

/**
 * 当前代理商的有效邀请码（status=active 的最新一条）。
 *
 * @returns { code: string | null } — 无有效码返回 null（前端据此展示"暂无邀请码"）
 */
export async function getActiveInviteCode(agentId: number): Promise<{ code: string | null }> {
  const rows = await db
    .select({ code: schema.agentInvitations.code })
    .from(schema.agentInvitations)
    .where(and(eq(schema.agentInvitations.agentId, agentId), eq(schema.agentInvitations.status, 'active')))
    .orderBy(desc(schema.agentInvitations.id))
    .limit(1);
  return { code: rows[0]?.code ?? null };
}

/**
 * 重新生成邀请码：事务内旧 active 码全部置 disabled，插入新码（status=active）。
 *
 * 历史码保留（records 可追踪）；code 唯一冲突（23505，极小概率并发碰撞）自动重试。
 *
 * @returns 新邀请码
 */
export async function regenerateInviteCode(agentId: number): Promise<{ code: string }> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomInviteCode();
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(schema.agentInvitations)
          .set({ status: 'disabled' })
          .where(and(eq(schema.agentInvitations.agentId, agentId), eq(schema.agentInvitations.status, 'active')));
        await tx.insert(schema.agentInvitations).values({ agentId, code, status: 'active' });
      });
      return { code };
    } catch (err) {
      const isUniqueViolation = (err as { code?: string })?.code === '23505';
      if (!isUniqueViolation) throw err; // 非唯一冲突直接上抛，不吞真实错误
      // 唯一冲突 → 换码重试
    }
  }
  throw new AppError('邀请码生成失败，请重试', 500, 'INVITE_CODE_GENERATE_FAILED');
}

export interface AgentInviteRecord {
  id: number;
  code: string;
  status: string;
  /** 使用该码注册的用户名（未使用为 null） */
  invitee_name: string | null;
  /** 使用该码注册的用户邮箱（未使用为 null） */
  invitee_email: string | null;
  used_at: string | null;
  created_at: string;
  /** 邀请返佣金额（分）——返佣由 P2-2 返佣表承载，本表无字段，恒为 0 */
  reward_amount: number;
}

/**
 * 邀请记录：该代理商所有邀请码 + 使用情况，按 createdAt 倒序。
 */
export async function listInviteRecords(agentId: number): Promise<AgentInviteRecord[]> {
  const rows = await db
    .select({
      id: schema.agentInvitations.id,
      code: schema.agentInvitations.code,
      status: schema.agentInvitations.status,
      inviteeName: schema.users.name,
      inviteeEmail: schema.users.email,
      usedAt: schema.agentInvitations.usedAt,
      createdAt: schema.agentInvitations.createdAt,
    })
    .from(schema.agentInvitations)
    .leftJoin(schema.users, eq(schema.users.id, schema.agentInvitations.usedBy))
    .where(eq(schema.agentInvitations.agentId, agentId))
    .orderBy(desc(schema.agentInvitations.createdAt));

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    status: r.status,
    invitee_name: r.inviteeName ?? null,
    invitee_email: r.inviteeEmail ?? null,
    used_at: r.usedAt ? r.usedAt.toISOString() : null,
    created_at: r.createdAt.toISOString(),
    reward_amount: 0,
  }));
}
