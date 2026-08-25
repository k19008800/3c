/**
 * 管理端风控三页 — /api/v1/admin/risk/{dashboard,events,rules}
 *
 * 对齐 gap-fix-spec-2026-08-18.md §3（风控三页）与前端
 * AdminRiskPage / AdminRiskEventsPage / AdminRiskRulesPage 的响应契约：
 *   - GET  /admin/risk/dashboard?period=          风控看板（计数 + 最近事件）
 *   - GET  /admin/risk/events?status=&keyword=&page_size=  风控事件列表
 *   - POST /admin/risk/events/:id/:op             op=resolve|freeze|ignore 处理事件
 *   - GET  /admin/risk/rules                      风控规则列表
 *   - POST /admin/risk/rules                      新建规则
 *   - PUT  /admin/risk/rules/:id                  更新规则（{ is_enabled } 或完整对象）
 *
 * 表：risk_rules(id,name,rule_type,description,config,enabled) /
 *     risk_events(id,rule_id,user_id,event_type,severity,details,resolved('0'|'1'|'2'),
 *                 resolved_by,resolved_at) / users(status='frozen')。
 *
 * 约定：
 *   - 全部 adminAuth（JWT + role ∈ {admin, super_admin}，对齐 admin-support-missing.ts）；
 *   - 写操作写 audit_logs（writeAudit）；
 *   - risk_events.resolved 映射：'0'→pending、'1'→handled/blocked（event_type=block 或
 *     details 含 block/freeze 时视为 blocked）、'2'→ignored（dashboard 契约不含 ignored，
 *     收敛为 handled）。
 *
 * @see docs/gap-fix-spec-2026-08-18.md §3
 * @module routes
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { and, asc, desc, eq, gte, like, not, or, sql } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';

/* ───────── auth / audit / 通用 helpers ───────── */

/** 用户鉴权（解析 JWT → request.userContext） */
async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

/** 管理端鉴权（preHandler，role ∈ {admin, super_admin}） */
async function adminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
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

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

/** 正整数解析（非法回退默认值，超上限截断） */
function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

/** 周期起点（today/week/month/quarter/year；默认 today） */
function periodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'week': return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter': return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case 'year': return new Date(now.getFullYear(), 0, 1);
    default: return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}

/* ───────── 风控事件字段映射 ───────── */

/** 事件 detail：优先取 details.description/reason/message，否则 JSON 序列化 */
function eventDetail(details: unknown): string | null {
  if (details == null) return null;
  if (typeof details === 'object') {
    const d = details as Record<string, unknown>;
    if (typeof d.description === 'string') return d.description;
    if (typeof d.reason === 'string') return d.reason;
    if (typeof d.message === 'string') return d.message;
    try {
      return JSON.stringify(d);
    } catch {
      return String(d);
    }
  }
  return String(details);
}

/** 事件文本（event_type + details）小写拼接，用于判定 blocked */
function eventText(eventType: string | null | undefined, details: unknown): string {
  let text = String(eventType ?? '');
  if (typeof details === 'string') text += ` ${details}`;
  else if (details != null) {
    try {
      text += ` ${JSON.stringify(details)}`;
    } catch {
      /* 忽略序列化失败 */
    }
  }
  return text.toLowerCase();
}

/** 判定事件是否命中「阻断/冻结」语义（blocked 状态） */
function isBlockish(eventType: string | null | undefined, details: unknown): boolean {
  const text = eventText(eventType, details);
  return text.includes('block') || text.includes('freeze');
}

/**
 * 事件展示状态 ← risk_events.resolved：
 *   '0' → pending；'2' → ignored；'1' → blocked（命中 block/freeze 语义）或 handled。
 *
 * @param forDashboard - dashboard 契约仅允许 pending|handled|blocked，ignored 收敛为 handled
 */
function eventStatus(
  resolved: string | null | undefined,
  eventType: string | null | undefined,
  details: unknown,
  forDashboard = false,
): 'pending' | 'handled' | 'blocked' | 'ignored' {
  const flag = resolved ?? '0';
  if (flag === '0') return 'pending';
  if (flag === '2') return forDashboard ? 'handled' : 'ignored';
  if (isBlockish(eventType, details)) return 'blocked';
  return 'handled';
}

