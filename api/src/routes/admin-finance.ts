/**
 * 财务工作台 API — /api/v1/admin/finance
 *
 * 提供财务工作台所需汇总数据：
 *   - GET /admin/finance/dashboard — 本月充值/退款/佣金/毛利 + 待办事项计数 + 最近交易
 *   - GET /admin/finance/transactions — 最近交易列表（统一视图）
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, gte, lte, sql, desc, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
} from '../lib/errors';

/* ───────── helpers ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

async function adminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

async function superAdminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
  if (role !== 'super_admin') {
    throw new ForbiddenError('Super admin access required');
  }
}

function monthRange(reference?: Date): { start: Date; end: Date } {
  const now = reference ?? new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

/** 由 "YYYY-MM" 解析出该月的起止时间 */
function monthRangeOf(period: string): { start: Date; end: Date } {
  const [y = 1970, m = 1] = period.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

/** 佣金工作台的周期筛选 → 起始时间（无上限，一律截至“现在”） */
function periodRange(period: string): Date | undefined {
  const now = new Date();
  switch (period) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week': {
      const day = now.getDay() || 7; // 周日=7
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
      monday.setHours(0, 0, 0, 0);
      return monday;
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    default:
      return undefined; // all
  }
}

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

/** 金额四舍五入到分 */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 结账期间状态文案 */
const PERIOD_STATUS_LABEL: Record<string, string> = {
  open: '未结账',
  locked: '已锁账',
  unlocked: '临时解锁',
};

/** 代理商等级 → 中文文案 */
const LEVEL_LABEL: Record<string, string> = {
  junior: '初级代理',
  senior: '高级代理',
  partner: '合作伙伴',
};

