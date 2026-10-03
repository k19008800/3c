/**
 * 告警中心管理路由 — /api/v1/admin/alerts/*（PRD §5.4）
 *
 * 端点：
 *   GET    /admin/alerts/rules          列出全部规则
 *   POST   /admin/alerts/rules          新建规则（super_admin）
 *   PUT    /admin/alerts/rules/:id      更新规则（部分字段，super_admin）
 *   DELETE /admin/alerts/rules/:id      删除规则（super_admin；历史 alert 保留）
 *   GET    /admin/alerts                告警事件列表（status/rule_id 筛选 + 分页）
 *   POST   /admin/alerts/:id/ack        确认告警（→ acknowledged）
 *
 * 鉴权：admin / super_admin 可读；写操作仅 super_admin（与 admin-sys-cache.ts 一致）。
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { verifyToken } from '../services/auth/jwt.js';
import { UnauthorizedError, ForbiddenError, ValidationError, NotFoundError } from '../lib/errors.js';
import { desc, eq, sql, and } from 'drizzle-orm';

/** 允许的告警指标（与 alert-engine metricValue 映射一致） */
const ALLOWED_METRICS = [
  'response_latency', 'error_rate', 'qps', 'cost_spike',
  'balance_low', 'vendor_health', 'cache_hit_rate',
] as const;

const ALLOWED_STATUSES = ['firing', 'acknowledged', 'resolved'];

async function adminAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
  const { role } = payload as { role: string };
  if (role !== 'admin' && role !== 'super_admin') throw new ForbiddenError('Admin access required');
}

async function superAdminOnly(request: any) {
  const { role } = request.userContext as { role: string };
  if (role !== 'super_admin') throw new ForbiddenError('仅超级管理员可执行该操作');
}

/** 校验新建/更新规则入参；返回清洗后字段。非法值抛 400 ValidationError。 */
function parseRuleBody(body: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};

  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (name.length < 1 || name.length > 100) throw new ValidationError('name 长度须为 1-100');
    out.name = name;
  }
  if (!partial || body.metric !== undefined) {
    const metric = String(body.metric ?? '');
    if (!(ALLOWED_METRICS as readonly string[]).includes(metric)) {
      throw new ValidationError(`metric 须为 ${ALLOWED_METRICS.join('/')} 之一`);
    }
    out.metric = metric;
  }
  if (!partial || body.threshold !== undefined) {
    const threshold = Number(body.threshold);
    if (!Number.isFinite(threshold)) throw new ValidationError('threshold 须为数字');
    out.threshold = threshold;
  }
  if (!partial || body.window_sec !== undefined) {
    const windowSec = body.window_sec === undefined ? 300 : Number(body.window_sec);
    if (!Number.isInteger(windowSec) || windowSec < 30 || windowSec > 86400) {
      throw new ValidationError('window_sec 须为 30-86400 的整数（秒）');
    }
    out.windowSec = windowSec;
  }
  if (body.channel_ids !== undefined) {
    if (!Array.isArray(body.channel_ids) || body.channel_ids.some((c) => !Number.isInteger(Number(c)))) {
      throw new ValidationError('channel_ids 须为整数数组');
    }
    out.channelIds = body.channel_ids.map(Number);
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') throw new ValidationError('enabled 须为布尔值');
    out.enabled = body.enabled;
  }
  return out;
}

/** 解析告警列表筛选参数 */
function parseAlertFilters(q: { status?: string; rule_id?: string }) {
  const status = q.status && ALLOWED_STATUSES.includes(q.status) ? q.status : undefined;
  const ruleId = q.rule_id && Number.isInteger(Number(q.rule_id)) ? Number(q.rule_id) : undefined;
  return { status, ruleId };
}