/** 规则行 → 前端线协议（config jsonb 内取 threshold/action） */
function ruleToWire(r: typeof schema.riskRules.$inferSelect) {
  const config = (r.config ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    name: r.name,
    type: r.ruleType,
    threshold: config.threshold ?? null,
    action: config.action ?? null,
    is_enabled: r.enabled,
    description: r.description,
  };
}

/** 事件行（含 join 出的用户邮箱 / 规则名）→ 前端线协议 */
function eventToWire(
  r: {
    id: number;
    createdAt: Date;
    resolved: string | null;
    eventType: string | null;
    severity: string | null;
    details: unknown;
    userEmail: string | null;
    ruleName: string | null;
  },
  forDashboard = false,
) {
  return {
    id: r.id,
    created_at: r.createdAt.toISOString(),
    user_email: r.userEmail ?? null,
    rule_name: r.ruleName ?? null,
    detail: eventDetail(r.details),
    severity: r.severity ?? 'medium',
    status: eventStatus(r.resolved, r.eventType, r.details, forDashboard),
  };
}

/** dashboard 事件的查询投影（含 users.email / risk_rules.name join） */
const dashboardEventSelect = {
  id: schema.riskEvents.id,
  createdAt: schema.riskEvents.createdAt,
  resolved: schema.riskEvents.resolved,
  eventType: schema.riskEvents.eventType,
  severity: schema.riskEvents.severity,
  details: schema.riskEvents.details,
  userEmail: schema.users.email,
  ruleName: schema.riskRules.name,
} as const;

