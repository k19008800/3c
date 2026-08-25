/**
 * 管理端工单管理 + 审计日志 — /api/v1/admin/tickets* 与 /api/v1/admin/audit-logs
 *
 * 对齐原型（gap-fix-spec-2026-08-18 §1 工单管理 1:1 复刻、§2 审计日志）：
 *   - GET  /api/v1/admin/tickets?page_size=&status=&search=
 *   - GET  /api/v1/admin/tickets/stats
 *   - GET  /api/v1/admin/tickets/:id
 *   - POST /api/v1/admin/tickets/:id/status  body { status }
 *   - POST /api/v1/admin/tickets/:id/reply   body { content }
 *   - POST /api/v1/admin/tickets/:id/note    body { note }
 *   - POST /api/v1/admin/tickets/:id/assign  body { assignee_id }
 *   - GET  /api/v1/admin/audit-logs?keyword=&action=&page_size=
 *
 * 关键约定：
 *   - 状态映射（表值 → 前端值）：open→pending、in_progress/waiting_customer→processing、
 *     resolved→resolved、closed→closed；status_label 中文见 STATUS_LABELS。
 *   - replies / operation_logs / satisfaction / tags 全部存于 tickets.metadata(jsonb)，
 *     读取时先 SELECT 原值再合并写回（drizzle jsonb 直接赋对象，由驱动序列化）。
 *   - 全部端点 adminAuth（JWT + role ∈ {admin, super_admin}，对齐 admin-support-missing.ts）；
 *     写操作写 audit_logs（action 前缀 ticket.*）；查询类端点不写审计（audit.list 可省略）。
 *   - 响应包裹 { data: ... }；错误走 lib/errors（AppError.statusCode → HTTP 状态码）。
 *
 * @see docs/gap-fix-spec-2026-08-18.md §1/§2
 * @see routes/admin-support-missing.ts（鉴权 / writeAudit / 分页 / 注释风格统一模式）
 * @module routes/admin-tickets
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, or, like, inArray, sql, desc, count } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';

/* ───────── 鉴权（对齐 admin-support-missing.ts 模式） ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

/** 管理后台鉴权：需有效 JWT 且 role 为 admin / super_admin */
async function adminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

/* ───────── 工具函数 ───────── */

/** 正整数解析（非法回退默认值，超上限截断） */
function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

/** 统一分页参数：page（默认 1）/ page_size 或 pageSize（默认 20，上限 100） */
function parsePageQuery(q: Record<string, unknown>): { page: number; pageSize: number } {
  return {
    page: parsePositiveInt(q.page, 1),
    pageSize: parsePositiveInt(q.page_size ?? q.pageSize, 20, 100),
  };
}

/** 路径 ID 解析：非正整数直接 400 */
function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法 ID');
  return id;
}

/** 写审计日志（操作留痕；details 为 jsonb 摘要，写操作专用） */
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
  });
}

/* ───────── 工单状态 / 分类映射 ───────── */

/** 表值 → 前端值（STATUS_MAP key：pending/processing/resolved/closed） */
const TABLE_TO_API: Record<string, string> = {
  open: 'pending',
  in_progress: 'processing',
  waiting_customer: 'processing',
  resolved: 'resolved',
  closed: 'closed',
};

/** 前端值 → 表值（列表过滤用：processing 覆盖 in_progress + waiting_customer） */
const STATUS_FILTER_MAP: Record<string, string[]> = {
  pending: ['open'],
  processing: ['in_progress', 'waiting_customer'],
  resolved: ['resolved'],
  closed: ['closed'],
};

/** 前端值 → 表值（写状态用，单值） */
const API_TO_TABLE: Record<string, string> = {
  pending: 'open',
  processing: 'in_progress',
  resolved: 'resolved',
  closed: 'closed',
};

/** 前端状态中文文案 */
const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  processing: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};

/** 工单分类中文文案（type → category_label；未知类型回退原值） */
const TICKET_CATEGORY_LABELS: Record<string, string> = {
  general: '通用咨询',
  technical: '技术问题',
  billing: '计费咨询',
  feature_request: '功能建议',
  account: '账户问题',
  other: '其他',
};

/** 表值工单状态 → 前端值 */
function mapTicketStatus(tableStatus: string): string {
  return TABLE_TO_API[tableStatus] ?? tableStatus;
}