export async function financeDashboardRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/finance/dashboard — 财务工作台汇总 */
  app.get('/api/v1/admin/finance/dashboard', { preHandler: [adminAuth] }, async (request, reply) => {
    const { start, end } = monthRange();

    // 1. 本月充值总额（recharge_orders.paid）
    const [rechargeAgg] = await db
      .select({ total: sql<number>`coalesce(sum(amount),0)` })
      .from(schema.rechargeOrders)
      .where(and(
        eq(schema.rechargeOrders.status, 'paid'),
        gte(schema.rechargeOrders.createdAt, start),
        lte(schema.rechargeOrders.createdAt, end),
      ));

    // 2. 本月退款总额（balance_transactions.refund）
    const [refundAgg] = await db
      .select({ total: sql<number>`coalesce(sum(abs(amount)),0)` })
      .from(schema.balanceTransactions)
      .where(and(
        eq(schema.balanceTransactions.type, 'refund'),
        gte(schema.balanceTransactions.createdAt, start),
        lte(schema.balanceTransactions.createdAt, end),
      ));

    // 3. 本月佣金支出（agent_commissions.settled）
    const [commissionAgg] = await db
      .select({ total: sql<number>`coalesce(sum(amount),0)` })
      .from(schema.agentCommissions)
      .where(and(
        eq(schema.agentCommissions.status, 'settled'),
        gte(schema.agentCommissions.createdAt, start),
        lte(schema.agentCommissions.createdAt, end),
      ));

    // 4. 本月毛利润 = 充值 - 退款 - 佣金
    const rechargeTotal = toNum(rechargeAgg?.total);
    const refundTotal = toNum(refundAgg?.total);
    const commissionTotal = toNum(commissionAgg?.total);
    const grossProfit = rechargeTotal - refundTotal - commissionTotal;

    // 5. 待办事项计数（pending 状态单据）
    const [manualTopupCnt, refundCnt, invoiceCnt, withdrawalCnt] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(schema.rechargeOrders)
        .where(and(eq(schema.rechargeOrders.status, 'pending'), eq(schema.rechargeOrders.method, 'manual'))),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.balanceTransactions)
        .where(eq(schema.balanceTransactions.type, 'refund')),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.invoices)
        .where(sql`${schema.invoices.status} IN ('pending', 'draft')`),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.agentWithdrawals)
        .where(eq(schema.agentWithdrawals.status, 'pending')),
    ]);

    return reply.send({
      data: {
        month: {
          recharge: rechargeTotal,
          refund: refundTotal,
          commission: commissionTotal,
          grossProfit,
        },
        todos: {
          manualTopup: toNum(manualTopupCnt[0]?.count),
          refund: toNum(refundCnt[0]?.count),
          invoice: toNum(invoiceCnt[0]?.count),
          withdrawal: toNum(withdrawalCnt[0]?.count),
        },
      },
    });
  });

  /** GET /api/v1/admin/finance/transactions — 最近交易（统一视图） */
  app.get('/api/v1/admin/finance/transactions', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { limit?: string; type?: string };
    const limit = Math.min(parseInt(q.limit ?? '10', 10) || 10, 50);

    const limitDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [recharges, refunds, withdrawals, commissions] = await Promise.all([
      // 充值（近30天 paid）
      db.select({
        id: schema.rechargeOrders.id,
        userId: schema.rechargeOrders.userId,
        type: sql<string>`'recharge'`,
        typeLabel: sql<string>`'充值'`,
        amount: schema.rechargeOrders.amount,
        status: schema.rechargeOrders.status,
        statusLabel: sql<string>`case when ${schema.rechargeOrders.status}='paid' then '成功' when ${schema.rechargeOrders.status}='pending' then '待审核' else '其他' end`,
        createdAt: schema.rechargeOrders.createdAt,
      })
        .from(schema.rechargeOrders)
        .where(and(gte(schema.rechargeOrders.createdAt, limitDate), eq(schema.rechargeOrders.status, 'paid')))
        .limit(limit),
      // 退款（近30天）
      db.select({
        id: schema.balanceTransactions.id,
        userId: schema.balanceTransactions.userId,
        type: sql<string>`'refund'`,
        typeLabel: sql<string>`'退款'`,
        amount: sql<number>`abs(${schema.balanceTransactions.amount})`,
        status: sql<string>`'completed'`,
        statusLabel: sql<string>`'成功'`,
        createdAt: schema.balanceTransactions.createdAt,
      })
        .from(schema.balanceTransactions)
        .where(and(gte(schema.balanceTransactions.createdAt, limitDate), eq(schema.balanceTransactions.type, 'refund')))
        .limit(limit),
      // 提现（近30天）
      db.select({
        id: schema.agentWithdrawals.id,
        userId: sql<number>`0`,
        type: sql<string>`'withdrawal'`,
        typeLabel: sql<string>`'提现'`,
        amount: sql<number>`abs(${schema.agentWithdrawals.amount})`,
        status: schema.agentWithdrawals.status,
        statusLabel: sql<string>`case when ${schema.agentWithdrawals.status}='pending' then '待审核' when ${schema.agentWithdrawals.status}='completed' then '已到账' when ${schema.agentWithdrawals.status}='processing' then '处理中' else '已拒绝' end`,
        createdAt: schema.agentWithdrawals.createdAt,
      })
        .from(schema.agentWithdrawals)
        .where(gte(schema.agentWithdrawals.createdAt, limitDate))
        .limit(limit),
      // 佣金（近30天 settled）
      db.select({
        id: schema.agentCommissions.id,
        userId: schema.agentCommissions.customerUserId,
        type: sql<string>`'commission'`,
        typeLabel: sql<string>`'佣金'`,
        amount: sql<number>`abs(${schema.agentCommissions.amount})`,
        status: sql<string>`'settled'`,
        statusLabel: sql<string>`'已结算'`,
        createdAt: schema.agentCommissions.createdAt,
      })
        .from(schema.agentCommissions)
        .where(and(gte(schema.agentCommissions.createdAt, limitDate), eq(schema.agentCommissions.status, 'settled')))
        .limit(limit),
    ]);

    // 客户邮箱映射
    const userIds = [...new Set([...recharges, ...refunds, ...withdrawals, ...commissions].map(r => r.userId).filter((id): id is number => !!id && id > 0))];
    const users: Record<number, string> = {};
    if (userIds.length > 0) {
      const userRows = await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.id, userIds));
      for (const u of userRows) users[u.id] = u.email;
    }

    const rows = [...recharges, ...refunds, ...withdrawals, ...commissions]
      .map(r => ({
        ...r,
        amount: toNum(r.amount),
        customer: users[r.userId] ?? null,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    return reply.send({ data: rows });
  });

  /** GET /api/v1/admin/finance/accounts — 平台资金账户总览
   * 数据源：customer_balances（用户资金池）、balance_transactions（资金流水，单一数据源）、
   * agent_commissions / agent_withdrawals（代理侧待结算）。
   * 口径：total = 用户可用 + 冻结；毛利 = 累计充值 − 累计退款 − 已结算佣金（与财务工作台一致）。
   */
  app.get('/api/v1/admin/finance/accounts', { preHandler: [adminAuth] }, async (_request, reply) => {
    // 1. 用户资金池合计
    const [userBal] = await db
      .select({
        available: sql<number>`coalesce(sum(available_balance),0)`,
        frozen: sql<number>`coalesce(sum(frozen_balance),0)`,
      })
      .from(schema.customerBalances);

    // 2. 平台累计收支（balance_transactions 单一数据源；amount 符号约定：充值+ 消费/退款/佣金/提现−）
    const [agg] = await db
      .select({
        recharge: sql<number>`coalesce(sum(abs(amount)) filter (where type='recharge'),0)`,
        consumption: sql<number>`coalesce(sum(abs(amount)) filter (where type='consumption'),0)`,
        refund: sql<number>`coalesce(sum(abs(amount)) filter (where type='refund'),0)`,
        commission: sql<number>`coalesce(sum(abs(amount)) filter (where type='commission'),0)`,
        withdrawal: sql<number>`coalesce(sum(abs(amount)) filter (where type='withdrawal'),0)`,
        adjustmentIn: sql<number>`coalesce(sum(amount) filter (where type='adjustment' and amount>0),0)`,
      })
      .from(schema.balanceTransactions);

    // 3. 待结算佣金 / 进行中提现
    const [commPending] = await db
      .select({ pending: sql<number>`coalesce(sum(amount),0)` })
      .from(schema.agentCommissions)
      .where(eq(schema.agentCommissions.status, 'pending'));
    const [withdrawPending] = await db
      .select({ pending: sql<number>`coalesce(sum(amount),0)` })
      .from(schema.agentWithdrawals)
      .where(inArray(schema.agentWithdrawals.status, ['pending', 'processing']));

    const userAvailable = toNum(userBal?.available);
    const userFrozen = toNum(userBal?.frozen);
    const commissionPending = toNum(commPending?.pending);
    const withdrawalPending = toNum(withdrawPending?.pending);

    const recharge = toNum(agg?.recharge);
    const consumption = toNum(agg?.consumption);
    const refund = toNum(agg?.refund);
    const commissionPaid = toNum(agg?.commission);
    const withdrawalDone = toNum(agg?.withdrawal);

    const frozenDetail = [
      { label: '代理待结算佣金', amount: round2(commissionPending) },
      { label: '进行中提现', amount: round2(withdrawalPending) },
      { label: '用户冻结余额', amount: round2(userFrozen) },
    ];
    const frozenTotal = round2(frozenDetail.reduce((s, f) => s + f.amount, 0));
    const totalBalance = round2(userAvailable + frozenTotal);
    const grossProfit = round2(recharge - refund - commissionPaid);
    const grossMargin = recharge > 0 ? Math.round((grossProfit / recharge) * 10000) / 100 : 0;

    return reply.send({
      data: {
        total_balance: totalBalance,
        available_balance: round2(userAvailable),
        frozen_balance: frozenTotal,
        frozen_detail: frozenDetail,
        user_recharge_total: round2(recharge),
        user_consumption_total: round2(consumption),
        refund_total: round2(refund),
        agent_commission_paid: round2(commissionPaid),
        agent_commission_pending: round2(commissionPending),
        withdrawal_pending: round2(withdrawalPending),
        withdrawal_completed: round2(withdrawalDone),
        platform_gross_profit: grossProfit,
        platform_gross_margin: grossMargin,
      },
    });
  });

  /** GET /api/v1/admin/finance/accounts/trend?days=30 — 近 N 天资金累计趋势 */
  app.get('/api/v1/admin/finance/accounts/trend', { preHandler: [adminAuth] }, async (request, reply) => {
    const days = Math.min(Number((request.query as any).days ?? 30), 90);
    const rows = await db.execute(sql`
      SELECT to_char(created_at::date,'YYYY-MM-DD') AS d, coalesce(sum(amount),0) AS net
      FROM balance_transactions
      WHERE created_at >= now() - make_interval(days => ${days})
      GROUP BY d ORDER BY d`);
    let cum = 0;
    const trend = (rows as any[]).map((r: any) => {
      cum = round2(cum + Number(r.net));
      return { date: r.d, total: cum, net: Number(r.net) };
    });
    return reply.send({ data: { trend } });
  });

  /** GET /api/v1/admin/finance/close/status?period=YYYY-MM — 结账状态（过期临时解锁自动重锁） */
  app.get('/api/v1/admin/finance/close/status', { preHandler: [adminAuth] }, async (request, reply) => {
    const period = (request.query as any).period ?? new Date().toISOString().slice(0, 7);
    let rec = await db.select().from(schema.accountingPeriods).where(eq(schema.accountingPeriods.period, period)).limit(1);
    // 临时解锁超过 1 小时 → 自动重锁
    if (rec[0] && rec[0].status === 'unlocked' && rec[0].relockAt && rec[0].relockAt.getTime() <= Date.now()) {
      await db.update(schema.accountingPeriods).set({ status: 'locked' }).where(eq(schema.accountingPeriods.id, rec[0].id));
      rec = await db.select().from(schema.accountingPeriods).where(eq(schema.accountingPeriods.period, period)).limit(1);
    }
    const r = rec[0];
    return reply.send({
      data: {
        period,
        status: r?.status ?? 'open',
        status_label: PERIOD_STATUS_LABEL[r?.status ?? 'open'],
        record: r
          ? {
              ...r,
              income_total: toNum(r.incomeTotal),
              expense_total: toNum(r.expenseTotal),
              gross_profit: toNum(r.grossProfit),
              gross_margin: toNum(r.grossMargin),
            }
          : null,
      },
    });
  });

  /** POST /api/v1/admin/finance/close/execute — 执行月结：按资金流水统计收入/支出/毛利并锁账 */
  app.post('/api/v1/admin/finance/close/execute', { preHandler: [adminAuth] }, async (request, reply) => {
    const { period: p } = (request.body ?? {}) as { period?: string };
    const period = p ?? new Date().toISOString().slice(0, 7);
    const operatorId = (request as any).userContext?.userId ?? 0;

    const ex = await db.select().from(schema.accountingPeriods).where(eq(schema.accountingPeriods.period, period)).limit(1);
    if (ex[0] && ex[0].status === 'locked') {
      return reply.code(409).send({ code: 409, error: 'LOCKED', message: '该期间已锁账' });
    }

    // 口径：收入 = 充值 + 消费 + 正向调账；支出 = 退款 + 佣金 + 提现 + 负向调账
    const { start, end } = monthRangeOf(period);
    const [agg] = await db
      .select({
        income: sql<number>`coalesce(sum(abs(amount)) filter (where type in ('recharge','consumption')),0)
          + coalesce(sum(amount) filter (where type='adjustment' and amount>0),0)`,
        expense: sql<number>`coalesce(sum(abs(amount)) filter (where type in ('refund','commission','withdrawal')),0)
          + coalesce(sum(abs(amount)) filter (where type='adjustment' and amount<0),0)`,
      })
      .from(schema.balanceTransactions)
      .where(and(gte(schema.balanceTransactions.createdAt, start), lte(schema.balanceTransactions.createdAt, end)));

    const income = toNum(agg?.income);
    const expense = toNum(agg?.expense);
    const profit = round2(income - expense);
    const margin = income > 0 ? Math.round((profit / income) * 10000) / 100 : 0;
    const voucherNo = `V${period.replace('-', '')}${String(Date.now()).slice(-4)}`;

    if (ex[0]) {
      await db.update(schema.accountingPeriods)
        .set({
          status: 'locked', incomeTotal: String(income), expenseTotal: String(expense),
          grossProfit: String(profit), grossMargin: String(margin),
          lockedBy: operatorId, lockedAt: new Date(), voucherNo, unlockedReason: null,
        })
        .where(eq(schema.accountingPeriods.id, ex[0].id));
    } else {
      await db.insert(schema.accountingPeriods)
        .values({
          period, status: 'locked', incomeTotal: String(income), expenseTotal: String(expense),
          grossProfit: String(profit), grossMargin: String(margin),
          lockedBy: operatorId, lockedAt: new Date(), voucherNo,
        });
    }
    return reply.send({
      data: { period, status: 'locked', income_total: income, expense_total: expense, gross_profit: profit, gross_margin: margin, voucher_no: voucherNo },
      message: '结账完成',
    });
  });

  /** GET /api/v1/admin/finance/close/history — 历史结账记录 */
  app.get('/api/v1/admin/finance/close/history', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rec = await db.select().from(schema.accountingPeriods).orderBy(desc(schema.accountingPeriods.period)).limit(24);
    return reply.send({
      data: {
        list: rec.map((r) => ({
          ...r,
          income_total: toNum(r.incomeTotal),
          expense_total: toNum(r.expenseTotal),
          gross_profit: toNum(r.grossProfit),
          gross_margin: toNum(r.grossMargin),
          status_label: PERIOD_STATUS_LABEL[r.status],
        })),
      },
    });
  });

  /** POST /api/v1/admin/finance/close/:period/unlock — 超管临时解锁（1 小时后自动重锁） */
  app.post('/api/v1/admin/finance/close/:period/unlock', { preHandler: [superAdminAuth] }, async (request, reply) => {
    const period = (request.params as { period: string }).period;
    const { reason } = (request.body ?? {}) as { reason?: string };
    if (!reason) return reply.code(400).send({ code: 400, error: 'BAD_PARAMS', message: '解锁理由必填' });
    const now = new Date();
    const relock = new Date(now.getTime() + 3600 * 1000);
    const operatorId = (request as any).userContext?.userId ?? 0;

    const rec = await db.select().from(schema.accountingPeriods).where(eq(schema.accountingPeriods.period, period)).limit(1);
    if (rec[0]) {
      await db.update(schema.accountingPeriods)
        .set({ status: 'unlocked', unlockedBy: operatorId, unlockedReason: reason, unlockedAt: now, relockAt: relock })
        .where(eq(schema.accountingPeriods.id, rec[0].id));
    } else {
      await db.insert(schema.accountingPeriods)
        .values({ period, status: 'unlocked', unlockedBy: operatorId, unlockedReason: reason, unlockedAt: now, relockAt: relock });
    }
    return reply.send({ data: { period, status: 'unlocked', relock_at: relock.toISOString() }, message: '已临时解锁（1 小时后自动重锁）' });
  });

  /** GET /api/v1/admin/commission/flow — 佣金工作台（全局概览 + 代理商账本 + 明细流水，均为元）
   *
   * 查询参数：
   *   keyword   — 代理商邮箱/昵称模糊搜索（作用于账本、概览与明细）
   *   agent_id  — 只看某代理（作用于账本、概览与明细）
   *   period    — today/week/month/all（仅作用于明细时间范围；账本/概览为累计口径）
   *   status    — 明细佣金状态过滤（pending/settled/cancelled）
   *   page/page_size — 明细分页
   *
   * 账本勾稽：可提现 = 已结算 − 已提现 − 审核中（按流水实时算），与 agents.available_balance 对照 balance_matched。
   */
  app.get('/api/v1/admin/commission/flow', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as {
      keyword?: string; period?: string; agent_id?: string; status?: string;
      page?: string; page_size?: string;
    };
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 200);
    const offset = (page - 1) * pageSize;
    const start = periodRange(q.period ?? 'month');

    // ── 代理商基础（账本 / 搜索上下文）──
    const keyword = q.keyword?.trim();
    const agentWhere: any[] = [];
    if (keyword) {
      const like = `%${keyword}%`;
      agentWhere.push(sql`(${schema.users.email} ILIKE ${like} OR ${schema.users.name} ILIKE ${like})`);
    }
    const agentWhereClause = agentWhere.length ? and(...agentWhere) : undefined;
    const agentRowsAll = await db
      .select({
        id: schema.agents.id,
        userId: schema.agents.userId,
        level: schema.agents.level,
        commissionRate: schema.agents.commissionRate,
        totalEarnings: schema.agents.totalEarnings,
        availableBalance: schema.agents.availableBalance,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.agents)
      .innerJoin(schema.users, eq(schema.users.id, schema.agents.userId))
      .where(agentWhereClause)
      .orderBy(desc(schema.agents.totalEarnings));
    let agentRows = agentRowsAll;
    if (q.agent_id && agentRowsAll.some((r) => r.id === Number(q.agent_id))) {
      agentRows = agentRowsAll.filter((r) => r.id === Number(q.agent_id));
    }

    const agentIds = agentRows.map((r) => r.id);

    // ── 每代理聚合：佣金 / 提现 / 客户数 / 未来可收佣 ──
    const settledMap: Record<number, number> = {};
    const monthMap: Record<number, number> = {};
    const pendingMap: Record<number, number> = {};
    const inReviewMap: Record<number, number> = {};
    const withdrawnMap: Record<number, number> = {};
    const futureMap: Record<number, number> = {};
    const customerCountMap: Record<number, number> = {};
    let pendingWithdrawCount = 0;

    if (agentIds.length > 0) {
      // 注：本仓库 postgres 驱动对 raw sql 模板里的 Date 参数会抛 ERR_INVALID_ARG_TYPE → 用 ISO 字符串
      const { start: mStart, end: mEnd } = monthRange();
      const mStartISO = mStart.toISOString();
      const mEndISO = mEnd.toISOString();
      const [commAgg, wdAgg, futureAgg, custAgg, pendingWd] = await Promise.all([
        db.select({
          agentId: schema.agentCommissions.agentId,
          settled: sql<number>`coalesce(sum(${schema.agentCommissions.amount}) filter (where status='settled'),0)`,
          monthSettled: sql<number>`coalesce(sum(${schema.agentCommissions.amount}) filter (where status='settled' and ${schema.agentCommissions.createdAt} >= ${mStartISO} and ${schema.agentCommissions.createdAt} < ${mEndISO}),0)`,
          pending: sql<number>`coalesce(sum(${schema.agentCommissions.amount}) filter (where status='pending'),0)`,
        })
          .from(schema.agentCommissions)
          .where(inArray(schema.agentCommissions.agentId, agentIds))
          .groupBy(schema.agentCommissions.agentId),
        db.select({
          agentId: schema.agentWithdrawals.agentId,
          inReview: sql<number>`coalesce(sum(${schema.agentWithdrawals.amount}) filter (where ${schema.agentWithdrawals.status} in ('pending','processing')),0)`,
          withdrawn: sql<number>`coalesce(sum(${schema.agentWithdrawals.amount}) filter (where status='completed'),0)`,
        })
          .from(schema.agentWithdrawals)
          .where(inArray(schema.agentWithdrawals.agentId, agentIds))
          .groupBy(schema.agentWithdrawals.agentId),
        db.select({
          agentId: schema.agentCustomers.agentId,
          balance: sql<number>`coalesce(sum(${schema.customerBalances.availableBalance}),0)`,
        })
          .from(schema.agentCustomers)
          .innerJoin(schema.customerBalances, eq(schema.customerBalances.userId, schema.agentCustomers.customerUserId))
          .where(and(eq(schema.agentCustomers.status, 'active'), inArray(schema.agentCustomers.agentId, agentIds)))
          .groupBy(schema.agentCustomers.agentId),
        db.select({
          agentId: schema.agentCustomers.agentId,
          count: sql<number>`count(*)::int`,
        })
          .from(schema.agentCustomers)
          .where(and(eq(schema.agentCustomers.status, 'active'), inArray(schema.agentCustomers.agentId, agentIds)))
          .groupBy(schema.agentCustomers.agentId),
        db.select({ count: sql<number>`count(*)::int` })
          .from(schema.agentWithdrawals)
          .where(and(eq(schema.agentWithdrawals.status, 'pending'), inArray(schema.agentWithdrawals.agentId, agentIds))),
      ]);

      for (const r of commAgg) {
        settledMap[r.agentId] = toNum(r.settled);
        monthMap[r.agentId] = toNum(r.monthSettled);
        pendingMap[r.agentId] = toNum(r.pending);
      }
      for (const r of wdAgg) {
        inReviewMap[r.agentId] = toNum(r.inReview);
        withdrawnMap[r.agentId] = toNum(r.withdrawn);
      }
      for (const r of futureAgg) futureMap[r.agentId] = toNum(r.balance);
      for (const r of custAgg) customerCountMap[r.agentId] = r.count;
      pendingWithdrawCount = Number(pendingWd[0]?.count ?? 0);
    }

    // ── 代理商账本 ──
    const agentsLedger = agentRows.map((r) => {
      const rate = toNum(r.commissionRate);
      const settled = settledMap[r.id] ?? 0;
      const inReview = inReviewMap[r.id] ?? 0;
      const withdrawn = withdrawnMap[r.id] ?? 0;
      const withdrawable = Math.max(0, round2(settled - withdrawn - inReview));
      const future = round2((futureMap[r.id] ?? 0) * rate / 100);
      const balance = round2(toNum(r.availableBalance));
      return {
        id: r.id,
        user_id: r.userId,
        agent_name: r.name || r.email,
        email: r.email,
        level: r.level,
        level_label: LEVEL_LABEL[r.level] ?? r.level,
        rate,
        customer_count: customerCountMap[r.id] ?? 0,
        settled: round2(settled),
        month_settled: round2(monthMap[r.id] ?? 0),
        pending: round2(pendingMap[r.id] ?? 0),
        withdrawable,
        in_review: round2(inReview),
        withdrawn: round2(withdrawn),
        future,
        total_earnings: round2(toNum(r.totalEarnings)),
        available_balance: balance,
        balance_matched: Math.abs(balance - withdrawable) < 0.01,
      };
    });

    // ── 概览（累计口径，随搜索上下文变化）──
    const totalWithdrawable = round2(agentsLedger.reduce((s, a) => s + a.withdrawable, 0));
    const totalInReview = round2(agentsLedger.reduce((s, a) => s + a.in_review, 0));
    const totalFuture = round2(agentsLedger.reduce((s, a) => s + a.future, 0));
    const monthSettled = round2(agentsLedger.reduce((s, a) => s + a.month_settled, 0));

    // ── 明细流水（受 keyword/agent_id/status/period 共同过滤）──
    const contextConditions: any[] = [];
    if (keyword) contextConditions.push(inArray(schema.agentCommissions.agentId, agentIds));
    if (q.agent_id) contextConditions.push(eq(schema.agentCommissions.agentId, Number(q.agent_id)));

    const VALID_COMM_STATUS = ['pending', 'settled', 'cancelled'] as const;
    const listConditions = [...contextConditions];
    if (q.status && (VALID_COMM_STATUS as readonly string[]).includes(q.status)) {
      listConditions.push(eq(schema.agentCommissions.status, q.status as (typeof VALID_COMM_STATUS)[number]));
    }
    if (start) listConditions.push(gte(schema.agentCommissions.createdAt, start));
    const listWhere = listConditions.length ? and(...listConditions) : undefined;
    const contextWhere = contextConditions.length ? and(...contextConditions) : undefined;

    const [rows, countResult, scopedAgg] = await Promise.all([
      db.select({
        id: schema.agentCommissions.id,
        agentId: schema.agentCommissions.agentId,
        customerEmail: schema.users.email,
        consumeAmount: schema.consumptionRecords.cost,
        rate: schema.agentCommissions.rate,
        commission: schema.agentCommissions.amount,
        status: schema.agentCommissions.status,
        createdAt: schema.agentCommissions.createdAt,
      })
        .from(schema.agentCommissions)
        .innerJoin(schema.users, eq(schema.users.id, schema.agentCommissions.customerUserId))
        .leftJoin(schema.consumptionRecords, eq(schema.consumptionRecords.id, schema.agentCommissions.consumptionRecordId))
        .where(listWhere)
        .orderBy(desc(schema.agentCommissions.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(schema.agentCommissions)
        .where(listWhere),
      db.select({
        total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}) filter (where ${schema.agentCommissions.status} <> 'cancelled'),0)`,
        agentCount: sql<number>`count(distinct ${schema.agentCommissions.agentId})::int`,
        avgRate: sql<number>`coalesce(avg(${schema.agentCommissions.rate}),0)`,
        maxCommission: sql<number>`coalesce(max(${schema.agentCommissions.amount}) filter (where ${schema.agentCommissions.status} <> 'cancelled'),0)`,
      })
        .from(schema.agentCommissions)
        .where(contextWhere),
    ]);

    const agentNameById: Record<number, string> = {};
    for (const r of agentRowsAll) agentNameById[r.id] = r.name || r.email;

    const list = rows.map((r) => ({
      id: r.id,
      agent_id: r.agentId,
      agent_name: agentNameById[r.agentId] ?? `#${r.agentId}`,
      customer_name: r.customerEmail,
      consume_amount: toNum(r.consumeAmount),
      commission_rate: toNum(r.rate),
      commission: toNum(r.commission),
      status: r.status,
      created_at: r.createdAt.toISOString(),
    }));

    const summary = {
      total: round2(toNum(scopedAgg[0]?.total)),
      agent_count: Number(scopedAgg[0]?.agentCount ?? 0),
      avg_rate: Math.round(toNum(scopedAgg[0]?.avgRate) * 100) / 100,
      max_commission: round2(toNum(scopedAgg[0]?.maxCommission)),
      month_settled: monthSettled,
      total_withdrawable: totalWithdrawable,
      total_in_review: totalInReview,
      total_future: totalFuture,
      pending_withdraw_count: pendingWithdrawCount,
    };

    return reply.send({
      data: {
        summary,
        agents: agentsLedger,
        list,
        pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) },
      },
    });
  });
}
