/**
 * 客服/运维类后台端点补齐 — /api/v1/admin/{support,knowledge-base,chat,sys/db,ops}
 *
 * 对齐原型（此前仅有前端页面与 MOCK，后端缺失）：
 *   - GET    /admin/support/kpi?period=         客服效能指标
 *   - GET    /admin/support/tickets?status=&page= 客服工单列表
 *   - GET    /admin/knowledge-base?keyword=&page= 知识库文章列表
 *   - POST   /admin/knowledge-base                新建文章
 *   - PUT    /admin/knowledge-base/:id            更新文章
 *   - DELETE /admin/knowledge-base/:id            删除文章
 *   - GET    /admin/chat/conversations?status=&page= 在线客服会话列表
 *   - GET    /admin/chat/conversations/:id/messages  会话消息（页面展示辅助）
 *   - POST   /admin/chat/conversations/:id/reply     客服回复
 *   - POST   /admin/chat/conversations/:id/close     关闭会话（页面辅助）
 *   - GET    /admin/sys/db/tables                数据库表结构（public schema）
 *   - POST   /admin/sys/db/query                 只读 SQL 查询（仅 SELECT，super_admin）
 *   - GET    /admin/ops/activity?page=           实时操作活动流（audit_logs）
 *
 * 全部端点带 adminAuth（JWT + role 校验，对齐 admin-finance.ts）；
 * 查询执行端点额外要求 super_admin（对齐 AdminSysDbPage 的「仅超级管理员可执行查询」）。
 * 写操作/敏感查询写 audit_logs 留痕。
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, or, like, sql, desc, count } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';

/* ───────── 鉴权（对齐 admin-finance.ts 模式） ───────── */

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

/** 仅超级管理员（在 adminAuth 之后调用） */
async function superAdminOnly(request: any) {
  const { role } = request.userContext as { role: string };
  if (role !== 'super_admin') throw new ForbiddenError('仅超级管理员可执行该操作');
}

/* ───────── 工具函数 ───────── */

/** 正整数解析（非法回退默认值，超上限截断） */
function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

/** 统一分页参数：page（默认 1）/ pageSize（默认 20，上限 100） */
function parsePageQuery(q: Record<string, unknown>): { page: number; pageSize: number } {
  return {
    page: parsePositiveInt(q.page, 1),
    pageSize: parsePositiveInt(q.pageSize, 20, 100),
  };
}

/** 周期起点（today/week/month/year；默认 all=undefined 不限） */
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
    default:
      return undefined; // all
  }
}

/** 写审计日志（操作留痕，资源归属本文件端点） */
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

/**
 * 只读 SELECT 校验（防注入/防写操作）
 * 规则：以 SELECT 开头（大小写不敏感）、不含分号（禁止多语句）、不含 SELECT INTO；
 * 未显式 LIMIT 时兜底追加 LIMIT 200，防止误拉全表。
 */
function assertReadOnlySelect(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) throw new ValidationError('SQL 不能为空');
  if (trimmed.length > 10000) throw new ValidationError('SQL 过长（上限 10000 字符）');
  if (!/^select\b/i.test(trimmed)) throw new ValidationError('仅允许 SELECT 查询（SQL 必须以 SELECT 开头）');
  if (trimmed.includes(';')) throw new ValidationError('不允许分号分隔的多语句执行');
  if (/\binto\s/i.test(trimmed)) throw new ValidationError('不允许 SELECT INTO 写操作');
  if (!/\blimit\b/i.test(trimmed)) return `${trimmed} LIMIT 200`;
  return trimmed;
}

/** 文章状态白名单 */
const KB_STATUSES = ['draft', 'published'] as const;

