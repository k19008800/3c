/**
 * 代理商管理 API — /api/v1/admin/agents
 *
 * 提供代理商列表（含用户信息 + 归属客户数 + 佣金汇总 + 月度佣金）。
 * 数据源：agents 表（join users）+ agent_customers + agent_commissions + agent_withdrawals。
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, sql, inArray, gte, lte } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
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

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

/** 本月区间 */
function monthRange(): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

/** 代理商等级 → 中文文案 */
const LEVEL_LABEL: Record<string, string> = {
  junior: '初级代理',
  senior: '高级代理',
  partner: '合作伙伴',
};

export async function adminAgentRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/agents — 代理商列表 + 汇总统计 */
  app.get('/api/v1/admin/agents', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { search?: string; page?: string; page_size?: string };
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 200);
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    if (q.search) {
      conditions.push(
        sql`(${schema.users.email} ILIKE ${'%' + q.search + '%'} OR ${schema.users.name} ILIKE ${'%' + q.search + '%'})`
      );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const { start, end } = monthRange();

    // 列表 + 总数 + 全局汇总（并行）
    const [rows, countResult, totalCustAgg, monthCommTotal, pendingWithdrawAgg] = await Promise.all([
      db
        .select({
          id: schema.agents.id,
          userId: schema.agents.userId,
          level: schema.agents.level,
          commissionRate: schema.agents.commissionRate,
          totalEarnings: schema.agents.totalEarnings,
          availableBalance: schema.agents.availableBalance,
          status: schema.agents.status,
          inviteCode: schema.agents.inviteCode,
          createdAt: schema.agents.createdAt,
          email: schema.users.email,
          name: schema.users.name,
        })
        .from(schema.agents)
        .innerJoin(schema.users, eq(schema.users.id, schema.agents.userId))
        .where(whereClause)
        .orderBy(schema.agents.id)
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.agents)
        .innerJoin(schema.users, eq(schema.users.id, schema.agents.userId))
        .where(whereClause),
      db.select({ total: sql<number>`count(*)::int` }).from(schema.agentCustomers),
      db
        .select({ total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)` })
        .from(schema.agentCommissions)
        .where(and(
          eq(schema.agentCommissions.status, 'settled'),
          gte(schema.agentCommissions.createdAt, start),
          lte(schema.agentCommissions.createdAt, end),
        )),
      db
        .select({
          total: sql<number>`coalesce(sum(abs(${schema.agentWithdrawals.amount})),0)`,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.agentWithdrawals)
        .where(eq(schema.agentWithdrawals.status, 'pending')),
    ]);

    // 每行：归属客户数 + 累计佣金 + 本月佣金
    const ids = rows.map(r => r.id);
    const customerCounts: Record<number, number> = {};
    const commissionTotals: Record<number, number> = {};
    const monthCommissions: Record<number, number> = {};
    if (ids.length > 0) {
      const [custAgg, commAgg, monthCommAgg] = await Promise.all([
        db
          .select({ agentId: schema.agentCustomers.agentId, count: sql<number>`count(*)::int` })
          .from(schema.agentCustomers)
          .where(inArray(schema.agentCustomers.agentId, ids))
          .groupBy(schema.agentCustomers.agentId),
        db
          .select({ agentId: schema.agentCommissions.agentId, total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)` })
          .from(schema.agentCommissions)
          .where(and(inArray(schema.agentCommissions.agentId, ids), eq(schema.agentCommissions.status, 'settled')))
          .groupBy(schema.agentCommissions.agentId),
        db
          .select({ agentId: schema.agentCommissions.agentId, total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)` })
          .from(schema.agentCommissions)
          .where(and(
            inArray(schema.agentCommissions.agentId, ids),
            eq(schema.agentCommissions.status, 'settled'),
            gte(schema.agentCommissions.createdAt, start),
            lte(schema.agentCommissions.createdAt, end),
          ))
          .groupBy(schema.agentCommissions.agentId),
      ]);
      for (const c of custAgg) customerCounts[c.agentId] = c.count;
      for (const c of commAgg) commissionTotals[c.agentId] = toNum(c.total);
      for (const c of monthCommAgg) monthCommissions[c.agentId] = toNum(c.total);
    }

    const list = rows.map(r => ({
      id: r.id,
      userId: r.userId,
      email: r.email,
      name: r.name,
      level: r.level,
      levelLabel: LEVEL_LABEL[r.level] ?? r.level,
      commissionRate: toNum(r.commissionRate),
      totalEarnings: toNum(r.totalEarnings),
      availableBalance: toNum(r.availableBalance),
      status: r.status,
      inviteCode: r.inviteCode,
      createdAt: r.createdAt,
      customerCount: customerCounts[r.id] ?? 0,
      totalCommission: commissionTotals[r.id] ?? 0,
      monthCommission: monthCommissions[r.id] ?? 0,
    }));

    const total = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return reply.send({
      data: list,
      pagination: { page, pageSize, total, totalPages },
      summary: {
        total,
        totalCustomers: Number(totalCustAgg[0]?.total ?? 0),
        monthCommission: toNum(monthCommTotal[0]?.total),
        pendingWithdrawal: toNum(pendingWithdrawAgg[0]?.total),
        pendingWithdrawalCount: Number(pendingWithdrawAgg[0]?.count ?? 0),
      },
    });
  });

  /** PUT /api/v1/admin/agents/:id — 更新佣金比例 / 状态（禁用·启用） */
  app.put('/api/v1/admin/agents/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const agentId = parseInt(id, 10);
    if (!Number.isInteger(agentId) || agentId <= 0) throw new ValidationError('Invalid agent id');

    const body = (request.body || {}) as { commissionRate?: number; status?: string };
    const patches: Record<string, unknown> = {};
    if (body.commissionRate !== undefined) {
      const rate = Number(body.commissionRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        throw new ValidationError('commissionRate 需为 0-100 的数值');
      }
      patches.commissionRate = rate;
    }
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'disabled') {
        throw new ValidationError('status 仅支持 active / disabled');
      }
      patches.status = body.status;
    }
    if (Object.keys(patches).length === 0) throw new ValidationError('无可更新字段');

    const [updated] = await db
      .update(schema.agents)
      .set(patches)
      .where(eq(schema.agents.id, agentId))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: '代理不存在' });
    }
    return reply.send({ data: updated });
  });
}
