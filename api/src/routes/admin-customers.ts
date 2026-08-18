/**
 * 管理端客户管理 API
 *
 * 端点覆盖：
 *   GET    /api/v1/admin/customers                 — 客户列表（分页 / 搜索 / 状态筛选 / 注册时间范围，含余额）
 *   GET    /api/v1/admin/customers/:id             — 客户详情（基本资料 + 余额）
 *   PUT    /api/v1/admin/customers/:id             — 编辑客户基本信息（邮箱/名称/手机/状态）
 *   POST   /api/v1/admin/customers/:id/reset-password — 重置客户密码
 *   GET    /api/v1/admin/customers/:id/consumption — 客户消费记录（近期）
 *   GET    /api/v1/admin/customers/:id/api-keys    — 客户 API Key 列表（仅前缀，不泄露完整 Key）
 *   GET    /api/v1/admin/customers/:id/tickets     — 客户工单列表
 *   GET    /api/v1/admin/customers/:id/recharges   — 客户充值记录
 *   GET    /api/v1/admin/customers/:id/operation-logs — 客户操作日志（audit_logs）
 *   PATCH  /api/v1/admin/customers/:id/status      — 启用 / 禁用客户
 *   POST   /api/v1/admin/customers                 — 新增客户
 *   POST   /api/v1/admin/customers/batch/status          — 批量启用/禁用
 *   POST   /api/v1/admin/customers/batch/reset-password  — 批量重置密码（自动生成）
 *   POST   /api/v1/admin/customers/batch/bind-agent      — 批量绑定代理商
 *   POST   /api/v1/admin/customers/batch/verify          — 批量强制实名认证
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, sql, desc, gte, lte, inArray } from 'drizzle-orm';
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
  /** 注册时间范围（ISO 日期或 datetime，含边界） */
  date_from?: string;
  date_to?: string;
  /** 累计消费区间（元） */
  consumption_min?: string;
  consumption_max?: string;
  /** 绑定代理商：1=已绑定，0=未绑定 */
  bound?: string;
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
   * 仅 customer 角色；搜索命中 email/name；状态筛选命中 users.status；
   * 支持注册时间范围、累计消费区间、绑定代理商状态筛选。
   */
  app.get('/api/v1/admin/customers', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as PaginationQuery;
    const { page, pageSize, offset } = parsePagination(q);

    // 累计消费（consumption_records.cost 聚合）与绑定代理商名（agent_customers → agents → users）标量子查询
    const consumptionSub = sql`(select coalesce(sum(${schema.consumptionRecords.cost}), 0) from ${schema.consumptionRecords} where ${schema.consumptionRecords.userId} = ${schema.users.id})`;
    const agentNameSub = sql`(
      select su.name
      from agent_customers ac
      join agents ag on ag.id = ac.agent_id
      join users su on su.id = ag.user_id
      where ac.customer_user_id = ${schema.users.id}
      order by ac.created_at desc
      limit 1
    )`;

    const conditions: any[] = [eq(schema.users.role, 'customer')];
    if (q.search) {
      conditions.push(
        sql`(${schema.users.email} ILIKE ${'%' + q.search + '%'} OR ${schema.users.name} ILIKE ${'%' + q.search + '%'})`,
      );
    }
    if (q.status) {
      conditions.push(eq(schema.users.status, q.status));
    }
    // 注册时间范围过滤（date_from 含当天 00:00:00，date_to 含当天 23:59:59）
    if (q.date_from) {
      conditions.push(gte(schema.users.createdAt, new Date(q.date_from.replace(' ', 'T'))));
    }
    if (q.date_to) {
      conditions.push(lte(schema.users.createdAt, new Date(q.date_to.replace(' ', 'T'))));
    }
    // 累计消费区间
    if (q.consumption_min) {
      conditions.push(sql`${consumptionSub} >= ${Number(q.consumption_min)}`);
    }
    if (q.consumption_max) {
      conditions.push(sql`${consumptionSub} <= ${Number(q.consumption_max)}`);
    }
    // 绑定代理商状态
    if (q.bound === '1') {
      conditions.push(sql`exists (select 1 from ${schema.agentCustomers} where ${schema.agentCustomers.customerUserId} = ${schema.users.id})`);
    } else if (q.bound === '0') {
      conditions.push(sql`not exists (select 1 from ${schema.agentCustomers} where ${schema.agentCustomers.customerUserId} = ${schema.users.id})`);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          status: schema.users.status,
          realNameStatus: schema.users.realNameStatus,
          createdAt: schema.users.createdAt,
          availableBalance: schema.customerBalances.availableBalance,
          frozenBalance: schema.customerBalances.frozenBalance,
          totalBalance: schema.customerBalances.totalBalance,
          totalConsumption: sql<number>`coalesce(${consumptionSub}, 0)`,
          boundAgent: agentNameSub,
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
      realNameVerified: r.realNameStatus === 'approved',
      createdAt: r.createdAt,
      availableBalance: Number(r.availableBalance ?? 0),
      frozenBalance: Number(r.frozenBalance ?? 0),
      totalBalance: Number(r.totalBalance ?? 0),
      totalConsumption: Number(r.totalConsumption ?? 0),
      boundAgent: r.boundAgent ?? null,
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
   * GET /api/v1/admin/customers/:id/recharges — 客户充值记录（倒序）
   */
  app.get('/api/v1/admin/customers/:id/recharges', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseCustomerId(request.params.id);
    await requireCustomer(id);

    const pageSize = Math.min(200, Math.max(1, parseInt(request.query?.page_size || '50', 10) || 50));
    const rows = await db
      .select({
        id: schema.rechargeOrders.id,
        orderNo: schema.rechargeOrders.orderNo,
        amount: schema.rechargeOrders.amount,
        currency: schema.rechargeOrders.currency,
        method: schema.rechargeOrders.method,
        status: schema.rechargeOrders.status,
        paidAt: schema.rechargeOrders.paidAt,
        createdAt: schema.rechargeOrders.createdAt,
      })
      .from(schema.rechargeOrders)
      .where(eq(schema.rechargeOrders.userId, id))
      .orderBy(desc(schema.rechargeOrders.createdAt))
      .limit(pageSize);

    const statusMap: Record<string, string> = {
      pending: '待审核',
      paid: '成功',
      failed: '失败',
      cancelled: '已取消',
      refunded: '已退款',
    };

    const list = rows.map((r) => ({
      id: r.id,
      order_no: r.orderNo,
      amount: Number(r.amount ?? 0),
      currency: r.currency ?? 'CNY',
      method: r.method,
      status: r.status,
      status_label: statusMap[r.status] ?? r.status,
      paid_at: r.paidAt,
      created_at: r.createdAt,
    }));

    return reply.send({ data: { list, total: list.length } });
  });

  /**
   * GET /api/v1/admin/customers/:id/operation-logs — 客户操作日志（倒序）
   * 来源：audit_logs 中 resource='user' 且 resource_id=客户 id 的记录。
   */
  app.get('/api/v1/admin/customers/:id/operation-logs', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseCustomerId(request.params.id);
    await requireCustomer(id);

    const pageSize = Math.min(200, Math.max(1, parseInt(request.query?.page_size || '50', 10) || 50));
    const rows = await db
      .select({
        id: schema.auditLogs.id,
        action: schema.auditLogs.action,
        details: schema.auditLogs.details,
        userId: schema.auditLogs.userId,
        createdAt: schema.auditLogs.createdAt,
      })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.resource, 'user'), eq(schema.auditLogs.resourceId, String(id))))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(pageSize);

    const actionMap: Record<string, string> = {
      'customer.create': '新增客户',
      'customer.update': '编辑客户信息',
      'customer.reset_password': '重置密码',
      'user_status_change': '启用/禁用',
    };

    const list = rows.map((r) => ({
      id: r.id,
      action: r.action,
      action_label: actionMap[r.action] ?? r.action,
      operator_id: r.userId,
      details: r.details ?? null,
      created_at: r.createdAt,
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

    // 先取改前状态，作为撤销记录快照
    const [prev] = await db
      .select({ id: schema.users.id, name: schema.users.name, status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    if (!prev) throw new NotFoundError('Customer');

    const [row] = await db
      .update(schema.users)
      .set({ status, updatedAt: sql`NOW()` })
      .where(eq(schema.users.id, id))
      .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, status: schema.users.status });

    // 写撤销记录（运维后台 undo 可一键恢复快照；窗口期由 undo_timeout_seconds 决定，默认 300s）
    try {
      const [cfg] = await db
        .select({ value: schema.systemConfig.value })
        .from(schema.systemConfig)
        .where(eq(schema.systemConfig.key, 'undo_timeout_seconds'))
        .limit(1);
      const timeoutSeconds = Number(cfg?.value);
      await db.insert(schema.undoRecords).values({
        operationType: 'user_status_change',
        operationLabel: `${status === 'disabled' ? '禁用' : '启用'}客户 ${prev.name}`,
        targetType: 'customer',
        targetId: String(id),
        snapshot: prev.status, // 快照 = 改前状态
        operatorId: request.userContext?.userId ?? null,
        expiresAt: new Date(Date.now() + (Number.isNaN(timeoutSeconds) ? 300 : timeoutSeconds) * 1000),
      });
    } catch (err) {
      request.log.warn({ err }, '写入撤销记录失败（不影响状态切换）');
    }

    return reply.send({ data: row });
  });

  /**
   * PUT /api/v1/admin/customers/:id — 编辑客户基本信息
   * body: { email?, name?, phone?, status? }
   * 校验邮箱唯一性（排除自身）；状态仅 active | disabled。
   */
  app.put('/api/v1/admin/customers/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseCustomerId(request.params.id);
    await requireCustomer(id);

    const b = (request.body || {}) as {
      email?: string;
      name?: string;
      phone?: string | null;
      status?: string;
    };

    const updates: Partial<{
      email: string;
      name: string;
      phone: string | null;
      status: string;
      updatedAt: Date;
    }> = {};

    if (b.email !== undefined) {
      const email = String(b.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('邮箱格式不正确');
      const [dup] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.email, email), sql`${schema.users.id} <> ${id}`));
      if (dup) throw new ValidationError('该邮箱已被其他客户使用');
      updates.email = email;
    }
    if (b.name !== undefined) {
      const name = String(b.name).trim();
      if (!name) throw new ValidationError('客户名称不能为空');
      updates.name = name;
    }
    if (b.phone !== undefined) {
      updates.phone = b.phone ? String(b.phone).trim() : null;
    }
    if (b.status !== undefined) {
      if (b.status !== 'active' && b.status !== 'disabled') {
        throw new ValidationError('status must be active | disabled');
      }
      updates.status = b.status;
    }

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('没有可更新的字段');
    }

    const [before] = await db
      .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    const [row] = await db
      .update(schema.users)
      .set({ ...updates, updatedAt: sql`NOW()` })
      .where(eq(schema.users.id, id))
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        phone: schema.users.phone,
        status: schema.users.status,
      });

    if (!row) throw new Error('Failed to update customer');

    try {
      await db.insert(schema.auditLogs).values({
        userId: request.userContext?.userId ?? null,
        action: 'customer.update',
        resource: 'user',
        resourceId: String(id),
        details: {
          before: { email: before?.email, name: before?.name, status: before?.status },
          after: { email: row.email, name: row.name, status: row.status },
        },
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
    } catch (err) {
      request.log.warn({ err }, '写入审计日志失败（不影响编辑结果）');
    }

    return reply.send({ data: row, message: '客户信息已更新' });
  });

  /**
   * POST /api/v1/admin/customers/:id/reset-password — 重置客户密码
   * body: { password? }  — 传 password（≥8 位）则手动指定；不传则自动生成随机密码。
   * 返回一次性明文密码（自动生成时），仅此响应可见。
   */
  app.post('/api/v1/admin/customers/:id/reset-password', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseCustomerId(request.params.id);
    const u = await requireCustomer(id);

    const b = (request.body || {}) as { password?: string };
    const manualPw = b.password !== undefined && b.password !== null ? String(b.password).trim() : '';
    const isManual = manualPw.length > 0;
    if (isManual && manualPw.length < 8) {
      throw new ValidationError('密码长度至少 8 位');
    }

    // 自动生成：大写+小写+数字，与新增客户初始密码同风格
    const newPassword = isManual
      ? manualPw
      : `Admin@${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 10)}`;
    const passwordHash = bcrypt.hashSync(newPassword, 12);

    await db
      .update(schema.users)
      .set({ passwordHash, updatedAt: sql`NOW()` })
      .where(eq(schema.users.id, id));

    try {
      await db.insert(schema.auditLogs).values({
        userId: request.userContext?.userId ?? null,
        action: 'customer.reset_password',
        resource: 'user',
        resourceId: String(id),
        details: { email: u.email, mode: isManual ? 'manual' : 'auto' },
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
    } catch (err) {
      request.log.warn({ err }, '写入审计日志失败（不影响重置结果）');
    }

    return reply.send({
      data: { id, email: u.email, newPassword, mode: isManual ? 'manual' : 'auto' },
      message: isManual ? '密码已重置' : '密码已重置，新密码仅本次可见',
    });
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

  /**
   * POST /api/v1/admin/customers/batch/status — 批量启用/禁用客户
   * body: { ids: number[], status: 'active' | 'disabled' }
   */
  app.post('/api/v1/admin/customers/batch/status', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as { ids?: number[]; status?: string };
    const ids = Array.isArray(b.ids) ? b.ids.filter((n) => Number.isInteger(n) && n > 0) : [];
    if (ids.length === 0) throw new ValidationError('ids 不能为空');
    if (b.status !== 'active' && b.status !== 'disabled') {
      throw new ValidationError('status must be active | disabled');
    }

    const [rows, countResult] = await Promise.all([
      db
        .update(schema.users)
        .set({ status: b.status, updatedAt: sql`NOW()` })
        .where(and(inArray(schema.users.id, ids), eq(schema.users.role, 'customer')))
        .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, status: schema.users.status }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.users)
        .where(and(inArray(schema.users.id, ids), eq(schema.users.role, 'customer'))),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    try {
      await db.insert(schema.auditLogs).values({
        userId: request.userContext?.userId ?? null,
        action: 'customer.batch_status_change',
        resource: 'user',
        resourceId: ids.join(','),
        details: { ids, status: b.status, count: total },
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
    } catch (err) {
      request.log.warn({ err }, '写入审计日志失败（不影响批量结果）');
    }

    return reply.send({
      data: { updated: rows.length, status: b.status },
      message: `已${b.status === 'disabled' ? '禁用' : '启用'} ${rows.length} 个客户`,
    });
  });

  /**
   * POST /api/v1/admin/customers/batch/reset-password — 批量重置密码（自动生成）
   * body: { ids: number[] }
   * 返回每个客户的一次性明文密码，仅此响应可见。
   */
  app.post('/api/v1/admin/customers/batch/reset-password', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as { ids?: number[] };
    const ids = Array.isArray(b.ids) ? b.ids.filter((n) => Number.isInteger(n) && n > 0) : [];
    if (ids.length === 0) throw new ValidationError('ids 不能为空');

    const rows = await db
      .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(and(inArray(schema.users.id, ids), eq(schema.users.role, 'customer')));

    const results = rows.map((u) => {
      const newPassword = `Admin@${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 10)}`;
      return { id: u.id, email: u.email, name: u.name, newPassword, hash: bcrypt.hashSync(newPassword, 12) };
    });

    for (const r of results) {
      await db
        .update(schema.users)
        .set({ passwordHash: r.hash, updatedAt: sql`NOW()` })
        .where(eq(schema.users.id, r.id));
    }

    try {
      await db.insert(schema.auditLogs).values({
        userId: request.userContext?.userId ?? null,
        action: 'customer.batch_reset_password',
        resource: 'user',
        resourceId: ids.join(','),
        details: { ids, count: results.length, mode: 'auto' },
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
    } catch (err) {
      request.log.warn({ err }, '写入审计日志失败（不影响批量结果）');
    }

    return reply.send({
      data: { list: results.map(({ hash, ...rest }) => rest) },
      message: `已为 ${results.length} 个客户重置密码（自动生成）`,
    });
  });

  /**
   * POST /api/v1/admin/customers/batch/bind-agent — 批量绑定代理商
   * body: { ids: number[], agentId: number }
   */
  app.post('/api/v1/admin/customers/batch/bind-agent', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as { ids?: number[]; agentId?: number };
    const ids = Array.isArray(b.ids) ? b.ids.filter((n) => Number.isInteger(n) && n > 0) : [];
    const agentId = Number(b.agentId);
    if (ids.length === 0) throw new ValidationError('ids 不能为空');
    if (!Number.isInteger(agentId) || agentId <= 0) throw new ValidationError('agentId 无效');

    const [agent] = await db.select({ id: schema.agents.id }).from(schema.agents).where(eq(schema.agents.id, agentId));
    if (!agent) throw new NotFoundError('Agent');

    // 已绑定的客户先解绑再绑定（保证一对一）
    await db.delete(schema.agentCustomers).where(inArray(schema.agentCustomers.customerUserId, ids));
    const values = ids.map((customerUserId) => ({
      agentId,
      customerUserId,
      status: 'active',
      source: 'admin_batch',
    }));
    await db.insert(schema.agentCustomers).values(values);

    try {
      await db.insert(schema.auditLogs).values({
        userId: request.userContext?.userId ?? null,
        action: 'customer.batch_bind_agent',
        resource: 'agent',
        resourceId: String(agentId),
        details: { ids, agentId, count: ids.length },
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
    } catch (err) {
      request.log.warn({ err }, '写入审计日志失败（不影响批量结果）');
    }

    return reply.send({
      data: { bound: ids.length, agentId },
      message: `已为 ${ids.length} 个客户绑定代理商`,
    });
  });

  /**
   * POST /api/v1/admin/customers/batch/verify — 批量强制实名认证
   * body: { ids: number[] }
   */
  app.post('/api/v1/admin/customers/batch/verify', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as { ids?: number[] };
    const ids = Array.isArray(b.ids) ? b.ids.filter((n) => Number.isInteger(n) && n > 0) : [];
    if (ids.length === 0) throw new ValidationError('ids 不能为空');

    const [rows] = await Promise.all([
      db
        .update(schema.users)
        .set({ realNameStatus: 'approved', updatedAt: sql`NOW()` })
        .where(and(inArray(schema.users.id, ids), eq(schema.users.role, 'customer')))
        .returning({ id: schema.users.id, email: schema.users.email }),
    ]);

    try {
      await db.insert(schema.auditLogs).values({
        userId: request.userContext?.userId ?? null,
        action: 'customer.batch_force_verify',
        resource: 'user',
        resourceId: ids.join(','),
        details: { ids, count: rows.length },
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
    } catch (err) {
      request.log.warn({ err }, '写入审计日志失败（不影响批量结果）');
    }

    return reply.send({
      data: { verified: rows.length },
      message: `已强制认证 ${rows.length} 个客户`,
    });
  });
}
