/**
 * 业务员支撑端点 — /api/v1/me/*（sales / admin / super_admin）
 *
 * 对齐 gap-fix-spec-2026-08-18 §9 + SPEC-§11 业务员支撑模块：
 *   - GET  /me/customers?keyword=&status=&tag=         名下客户列表（含标签/余额/累计消费）
 *   - POST /me/customers/:id/assign                    认领客户（写 agent_customers，source='sales'）
 *   - GET  /me/customers/:id                           客户详情（基本信息+标签+联系记录+最近消费+工单数）
 *   - POST /me/customers/:id/contacts                  写联系记录（customer_notes）
 *   - PUT  /me/customers/:id/status                    变更客户状态（意向/试用/活跃/沉默/流失）
 *   - PUT  /me/customers/:id/tags                      全量替换客户标签（customer_tags 删旧插新）
 *   - GET  /me/customers/:id/consumption?period=       消费聚合（按天）或明细（分页）
 *   - GET  /me/customers/:id/recharges?page_size=      充值记录
 *   - GET  /me/follow-reminders?status=                跟进提醒列表
 *   - POST /me/follow-reminders                        新增跟进提醒
 *   - POST /me/follow-reminders/:id/complete|ignore    完成/忽略提醒
 *   - GET  /me/sales-performance?period=               业绩看板（含同组销售排名）
 *
 * 鉴权：jwtAuth + role ∈ {sales, admin, super_admin}；sales 只能操作名下客户
 * （agent_customers 归属校验），admin/super_admin 可跨客户。
 * 注意：agent_customers.agent_id 外键指向 agents.id，sales 用户归属解析见 resolveAgentId。
 * 写操作写 audit_logs 留痕。
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, or, sql, desc, gte, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';

/* ───────── 鉴权 ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

/** 业务员角色校验：sales/admin/super_admin 均可访问；返回当前用户上下文 */
async function requireSales(request: any): Promise<{ userId: number; role: string; isAdmin: boolean }> {
  const ctx = request.userContext as { userId: number; role: string };
  if (!ctx?.userId) throw new UnauthorizedError('Missing user');
  const role = ctx.role;
  if (role !== 'sales' && role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('仅业务员/管理员可访问');
  }
  return { userId: ctx.userId, role, isAdmin: role === 'admin' || role === 'super_admin' };
}

/* ───────── 工具函数 ───────── */

/** 正整数解析（非法回退默认值，超上限截断） */
function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

/** numeric/字符串金额 → number */
function toNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** 周期起点（today/week/month/year/all；YYYY-MM 直接解析为当月） */
function periodStart(period: string): Date | undefined {
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
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
    default: {
      // 支持 YYYY-MM（业绩看板前端传入的 period）
      const m = /^(\d{4})-(\d{2})$/.exec(period);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);
      return undefined; // all
    }
  }
}

/** 客户状态白名单：中文 ↔ 英文（前端展示英文枚举 + 中文文案） */
const STATUS_MAP: Record<string, string> = {
  lead: 'lead',
  trial: 'trial',
  active: 'active',
  silent: 'silent',
  churned: 'churned',
  意向: 'lead',
  试用: 'trial',
  活跃: 'active',
  沉默: 'silent',
  流失: 'churned',
};
const SALES_STATUSES = new Set(Object.values(STATUS_MAP));

/** 写审计日志 */
async function writeAudit(request: any, action: string, resource: string, resourceId: string | null, details: unknown) {
  const ctx = request.userContext ?? {};
  await db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource,
    resourceId,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
    createdAt: new Date(),
  });
}

/**
 * 解析业务员（sales 用户）在 agents 表中的身份 ID。
 *
 * agent_customers.agent_id 外键指向 agents.id（migration 0000），不能直接写 users.id；
 * 因此 sales 用户先查 agents.userId 对应记录，没有则自动补一条（commissionRate=0 不产生佣金），
 * 兜底返回 userId 以兼容直接以用户 ID 建立关系的旧数据/测试环境。
 *
 * @returns agents.id（无记录时自动创建后返回）
 */
async function resolveAgentId(userId: number): Promise<number> {
  const rows = await db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.userId, userId))
    .limit(1);
  if (rows[0]) return rows[0].id;

  const [created] = await db
    .insert(schema.agents)
    .values({ userId, level: 'junior', commissionRate: '0', status: 'active', createdAt: new Date(), updatedAt: new Date() })
    .returning();
  return created?.id ?? userId;
}

/**
 * 当前用户的候选 agent 身份 ID 列表：[agents.id, users.id]（去重）。
 *
 * 同时匹配两种归属写法：正式 FK 语义（agent_id=agents.id）与
 * 任务契约中的简写（agent_id=当前用户 user id）。
 */
async function myAgentIds(userId: number): Promise<number[]> {
  const agentId = await resolveAgentId(userId);
  const ids = agentId === userId ? [userId] : [agentId, userId];
  return ids;
}

/**
 * 客户归属校验：sales 必须与客户存在 agent_customers 关系；admin/super_admin 可跨客户。
 *
 * @throws {ForbiddenError} sales 无权操作非名下客户
 */