export function adminRiskRoutes(app: FastifyInstance) {
  /* ═══════════ 1. 风控看板 ═══════════ */

  /** GET /api/v1/admin/risk/dashboard?period=today|week|month|quarter|year — 风控看板 */
  app.get('/api/v1/admin/risk/dashboard', { preHandler: [adminAuth] }, async (request, reply) => {
    const period = String((request.query as any)?.period ?? 'today');
    const start = periodStart(period);
    const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    // 5 个计数并行取（计数均为全局口径；period 只作用于 events 列表）
    const [frozenRow, rulesRow, unhandledRow, blocksRow, events] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(schema.users)
        .where(eq(schema.users.status, 'frozen')),
      db.select({ n: sql<number>`count(*)::int` }).from(schema.riskRules)
        .where(eq(schema.riskRules.enabled, true)),
      db.select({ n: sql<number>`count(*)::int` }).from(schema.riskEvents)
        .where(eq(schema.riskEvents.resolved, '0')),
      // 今日拦截：event_type='block' 或 details 含 block
      db.select({ n: sql<number>`count(*)::int` }).from(schema.riskEvents)
        .where(and(
          gte(schema.riskEvents.createdAt, todayStart),
          or(
            eq(schema.riskEvents.eventType, 'block'),
            sql`${schema.riskEvents.details}::text ILIKE '%block%'`,
          ),
        )),
      db.select(dashboardEventSelect)
        .from(schema.riskEvents)
        .leftJoin(schema.users, eq(schema.riskEvents.userId, schema.users.id))
        .leftJoin(schema.riskRules, eq(schema.riskEvents.ruleId, schema.riskRules.id))
        .where(gte(schema.riskEvents.createdAt, start))
        .orderBy(desc(schema.riskEvents.createdAt))
        .limit(10),
    ]);

    const unhandled = toNum(unhandledRow?.[0]?.n);

    return reply.send({
      data: {
        unhandled_events: unhandled,
        frozen_accounts: toNum(frozenRow?.[0]?.n),
        active_rules: toNum(rulesRow?.[0]?.n),
        today_blocks: toNum(blocksRow?.[0]?.n),
        // pending_incidents 与 unhandled_events 同源（risk_events 未处理，规格允许复用）
        pending_incidents: unhandled,
        events: events.map((e) => eventToWire(e, true)),
      },
    });
  });

  /* ═══════════ 2. 风控事件列表 ═══════════ */

  /** GET /api/v1/admin/risk/events?status=pending|handled|blocked|ignored&keyword=&page_size= — 事件列表 */
  app.get('/api/v1/admin/risk/events', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const pageSize = parsePositiveInt(q.page_size, 50, 200);
    const status = String(q.status ?? '').trim();
    const keyword = String(q.keyword ?? '').trim();

    const conds: any[] = [];
    // status 过滤映射：pending=resolved'0'；blocked/ignored 按标志位；handled=其余已处理
    if (status) {
      // 阻断/冻结语义（blocked 判定用，与展示映射一致）
      const blockCond = sql`(
        ${schema.riskEvents.eventType} = 'block'
        OR ${schema.riskEvents.details}::text ILIKE '%block%'
        OR ${schema.riskEvents.details}::text ILIKE '%freeze%'
      )`;
      switch (status) {
        case 'pending':
          conds.push(eq(schema.riskEvents.resolved, '0'));
          break;
        case 'ignored':
          conds.push(eq(schema.riskEvents.resolved, '2'));
          break;
        case 'blocked':
          conds.push(and(eq(schema.riskEvents.resolved, '1'), blockCond));
          break;
        case 'handled':
          conds.push(and(eq(schema.riskEvents.resolved, '1'), not(blockCond)));
          break;
        default:
          throw new ValidationError('status 仅支持 pending / handled / blocked / ignored');
      }
    }
    if (keyword) {
      const kw = `%${keyword}%`;
      conds.push(or(
        like(schema.users.email, kw),
        like(schema.riskRules.name, kw),
        sql`${schema.riskEvents.details}::text ILIKE ${kw}`,
      ));
    }
    const whereClause = conds.length > 0 ? and(...conds) : undefined;

    const rows = await db
      .select(dashboardEventSelect)
      .from(schema.riskEvents)
      .leftJoin(schema.users, eq(schema.riskEvents.userId, schema.users.id))
      .leftJoin(schema.riskRules, eq(schema.riskEvents.ruleId, schema.riskRules.id))
      .where(whereClause)
      .orderBy(desc(schema.riskEvents.createdAt))
      .limit(pageSize);

    return reply.send({
      data: { list: rows.map((e) => eventToWire(e)) },
    });
  });

  /* ═══════════ 3. 风控事件处理 ═══════════ */

  /** POST /api/v1/admin/risk/events/:id/:op — op=resolve|freeze|ignore（freeze 同时冻结对应用户） */
  app.post('/api/v1/admin/risk/events/:id/:op', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id, op } = (request.params ?? {}) as { id: string; op: string };
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) throw new ValidationError('事件 ID 非法');
    if (op !== 'resolve' && op !== 'freeze' && op !== 'ignore') {
      throw new ValidationError('op 仅支持 resolve / freeze / ignore');
    }

    const [row] = await db
      .select({ id: schema.riskEvents.id, userId: schema.riskEvents.userId, eventType: schema.riskEvents.eventType })
      .from(schema.riskEvents)
      .where(eq(schema.riskEvents.id, eventId))
      .limit(1);
    if (!row) throw new NotFoundError('风控事件', eventId);

    const operatorId = (request as any).userContext?.userId ?? null;

    // freeze：先把对应用户置为 frozen（事件无 userId 则跳过用户操作）
    if (op === 'freeze' && row.userId != null) {
      await db.update(schema.users)
        .set({ status: 'frozen', updatedAt: new Date() })
        .where(eq(schema.users.id, row.userId));
    }

    // resolve/freeze → resolved='1'；ignore → resolved='2'
    await db.update(schema.riskEvents)
      .set({
        resolved: op === 'ignore' ? '2' : '1',
        resolvedBy: operatorId,
        resolvedAt: new Date(),
      })
      .where(eq(schema.riskEvents.id, eventId));

    await writeAudit(request, `risk.event.${op}`, 'risk_event', eventId, {
      userId: row.userId,
      eventType: row.eventType,
    });

    const status = op === 'ignore' ? 'ignored' : 'resolved';
    const message = op === 'freeze' ? '事件已处理，用户已冻结'
      : op === 'ignore' ? '事件已忽略' : '事件已标记为已解决';

    return reply.send({
      data: { id: eventId, status },
      message,
    });
  });

  /* ═══════════ 4. 风控规则列表 ═══════════ */

  /** GET /api/v1/admin/risk/rules — 规则列表（threshold/action 从 config jsonb 取） */
  app.get('/api/v1/admin/risk/rules', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rows = await db
      .select()
      .from(schema.riskRules)
      .orderBy(asc(schema.riskRules.id));
    return reply.send({ data: { list: rows.map(ruleToWire) } });
  });

  /* ═══════════ 5. 新建规则 ═══════════ */

  /** POST /api/v1/admin/risk/rules — body { name, description, type, threshold, action } */
  app.post('/api/v1/admin/risk/rules', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    const type = String(body.type ?? '').trim();
    if (!name) throw new ValidationError('规则名称必填');
    if (!type) throw new ValidationError('规则类型必填');

    const threshold = body.threshold !== undefined && body.threshold !== null && body.threshold !== ''
      ? Number(body.threshold)
      : 0;
    if (!Number.isFinite(threshold)) throw new ValidationError('阈值必须为数字');
    const action = String(body.action ?? '').trim() || 'warn';

    const [created] = await db.insert(schema.riskRules)
      .values({
        name,
        ruleType: type,
        description: body.description != null ? String(body.description).slice(0, 500) : null,
        config: { threshold, action },
        enabled: true,
      })
      .returning();
    if (!created) throw new ValidationError('规则创建失败，请重试');

    await writeAudit(request, 'risk.rule.create', 'risk_rule', created.id, { name, type, threshold, action });

    return reply.send({ data: ruleToWire(created), message: '规则已创建' });
  });

  /* ═══════════ 6. 更新规则 ═══════════ */

  /** PUT /api/v1/admin/risk/rules/:id — body { is_enabled } 或完整对象（name/description/type/threshold/action） */
  app.put('/api/v1/admin/risk/rules/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = Number((request.params as any)?.id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('规则 ID 非法');

    const [row] = await db
      .select()
      .from(schema.riskRules)
      .where(eq(schema.riskRules.id, id))
      .limit(1);
    if (!row) throw new NotFoundError('风控规则', id);

    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new ValidationError('规则名称不能为空');
      patch.name = name;
    }
    if (body.description !== undefined) {
      patch.description = body.description != null ? String(body.description).slice(0, 500) : null;
    }
    if (body.type !== undefined) {
      const type = String(body.type).trim();
      if (!type) throw new ValidationError('规则类型不能为空');
      patch.ruleType = type;
    }
    // config 内的 threshold/action：与既有 config 合并（保留未提交字段）
    const config = { ...((row.config ?? {}) as Record<string, unknown>) };
    if (body.threshold !== undefined && body.threshold !== null && body.threshold !== '') {
      const threshold = Number(body.threshold);
      if (!Number.isFinite(threshold)) throw new ValidationError('阈值必须为数字');
      config.threshold = threshold;
    }
    if (body.action !== undefined) {
      const action = String(body.action).trim();
      if (!action) throw new ValidationError('动作不能为空');
      config.action = action;
    }
    patch.config = config;
    // 启停：前端传 is_enabled（表列名 enabled）
    if (body.is_enabled !== undefined) {
      patch.enabled = !!body.is_enabled;
    }
    patch.updatedAt = new Date();

    await db.update(schema.riskRules)
      .set(patch as any)
      .where(eq(schema.riskRules.id, id));

    await writeAudit(request, 'risk.rule.update', 'risk_rule', id, {
      name: row.name,
      patch,
    });

    const [updated] = await db
      .select()
      .from(schema.riskRules)
      .where(eq(schema.riskRules.id, id))
      .limit(1);

    return reply.send({ data: updated ? ruleToWire(updated) : null, message: '规则已更新' });
  });
}
