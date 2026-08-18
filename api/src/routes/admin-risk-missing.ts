/**
 * 管理端风控 / 审计 / 订阅缺失端点补齐 — /api/v1/admin/*
 *
 * 原型有但后端缺失的一批端点，全部带 adminAuth（JWT + role ∈ {admin, super_admin}），
 * 写操作统一写 audit_logs（writeAudit）。
 *
 * 端点清单：
 *   1. GET  /api/v1/admin/security/incidents            — 安全事件列表（risk_events + users 邮箱）
 *      POST /api/v1/admin/security/incidents/:id/:op    — 处理（op=resolve 已解决 / ignore 忽略）
 *   2. GET  /api/v1/admin/content-moderation            — 内容审核队列（content_moderation + users）
 *      POST /api/v1/admin/content-moderation/:id/:op    — 审核（op=approve 通过 / reject 拒绝）
 *   3. GET  /api/v1/admin/operation/diff                — 操作差异（audit_logs details before/after 展开）
 *   4. GET  /api/v1/admin/subscription/plans            — 订阅套餐列表
 *      POST /api/v1/admin/subscription/plans            — 新建套餐
 *      PUT  /api/v1/admin/subscription/plans/:id        — 编辑 / 启停套餐（页面配套，非必选）
 *   5. GET  /api/v1/admin/audit/permissions             — 权限审计日志（audit_logs action 含 permission/role）
 *
 * @module routes
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';

/* ───────── auth / audit / 通用 helpers ───────── */

/** 管理端鉴权（preHandler，role ∈ {admin, super_admin}） */
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