export async function adminSupportMissingRoutes(app: FastifyInstance) {
  /* ═══════════ 1. 客服效能指标 / 工单列表 ═══════════ */

  /** GET /api/v1/admin/support/kpi?period=today|week|month|year|all — 客服效能指标 */
  app.get('/api/v1/admin/support/kpi', { preHandler: [adminAuth] }, async (request, reply) => {
    const period = String((request.query as any).period ?? 'month');
    const start = periodStart(period);
    const since = start ? start.toISOString() : '1970-01-01T00:00:00.000Z';

    // 工单维度：总量/解决/未解决 + 平均解决时长（秒）+ 满意度（tickets.metadata->satisfaction，0-5）
    const [ticketAgg] = (await db.execute(sql`
      SELECT COUNT(*)::int AS ticket_count,
             COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::int AS resolved_count,
             COUNT(*) FILTER (WHERE status IN ('open','in_progress','waiting_customer'))::int AS open_count,
             COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))), 0)::float8 AS avg_resolve_seconds,
             COALESCE(AVG(NULLIF(metadata->>'satisfaction', '')::numeric), 0)::float8 AS satisfaction
      FROM tickets
      WHERE created_at >= ${since}
    `)) as any[];

    // 平均响应时长（秒）：同一会话内用户消息 → 下一条客服消息的间隔均值
    const [respAgg] = (await db.execute(sql`
      WITH msg AS (
        SELECT conversation_id, role, created_at,
               lead(created_at) OVER (PARTITION BY conversation_id ORDER BY created_at) AS next_at
        FROM chat_messages
        WHERE created_at >= ${since}
      )
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (next_at - created_at))), 0)::float8 AS avg_response_seconds
      FROM msg
      WHERE role = 'user' AND next_at IS NOT NULL
    `)) as any[];

    // 会话维度：周期内会话总数 / 进行中
    const [chatAgg] = (await db.execute(sql`
      SELECT COUNT(*)::int AS chat_count,
             COUNT(*) FILTER (WHERE status = 'open')::int AS open_chat_count
      FROM chat_conversations
      WHERE created_at >= ${since}
    `)) as any[];

    const t = ticketAgg ?? {};
    const r = respAgg ?? {};
    const c = chatAgg ?? {};

    await writeAudit(request, 'support.kpi.view', 'support_kpi', null, { period });

    return reply.send({
      data: {
        kpi: {
          period,
          ticket_count: Number(t.ticket_count ?? 0),
          resolved_count: Number(t.resolved_count ?? 0),
          open_count: Number(t.open_count ?? 0),
          /** 平均响应时长（秒） */
          avg_response: Math.round(Number(r.avg_response_seconds ?? 0)),
          /** 平均解决时长（秒） */
          avg_resolve: Math.round(Number(t.avg_resolve_seconds ?? 0)),
          /** 满意度 0-5（无数据为 0） */
          satisfaction: Math.round(Number(t.satisfaction ?? 0) * 100) / 100,
          chat_count: Number(c.chat_count ?? 0),
          open_chat_count: Number(c.open_chat_count ?? 0),
        },
      },
    });
  });

  /** GET /api/v1/admin/support/tickets?status=&page=&pageSize= — 客服工单列表 */
  app.get('/api/v1/admin/support/tickets', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize } = parsePageQuery(q);
    const status = String(q.status ?? '').trim();

    const conds: any[] = [];
    if (status) conds.push(eq(schema.tickets.status, status as any));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const rows = await db
      .select({
        id: schema.tickets.id,
        userId: schema.tickets.userId,
        title: schema.tickets.title,
        status: schema.tickets.status,
        priority: schema.tickets.priority,
        createdAt: schema.tickets.createdAt,
        updatedAt: schema.tickets.updatedAt,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.tickets)
      .leftJoin(schema.users, eq(schema.tickets.userId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.tickets.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [totalRow] = await db.select({ total: count() }).from(schema.tickets).where(where);
    const total = Number(totalRow?.total ?? 0);

    await writeAudit(request, 'support.tickets.list', 'support_ticket', null, { page, pageSize, status });

    return reply.send({
      data: {
        list: rows.map((r) => ({
          id: r.id,
          user_id: r.userId,
          user: r.userId ? { id: r.userId, email: r.email, name: r.name } : null,
          title: r.title,
          status: r.status,
          priority: r.priority,
          created_at: r.createdAt,
          updated_at: r.updatedAt,
        })),
        total,
        page,
        pageSize,
      },
    });
  });

  /* ═══════════ 2. 客服知识库 CRUD ═══════════ */

  /** GET /api/v1/admin/knowledge-base?keyword=&page=&pageSize= — 文章列表（标题/分类/内容模糊搜索） */
  app.get('/api/v1/admin/knowledge-base', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize } = parsePageQuery(q);
    const keyword = String(q.keyword ?? '').trim();

    let where;
    if (keyword) {
      const kw = `%${keyword}%`;
      where = or(
        like(schema.knowledgeBaseArticles.title, kw),
        like(schema.knowledgeBaseArticles.category, kw),
        like(schema.knowledgeBaseArticles.content, kw),
      );
    }

    const rows = await db
      .select()
      .from(schema.knowledgeBaseArticles)
      .where(where)
      .orderBy(desc(schema.knowledgeBaseArticles.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [totalRow] = await db.select({ total: count() }).from(schema.knowledgeBaseArticles).where(where);
    const total = Number(totalRow?.total ?? 0);

    return reply.send({ data: { list: rows, total, page, pageSize } });
  });

  /** POST /api/v1/admin/knowledge-base — 新建文章 */
  app.post('/api/v1/admin/knowledge-base', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const title = String(body.title ?? '').trim();
    const content = String(body.content ?? '');
    const category = String(body.category ?? '').trim() || 'general';
    const status = String(body.status ?? 'draft').trim();

    if (!title) throw new ValidationError('标题不能为空');
    if (!content) throw new ValidationError('内容不能为空');
    if (!(KB_STATUSES as readonly string[]).includes(status)) throw new ValidationError('status 仅支持 draft / published');

    const [created] = await db
      .insert(schema.knowledgeBaseArticles)
      .values({
        title,
        category,
        content,
        status,
        createdBy: (request as any).userContext?.userId ?? null,
      })
      .returning();
    if (!created) throw new ValidationError('文章创建失败');

    await writeAudit(request, 'knowledge_base.create', 'knowledge_base_article', String(created.id), { title, category, status });
    return reply.send({ data: created });
  });

  /** PUT /api/v1/admin/knowledge-base/:id — 更新文章（部分字段） */
  app.put('/api/v1/admin/knowledge-base/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法文章 ID');

    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) throw new ValidationError('标题不能为空');
      patch.title = title;
    }
    if (body.category !== undefined) patch.category = String(body.category).trim() || 'general';
    if (body.content !== undefined) {
      const content = String(body.content);
      if (!content) throw new ValidationError('内容不能为空');
      patch.content = content;
    }
    if (body.status !== undefined) {
      const status = String(body.status).trim();
      if (!(KB_STATUSES as readonly string[]).includes(status)) throw new ValidationError('status 仅支持 draft / published');
      patch.status = status;
    }
    patch.updatedAt = new Date();

    const [updated] = await db
      .update(schema.knowledgeBaseArticles)
      .set(patch as any)
      .where(eq(schema.knowledgeBaseArticles.id, id))
      .returning();
    if (!updated) throw new NotFoundError('知识库文章', id);

    await writeAudit(request, 'knowledge_base.update', 'knowledge_base_article', String(id), patch);
    return reply.send({ data: updated });
  });

  /** DELETE /api/v1/admin/knowledge-base/:id — 删除文章 */
  app.delete('/api/v1/admin/knowledge-base/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法文章 ID');

    const [deleted] = await db
      .delete(schema.knowledgeBaseArticles)
      .where(eq(schema.knowledgeBaseArticles.id, id))
      .returning({ id: schema.knowledgeBaseArticles.id });
    if (!deleted) throw new NotFoundError('知识库文章', id);

    await writeAudit(request, 'knowledge_base.delete', 'knowledge_base_article', String(id), {});
    return reply.send({ data: { ok: true } });
  });

  /* ═══════════ 3. 在线客服会话 ═══════════ */

  /** GET /api/v1/admin/chat/conversations?status=open|closed&page=&pageSize= — 会话列表 */
  app.get('/api/v1/admin/chat/conversations', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize } = parsePageQuery(q);
    const status = String(q.status ?? '').trim();

    const conds: any[] = [];
    if (status) conds.push(eq(schema.chatConversations.status, status));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const rows = await db
      .select({
        id: schema.chatConversations.id,
        userId: schema.chatConversations.userId,
        status: schema.chatConversations.status,
        lastMessage: schema.chatConversations.lastMessage,
        createdAt: schema.chatConversations.createdAt,
        updatedAt: schema.chatConversations.updatedAt,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.chatConversations)
      .leftJoin(schema.users, eq(schema.chatConversations.userId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.chatConversations.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [totalRow] = await db.select({ total: count() }).from(schema.chatConversations).where(where);
    const total = Number(totalRow?.total ?? 0);

    return reply.send({
      data: {
        list: rows.map((r) => ({
          id: r.id,
          user_id: r.userId,
          user: r.userId ? { id: r.userId, email: r.email, name: r.name } : null,
          status: r.status,
          last_message: r.lastMessage,
          created_at: r.createdAt,
          updated_at: r.updatedAt,
        })),
        total,
        page,
        pageSize,
      },
    });
  });

  /** GET /api/v1/admin/chat/conversations/:id/messages — 会话消息（按时间正序，最多 200 条） */
  app.get('/api/v1/admin/chat/conversations/:id/messages', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法会话 ID');

    const [conv] = await db.select().from(schema.chatConversations).where(eq(schema.chatConversations.id, id)).limit(1);
    if (!conv) throw new NotFoundError('客服会话', id);

    const messages = await db
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.conversationId, id))
      .orderBy(sql`${schema.chatMessages.createdAt} ASC`)
      .limit(200);

    return reply.send({ data: { list: messages, conversation: conv } });
  });

  /** POST /api/v1/admin/chat/conversations/:id/reply — 客服回复（写 chat_messages + 更新会话 last_message） */
  app.post('/api/v1/admin/chat/conversations/:id/reply', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法会话 ID');

    const content = String((request.body as any)?.content ?? '').trim();
    if (!content) throw new ValidationError('回复内容不能为空');

    const [conv] = await db.select().from(schema.chatConversations).where(eq(schema.chatConversations.id, id)).limit(1);
    if (!conv) throw new NotFoundError('客服会话', id);

    const [msg] = await db
      .insert(schema.chatMessages)
      .values({ conversationId: id, role: 'staff', content })
      .returning();
    if (!msg) throw new ValidationError('消息发送失败');

    await db
      .update(schema.chatConversations)
      .set({ lastMessage: content, updatedAt: new Date() })
      .where(eq(schema.chatConversations.id, id));

    await writeAudit(request, 'chat.reply', 'chat_conversation', String(id), { contentLength: content.length });
    return reply.send({ data: msg });
  });

  /** POST /api/v1/admin/chat/conversations/:id/close — 关闭会话 */
  app.post('/api/v1/admin/chat/conversations/:id/close', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法会话 ID');

    const [updated] = await db
      .update(schema.chatConversations)
      .set({ status: 'closed', updatedAt: new Date() })
      .where(eq(schema.chatConversations.id, id))
      .returning();
    if (!updated) throw new NotFoundError('客服会话', id);

    await writeAudit(request, 'chat.close', 'chat_conversation', String(id), {});
    return reply.send({ data: { ok: true, status: updated.status } });
  });

  /* ═══════════ 4. 数据库管理（只读） ═══════════ */

  /** GET /api/v1/admin/sys/db/tables — public schema 表结构（含列定义） */
  app.get('/api/v1/admin/sys/db/tables', { preHandler: [adminAuth] }, async (request, reply) => {
    const rows = (await db.execute(sql`
      SELECT t.table_name, t.table_type,
             COALESCE(
               json_agg(
                 json_build_object('column_name', c.column_name, 'data_type', c.data_type, 'is_nullable', c.is_nullable)
                 ORDER BY c.ordinal_position
               ) FILTER (WHERE c.column_name IS NOT NULL),
               '[]'
             ) AS columns
      FROM information_schema.tables t
      LEFT JOIN information_schema.columns c
        ON c.table_schema = t.table_schema AND c.table_name = t.table_name
      WHERE t.table_schema = 'public'
        AND t.table_type IN ('BASE TABLE', 'VIEW')
      GROUP BY t.table_name, t.table_type
      ORDER BY t.table_name
    `)) as any[];

    await writeAudit(request, 'sys.db.tables', 'sys_db', null, { tableCount: rows.length });

    return reply.send({
      data: {
        tables: rows.map((r: any) => ({
          table_name: r.table_name,
          table_type: r.table_type,
          columns: Array.isArray(r.columns) ? r.columns : [],
        })),
      },
    });
  });

  /** POST /api/v1/admin/sys/db/query — 只读 SQL 查询（仅 SELECT，super_admin） */
  app.post('/api/v1/admin/sys/db/query', { preHandler: [adminAuth] }, async (request, reply) => {
    await superAdminOnly(request);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const finalSql = assertReadOnlySelect(String(body.sql ?? ''));

    const startedAt = Date.now();
    let rows: any[];
    try {
      rows = (await db.execute(sql.raw(finalSql))) as any[];
    } catch (err: any) {
      throw new ValidationError(`SQL 执行失败：${err?.message ?? String(err)}`);
    }
    const duration = Date.now() - startedAt;

    // 字段名：取首行键；值 Date → ISO 字符串便于前端展示
    const fields = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];
    const normalized = rows.map((r: any) => {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(r ?? {})) {
        const v = r[k];
        out[k] = v instanceof Date ? v.toISOString() : v;
      }
      return out;
    });

    await writeAudit(request, 'sys.db.query', 'sys_db', null, { sql: finalSql.slice(0, 200), rowCount: rows.length, duration });
    return reply.send({ data: { rows: normalized, fields, rowCount: rows.length, duration } });
  });

  /* ═══════════ 5. 实时操作活动流 ═══════════ */

  /** GET /api/v1/admin/ops/activity?page=&pageSize= — 最近操作流（audit_logs 倒序） */
  app.get('/api/v1/admin/ops/activity', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize } = parsePageQuery(q);

    const rows = await db
      .select({
        id: schema.auditLogs.id,
        userId: schema.auditLogs.userId,
        action: schema.auditLogs.action,
        resource: schema.auditLogs.resource,
        resourceId: schema.auditLogs.resourceId,
        createdAt: schema.auditLogs.createdAt,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [totalRow] = await db.select({ total: count() }).from(schema.auditLogs);
    const total = Number(totalRow?.total ?? 0);

    return reply.send({
      data: {
        list: rows.map((r) => ({
          id: r.id,
          user_id: r.userId,
          user: r.userId ? { id: r.userId, email: r.email, name: r.name } : null,
          action: r.action,
          resource: r.resource,
          resource_id: r.resourceId,
          created_at: r.createdAt,
        })),
        total,
        page,
        pageSize,
      },
    });
  });
}
