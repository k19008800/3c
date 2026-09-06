/**
 * 公告管理后台端点 — /api/v1/admin/announcements（全部 adminAuth）
 *
 * 对齐 docs/gap-fix-spec-2026-08-18.md §6 公告 CRUD + 用户已读统计：
 *   GET    /api/v1/admin/announcements              — 公告列表（status 过滤 + read_count 聚合）
 *   POST   /api/v1/admin/announcements              — 新建公告（publish ? published : draft）
 *   PUT    /api/v1/admin/announcements/:id          — 更新公告（publish 勾选 → published）
 *   DELETE /api/v1/admin/announcements/:id          — 删除公告（announcement_reads 级联删除）
 *   GET    /api/v1/admin/announcements/:id/readers  — 已读用户列表（announcement_reads join users）
 *
 * 权限：admin / super_admin（adminAuth，对齐 admin-support-missing.ts）。
 * 写操作统一写 audit_logs 留痕（writeAudit）。
 * 契约要点：status 返回布尔（published=true / draft=false）；read_count 来自
 * announcement_reads 聚合；created_by_email 由 announcements.created_by join users.email 得出。
 *
 * @module routes
 * @see docs/gap-fix-spec-2026-08-18.md §6
 * @see src/db/schema/gap-fix-2026-08.ts announcementReads
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt.js';
import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';

/* ───────── 鉴权（对齐 admin-support-missing.ts 模式） ───────── */

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

/* ───────── 常量与工具 ───────── */

/** 公告类型 → 中文标签（未知类型回退为原始 type，兼容历史数据） */
const ANNOUNCEMENT_TYPE_LABEL: Record<string, string> = {
  system_announcement: '系统公告',
  maintenance: '维护通知',
  activity: '活动通知',
  security: '安全告警',
};

/** 正整数路径参数解析（非法 → 400） */
function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法的公告 ID');
  return id;
}

/**
 * 写审计日志（操作留痕）
 *
 * @param request - Fastify 请求（需带 userContext，由 adminAuth/jwtAuth 注入）
 * @param action - 审计动作名，如 announcement.create / announcement.delete
 * @param resource - 资源类型，如 announcement
 * @param resourceId - 资源 ID（可为 null）
 * @param details - 审计详情（jsonb）
 */
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