export async function adminAlertsRoutes(app: FastifyInstance) {
  // ── 规则 CRUD ──────────────────────────────────────────────

  /** GET /api/v1/admin/alerts/rules — 列出全部规则（按 id 倒序） */
  app.get('/api/v1/admin/alerts/rules', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rules = await db.select().from(schema.monitoringRules).orderBy(desc(schema.monitoringRules.id));
    return reply.send({ data: { rules } });
  });

  /** POST /api/v1/admin/alerts/rules — 新建规则（super_admin） */
  app.post('/api/v1/admin/alerts/rules', { preHandler: [adminAuth] }, async (request, reply) => {
    await superAdminOnly(request);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const values = parseRuleBody(body, false);
    const [row] = await db.insert(schema.monitoringRules).values(values as any).returning();
    return reply.status(201).send({ data: row, message: '告警规则已创建' });
  });

  /** PUT /api/v1/admin/alerts/rules/:id — 更新规则（部分字段，super_admin） */
  app.put('/api/v1/admin/alerts/rules/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    await superAdminOnly(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('id 非法');
    const body = (request.body ?? {}) as Record<string, unknown>;
    const values = { ...parseRuleBody(body, true), updatedAt: new Date() };
    const [row] = await db
      .update(schema.monitoringRules)
      .set(values as any)
      .where(eq(schema.monitoringRules.id, id))
      .returning();
    if (!row) throw new NotFoundError('告警规则', id);
    return reply.send({ data: row, message: '告警规则已更新' });
  });

  /** DELETE /api/v1/admin/alerts/rules/:id — 删除规则（super_admin）。历史 alert 保留。 */
  app.delete('/api/v1/admin/alerts/rules/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    await superAdminOnly(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('id 非法');
    const deleted = await db.delete(schema.monitoringRules).where(eq(schema.monitoringRules.id, id)).returning();
    if (deleted.length === 0) throw new NotFoundError('告警规则', id);
    return reply.send({ data: { ok: true, id }, message: '告警规则已删除' });
  });

  // ── 告警事件 ──────────────────────────────────────────────

  /**
   * GET /api/v1/admin/alerts — 告警事件列表
   * query: status(firing/acknowledged/resolved) / rule_id / page / page_size
   */
  app.get('/api/v1/admin/alerts', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as { status?: string; rule_id?: string; page?: string; page_size?: string };
    const page = q.page ? Number(q.page) : 1;
    const pageSize = q.page_size ? Math.min(Number(q.page_size), 100) : 20;
    const { status, ruleId } = parseAlertFilters(q);

    // where 恒为 SQL（无过滤时为 true），保证单链调用类型一致
    const conds = [];
    if (status) conds.push(eq(schema.alerts.status, status));
    if (ruleId != null) conds.push(eq(schema.alerts.ruleId, ruleId));
    const where = conds.length === 0 ? sql`true` : conds.length === 1 ? conds[0] : and(...conds);

    const items = await db.select().from(schema.alerts)
      .where(where)
      .orderBy(desc(schema.alerts.firedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // 同条件 count（原生 sql，避免再拼一次 drizzle 条件）
    const countRows = await db.execute(buildCountSql(status, ruleId)) as unknown as Array<{ count: number | string }>;
    const total = Number(countRows[0]?.count ?? 0);

    return reply.send({ data: { items, total, page, pageSize } });
  });

  /** POST /api/v1/admin/alerts/:id/ack — 确认告警（firing/acknowledged → acknowledged） */
  app.post('/api/v1/admin/alerts/:id/ack', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('id 非法');
    const [row] = await db
      .update(schema.alerts)
      .set({ status: 'acknowledged', acknowledgedAt: new Date() })
      .where(eq(schema.alerts.id, id))
      .returning();
    if (!row) throw new NotFoundError('告警', id);
    return reply.send({ data: row, message: '告警已确认' });
  });
}

/** 与列表同过滤条件的 count SQL（status/rule_id 均可选） */
function buildCountSql(status: string | undefined, ruleId: number | undefined) {
  if (status && ruleId != null) {
    return sql`SELECT COUNT(*)::int AS count FROM alerts WHERE status = ${status} AND rule_id = ${ruleId}`;
  }
  if (status) {
    return sql`SELECT COUNT(*)::int AS count FROM alerts WHERE status = ${status}`;
  }
  if (ruleId != null) {
    return sql`SELECT COUNT(*)::int AS count FROM alerts WHERE rule_id = ${ruleId}`;
  }
  return sql`SELECT COUNT(*)::int AS count FROM alerts`;
}
