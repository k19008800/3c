/**
 * 管理端客户管理 API
 *
 * 端点覆盖：
 *   GET   /api/v1/admin/customers                 — 客户列表（分页 / 搜索 / 状态筛选，含余额）
 *   GET   /api/v1/admin/customers/:id             — 客户详情（基本资料 + 余额）
 *   GET   /api/v1/admin/customers/:id/consumption — 客户消费记录（近期）
 *   GET   /api/v1/admin/customers/:id/api-keys    — 客户 API Key 列表（仅前缀，不泄露完整 Key）
 *   GET   /api/v1/admin/customers/:id/tickets     — 客户工单列表
 *   PATCH /api/v1/admin/customers/:id/status      — 启用 / 禁用客户
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, sql, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
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

function parseCustomerId(id: string): number {
  const n = parseInt(id, 10);
  if (isNaN(n) || n <= 0) throw new ValidationError('Invalid customer id');
  return n;
}

function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'active': return '正常';
    case 'disabled': return '已禁用';
    default: return status ?? '—';
  }
}

function apiKeyStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'active': return '启用';
    case 'disabled': return '已禁用';
    case 'revoked': return '已撤销';
    default: return status ?? '—';
  }
}

function ticketStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'open': return '待处理';
    case 'in_progress': return '处理中';
    case 'waiting_customer': return '待客户回复';
    case 'resolved': return '已解决';
    case 'closed': return '已关闭';
    default: return status ?? '—';
  }
}

/** 校验目标用户为 customer 角色，返回该用户行；否则 404 */
async function requireCustomer(id: number) {
  const [row] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      status: schema.users.status,
      phone: schema.users.phone,
      avatarUrl: schema.users.avatarUrl,
      emailVerified: schema.users.emailVerified,
      lastLoginAt: schema.users.lastLoginAt,
      createdAt: schema.users.createdAt,
      updatedAt: schema.users.updatedAt,
    })
    .from(schema.users)
    .where(and(eq(schema.users.id, id), eq(schema.users.role, 'customer')));
  if (!row) throw new NotFoundError('Customer');
  return row;
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
   * GET /api/v1/admin/customers/:id — 客户详情
   * 基本资料 + 余额；real-name / 额度 / 销售 / 标签字段当前后端暂无数据源，返回默认值。
   */
  app.get('/api/v1/admin/customers/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseCustomerId(request.params.id);
    const u = await requireCustomer(id);

    const [bal] = await db
      .select({
        availableBalance: schema.customerBalances.availableBalance,
        frozenBalance: schema.customerBalances.frozenBalance,
        totalBalance: schema.customerBalances.totalBalance,
      })
      .from(schema.customerBalances)
      .where(eq(schema.customerBalances.userId, id));

    return reply.send({
      data: {
        id: u.id,
        user_id: u.id,
        username: u.name,
        email: u.email,
        status: u.status,
        status_label: statusLabel(u.status),
        balance: Number(bal?.availableBalance ?? 0),
        real_name_verified: false,
        real_name_label: '未认证',
        quota_total: 0,
        quota_used: 0,
        created_at: u.createdAt,
        updated_at: u.updatedAt,
        phone: u.phone ?? null,
        company: null,
        salesperson_id: null,
        salesperson_name: null,
        tags: [],
      },
    });
  });

  /**
   * GET /api/v1/admin/customers/:id/consumption — 客户消费记录（近期，倒序）
   */
  app.get('/api/v1/admin/customers/:id/consumption', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseCustomerId(request.params.id);
    await requireCustomer(id);

    const pageSize = Math.min(200, Math.max(1, parseInt(request.query?.page_size || '50', 10) || 50));
    const rows = await db
      .select({
        id: schema.consumptionRecords.id,
        model: schema.consumptionRecords.model,
        inputTokens: schema.consumptionRecords.inputTokens,
        outputTokens: schema.consumptionRecords.outputTokens,
        totalTokens: schema.consumptionRecords.totalTokens,
        cost: schema.consumptionRecords.cost,
        fallback: schema.consumptionRecords.fallback,
        errorCode: schema.consumptionRecords.errorCode,
        createdAt: schema.consumptionRecords.createdAt,
      })
      .from(schema.consumptionRecords)
      .where(eq(schema.consumptionRecords.userId, id))
      .orderBy(desc(schema.consumptionRecords.createdAt))
      .limit(pageSize);

    const list = rows.map((r) => ({
      id: r.id,
      model_name: r.model,
      input_tokens: r.inputTokens,
      output_tokens: r.outputTokens,
      total_tokens: r.totalTokens,
      amount: Number(r.cost ?? 0),
      fallback: r.fallback,
      error_code: r.errorCode,
      created_at: r.createdAt,
    }));

    return reply.send({ data: { list, total: list.length } });
  });

  /**
   * GET /api/v1/admin/customers/:id/api-keys — 客户 API Key 列表
   * 仅返回前缀，不返回 key_hash（原始 Key 无法还原）。
   */
  app.get('/api/v1/admin/customers/:id/api-keys', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseCustomerId(request.params.id);
    await requireCustomer(id);

    const rows = await db
      .select({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        keyPrefix: schema.apiKeys.keyPrefix,
        status: schema.apiKeys.status,
        lastUsedAt: schema.apiKeys.lastUsedAt,
        createdAt: schema.apiKeys.createdAt,
      })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, id))
      .orderBy(desc(schema.apiKeys.createdAt));

    const list = rows.map((k) => ({
      id: k.id,
      name: k.name,
      key_prefix: `${k.keyPrefix}****`,
      status: k.status,
      status_label: apiKeyStatusLabel(k.status),
      last_used_at: k.lastUsedAt,
      created_at: k.createdAt,
    }));

    return reply.send({ data: { list, total: list.length } });
  });

  /**
   * GET /api/v1/admin/customers/:id/tickets — 客户工单列表（倒序）
   */
  app.get('/api/v1/admin/customers/:id/tickets', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseCustomerId(request.params.id);
    await requireCustomer(id);

    const pageSize = Math.min(200, Math.max(1, parseInt(request.query?.page_size || '50', 10) || 50));
    const rows = await db
      .select({
        id: schema.tickets.id,
        type: schema.tickets.type,
        title: schema.tickets.title,
        status: schema.tickets.status,
        priority: schema.tickets.priority,
        createdAt: schema.tickets.createdAt,
      })
      .from(schema.tickets)
      .where(eq(schema.tickets.userId, id))
      .orderBy(desc(schema.tickets.createdAt))
      .limit(pageSize);

    const list = rows.map((t) => ({
      id: t.id,
      ticket_no: `TCK${String(t.id).padStart(6, '0')}`,
      title: t.title,
      type: t.type,
      type_label: t.type,
      status: t.status,
      status_label: ticketStatusLabel(t.status),
      priority: t.priority,
      created_at: t.createdAt,
    }));

    return reply.send({ data: { list, total: list.length } });
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
    if (!row) throw new NotFoundError('Customer');

    return reply.send({ data: row });
  });

  /**
   * POST /api/v1/admin/customers — 新增客户
   * body: { email, name, customer_type: 'enterprise'|'personal', password?, phone? }
   * 默认随机密码（首次登录后可重置）；同步创建 0 余额账户。
   */
  app.post('/api/v1/admin/customers', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as {
      email?: string;
      name?: string;
      customer_type?: string;
      password?: string;
      phone?: string;
    };
    const email = (b.email ?? '').trim().toLowerCase();
    const name = (b.name ?? '').trim();
    const customerType = b.customer_type === 'enterprise' ? 'enterprise' : 'personal';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('邮箱格式不正确');
    if (!name) throw new ValidationError('客户名称不能为空');

    const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    if (exists) throw new ValidationError('该邮箱已存在');

    // 默认随机密码：Admin@ + 6 位随机，可在客户详情/重置密码时修改
    const password = b.password && b.password.length >= 8
      ? b.password
      : `Admin@${Math.random().toString(36).slice(2, 8)}`;
    const passwordHash = bcrypt.hashSync(password, 12);

    const ctx = request.userContext ?? {};
    const [user] = await db
      .insert(schema.users)
      .values({
        email,
        name,
        role: 'customer',
        status: 'active',
        passwordHash,
        customerType,
        phone: b.phone ?? null,
        emailVerified: sql`NOW()`,
      })
      .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name });

    if (!user) throw new Error('Failed to create customer');

    await db.insert(schema.customerBalances).values({
      userId: user.id,
      totalBalance: '0',
      availableBalance: '0',
      frozenBalance: '0',
    });

    await db.insert(schema.auditLogs).values({
      userId: ctx.userId ?? null,
      action: 'customer.create',
      resource: 'user',
      resourceId: String(user.id),
      details: { email, customerType },
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return reply.send({
      data: { id: user.id, email: user.email, name: user.name, customerType, defaultPassword: password },
      message: '客户创建成功',
    });
  });
}
