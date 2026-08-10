/**
 * 管理端客户管理 API
 *
 * 端点覆盖：
 *   GET   /api/v1/admin/customers             — 客户列表（分页 / 搜索 / 状态筛选，含余额）
 *   PATCH /api/v1/admin/customers/:id/status  — 启用 / 禁用客户
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, sql, desc } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';

/* ───────── helpers ───────── */

async function adminAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
  const { role } = payload as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

interface PaginationQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  status?: string;
}

function parsePagination(query: PaginationQuery) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || '20', 10) || 20));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

/* ───────── route plugin ───────── */

export async function adminCustomerRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/admin/customers — 客户列表
   * 仅 customer 角色；搜索命中 email/name；状态筛选命中 users.status。
   */
  app.get('/api/v1/admin/customers', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as PaginationQuery;
    const { page, pageSize, offset } = parsePagination(q);

    const conditions: any[] = [eq(schema.users.role, 'customer')];
    if (q.search) {
      conditions.push(
        sql`(${schema.users.email} ILIKE ${'%' + q.search + '%'} OR ${schema.users.name} ILIKE ${'%' + q.search + '%'})`,
      );
    }
    if (q.status) {
      conditions.push(eq(schema.users.status, q.status));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          status: schema.users.status,
          createdAt: schema.users.createdAt,
          availableBalance: schema.customerBalances.availableBalance,
          frozenBalance: schema.customerBalances.frozenBalance,
          totalBalance: schema.customerBalances.totalBalance,
        })
        .from(schema.users)
        .leftJoin(schema.customerBalances, eq(schema.customerBalances.userId, schema.users.id))
        .where(whereClause)
        .orderBy(desc(schema.users.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(schema.users).where(whereClause),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    const list = rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      status: r.status,
      createdAt: r.createdAt,
      availableBalance: Number(r.availableBalance ?? 0),
      frozenBalance: Number(r.frozenBalance ?? 0),
      totalBalance: Number(r.totalBalance ?? 0),
    }));

    return reply.send({
      data: list,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  });

  /**
   * PATCH /api/v1/admin/customers/:id/status — 启用 / 禁用客户
   * body: { status: 'active' | 'disabled' }
   */
  app.patch('/api/v1/admin/customers/:id/status', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) throw new ValidationError('Invalid id');

    const { status } = (request.body || {}) as { status?: string };
    if (status !== 'active' && status !== 'disabled') {
      throw new ValidationError('status must be active | disabled');
    }

    const [row] = await db
      .update(schema.users)
      .set({ status, updatedAt: sql`NOW()` })
      .where(eq(schema.users.id, id))
      .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, status: schema.users.status });
    if (!row) throw new NotFoundError('Customer not found');

    return reply.send({ data: row });
  });
}