export async function adminAnnouncementsRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/admin/announcements?status=published|draft|（空=全部）— 公告列表
   *
   * read_count 用关联子查询聚合 announcement_reads；created_by_email join users；
   * status 转布尔（published=true / draft=false）。按创建时间倒序。
   */
  app.get('/api/v1/admin/announcements', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const status = String(q.status ?? '').trim();
    if (status && status !== 'published' && status !== 'draft') {
      throw new ValidationError('status 仅支持 published / draft');
    }

    const conds: any[] = [];
    if (status) conds.push(eq(schema.announcements.status, status));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const rows = await db
      .select({
        id: schema.announcements.id,
        title: schema.announcements.title,
        content: schema.announcements.content,
        type: schema.announcements.type,
        priority: schema.announcements.priority,
        status: schema.announcements.status,
        createdAt: schema.announcements.createdAt,
        createdByEmail: schema.users.email,
        // 关联子查询：该公告的已读记录数（announcement_reads 主键 (announcement_id, user_id)）
        readCount: sql<number>`(SELECT COUNT(*)::int FROM announcement_reads WHERE announcement_id = ${schema.announcements.id})`,
      })
      .from(schema.announcements)
      .leftJoin(schema.users, eq(schema.announcements.createdBy, schema.users.id))
      .where(where)
      .orderBy(desc(schema.announcements.createdAt));

    return reply.send({
      data: {
        list: rows.map((r) => ({
          id: r.id,
          title: r.title,
          content: r.content,
          type: r.type,
          type_label: ANNOUNCEMENT_TYPE_LABEL[r.type] ?? r.type,
          status: r.status === 'published',
          priority: r.priority ?? 0,
          read_count: Number(r.readCount ?? 0),
          created_by_email: r.createdByEmail ?? null,
          created_at: r.createdAt,
        })),
      },
    });
  });

  /**
   * POST /api/v1/admin/announcements — 新建公告
   *
   * body { title, content, type, priority, publish }：
   * publish=true → status='published' 且 publish_at=now；否则 status='draft'、publish_at 为空。
   * 写 audit_logs（announcement.create）。
   */
  app.post('/api/v1/admin/announcements', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const title = String(body.title ?? '').trim();
    const content = String(body.content ?? '');
    const type = String(body.type ?? 'system_announcement').trim() || 'system_announcement';
    const priority = Number(body.priority ?? 0);
    const publish = body.publish === true || body.publish === 'true';

    if (!title) throw new ValidationError('公告标题不能为空');
    if (!content) throw new ValidationError('公告内容不能为空');
    if (type.length > 30) throw new ValidationError('公告类型过长');
    if (!Number.isFinite(priority)) throw new ValidationError('优先级必须是数字');

    const now = new Date();
    const [created] = await db
      .insert(schema.announcements)
      .values({
        title,
        content,
        type,
        priority: Math.trunc(priority),
        status: publish ? 'published' : 'draft',
        publishAt: publish ? now : null,
        createdBy: (request as any).userContext?.userId ?? null,
      })
      .returning({ id: schema.announcements.id, status: schema.announcements.status });
    if (!created) throw new ValidationError('公告创建失败');

    await writeAudit(request, 'announcement.create', 'announcement', String(created.id), { title, type, publish });
    return reply.send({
      data: {
        id: created.id,
        status: created.status,
        message: publish ? '公告已发布' : '公告已保存为草稿',
      },
    });
  });

  /**
   * PUT /api/v1/admin/announcements/:id — 更新公告（部分字段）
   *
   * body 同创建；publish 勾选（true）→ status='published'（首次发布时置 publish_at=now，
   * 已发布过保留原 publish_at）；publish=false → status='draft'、publish_at 清空。
   * 写 audit_logs（announcement.update）。
   */
  app.put('/api/v1/admin/announcements/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as any).id);
    const body = (request.body ?? {}) as Record<string, unknown>;

    const [existing] = await db
      .select({
        id: schema.announcements.id,
        status: schema.announcements.status,
        publishAt: schema.announcements.publishAt,
      })
      .from(schema.announcements)
      .where(eq(schema.announcements.id, id))
      .limit(1);
    if (!existing) throw new NotFoundError('公告', id);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) throw new ValidationError('公告标题不能为空');
      patch.title = title;
    }
    if (body.content !== undefined) {
      const content = String(body.content);
      if (!content) throw new ValidationError('公告内容不能为空');
      patch.content = content;
    }
    if (body.type !== undefined) {
      const type = String(body.type).trim();
      if (!type || type.length > 30) throw new ValidationError('公告类型不合法');
      patch.type = type;
    }
    if (body.priority !== undefined) {
      const priority = Number(body.priority);
      if (!Number.isFinite(priority)) throw new ValidationError('优先级必须是数字');
      patch.priority = Math.trunc(priority);
    }
    if (body.publish !== undefined) {
      const publish = body.publish === true || body.publish === 'true';
      if (publish) {
        patch.status = 'published';
        // 已发布过则保留原发布时间，避免每次编辑都刷新 publish_at
        patch.publishAt = existing.publishAt ?? new Date();
      } else {
        patch.status = 'draft';
        patch.publishAt = null;
      }
    }

    const [updated] = await db
      .update(schema.announcements)
      .set(patch as any)
      .where(eq(schema.announcements.id, id))
      .returning({ id: schema.announcements.id, status: schema.announcements.status });
    if (!updated) throw new NotFoundError('公告', id);

    await writeAudit(request, 'announcement.update', 'announcement', String(id), { patch });
    return reply.send({
      data: { id: updated.id, status: updated.status, message: '公告已更新' },
    });
  });

  /**
   * DELETE /api/v1/admin/announcements/:id — 删除公告
   *
   * announcement_reads 通过外键 onDelete: 'cascade' 级联删除（见 gap-fix-2026-08.ts）。
   * 写 audit_logs（announcement.delete）。
   */
  app.delete('/api/v1/admin/announcements/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as any).id);

    const [deleted] = await db
      .delete(schema.announcements)
      .where(eq(schema.announcements.id, id))
      .returning({ id: schema.announcements.id });
    if (!deleted) throw new NotFoundError('公告', id);

    await writeAudit(request, 'announcement.delete', 'announcement', String(id), {});
    return reply.send({ data: { ok: true, message: '公告已删除' } });
  });

  /**
   * GET /api/v1/admin/announcements/:id/readers — 已读用户列表
   *
   * announcement_reads join users，按阅读时间倒序；username 取 users.name（表无 username 列）。
   */
  app.get('/api/v1/admin/announcements/:id/readers', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as any).id);

    const rows = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        username: schema.users.name,
        readAt: schema.announcementReads.readAt,
      })
      .from(schema.announcementReads)
      .leftJoin(schema.users, eq(schema.announcementReads.userId, schema.users.id))
      .where(eq(schema.announcementReads.announcementId, id))
      .orderBy(desc(schema.announcementReads.readAt));

    return reply.send({
      data: {
        readers: rows.map((r) => ({ id: r.id, email: r.email, username: r.username, read_at: r.readAt })),
      },
    });
  });
}