/**
 * metadata 内数组的自增 ID 分配：取现有最大 id + 1（无 id 的旧条目忽略，首条从 1 开始）。
 * 用户端回复（me.ts 写入）无 id 字段，客服侧追加回复/操作日志时按此分配，保证前端 key 稳定。
 */
function nextSeqId(items: unknown[]): number {
  let max = 0;
  for (const it of items) {
    const n = (it as Record<string, unknown> | null)?.id;
    if (typeof n === 'number' && n > max) max = n;
  }
  return max + 1;
}

/** 回复记录归一化：兼容客服端写入的 { id,is_staff,content,created_at } 与用户端写入的 { role,content,createdAt } */
function normalizeReply(r: unknown) {
  const item = (r ?? {}) as Record<string, unknown>;
  return {
    id: typeof item.id === 'number' ? item.id : 0,
    is_staff: item.is_staff === true,
    content: String(item.content ?? ''),
    created_at: (item.created_at as string) ?? (item.createdAt as string) ?? null,
  };
}

/** 列表/详情共用的工单行 → AdminTicket DTO */
type TicketRow = {
  id: number;
  type: string;
  title: string;
  content?: string | null;
  priority: string | null;
  status: string;
  createdAt: Date;
  email: string | null;
  name: string | null;
  assigneeName: string | null;
};

function toAdminTicket(r: TicketRow) {
  const status = mapTicketStatus(r.status);
  return {
    id: r.id,
    ticket_no: `TCK${String(r.id).padStart(6, '0')}`,
    title: r.title,
    category: r.type,
    category_label: TICKET_CATEGORY_LABELS[r.type] ?? r.type,
    priority: r.priority,
    status,
    status_label: STATUS_LABELS[status] ?? status,
    email: r.email,
    username: r.name,
    assignee_name: r.assigneeName,
    created_at: r.createdAt,
  };
}

/**
 * 全表工单指标扫描（平均响应 / 平均解决 / 满意度）。
 *
 * 平均响应：所有已回复工单 创建 → 首次客服回复（metadata.replies 中第一条 is_staff=true）的秒数均值；
 * 平均解决：所有已解决工单（resolved/closed 且 resolved_at 非空）创建 → resolved_at 的秒数均值；
 * 满意度：metadata.satisfaction.rating（0-5）均值。数据量级小，JS 侧解析 jsonb 比 SQL 嵌套更直白。
 *
 * @returns 各指标（无数据为 0；秒数四舍五入取整）
 */
