/**
 * 业务看板 API — /api/v1/admin/dashboard
 *
 * 提供 Admin 业务看板所需数据：
 *   - GET /admin/dashboard — 充值排行榜 Top 10（充值客户聚合）
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, sql, desc } from 'drizzle-orm';
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

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

export async function adminDashboardRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/dashboard — 业务看板汇总数据（充值排行榜 Top 10） */
  app.get('/api/v1/admin/dashboard', { preHandler: [adminAuth] }, async (_request, reply) => {
    // 充值排行榜：按已支付充值订单的用户聚合，金额降序取前 10
    const rows = await db
      .select({
        userId: schema.rechargeOrders.userId,
        email: schema.users.email,
        name: schema.users.name,
        totalAmount: sql<string>`coalesce(sum(${schema.rechargeOrders.amount}), 0)`,
        count: sql<number>`count(*)::int`,
        lastPaidAt: sql<Date>`max(${schema.rechargeOrders.paidAt})`,
      })
      .from(schema.rechargeOrders)
      .leftJoin(schema.users, eq(schema.users.id, schema.rechargeOrders.userId))
      .where(eq(schema.rechargeOrders.status, 'paid'))
      .groupBy(schema.rechargeOrders.userId, schema.users.email, schema.users.name)
      .orderBy(desc(sql`sum(${schema.rechargeOrders.amount})`))
      .limit(10);

    const topRechargers = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      email: r.email ?? '-',
      name: r.name ?? '',
      amount: toNum(r.totalAmount),
      count: toNum(r.count),
      lastPaidAt: r.lastPaidAt,
    }));

    return reply.send({ data: { topRechargers } });
  });
}
