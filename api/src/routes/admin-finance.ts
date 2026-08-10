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

function monthRange(reference?: Date): { start: Date; end: Date } {
  const now = reference ?? new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

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
        .where(eq(schema.invoices.status, 'draft')),
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
}