async function assertCustomerAccess(request: any, customerUserId: number): Promise<void> {
  const me = await requireSales(request);
  if (me.isAdmin) return;
  const ids = await myAgentIds(me.userId);
  const conds = ids.map((aid) => eq(schema.agentCustomers.agentId, aid));
  const [rel] = await db
    .select({ id: schema.agentCustomers.id })
    .from(schema.agentCustomers)
    .where(and(or(...conds), eq(schema.agentCustomers.customerUserId, customerUserId)))
    .limit(1);
  if (!rel) throw new ForbiddenError('无权操作该客户（非名下客户）');
}

export async function meSalesRoutes(app: FastifyInstance) {
  /* ═══════════ 1. 名下客户列表 ═══════════ */

  /**
   * GET /api/v1/me/customers?keyword=&search=&status=&tag=&sort=&time_range=&page=&page_size=
   *
   * 返回 { list, pagination }；list 项含 id/user_id/email/username/status/tags/balance/
   * total_spend(累计消费)/month_consumption(本月消费)/last_active_at/last_consumption_at/created_at。
   */
  app.get('/api/v1/me/customers', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const page = parsePositiveInt(q.page, 1);
    const pageSize = parsePositiveInt(q.page_size ?? q.pageSize, 20, 100);
    const keyword = String(q.keyword ?? q.search ?? '').trim().toLowerCase();
    const status = String(q.status ?? '').trim();
    const tag = String(q.tag ?? '').trim();
    const sort = String(q.sort ?? 'total-desc').trim();
    const timeRange = String(q.time_range ?? '').trim();

    const ids = await myAgentIds(me.userId);
    const relRows = await db
      .select({
        agentId: schema.agentCustomers.agentId,
        customerUserId: schema.agentCustomers.customerUserId,
        status: schema.agentCustomers.status,
        createdAt: schema.agentCustomers.createdAt,
      })
      .from(schema.agentCustomers)
      .where(or(...ids.map((aid) => eq(schema.agentCustomers.agentId, aid))));

    const customerIds = [...new Set(relRows.map((r) => r.customerUserId))];
    const relByCustomer = new Map<number, (typeof relRows)[number]>();
    for (const r of relRows) if (!relByCustomer.has(r.customerUserId)) relByCustomer.set(r.customerUserId, r);

    const userRows = customerIds.length
      ? await db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            createdAt: schema.users.createdAt,
            lastLoginAt: schema.users.lastLoginAt,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, customerIds))
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    // 标签：当前用户在该客户上打的标签
    const tagRows = customerIds.length
      ? await db
          .select({ customerUserId: schema.customerTags.customerUserId, tag: schema.customerTags.tag })
          .from(schema.customerTags)
          .where(and(inArray(schema.customerTags.customerUserId, customerIds), eq(schema.customerTags.salesUserId, me.userId)))
      : [];
    const tagsByCustomer = new Map<number, string[]>();
    for (const t of tagRows) {
      const arr = tagsByCustomer.get(t.customerUserId) ?? [];
      arr.push(t.tag);
      tagsByCustomer.set(t.customerUserId, arr);
    }

    // 余额
    const balanceRows = customerIds.length
      ? await db
          .select({
            userId: schema.customerBalances.userId,
            availableBalance: schema.customerBalances.availableBalance,
            totalBalance: schema.customerBalances.totalBalance,
          })
          .from(schema.customerBalances)
          .where(inArray(schema.customerBalances.userId, customerIds))
      : [];
    const balanceByCustomer = new Map(
      balanceRows.map((b) => [b.userId, toNumber(b.availableBalance ?? b.totalBalance ?? 0)]),
    );

    // 累计消费 / 本月消费 / 最后消费时间（SQL 聚合）
    const monthStart = periodStart('month');
    const [spendRows, monthSpendRows, lastRows] = await Promise.all([
      customerIds.length
        ? db
            .select({
              userId: schema.consumptionRecords.userId,
              total: sql<number>`coalesce(sum(${schema.consumptionRecords.cost}),0)`,
            })
            .from(schema.consumptionRecords)
            .where(inArray(schema.consumptionRecords.userId, customerIds))
            .groupBy(schema.consumptionRecords.userId)
        : [],
      customerIds.length && monthStart
        ? db
            .select({
              userId: schema.consumptionRecords.userId,
              total: sql<number>`coalesce(sum(${schema.consumptionRecords.cost}),0)`,
            })
            .from(schema.consumptionRecords)
            .where(and(inArray(schema.consumptionRecords.userId, customerIds), gte(schema.consumptionRecords.createdAt, monthStart)))
            .groupBy(schema.consumptionRecords.userId)
        : [],
      customerIds.length
        ? db
            .select({
              userId: schema.consumptionRecords.userId,
              last: sql<Date | null>`max(${schema.consumptionRecords.createdAt})`,
            })
            .from(schema.consumptionRecords)
            .where(inArray(schema.consumptionRecords.userId, customerIds))
            .groupBy(schema.consumptionRecords.userId)
        : [],
    ]);
    const spendMap = new Map(spendRows.map((r) => [r.userId, toNumber(r.total)]));
    const monthSpendMap = new Map(monthSpendRows.map((r) => [r.userId, toNumber(r.total)]));
    const lastConsumptionMap = new Map(lastRows.map((r) => [r.userId, r.last]));

    // 组装 + 筛选（按客户去重，一个客户只展示一条归属）
    let list = [...relByCustomer.entries()].map(([customerUserId, rel]) => {
      const u = userMap.get(customerUserId);
      const customerTags = tagsByCustomer.get(customerUserId) ?? [];
      return {
        id: customerUserId,
        user_id: customerUserId,
        email: u?.email ?? '',
        username: u?.name ?? '',
        status: rel.status,
        tags: customerTags,
        balance: balanceByCustomer.get(customerUserId) ?? 0,
        total_spend: spendMap.get(customerUserId) ?? 0,
        total_consumption: spendMap.get(customerUserId) ?? 0,
        month_consumption: monthSpendMap.get(customerUserId) ?? 0,
        last_active_at: u?.lastLoginAt ?? null,
        last_consumption_at: lastConsumptionMap.get(customerUserId) ?? null,
        created_at: rel.createdAt,
        user_created_at: u?.createdAt ?? null,
        updated_at: rel.createdAt,
        salesperson_id: me.userId,
      };
    });

    if (keyword) {
      list = list.filter(
        (c) => (c.email ?? '').toLowerCase().includes(keyword) || (c.username ?? '').toLowerCase().includes(keyword),
      );
    }
    if (status && SALES_STATUSES.has(status)) {
      list = list.filter((c) => c.status === status);
    }
    if (tag) {
      list = list.filter((c) => c.tags.includes(tag));
    }
    if (timeRange) {
      const days = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }[timeRange];
      if (days) {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        list = list.filter((c) => c.user_created_at == null || new Date(c.user_created_at) >= cutoff);
      }
    }

    // 排序（前端 sort 枚举）
    const sortKey = sort.replace(/-asc$/, '').replace(/-desc$/, '');
    const direction = sort.endsWith('-asc') ? 1 : -1;
    const sortValue = (c: (typeof list)[number]): number | string => {
      switch (sortKey) {
        case 'total':
          return c.total_spend;
        case 'month':
          return c.month_consumption;
        case 'bind':
          return new Date(c.created_at).getTime();
        default:
          return c.total_spend;
      }
    };
    list.sort((a, b) => {
      const va = sortValue(a);
      const vb = sortValue(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * direction;
    });

    const total = list.length;
    const paged = list.slice((page - 1) * pageSize, page * pageSize);

    return reply.send({
      data: {
        list: paged,
        total,
        page,
        pageSize,
        pagination: { page, pageSize, total },
      },
    });
  });

  /* ═══════════ 2. 认领客户 ═══════════ */

  /** POST /api/v1/me/customers/:id/assign — 建立 agent_customers 归属（幂等，source='sales'） */
  app.post('/api/v1/me/customers/:id/assign', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const customerUserId = Number((request.params as any).id);
    if (!Number.isInteger(customerUserId) || customerUserId <= 0) throw new ValidationError('非法客户 ID');

    const [target] = await db
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, customerUserId))
      .limit(1);
    if (!target) throw new NotFoundError('客户用户', customerUserId);
    if (target.role !== 'customer') throw new ValidationError('只能认领 customer 角色的用户');

    const ids = await myAgentIds(me.userId);
    const [existing] = await db
      .select({ id: schema.agentCustomers.id })
      .from(schema.agentCustomers)
      .where(and(or(...ids.map((aid) => eq(schema.agentCustomers.agentId, aid))), eq(schema.agentCustomers.customerUserId, customerUserId)))
      .limit(1);

    let agentId: number;
    if (existing) {
      // 幂等：已存在归属，仅刷新 source 标记
      await db
        .update(schema.agentCustomers)
        .set({ source: 'sales' })
        .where(eq(schema.agentCustomers.id, existing.id));
      agentId = (await db.select({ agentId: schema.agentCustomers.agentId }).from(schema.agentCustomers).where(eq(schema.agentCustomers.id, existing.id)).limit(1))[0]?.agentId ?? 0;
    } else {
      const resolved = await resolveAgentId(me.userId);
      const [created] = await db
        .insert(schema.agentCustomers)
        .values({ agentId: resolved, customerUserId, status: 'active', source: 'sales', createdAt: new Date() })
        .returning();
      if (!created) throw new ValidationError('认领客户失败');
      agentId = created.agentId;
    }

    await writeAudit(request, 'sales.customer.assign', 'agent_customer', String(customerUserId), { agentId });
    return reply.send({ data: { ok: true, customer_user_id: customerUserId, agent_id: agentId } });
  });

  /* ═══════════ 3. 客户详情 ═══════════ */

  /**
   * GET /api/v1/me/customers/:id — 详情
   *
   * { customer, tags, notes, contacts, recent_consumption, tickets_count, balance }
   * notes/contacts 为同一批联系记录的双契约字段（任务命名 + 前端命名）。
   */
  app.get('/api/v1/me/customers/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const customerUserId = Number((request.params as any).id);
    if (!Number.isInteger(customerUserId) || customerUserId <= 0) throw new ValidationError('非法客户 ID');
    await assertCustomerAccess(request, customerUserId);

    const ids = await myAgentIds(me.userId);
    const [userRow] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        status: schema.users.status,
        realNameStatus: schema.users.realNameStatus,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, customerUserId))
      .limit(1);
    if (!userRow) throw new NotFoundError('客户用户', customerUserId);

    const [relRow] = await db
      .select({ status: schema.agentCustomers.status, createdAt: schema.agentCustomers.createdAt })
      .from(schema.agentCustomers)
      .where(and(or(...ids.map((aid) => eq(schema.agentCustomers.agentId, aid))), eq(schema.agentCustomers.customerUserId, customerUserId)))
      .limit(1);

    // 标签（当前用户打的标签，与 PUT tags 的作用域一致）
    const tagRows = await db
      .select({ id: schema.customerTags.id, tag: schema.customerTags.tag })
      .from(schema.customerTags)
      .where(and(eq(schema.customerTags.salesUserId, me.userId), eq(schema.customerTags.customerUserId, customerUserId)))
      .orderBy(desc(schema.customerTags.id));
    const tags = tagRows.map((t) => ({ id: t.id, name: t.tag }));

    // 联系记录（客户维度共享，按时间倒序）
    const noteRows = await db
      .select({
        id: schema.customerNotes.id,
        channel: schema.customerNotes.channel,
        content: schema.customerNotes.content,
        nextFollowAt: schema.customerNotes.nextFollowAt,
        createdAt: schema.customerNotes.createdAt,
      })
      .from(schema.customerNotes)
      .where(eq(schema.customerNotes.customerUserId, customerUserId))
      .orderBy(desc(schema.customerNotes.createdAt))
      .limit(50);
    const notes = noteRows.map((n) => ({
      id: n.id,
      channel: n.channel,
      method: n.channel,
      content: n.content,
      summary: n.content,
      next_follow_at: n.nextFollowAt,
      next_follow_up: n.nextFollowAt,
      created_at: n.createdAt,
    }));

    // 最近消费（10 条）
    const recentRows = await db
      .select({
        createdAt: schema.consumptionRecords.createdAt,
        model: schema.consumptionRecords.model,
        cost: schema.consumptionRecords.cost,
      })
      .from(schema.consumptionRecords)
      .where(eq(schema.consumptionRecords.userId, customerUserId))
      .orderBy(desc(schema.consumptionRecords.createdAt))
      .limit(10);
    const recentConsumption = recentRows.map((r) => ({
      created_at: r.createdAt,
      model: r.model,
      model_name: r.model,
      cost: toNumber(r.cost),
    }));

    // 工单数 / 余额 / 累计消费 / 本月消费
    const [ticketRows, balanceRows, totalSpendRows, monthSpendRows] = await Promise.all([
      db.select({ id: schema.tickets.id }).from(schema.tickets).where(eq(schema.tickets.userId, customerUserId)),
      db
        .select({
          availableBalance: schema.customerBalances.availableBalance,
          totalBalance: schema.customerBalances.totalBalance,
        })
        .from(schema.customerBalances)
        .where(eq(schema.customerBalances.userId, customerUserId))
        .limit(1),
      db
        .select({ total: sql<number>`coalesce(sum(${schema.consumptionRecords.cost}),0)` })
        .from(schema.consumptionRecords)
        .where(eq(schema.consumptionRecords.userId, customerUserId)),
      db
        .select({ total: sql<number>`coalesce(sum(${schema.consumptionRecords.cost}),0)` })
        .from(schema.consumptionRecords)
        .where(and(eq(schema.consumptionRecords.userId, customerUserId), gte(schema.consumptionRecords.createdAt, periodStart('month') as Date))),
    ]);
    const balance = toNumber(balanceRows[0]?.availableBalance ?? balanceRows[0]?.totalBalance ?? 0);

    const customer = {
      id: userRow.id,
      email: userRow.email,
      username: userRow.name,
      name: userRow.name,
      status: relRow?.status ?? userRow.status,
      real_name_status: userRow.realNameStatus,
      created_at: relRow?.createdAt ?? userRow.createdAt,
      user_created_at: userRow.createdAt,
      balance,
      total_consumption: toNumber(totalSpendRows[0]?.total ?? 0),
      month_consumption: toNumber(monthSpendRows[0]?.total ?? 0),
      tags,
    };

    return reply.send({
      data: {
        customer,
        tags,
        notes,
        contacts: notes,
        recent_consumption: recentConsumption,
        tickets_count: ticketRows.length,
        balance,
      },
    });
  });

  /* ═══════════ 4. 联系记录 / 状态 / 标签 ═══════════ */

  /** POST /api/v1/me/customers/:id/contacts — 写联系记录（body 兼容任务与前端两套命名） */
  app.post('/api/v1/me/customers/:id/contacts', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const customerUserId = Number((request.params as any).id);
    if (!Number.isInteger(customerUserId) || customerUserId <= 0) throw new ValidationError('非法客户 ID');
    await assertCustomerAccess(request, customerUserId);

    const body = (request.body ?? {}) as Record<string, unknown>;
    const channel = String(body.channel ?? body.method ?? 'other').trim() || 'other';
    const content = String(body.content ?? body.summary ?? '').trim();
    const nextFollowAtRaw = body.next_follow_at ?? body.next_follow_up;
    const nextFollowAt = nextFollowAtRaw ? new Date(String(nextFollowAtRaw)) : null;

    if (!content) throw new ValidationError('联系记录内容（content/summary）不能为空');
    if (content.length > 2000) throw new ValidationError('内容过长（上限 2000 字符）');
    if (nextFollowAt && Number.isNaN(nextFollowAt.getTime())) throw new ValidationError('next_follow_at 日期格式非法');

    const [created] = await db
      .insert(schema.customerNotes)
      .values({
        salesUserId: me.userId,
        customerUserId,
        channel,
        content,
        nextFollowAt,
        createdAt: new Date(),
      })
      .returning();
    if (!created) throw new ValidationError('联系记录写入失败');

    await writeAudit(request, 'sales.customer.note.create', 'customer_note', String(customerUserId), { channel, contentLength: content.length, nextFollowAt });
    return reply.send({ data: { ok: true, id: created.id } });
  });

  /** PUT /api/v1/me/customers/:id/status — 变更客户状态（意向/试用/活跃/沉默/流失） */
  app.put('/api/v1/me/customers/:id/status', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const customerUserId = Number((request.params as any).id);
    if (!Number.isInteger(customerUserId) || customerUserId <= 0) throw new ValidationError('非法客户 ID');
    await assertCustomerAccess(request, customerUserId);

    const body = (request.body ?? {}) as Record<string, unknown>;
    const rawStatus = String(body.status ?? '').trim();
    const status = STATUS_MAP[rawStatus];
    if (!status) throw new ValidationError('status 仅支持：lead/trial/active/silent/churned（或 意向/试用/活跃/沉默/流失）');
    const reason = String(body.reason ?? '').trim();

    const ids = await myAgentIds(me.userId);
    const [updated] = await db
      .update(schema.agentCustomers)
      .set({ status })
      .where(and(or(...ids.map((aid) => eq(schema.agentCustomers.agentId, aid))), eq(schema.agentCustomers.customerUserId, customerUserId)))
      .returning();

    if (!updated) {
      // sales 已通过归属校验必然命中；此处仅覆盖「admin 操作无归属关系的客户」兜底
      if (me.isAdmin) {
        await db.update(schema.users).set({ status }).where(eq(schema.users.id, customerUserId));
      } else {
        throw new NotFoundError('客户归属关系', customerUserId);
      }
    }

    await writeAudit(request, 'sales.customer.status.update', 'agent_customer', String(customerUserId), { status, reason });
    return reply.send({ data: { ok: true, status } });
  });

  /** PUT /api/v1/me/customers/:id/tags — 全量替换标签（删旧插新，上限 20） */
  app.put('/api/v1/me/customers/:id/tags', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const customerUserId = Number((request.params as any).id);
    if (!Number.isInteger(customerUserId) || customerUserId <= 0) throw new ValidationError('非法客户 ID');
    await assertCustomerAccess(request, customerUserId);

    const body = (request.body ?? {}) as Record<string, unknown>;
    const rawTags = Array.isArray(body.tags) ? body.tags : [];
    if (rawTags.length > 20) throw new ValidationError('标签数量已达上限（20）');
    const tags = [...new Set(rawTags.map((t) => String(t).trim()).filter((t) => t !== ''))];
    for (const t of tags) {
      if (t.length > 50) throw new ValidationError(`标签「${t}」过长（上限 50 字符）`);
    }

    await db.transaction(async (tx) => {
      await tx.delete(schema.customerTags).where(
        and(eq(schema.customerTags.salesUserId, me.userId), eq(schema.customerTags.customerUserId, customerUserId)),
      );
      for (const tag of tags) {
        await tx.insert(schema.customerTags).values({
          salesUserId: me.userId,
          customerUserId,
          tag,
          createdAt: new Date(),
        });
      }
    });

    await writeAudit(request, 'sales.customer.tags.replace', 'customer_tag', String(customerUserId), { tags });
    return reply.send({ data: { ok: true, tags } });
  });

  /* ═══════════ 5. 消费 / 充值 ═══════════ */

  /**
   * GET /api/v1/me/customers/:id/consumption?period=today|week|month|year|all
   *
   * 传 period → 按天聚合 [{ date, cost, calls }]（任务契约）；
   * 不传 period（前端传 time_range/page/page_size）→ 分页明细（前端契约）。
   */
  app.get('/api/v1/me/customers/:id/consumption', { preHandler: [jwtAuth] }, async (request, reply) => {
    const customerUserId = Number((request.params as any).id);
    if (!Number.isInteger(customerUserId) || customerUserId <= 0) throw new ValidationError('非法客户 ID');
    await assertCustomerAccess(request, customerUserId);

    const q = (request.query ?? {}) as Record<string, unknown>;
    const period = String(q.period ?? '').trim();

    if (period) {
      const start = periodStart(period);
      const conds = [eq(schema.consumptionRecords.userId, customerUserId)];
      if (start) conds.push(gte(schema.consumptionRecords.createdAt, start));
      const rows = await db
        .select({
          createdAt: schema.consumptionRecords.createdAt,
          cost: schema.consumptionRecords.cost,
        })
        .from(schema.consumptionRecords)
        .where(and(...conds));

      const byDate = new Map<string, { date: string; cost: number; calls: number }>();
      for (const r of rows) {
        const d = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const entry = byDate.get(date) ?? { date, cost: 0, calls: 0 };
        entry.cost += toNumber(r.cost);
        entry.calls += 1;
        byDate.set(date, entry);
      }
      const list = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
      return reply.send({ data: { list, period } });
    }

    // 分页明细模式
    const page = parsePositiveInt(q.page, 1);
    const pageSize = parsePositiveInt(q.page_size ?? q.pageSize, 10, 100);
    const timeRange = String(q.time_range ?? '30d').trim();
    const days = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }[timeRange] ?? null;
    const start = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
    const whereConds = [eq(schema.consumptionRecords.userId, customerUserId)];
    if (start) whereConds.push(gte(schema.consumptionRecords.createdAt, start));
    const where = and(...whereConds);

    const [rows, countRows] = await Promise.all([
      db
        .select({
          createdAt: schema.consumptionRecords.createdAt,
          model: schema.consumptionRecords.model,
          supplierId: schema.consumptionRecords.supplierId,
          inputTokens: schema.consumptionRecords.inputTokens,
          outputTokens: schema.consumptionRecords.outputTokens,
          cost: schema.consumptionRecords.cost,
        })
        .from(schema.consumptionRecords)
        .where(where)
        .orderBy(desc(schema.consumptionRecords.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ id: schema.consumptionRecords.id }).from(schema.consumptionRecords).where(where),
    ]);

    const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter((v): v is number => v != null))];
    const supplierRows = supplierIds.length
      ? await db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(inArray(schema.suppliers.id, supplierIds))
      : [];
    const supplierName = new Map(supplierRows.map((s) => [s.id, s.name]));

    const list = rows.map((r) => ({
      time: r.createdAt,
      created_at: r.createdAt,
      provider: r.supplierId != null ? supplierName.get(r.supplierId) ?? null : null,
      model: r.model,
      model_name: r.model,
      input_tokens: r.inputTokens ?? 0,
      output_tokens: r.outputTokens ?? 0,
      amount: toNumber(r.cost),
      cost: toNumber(r.cost),
    }));

    return reply.send({
      data: {
        list,
        pagination: { page, pageSize, total: countRows.length },
      },
    });
  });

  /** GET /api/v1/me/customers/:id/recharges?page_size= — 充值记录 */
  app.get('/api/v1/me/customers/:id/recharges', { preHandler: [jwtAuth] }, async (request, reply) => {
    const customerUserId = Number((request.params as any).id);
    if (!Number.isInteger(customerUserId) || customerUserId <= 0) throw new ValidationError('非法客户 ID');
    await assertCustomerAccess(request, customerUserId);

    const q = (request.query ?? {}) as Record<string, unknown>;
    const page = parsePositiveInt(q.page, 1);
    const pageSize = parsePositiveInt(q.page_size ?? q.pageSize, 10, 100);

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: schema.rechargeOrders.id,
          amount: schema.rechargeOrders.amount,
          status: schema.rechargeOrders.status,
          method: schema.rechargeOrders.method,
          createdAt: schema.rechargeOrders.createdAt,
        })
        .from(schema.rechargeOrders)
        .where(eq(schema.rechargeOrders.userId, customerUserId))
        .orderBy(desc(schema.rechargeOrders.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ id: schema.rechargeOrders.id }).from(schema.rechargeOrders).where(eq(schema.rechargeOrders.userId, customerUserId)),
    ]);

    const list = rows.map((r) => ({
      id: r.id,
      amount: toNumber(r.amount),
      status: r.status,
      method: r.method,
      payment_method: r.method,
      created_at: r.createdAt,
      time: r.createdAt,
    }));

    return reply.send({ data: { list, pagination: { page, pageSize, total: countRows.length } } });
  });

  /* ═══════════ 6. 跟进提醒 ═══════════ */

  /** GET /api/v1/me/follow-reminders?status=pending|completed|ignored — 我的跟进提醒 */
  app.get('/api/v1/me/follow-reminders', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const status = String(q.status ?? '').trim();

    const conds = [eq(schema.followReminders.salesUserId, me.userId)];
    if (status === 'pending' || status === 'completed' || status === 'ignored') {
      conds.push(eq(schema.followReminders.status, status));
    }

    const rows = await db
      .select({
        id: schema.followReminders.id,
        customerUserId: schema.followReminders.customerUserId,
        content: schema.followReminders.content,
        remindAt: schema.followReminders.remindAt,
        status: schema.followReminders.status,
        completedAt: schema.followReminders.completedAt,
        createdAt: schema.followReminders.createdAt,
      })
      .from(schema.followReminders)
      .where(and(...conds))
      .orderBy(desc(schema.followReminders.createdAt));

    const customerIds = [...new Set(rows.map((r) => r.customerUserId))];
    const userRows = customerIds.length
      ? await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, customerIds))
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    const list = rows.map((r) => {
      const u = userMap.get(r.customerUserId);
      return {
        id: r.id,
        customer_user_id: r.customerUserId,
        user_id: r.customerUserId,
        customer_email: u?.email ?? null,
        user_email: u?.email ?? null,
        username: u?.name ?? null,
        content: r.content,
        title: r.content,
        description: r.content,
        remind_at: r.remindAt,
        due_at: r.remindAt,
        type: 'follow_up',
        status: r.status,
        completed_at: r.completedAt,
        created_at: r.createdAt,
      };
    });

    return reply.send({ data: { list } });
  });

  /** POST /api/v1/me/follow-reminders — 新增跟进提醒（body 兼容任务与前端两套命名） */
  app.post('/api/v1/me/follow-reminders', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const body = (request.body ?? {}) as Record<string, unknown>;

    const customerUserId = Number(body.customer_user_id ?? body.user_id);
    // content 主契约；兼容前端 title/description 两段式字段
    const content = String(body.content ?? body.title ?? body.description ?? '').trim();
    const remindAtRaw = body.remind_at ?? body.due_at;
    const remindAt = remindAtRaw ? new Date(String(remindAtRaw)) : null;

    if (!Number.isInteger(customerUserId) || customerUserId <= 0) throw new ValidationError('customer_user_id（或 user_id）非法');
    if (!content) throw new ValidationError('提醒内容（content/title）不能为空');
    if (content.length > 500) throw new ValidationError('提醒内容过长（上限 500 字符）');
    if (!remindAt || Number.isNaN(remindAt.getTime())) throw new ValidationError('remind_at（或 due_at）必填且日期合法');

    // sales 只能为客户创建提醒（归属校验）；admin/super_admin 可跨客户
    await assertCustomerAccess(request, customerUserId);

    const [created] = await db
      .insert(schema.followReminders)
      .values({
        salesUserId: me.userId,
        customerUserId,
        content,
        remindAt,
        status: 'pending',
        createdAt: new Date(),
      })
      .returning();
    if (!created) throw new ValidationError('提醒创建失败');

    await writeAudit(request, 'sales.reminder.create', 'follow_reminder', String(created.id), { customerUserId, remindAt });
    return reply.send({ data: { id: created.id, status: 'pending' } });
  });

  /** POST /api/v1/me/follow-reminders/:id/complete — 标记完成 */
  app.post('/api/v1/me/follow-reminders/:id/complete', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法提醒 ID');

    const [updated] = await db
      .update(schema.followReminders)
      .set({ status: 'completed', completedAt: new Date() })
      .where(and(eq(schema.followReminders.id, id), eq(schema.followReminders.salesUserId, me.userId)))
      .returning();
    if (!updated) throw new NotFoundError('跟进提醒', id);

    await writeAudit(request, 'sales.reminder.complete', 'follow_reminder', String(id), {});
    return reply.send({ data: { ok: true, id, status: 'completed' } });
  });

  /** POST /api/v1/me/follow-reminders/:id/ignore — 标记忽略 */
  app.post('/api/v1/me/follow-reminders/:id/ignore', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法提醒 ID');

    const [updated] = await db
      .update(schema.followReminders)
      .set({ status: 'ignored' })
      .where(and(eq(schema.followReminders.id, id), eq(schema.followReminders.salesUserId, me.userId)))
      .returning();
    if (!updated) throw new NotFoundError('跟进提醒', id);

    await writeAudit(request, 'sales.reminder.ignore', 'follow_reminder', String(id), {});
    return reply.send({ data: { ok: true, id, status: 'ignored' } });
  });

  /* ═══════════ 7. 业绩看板 ═══════════ */

  /**
   * GET /api/v1/me/sales-performance?period=month|week|year|YYYY-MM|all
   *
   * 返回任务契约平铺字段（customers/new_customers/reminders_done/total_spend/revenue/rank）
   * + 前端契约 stats/performance 对象。
   *   total_spend = 期内名下客户消费合计（consumption_records.cost）
   *   revenue     = 期内名下客户已支付充值合计（recharge_orders.status='paid'）
   *   rank        = 当前用户按期内客户消费在同级 sales 中的名次（admin 返回 null）
   */
  app.get('/api/v1/me/sales-performance', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const periodType = String(q.period_type ?? '').trim();
    const periodRaw = String(q.period ?? '').trim();
    // 前端 period_type=monthly 且 period=YYYY-MM；后端默认 month
    const period = periodType === 'monthly' || periodType === 'quarterly' || periodType === 'yearly'
      ? periodRaw || (periodType === 'yearly' ? 'year' : periodType === 'quarterly' ? 'quarter' : 'month')
      : periodRaw || 'month';
    const start = periodStart(period);

    const ids = await myAgentIds(me.userId);
    const relRows = await db
      .select({
        customerUserId: schema.agentCustomers.customerUserId,
        status: schema.agentCustomers.status,
        createdAt: schema.agentCustomers.createdAt,
      })
      .from(schema.agentCustomers)
      .where(or(...ids.map((aid) => eq(schema.agentCustomers.agentId, aid))));
    const customerIds = [...new Set(relRows.map((r) => r.customerUserId))];

    const customers = relRows.length;
    const newCustomers = start
      ? relRows.filter((r) => r.createdAt instanceof Date ? r.createdAt >= start : new Date(r.createdAt) >= start).length
      : relRows.length;
    const activeCount = relRows.filter((r) => r.status === 'active').length;

    const [reminderRows] = await Promise.all([
      (async () => {
        const conds = [
          eq(schema.followReminders.salesUserId, me.userId),
          eq(schema.followReminders.status, 'completed'),
        ];
        if (start) conds.push(gte(schema.followReminders.completedAt, start));
        return db
          .select({ id: schema.followReminders.id })
          .from(schema.followReminders)
          .where(and(...conds));
      })(),
    ]);
    const remindersDone = reminderRows.length;

    // 期内消费 / 已支付充值
    let totalSpend = 0;
    let revenue = 0;
    if (customerIds.length > 0) {
      const spendConds = [inArray(schema.consumptionRecords.userId, customerIds)];
      if (start) spendConds.push(gte(schema.consumptionRecords.createdAt, start));
      const rechargeConds = [
        inArray(schema.rechargeOrders.userId, customerIds),
        eq(schema.rechargeOrders.status, 'paid'),
      ];
      if (start) rechargeConds.push(gte(schema.rechargeOrders.createdAt, start));
      const [spendRows, rechargeRows] = await Promise.all([
        db
          .select({ total: sql<number>`coalesce(sum(${schema.consumptionRecords.cost}),0)` })
          .from(schema.consumptionRecords)
          .where(and(...spendConds)),
        db
          .select({ total: sql<number>`coalesce(sum(${schema.rechargeOrders.amount}),0)` })
          .from(schema.rechargeOrders)
          .where(and(...rechargeConds)),
      ]);
      totalSpend = toNumber(spendRows[0]?.total ?? 0);
      revenue = toNumber(rechargeRows[0]?.total ?? 0);
    }

    // 排名：同级 sales 按期内名下客户消费降序（稠密排名）
    let rank: number | null = null;
    if (me.role === 'sales') {
      const salesUsers = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.role, 'sales'));
      const salesIds = salesUsers.map((u) => u.id);
      const agentsForSales = salesIds.length
        ? await db.select({ id: schema.agents.id, userId: schema.agents.userId }).from(schema.agents).where(inArray(schema.agents.userId, salesIds))
        : [];
      const salesAgentMap = new Map(agentsForSales.map((a) => [a.userId, a.id]));
      const candidates = new Set<number>(); // 所有 sales 的候选 agent id（含 user id 兜底）
      for (const sid of salesIds) {
        const aid = salesAgentMap.get(sid);
        if (aid != null && aid !== sid) candidates.add(aid);
        candidates.add(sid);
      }
      const allRelRows = candidates.size
        ? await db
            .select({ agentId: schema.agentCustomers.agentId, customerUserId: schema.agentCustomers.customerUserId })
            .from(schema.agentCustomers)
            .where(or(...[...candidates].map((aid) => eq(schema.agentCustomers.agentId, aid))))
        : [];
      const customerBySales = new Map<number, Set<number>>();
      for (const r of allRelRows) {
        // agentId → sales 用户 id
        let salesId: number | undefined;
        for (const [uid, aid] of salesAgentMap) if (aid === r.agentId) { salesId = uid; break; }
        if (salesId === undefined && candidates.has(r.agentId)) salesId = r.agentId;
        if (salesId === undefined) continue;
        const set = customerBySales.get(salesId) ?? new Set<number>();
        set.add(r.customerUserId);
        customerBySales.set(salesId, set);
      }
      const revenueBySales = new Map<number, number>();
      for (const [sid, cset] of customerBySales) {
        if (cset.size === 0) continue;
        const rankConds = [inArray(schema.consumptionRecords.userId, [...cset])];
        if (start) rankConds.push(gte(schema.consumptionRecords.createdAt, start));
        const [agg] = await db
          .select({ total: sql<number>`coalesce(sum(${schema.consumptionRecords.cost}),0)` })
          .from(schema.consumptionRecords)
          .where(and(...rankConds));
        revenueBySales.set(sid, toNumber(agg?.total ?? 0));
      }
      const myRevenue = revenueBySales.get(me.userId) ?? totalSpend;
      const ranked = [...revenueBySales.values()].sort((a, b) => b - a);
      rank = ranked.length === 0 ? 1 : ranked.filter((v) => v > myRevenue).length + 1;
    }

    const periodStartStr = start ?? new Date('1970-01-01T00:00:00.000Z');
    const periodEnd = new Date();
    return reply.send({
      data: {
        customers,
        new_customers: newCustomers,
        reminders_done: remindersDone,
        total_spend: totalSpend,
        revenue,
        rank,
        period,
        period_start: periodStartStr,
        period_end: periodEnd,
        stats: {
          customer_count: customers,
          active_count: activeCount,
          active_rate: customers > 0 ? Math.round((activeCount / customers) * 100) : 0,
        },
        performance: {
          customer_count: customers,
          active_count: activeCount,
          new_customers: newCustomers,
          period_start: periodStartStr,
          period_end: periodEnd,
          total_revenue: revenue,
          total_spend: totalSpend,
          commission: 0,
          conversion_rate: null,
        },
      },
    });
  });
}