async function scanTicketMetrics(): Promise<{ avgResponseSeconds: number; avgResolveSeconds: number; satisfaction: number }> {
  const rows = await db
    .select({
      createdAt: schema.tickets.createdAt,
      resolvedAt: schema.tickets.resolvedAt,
      status: schema.tickets.status,
      metadata: schema.tickets.metadata,
    })
    .from(schema.tickets);

  const responseDiffs: number[] = [];
  const resolveDiffs: number[] = [];
  const satisfactionRatings: number[] = [];

  for (const r of rows) {
    const createdMs = new Date(r.createdAt).getTime();
    const meta = (r.metadata ?? {}) as Record<string, unknown>;

    // 首次客服回复时间：取 replies 数组中第一条 is_staff=true（数组按时间追加，顺序即时间序）
    const replies = Array.isArray(meta.replies) ? (meta.replies as Record<string, unknown>[]) : [];
    const firstStaff = replies.find((x) => x && x.is_staff === true);
    const replyAt = firstStaff
      ? (firstStaff.created_at as string) ?? (firstStaff.createdAt as string)
      : null;
    if (replyAt) {
      const diff = (new Date(replyAt).getTime() - createdMs) / 1000;
      if (Number.isFinite(diff) && diff >= 0) responseDiffs.push(diff);
    }

    // 已解决工单：创建 → resolved_at
    if ((r.status === 'resolved' || r.status === 'closed') && r.resolvedAt) {
      const diff = (new Date(r.resolvedAt).getTime() - createdMs) / 1000;
      if (Number.isFinite(diff) && diff >= 0) resolveDiffs.push(diff);
    }

    // 满意度：metadata.satisfaction.rating
    const sat = meta.satisfaction as Record<string, unknown> | null | undefined;
    if (sat && typeof sat.rating === 'number' && sat.rating >= 0) {
      satisfactionRatings.push(sat.rating);
    }
  }

  const avg = (arr: number[]) => (arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
  return {
    avgResponseSeconds: avg(responseDiffs),
    avgResolveSeconds: avg(resolveDiffs),
    satisfaction: satisfactionRatings.length > 0
      ? Math.round((satisfactionRatings.reduce((a, b) => a + b, 0) / satisfactionRatings.length) * 100) / 100
      : 0,
  };
}

/** 全量工单状态统计（表值分组 → 前端 pending/processing/resolved/closed 计数） */
async function getTicketStatusStats(): Promise<{ pending: number; processing: number; resolved: number; closed: number }> {
  const rows = (await db.execute(sql`
    SELECT status, COUNT(*)::int AS c FROM tickets GROUP BY status
  `)) as any[];

  const stats = { pending: 0, processing: 0, resolved: 0, closed: 0 };
  for (const r of rows ?? []) {
    const mapped = mapTicketStatus(String(r.status));
    if (mapped in stats) stats[mapped as keyof typeof stats] += Number(r.c ?? 0);
  }
  return stats;
}

/** 读取工单基础行（含用户邮箱/用户名 + 分配人姓名） */
async function findTicketRow(id: number) {
  const assignee = alias(schema.users, 'assignee');
  const [row] = await db
    .select({
      id: schema.tickets.id,
      userId: schema.tickets.userId,
      type: schema.tickets.type,
      title: schema.tickets.title,
      content: schema.tickets.content,
      status: schema.tickets.status,
      priority: schema.tickets.priority,
      assignedTo: schema.tickets.assignedTo,
      resolvedAt: schema.tickets.resolvedAt,
      metadata: schema.tickets.metadata,
      createdAt: schema.tickets.createdAt,
      updatedAt: schema.tickets.updatedAt,
      email: schema.users.email,
      name: schema.users.name,
      assigneeName: assignee.name,
    })
    .from(schema.tickets)
    .leftJoin(schema.users, eq(schema.tickets.userId, schema.users.id))
    .leftJoin(assignee, eq(schema.tickets.assignedTo, assignee.id))
    .where(eq(schema.tickets.id, id))
    .limit(1);
  return row;
}

export async function adminTicketsRoutes(app: FastifyInstance) {
  /* ═══════════ 1. 工单列表 ═══════════ */

  /**
   * GET /api/v1/admin/tickets?page_size=&status=&search= — 工单列表
   *
   * 响应 { data: { list: AdminTicket[], stats: { pending,processing,resolved,closed },
   *               avg_response_seconds, avg_resolve_seconds } }
   * AdminTicket: { id, ticket_no(TCK+pad6), title, category(=type), category_label, priority,
   *                status, status_label, email, username, assignee_name, created_at }
   * status 为前端值（open→pending、in_progress/waiting_customer→processing）；stats 为全量计数。
   */
  app.get('/api/v1/admin/tickets', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize } = parsePageQuery(q);
    const statusParam = String(q.status ?? '').trim();
    const search = String(q.search ?? '').trim();

    const assignee = alias(schema.users, 'assignee');
    const conds: any[] = [];

    // 状态过滤：前端值（pending/processing/resolved/closed）→ 映射回表值集合
    if (statusParam) {
      const tableStatuses = STATUS_FILTER_MAP[statusParam];
      if (!tableStatuses) throw new ValidationError(`非法工单状态: ${statusParam}（仅支持 pending/processing/resolved/closed）`);
      conds.push(inArray(schema.tickets.status, tableStatuses as any));
    }

    // 搜索：标题 / 用户名 / 邮箱模糊匹配；工单号 TCKxxxxxx 命中 id
    if (search) {
      const kw = `%${search}%`;
      const tcNo = /^tck(\d+)$/i.exec(search);
      const searchConds: any[] = [
        like(schema.tickets.title, kw),
        like(schema.users.name, kw),
        like(schema.users.email, kw),
      ];
      if (tcNo) searchConds.push(eq(schema.tickets.id, parseInt(tcNo[1] as string, 10)));
      conds.push(or(...searchConds));
    }
    const where = conds.length > 0 ? and(...conds) : undefined;

    const [rows, totalRow, stats, metrics] = await Promise.all([
      db
        .select({
          id: schema.tickets.id,
          type: schema.tickets.type,
          title: schema.tickets.title,
          priority: schema.tickets.priority,
          status: schema.tickets.status,
          createdAt: schema.tickets.createdAt,
          email: schema.users.email,
          name: schema.users.name,
          assigneeName: assignee.name,
        })
        .from(schema.tickets)
        .leftJoin(schema.users, eq(schema.tickets.userId, schema.users.id))
        .leftJoin(assignee, eq(schema.tickets.assignedTo, assignee.id))
        .where(where)
        .orderBy(desc(schema.tickets.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: count() })
        .from(schema.tickets)
        .leftJoin(schema.users, eq(schema.tickets.userId, schema.users.id))
        .leftJoin(assignee, eq(schema.tickets.assignedTo, assignee.id))
        .where(where),
      getTicketStatusStats(),
      scanTicketMetrics(),
    ]);

    return reply.send({
      data: {
        list: rows.map((r) => toAdminTicket(r as unknown as TicketRow)),
        total: Number(totalRow?.[0]?.total ?? 0),
        stats,
        avg_response_seconds: metrics.avgResponseSeconds,
        avg_resolve_seconds: metrics.avgResolveSeconds,
      },
    });
  });

  /* ═══════════ 2. 工单统计 ═══════════ */

  /**
   * GET /api/v1/admin/tickets/stats — 工单统计
   *
   * 响应 { data: { total, resolved, resolve_rate, avg_response_seconds, avg_resolve_seconds,
   *                satisfaction, category_distribution: [{category,c}],
   *                staff_ranking: [{username,tickets,satisfaction}] } }
   * resolved = 已解决 + 已关闭；resolve_rate 百分比（1 位小数）；满意度 0-5；
   * staff_ranking 按 assigned_to 聚合（无满意度为 0）。
   */
  app.get('/api/v1/admin/tickets/stats', { preHandler: [adminAuth] }, async (request, reply) => {
    const [agg, dist, ranking, metrics] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::int AS resolved
        FROM tickets
      `),
      db.execute(sql`
        SELECT type AS category, COUNT(*)::int AS c FROM tickets GROUP BY type ORDER BY c DESC
      `),
      db.execute(sql`
        SELECT COALESCE(u.name, '未分配') AS username,
               COUNT(*)::int AS tickets,
               COALESCE(AVG((t.metadata->'satisfaction'->>'rating')::numeric), 0)::float8 AS satisfaction
        FROM tickets t
        LEFT JOIN users u ON u.id = t.assigned_to
        WHERE t.assigned_to IS NOT NULL
        GROUP BY u.name
        ORDER BY tickets DESC
      `),
      scanTicketMetrics(),
    ]);

    const a = (agg as any[])[0] ?? { total: 0, resolved: 0 };
    const total = Number(a.total ?? 0);
    const resolved = Number(a.resolved ?? 0);
    const resolveRate = total > 0 ? Math.round((resolved / total) * 1000) / 10 : 0;

    return reply.send({
      data: {
        total,
        resolved,
        resolve_rate: resolveRate,
        avg_response_seconds: metrics.avgResponseSeconds,
        avg_resolve_seconds: metrics.avgResolveSeconds,
        satisfaction: metrics.satisfaction,
        category_distribution: (dist as any[] ?? []).map((r) => ({
          category: String(r.category ?? ''),
          c: Number(r.c ?? 0),
        })),
        staff_ranking: (ranking as any[] ?? []).map((r) => ({
          username: String(r.username ?? ''),
          tickets: Number(r.tickets ?? 0),
          satisfaction: Math.round(Number(r.satisfaction ?? 0) * 100) / 100,
        })),
      },
    });
  });

  /* ═══════════ 3. 工单详情 ═══════════ */

  /**
   * GET /api/v1/admin/tickets/:id — 工单详情
   *
   * 响应 { data: { ticket: AdminTicket + { description(=content), all_tags },
   *                replies: [{id,is_staff,content,created_at}],
   *                operation_logs: [{id,action,detail,created_at}],
   *                satisfaction: {rating,comment}|null, all_tags } }
   * replies/operation_logs/satisfaction/tags 均来自 tickets.metadata，不存在时返回空值。
   */
  app.get('/api/v1/admin/tickets/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as Record<string, unknown>).id);
    const row = await findTicketRow(id);
    if (!row) throw new NotFoundError('工单', id);

    const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>;
    const replies = Array.isArray(meta.replies) ? (meta.replies as unknown[]).map(normalizeReply) : [];
    const operationLogs = Array.isArray(meta.operation_logs) ? meta.operation_logs : [];
    const satisfaction = (meta.satisfaction && typeof meta.satisfaction === 'object' ? meta.satisfaction : null) as
      | { rating: number; comment?: string }
      | null;
    const allTags = Array.isArray(meta.tags) ? meta.tags : [];

    return reply.send({
      data: {
        ticket: {
          ...toAdminTicket(row as unknown as TicketRow),
          description: row.content,
          all_tags: allTags,
        },
        replies,
        operation_logs: operationLogs,
        satisfaction,
        all_tags: allTags,
      },
    });
  });

  /* ═══════════ 4. 修改工单状态 ═══════════ */

  /**
   * POST /api/v1/admin/tickets/:id/status — 修改工单状态
   *
   * body { status: pending|processing|resolved|closed }（也兼容表值 open/in_progress/...）。
   * 更新 tickets.status（转为 resolved 时写 resolved_at），metadata.operation_logs 追加
   * { action:'status', detail, created_at }，并写 audit_logs（ticket.status）。
   * 响应 { data: { id, status, status_label, resolved_at } }。
   */
  app.post('/api/v1/admin/tickets/:id/status', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as Record<string, unknown>).id);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const rawStatus = String(body.status ?? '').trim();

    // 前端值 → 表值；直接传表值（open/in_progress/waiting_customer/resolved/closed）也放行
    const nextTableStatus =
      API_TO_TABLE[rawStatus] ?? (Object.values(TABLE_TO_API).includes(rawStatus) ? rawStatus : undefined);
    if (!nextTableStatus) {
      throw new ValidationError('status 仅支持 pending/processing/resolved/closed');
    }

    const [ticket] = await db
      .select({ id: schema.tickets.id, status: schema.tickets.status, metadata: schema.tickets.metadata })
      .from(schema.tickets)
      .where(eq(schema.tickets.id, id))
      .limit(1);
    if (!ticket) throw new NotFoundError('工单', id);

    const now = new Date();
    const meta = (ticket.metadata && typeof ticket.metadata === 'object' ? ticket.metadata : {}) as Record<string, unknown>;
    const ops = Array.isArray(meta.operation_logs) ? [...(meta.operation_logs as unknown[])] : [];
    ops.push({ id: nextSeqId(ops), action: 'status', detail: `${ticket.status} → ${nextTableStatus}`, created_at: now.toISOString() });

    const patch: Record<string, unknown> = {
      status: nextTableStatus,
      metadata: { ...meta, operation_logs: ops },
      updatedAt: now,
    };
    if (nextTableStatus === 'resolved') patch.resolvedAt = now;

    const [updated] = await db
      .update(schema.tickets)
      .set(patch as any)
      .where(eq(schema.tickets.id, id))
      .returning({ id: schema.tickets.id, status: schema.tickets.status, resolvedAt: schema.tickets.resolvedAt });
    if (!updated) throw new NotFoundError('工单', id);

    await writeAudit(request, 'ticket.status', 'ticket', String(id), { from: ticket.status, to: nextTableStatus });

    const apiStatus = mapTicketStatus(updated.status);
    return reply.send({
      data: {
        id: updated.id,
        status: apiStatus,
        status_label: STATUS_LABELS[apiStatus] ?? apiStatus,
        resolved_at: updated.resolvedAt,
      },
    });
  });

  /* ═══════════ 5. 客服回复 ═══════════ */

  /**
   * POST /api/v1/admin/tickets/:id/reply — 客服回复
   *
   * body { content }。metadata.replies 追加 { id(自增), is_staff:true, content, created_at }；
   * 若工单为 open 则置 in_progress 并追加 operation_logs；写 audit_logs（ticket.reply）。
   * 响应 { data: { id, status, status_label, reply, updated_at } }。
   */
  app.post('/api/v1/admin/tickets/:id/reply', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as Record<string, unknown>).id);
    const content = String((request.body as Record<string, unknown> | undefined)?.content ?? '').trim();
    if (!content) throw new ValidationError('回复内容不能为空');

    const [ticket] = await db
      .select({ id: schema.tickets.id, status: schema.tickets.status, metadata: schema.tickets.metadata })
      .from(schema.tickets)
      .where(eq(schema.tickets.id, id))
      .limit(1);
    if (!ticket) throw new NotFoundError('工单', id);

    const now = new Date();
    const meta = (ticket.metadata && typeof ticket.metadata === 'object' ? ticket.metadata : {}) as Record<string, unknown>;
    const replies = Array.isArray(meta.replies) ? [...(meta.replies as unknown[])] : [];
    const newReply = { id: nextSeqId(replies), is_staff: true, content, created_at: now.toISOString() };
    replies.push(newReply);

    const ops = Array.isArray(meta.operation_logs) ? [...(meta.operation_logs as unknown[])] : [];
    const patch: Record<string, unknown> = {
      metadata: { ...meta, replies },
      updatedAt: now,
    };
    // 用户新工单（open）首次客服回复 → 转处理中（对齐原型：回复即开始处理）
    if (ticket.status === 'open') {
      patch.status = 'in_progress';
      ops.push({ id: nextSeqId(ops), action: 'status', detail: 'open → in_progress', created_at: now.toISOString() });
      patch.metadata = { ...meta, replies, operation_logs: ops };
    }

    const [updated] = await db
      .update(schema.tickets)
      .set(patch as any)
      .where(eq(schema.tickets.id, id))
      .returning({ id: schema.tickets.id, status: schema.tickets.status, updatedAt: schema.tickets.updatedAt });
    if (!updated) throw new NotFoundError('工单', id);

    await writeAudit(request, 'ticket.reply', 'ticket', String(id), { contentLength: content.length });

    const apiStatus = mapTicketStatus(updated.status);
    return reply.send({
      data: {
        id: updated.id,
        status: apiStatus,
        status_label: STATUS_LABELS[apiStatus] ?? apiStatus,
        reply: newReply,
        updated_at: updated.updatedAt,
      },
    });
  });

  /* ═══════════ 6. 内部备注 ═══════════ */

  /**
   * POST /api/v1/admin/tickets/:id/note — 内部备注（用户不可见）
   *
   * body { note }。metadata.operation_logs 追加 { action:'note', detail: note, created_at }；
   * 写 audit_logs（ticket.note）。响应 { data: { id, ok, note_count } }。
   */
  app.post('/api/v1/admin/tickets/:id/note', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as Record<string, unknown>).id);
    const note = String((request.body as Record<string, unknown> | undefined)?.note ?? '').trim();
    if (!note) throw new ValidationError('备注内容不能为空');

    const [ticket] = await db
      .select({ id: schema.tickets.id, metadata: schema.tickets.metadata })
      .from(schema.tickets)
      .where(eq(schema.tickets.id, id))
      .limit(1);
    if (!ticket) throw new NotFoundError('工单', id);

    const now = new Date();
    const meta = (ticket.metadata && typeof ticket.metadata === 'object' ? ticket.metadata : {}) as Record<string, unknown>;
    const ops = Array.isArray(meta.operation_logs) ? [...(meta.operation_logs as unknown[])] : [];
    ops.push({ id: nextSeqId(ops), action: 'note', detail: note, created_at: now.toISOString() });

    const [updated] = await db
      .update(schema.tickets)
      .set({ metadata: { ...meta, operation_logs: ops }, updatedAt: now } as any)
      .where(eq(schema.tickets.id, id))
      .returning({ id: schema.tickets.id });
    if (!updated) throw new NotFoundError('工单', id);

    await writeAudit(request, 'ticket.note', 'ticket', String(id), { noteLength: note.length });
    return reply.send({ data: { id: updated.id, ok: true, note_count: ops.length } });
  });

  /* ═══════════ 7. 分配工单 ═══════════ */

  /**
   * POST /api/v1/admin/tickets/:id/assign — 分配工单给客服
   *
   * body { assignee_id }。更新 tickets.assigned_to，metadata.operation_logs 追加
   * { action:'assign', detail: 客服姓名, created_at }；写 audit_logs（ticket.assign）。
   * 响应 { data: { id, assigned_to, assignee_name } }。
   */
  app.post('/api/v1/admin/tickets/:id/assign', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as Record<string, unknown>).id);
    const assigneeId = Number((request.body as Record<string, unknown> | undefined)?.assignee_id);
    if (!Number.isInteger(assigneeId) || assigneeId <= 0) {
      throw new ValidationError('assignee_id 必须是正整数');
    }

    const [assigneeUser] = await db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, assigneeId))
      .limit(1);
    if (!assigneeUser) throw new ValidationError('分配的用户不存在');

    const [ticket] = await db
      .select({ id: schema.tickets.id, metadata: schema.tickets.metadata })
      .from(schema.tickets)
      .where(eq(schema.tickets.id, id))
      .limit(1);
    if (!ticket) throw new NotFoundError('工单', id);

    const now = new Date();
    const meta = (ticket.metadata && typeof ticket.metadata === 'object' ? ticket.metadata : {}) as Record<string, unknown>;
    const ops = Array.isArray(meta.operation_logs) ? [...(meta.operation_logs as unknown[])] : [];
    ops.push({ id: nextSeqId(ops), action: 'assign', detail: `分配至 ${assigneeUser.name}`, created_at: now.toISOString() });

    const [updated] = await db
      .update(schema.tickets)
      .set({ assignedTo: assigneeId, metadata: { ...meta, operation_logs: ops }, updatedAt: now } as any)
      .where(eq(schema.tickets.id, id))
      .returning({ id: schema.tickets.id, assignedTo: schema.tickets.assignedTo });
    if (!updated) throw new NotFoundError('工单', id);

    await writeAudit(request, 'ticket.assign', 'ticket', String(id), { assigneeId });
    return reply.send({
      data: { id: updated.id, assigned_to: updated.assignedTo, assignee_name: assigneeUser.name },
    });
  });

  /* ═══════════ 8. 审计日志 ═══════════ */

  /**
   * GET /api/v1/admin/audit-logs?keyword=&action=&page_size= — 审计日志列表
   *
   * 响应 { data: { list: [{ id, created_at, operator, action, target, detail, ip }] } }
   * operator = users.name || users.email；target = resource:resourceId（无 resourceId 时仅 resource）；
   * detail = details 的 JSON 摘要（null 时返回 null）；action 按前端下拉分类模糊过滤
   * （create/update/delete/audit/login/export）；keyword 模糊匹配 operator 或 target。
   */
  app.get('/api/v1/admin/audit-logs', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize } = parsePageQuery(q);
    const keyword = String(q.keyword ?? '').trim();
    const action = String(q.action ?? '').trim();

    const conds: any[] = [];
    if (keyword) {
      const kw = `%${keyword}%`;
      conds.push(
        or(
          like(schema.users.name, kw),
          like(schema.users.email, kw),
          like(schema.auditLogs.resource, kw),
          like(schema.auditLogs.resourceId, kw),
          // 支持 "resource:resourceId" 整串关键词（如 ticket:12）
          like(sql`${schema.auditLogs.resource} || ':' || COALESCE(${schema.auditLogs.resourceId}, '')`, kw),
        ),
      );
    }
    if (action) conds.push(like(schema.auditLogs.action, `%${action}%`));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: schema.auditLogs.id,
          createdAt: schema.auditLogs.createdAt,
          action: schema.auditLogs.action,
          resource: schema.auditLogs.resource,
          resourceId: schema.auditLogs.resourceId,
          details: schema.auditLogs.details,
          ipAddress: schema.auditLogs.ipAddress,
          name: schema.users.name,
          email: schema.users.email,
        })
        .from(schema.auditLogs)
        .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
        .where(where)
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: count() })
        .from(schema.auditLogs)
        .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
        .where(where),
    ]);

    return reply.send({
      data: {
        list: rows.map((r) => ({
          id: r.id,
          created_at: r.createdAt,
          operator: r.name || r.email || '系统',
          action: r.action,
          target: r.resourceId ? `${r.resource}:${r.resourceId}` : r.resource,
          detail: r.details == null ? null : typeof r.details === 'string' ? r.details : JSON.stringify(r.details),
          ip: r.ipAddress,
        })),
        total: Number(totalRow?.[0]?.total ?? 0),
        page,
        page_size: pageSize,
      },
    });
  });
}