/** 管理端操作审计写库 */
function writeAudit(
  request: any,
  action: string,
  resource: string,
  resourceId: string | number | null,
  details: Record<string, unknown>,
) {
  const ctx = request.userContext ?? {};
  return db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource,
    resourceId: resourceId != null ? String(resourceId) : null,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/** 解析分页参数（page / page_size，兼容 pageSize） */
function parsePagination(q: Record<string, string | undefined>) {
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.page_size || q.pageSize || '20', 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 周期筛选 → 起始时间（today/week/month/all，一律截至“现在”） */
function periodRange(period?: string): Date | undefined {
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

/** diff 值格式化：对象/数组 → JSON 字符串，其余原样 */
function fmtValue(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/** 批量取用户邮箱（id → email 映射） */
async function userEmailMap(ids: (number | null)[]): Promise<Record<number, string>> {
  const unique = [...new Set(ids.filter((id): id is number => !!id && id > 0))];
  const map: Record<number, string> = {};
  if (unique.length === 0) return map;
  const rows = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(inArray(schema.users.id, unique));
  for (const u of rows) map[u.id] = u.name || u.email;
  return map;
}

/**
 * 安全事件 status ← risk_events.resolved（varchar(1)）：
 *   '0' → open（待处理）、'1' → resolved（已解决）、'2' → ignored（已忽略）
 */
const RISK_STATUS_FLAG: Record<string, string> = { open: '0', resolved: '1', ignored: '2' };
const RISK_FLAG_STATUS: Record<string, string> = { '0': 'open', '1': 'resolved', '2': 'ignored' };

/* ───────── 1. 安全事件（risk_events） ───────── */

export async function adminRiskMissingRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/security/incidents?status=&page=&page_size= — 安全事件列表 */
  app.get('/api/v1/admin/security/incidents', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as Record<string, string | undefined>;
    const { page, pageSize, offset } = parsePagination(q);

    const where: any[] = [];
    if (q.status) {
      const flag = RISK_STATUS_FLAG[q.status];
      if (flag) where.push(eq(schema.riskEvents.resolved, flag));
    }
    const whereClause = where.length ? and(...where) : undefined;

    const [rows, cnt] = await Promise.all([
      db.select({
        id: schema.riskEvents.id,
        userId: schema.riskEvents.userId,
        eventType: schema.riskEvents.eventType,
        severity: schema.riskEvents.severity,
        resolved: schema.riskEvents.resolved,
        resolvedBy: schema.riskEvents.resolvedBy,
        resolvedAt: schema.riskEvents.resolvedAt,
        details: schema.riskEvents.details,
        createdAt: schema.riskEvents.createdAt,
      })
        .from(schema.riskEvents)
        .where(whereClause)
        .orderBy(desc(schema.riskEvents.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(schema.riskEvents)
        .where(whereClause),
    ]);

    // join users 取受影响用户邮箱 + 处理人邮箱（批量查询避免别名 join）
    const emails = await userEmailMap([...rows.map((r) => r.userId), ...rows.map((r) => r.resolvedBy)]);

    const list = rows.map((r) => {
      const details = (r.details ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        incident_type: r.eventType,
        severity: r.severity,
        status: RISK_FLAG_STATUS[r.resolved ?? '0'] ?? 'open',
        description: details.description != null ? String(details.description) : null,
        affected: details.affected != null ? String(details.affected) : null,
        user_email: r.userId != null ? emails[r.userId] ?? null : null,
        handler: r.resolvedBy != null ? emails[r.resolvedBy] ?? null : null,
        resolved_at: r.resolvedAt ? r.resolvedAt.toISOString() : null,
        created_at: r.createdAt.toISOString(),
      };
    });

    return reply.send({
      data: { list, pagination: { page, pageSize, total: toNum(cnt[0]?.count) } },
    });
  });

  /** POST /api/v1/admin/security/incidents/:id/:op — 处理（op=resolve|ignore） */
  app.post('/api/v1/admin/security/incidents/:id/:op', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id, op } = (request.params || {}) as { id: string; op: string };
    const incidentId = Number(id);
    if (!Number.isInteger(incidentId) || incidentId <= 0) throw new ValidationError('事件 ID 非法');
    if (op !== 'resolve' && op !== 'ignore') throw new ValidationError('op 仅支持 resolve / ignore');

    const [row] = await db
      .select({ id: schema.riskEvents.id, eventType: schema.riskEvents.eventType })
      .from(schema.riskEvents)
      .where(eq(schema.riskEvents.id, incidentId))
      .limit(1);
    if (!row) throw new NotFoundError('安全事件', incidentId);

    const operatorId = (request as any).userContext?.userId ?? null;
    await db.update(schema.riskEvents)
      .set({
        resolved: op === 'resolve' ? '1' : '2',
        resolvedBy: operatorId,
        resolvedAt: new Date(),
      })
      .where(eq(schema.riskEvents.id, incidentId));

    await writeAudit(request, `security.incident.${op}`, 'risk_event', incidentId, {
      eventType: row.eventType,
    });

    const status = op === 'resolve' ? 'resolved' : 'ignored';
    return reply.send({
      data: { id: incidentId, status },
      message: op === 'resolve' ? '事件已标记为已解决' : '事件已标记为忽略',
    });
  });

  /* ───────── 2. 内容审核队列（content_moderation） ───────── */

  /** GET /api/v1/admin/content-moderation?status=&page=&page_size= — 审核队列 */
  app.get('/api/v1/admin/content-moderation', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as Record<string, string | undefined>;
    const { page, pageSize, offset } = parsePagination(q);

    const where: any[] = [];
    if (q.status) where.push(eq(schema.contentModeration.status, q.status));
    const whereClause = where.length ? and(...where) : undefined;

    const [rows, cnt] = await Promise.all([
      db.select({
        id: schema.contentModeration.id,
        userId: schema.contentModeration.userId,
        contentType: schema.contentModeration.contentType,
        content: schema.contentModeration.content,
        status: schema.contentModeration.status,
        moderatorId: schema.contentModeration.moderatorId,
        reviewNote: schema.contentModeration.reviewNote,
        createdAt: schema.contentModeration.createdAt,
        reviewedAt: schema.contentModeration.reviewedAt,
      })
        .from(schema.contentModeration)
        .where(whereClause)
        .orderBy(desc(schema.contentModeration.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(schema.contentModeration)
        .where(whereClause),
    ]);

    // join users 取用户名 + 审核人（批量查询避免别名 join）
    const emails = await userEmailMap([...rows.map((r) => r.userId), ...rows.map((r) => r.moderatorId)]);

    const list = rows.map((r) => ({
      id: r.id,
      user_id: r.userId,
      username: r.userId != null ? emails[r.userId] ?? `#${r.userId}` : null,
      content_type: r.contentType,
      content: r.content,
      content_preview: r.content.length > 120 ? `${r.content.slice(0, 120)}…` : r.content,
      status: r.status, // pending / approved / rejected
      moderator_id: r.moderatorId,
      moderator_name: r.moderatorId != null ? emails[r.moderatorId] ?? null : null,
      review_note: r.reviewNote,
      created_at: r.createdAt.toISOString(),
      reviewed_at: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    }));

    return reply.send({
      data: { list, pagination: { page, pageSize, total: toNum(cnt[0]?.count) } },
    });
  });

  /** POST /api/v1/admin/content-moderation/:id/:op — 审核（op=approve|reject） */
  app.post('/api/v1/admin/content-moderation/:id/:op', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id, op } = (request.params || {}) as { id: string; op: string };
    const recId = Number(id);
    if (!Number.isInteger(recId) || recId <= 0) throw new ValidationError('审核记录 ID 非法');
    if (op !== 'approve' && op !== 'reject') throw new ValidationError('op 仅支持 approve / reject');

    const [row] = await db
      .select({ id: schema.contentModeration.id, contentType: schema.contentModeration.contentType })
      .from(schema.contentModeration)
      .where(eq(schema.contentModeration.id, recId))
      .limit(1);
    if (!row) throw new NotFoundError('内容审核记录', recId);

    const body = (request.body || {}) as Record<string, unknown>;
    const operatorId = (request as any).userContext?.userId ?? null;
    const note = body.note != null ? String(body.note).slice(0, 1000) : null;

    await db.update(schema.contentModeration)
      .set({
        status: op === 'approve' ? 'approved' : 'rejected',
        moderatorId: operatorId,
        reviewNote: note,
        reviewedAt: new Date(),
      })
      .where(eq(schema.contentModeration.id, recId));

    await writeAudit(request, `content_moderation.${op}`, 'content_moderation', recId, {
      contentType: row.contentType,
      note,
    });

    const status = op === 'approve' ? 'approved' : 'rejected';
    return reply.send({
      data: { id: recId, status },
      message: op === 'approve' ? '内容已通过' : '内容已拒绝',
    });
  });

  /* ───────── 3. 操作差异（audit_logs） ───────── */

  /**
   * GET /api/v1/admin/operation/diff?period=&page=&page_size=
   *
   * 数据源 audit_logs.details（jsonb）：
   *   - details.changes: [{ field, old_value, new_value }]        → 逐条展开
   *   - details.before / details.after 均为对象                     → 按字段 diff 展开
   *   - 其余情况                                                    → 单条（old=before/空，new=after/details）
   * 注：pagination.total 按 audit_logs 行数统计（一条日志可能展开为多条 diff）。
   */
  app.get('/api/v1/admin/operation/diff', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as Record<string, string | undefined>;
    const { page, pageSize, offset } = parsePagination(q);

    const where: any[] = [];
    const start = periodRange(q.period);
    if (start) where.push(gte(schema.auditLogs.createdAt, start));
    const whereClause = where.length ? and(...where) : undefined;

    const [rows, cnt] = await Promise.all([
      db.select({
        id: schema.auditLogs.id,
        userId: schema.auditLogs.userId,
        action: schema.auditLogs.action,
        resource: schema.auditLogs.resource,
        resourceId: schema.auditLogs.resourceId,
        details: schema.auditLogs.details,
        createdAt: schema.auditLogs.createdAt,
      })
        .from(schema.auditLogs)
        .where(whereClause)
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(schema.auditLogs)
        .where(whereClause),
    ]);

    const emails = await userEmailMap(rows.map((r) => r.userId));
    const diffs: {
      id: string;
      resource: string;
      resource_id: string | null;
      field: string;
      old_value: string;
      new_value: string;
      operator: string | null;
      action: string;
      created_at: string;
    }[] = [];

    for (const r of rows) {
      const details = (r.details ?? {}) as Record<string, unknown>;
      const operator = r.userId != null ? emails[r.userId] ?? `#${r.userId}` : null;
      const base = {
        resource: r.resource,
        resource_id: r.resourceId ?? null,
        operator,
        action: r.action,
        created_at: r.createdAt.toISOString(),
      };

      // 1) changes 数组逐条展开
      const changes = details.changes;
      if (Array.isArray(changes)) {
        for (const c of changes) {
          const item = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
          diffs.push({
            ...base,
            id: `${r.id}-${diffs.length}`,
            field: item.field != null ? String(item.field) : 'changes',
            old_value: fmtValue(item.old_value ?? item.old),
            new_value: fmtValue(item.new_value ?? item.new),
          });
        }
        continue;
      }

      // 2) before / after 均为对象 → 按字段 diff
      const before = details.before;
      const after = details.after;
      if (
        before && after &&
        typeof before === 'object' && !Array.isArray(before) &&
        typeof after === 'object' && !Array.isArray(after)
      ) {
        const beforeObj = before as Record<string, unknown>;
        const afterObj = after as Record<string, unknown>;
        const fields = [...new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])];
        for (const f of fields) {
          const oldV = beforeObj[f];
          const newV = afterObj[f];
          if (JSON.stringify(oldV) === JSON.stringify(newV)) continue; // 无变化跳过
          diffs.push({
            ...base,
            id: `${r.id}-${f}`,
            field: f,
            old_value: fmtValue(oldV),
            new_value: fmtValue(newV),
          });
        }
        continue;
      }

      // 3) 其余 → 单条（before/after 或整体 details）
      diffs.push({
        ...base,
        id: String(r.id),
        field: before !== undefined || after !== undefined ? 'before/after' : 'details',
        old_value: fmtValue(before),
        new_value: fmtValue(after !== undefined ? after : details),
      });
    }

    return reply.send({
      data: {
        diffs: diffs.slice(0, pageSize),
        pagination: { page, pageSize, total: toNum(cnt[0]?.count) },
      },
    });
  });

  /* ───────── 4. 订阅套餐（subscription_plans） ───────── */

  /** 套餐行 → 前端线协议（price 单位分；quota jsonb 原样） */
  function toPlanWire(r: typeof schema.subscriptionPlans.$inferSelect) {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      price: toNum(r.price),
      billing_cycle: r.billingCycle,
      quota: r.quota ?? {},
      status: r.status,
      sort_order: r.sortOrder,
      created_at: r.createdAt.toISOString(),
    };
  }

  /** GET /api/v1/admin/subscription/plans — 订阅套餐列表 */
  app.get('/api/v1/admin/subscription/plans', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rows = await db
      .select()
      .from(schema.subscriptionPlans)
      .orderBy(asc(schema.subscriptionPlans.sortOrder), asc(schema.subscriptionPlans.id));
    return reply.send({ data: { list: rows.map(toPlanWire) } });
  });

  /** POST /api/v1/admin/subscription/plans — 新建套餐 */
  app.post('/api/v1/admin/subscription/plans', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    if (!name) throw new ValidationError('套餐名称必填');
    const price = Number(body.price ?? 0);
    if (Number.isNaN(price) || price < 0) throw new ValidationError('价格必须为非负数字（单位：分）');
    const billingCycle = body.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
    const status = body.status === 'inactive' ? 'inactive' : 'active';
    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    const quota = body.quota && typeof body.quota === 'object' && !Array.isArray(body.quota)
      ? body.quota as Record<string, unknown>
      : {};

    const [created] = await db.insert(schema.subscriptionPlans)
      .values({
        name,
        description: body.description != null ? String(body.description).slice(0, 500) : null,
        price: String(price),
        quota,
        billingCycle,
        status,
        sortOrder,
      })
      .returning();
    if (!created) throw new ValidationError('套餐创建失败，请重试');

    await writeAudit(request, 'subscription.plan.create', 'subscription_plan', created.id, {
      name: created.name,
      price: toNum(created.price),
    });

    return reply.code(201).send({ data: toPlanWire(created), message: '套餐已创建' });
  });

  /** PUT /api/v1/admin/subscription/plans/:id — 编辑 / 启停套餐（页面配套） */
  app.put('/api/v1/admin/subscription/plans/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const planId = Number(((request.params || {}) as { id: string }).id);
    if (!Number.isInteger(planId) || planId <= 0) throw new ValidationError('套餐 ID 非法');

    const [row] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);
    if (!row) throw new NotFoundError('订阅套餐', planId);

    const body = (request.body || {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const n = String(body.name).trim();
      if (!n) throw new ValidationError('套餐名称不能为空');
      patch.name = n;
    }
    if (body.description !== undefined) {
      patch.description = body.description != null ? String(body.description).slice(0, 500) : null;
    }
    if (body.price !== undefined) {
      const p = Number(body.price);
      if (Number.isNaN(p) || p < 0) throw new ValidationError('价格必须为非负数字（单位：分）');
      patch.price = String(p);
    }
    if (body.billing_cycle !== undefined) {
      patch.billingCycle = body.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
    }
    if (body.status !== undefined) {
      const s = String(body.status);
      if (s !== 'active' && s !== 'inactive') throw new ValidationError('status 仅支持 active / inactive');
      patch.status = s;
    }
    if (body.sort_order !== undefined) {
      patch.sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    }
    if (body.quota !== undefined && typeof body.quota === 'object' && !Array.isArray(body.quota)) {
      patch.quota = body.quota as Record<string, unknown>;
    }

    await db.update(schema.subscriptionPlans)
      .set(patch as any)
      .where(eq(schema.subscriptionPlans.id, planId));

    await writeAudit(request, 'subscription.plan.update', 'subscription_plan', planId, {
      name: row.name,
      patch,
    });

    const [updated] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);
    return reply.send({ data: updated ? toPlanWire(updated) : null, message: '套餐已更新' });
  });

  /* ───────── 5. 权限审计日志（audit_logs） ───────── */

  /**
   * GET /api/v1/admin/audit/permissions?page=&page_size=&action=
   *
   * 取 audit_logs 中 action 含 'permission' 或 'role' 的记录；
   * 可选 action 参数做模糊过滤（如 role / permission）。
   */
  app.get('/api/v1/admin/audit/permissions', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as Record<string, string | undefined>;
    const { page, pageSize, offset } = parsePagination(q);

    const where: any[] = [
      sql`(${schema.auditLogs.action} ILIKE '%permission%' OR ${schema.auditLogs.action} ILIKE '%role%')`,
    ];
    if (q.action) where.push(sql`${schema.auditLogs.action} ILIKE ${`%${q.action}%`}`);
    const whereClause = and(...where);

    const [rows, cnt] = await Promise.all([
      db.select({
        id: schema.auditLogs.id,
        userId: schema.auditLogs.userId,
        action: schema.auditLogs.action,
        resource: schema.auditLogs.resource,
        resourceId: schema.auditLogs.resourceId,
        details: schema.auditLogs.details,
        ipAddress: schema.auditLogs.ipAddress,
        userAgent: schema.auditLogs.userAgent,
        createdAt: schema.auditLogs.createdAt,
      })
        .from(schema.auditLogs)
        .where(whereClause)
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(schema.auditLogs)
        .where(whereClause),
    ]);

    // 操作者 + 目标用户邮箱（details 中可能带 userId / targetUserId / roleId）
    const targetIds = rows.map((r) => {
      const d = (r.details ?? {}) as Record<string, unknown>;
      const v = d.userId ?? d.targetUserId ?? d.target_user_id;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    });
    const emails = await userEmailMap([...rows.map((r) => r.userId), ...targetIds]);

    const list = rows.map((r) => {
      const d = (r.details ?? {}) as Record<string, unknown>;
      const targetUserId = targetIds[rows.indexOf(r)] ?? null;
      const roleId = d.roleId ?? d.role_id ?? d.targetRoleId ?? d.target_role_id;
      return {
        id: r.id,
        action: r.action,
        resource: r.resource,
        resource_id: r.resourceId,
        operator_id: r.userId,
        operator_email: r.userId != null ? emails[r.userId] ?? null : null,
        target_user_id: targetUserId,
        target_email: targetUserId != null ? emails[targetUserId] ?? null : null,
        target_role_id: roleId != null ? Number(roleId) : null,
        detail: typeof d.detail === 'string' ? d.detail : (typeof d.description === 'string' ? d.description : null),
        diff: typeof d.diff === 'string' ? d.diff : JSON.stringify(d),
        ip_address: r.ipAddress,
        created_at: r.createdAt.toISOString(),
      };
    });

    return reply.send({
      data: { list, pagination: { page, pageSize, total: toNum(cnt[0]?.count) } },
    });
  });
}
