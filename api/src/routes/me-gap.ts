/**
 * 用户端「本人」域补充端点 — /api/v1/me/*（全部 jwtAuth）
 *
 * 对齐 docs/gap-fix-spec-2026-08-18.md §6 用户公告已读 + §7 用户端小功能：
 *   GET    /api/v1/me/announcements                      — 已发布公告列表（含 is_read）
 *   GET    /api/v1/me/announcements/unread-count         — 未读公告数
 *   POST   /api/v1/me/announcements/:id/read             — 标记已读（announcementReads 幂等插入）
 *   POST   /api/v1/me/announcements/read-all             — 批量标记已读
 *   GET    /api/v1/me/devices                            — 活跃会话（user_sessions）列表
 *   POST   /api/v1/me/devices/:id/logout                 — 强制下线指定会话（仅本人；写 audit）
 *   POST   /api/v1/me/knowledge-base/:id/feedback        — 知识库文章反馈（knowledgeBaseFeedback）
 *   POST   /api/v1/me/notification-settings/:type/email  — 邮件通知偏好（system_config 持久化）
 *   PATCH  /api/v1/me/webhooks/:id                       — 启用/禁用 Webhook（isEnabled → enabled 列）
 *
 * 权限：任意登录用户（jwtAuth）。device.logout 写 audit_logs（action=device.logout）。
 * 独立文件实现（不并入 me.ts / webhooks.ts），避免改动现有路由文件，由主 agent 在 app.ts 注册。
 *
 * @module routes
 * @see docs/gap-fix-spec-2026-08-18.md §6 / §7
 * @see src/db/schema/gap-fix-2026-08.ts announcementReads / knowledgeBaseFeedback
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, sql, desc, like, or, count, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ValidationError, NotFoundError } from '../lib/errors';

/* ───────── 鉴权（对齐 me.ts / webhooks.ts 模式） ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

function userId(request: any): number {
  return (request as any).userContext.userId;
}

/* ───────── 常量与工具 ───────── */

/** 公告类型 → 中文标签（未知类型回退为原始 type） */
const ANNOUNCEMENT_TYPE_LABEL: Record<string, string> = {
  system_announcement: '系统公告',
  maintenance: '维护通知',
  activity: '活动通知',
  security: '安全告警',
};

/** 正整数路径参数解析（非法 → 400） */
function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法的 ID');
  return id;
}

/**
 * 写审计日志（操作留痕）
 *
 * @param request - Fastify 请求（需带 userContext，由 jwtAuth 注入）
 * @param action - 审计动作名
 * @param resource - 资源类型
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

export async function meGapRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/me/announcements — 已发布公告列表（用户端公告中心）
   *
   * 仅返回 status='published' 且 publish_at<=now 的公告；
   * is_read 通过 announcement_reads 关联子查询判断（按用户）。
   */
  app.get('/api/v1/me/announcements', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);

    const rows = await db
      .select({
        id: schema.announcements.id,
        title: schema.announcements.title,
        content: schema.announcements.content,
        type: schema.announcements.type,
        priority: schema.announcements.priority,
        createdAt: schema.announcements.createdAt,
        // 关联子查询：当前用户是否已读（announcement_reads 主键 (announcement_id, user_id)）
        isRead: sql<boolean>`EXISTS (SELECT 1 FROM announcement_reads WHERE announcement_id = ${schema.announcements.id} AND user_id = ${uid})`,
      })
      .from(schema.announcements)
      .where(and(
        eq(schema.announcements.status, 'published'),
        // publish_at 为 NULL 视为已发布（兼容历史数据），否则要求不晚于当前时间
        sql`(${schema.announcements.publishAt} IS NULL OR ${schema.announcements.publishAt} <= NOW())`,
      ))
      .orderBy(desc(schema.announcements.createdAt));

    return reply.send({
      data: {
        list: rows.map((r) => ({
          id: r.id,
          title: r.title,
          content: r.content,
          type: r.type,
          type_label: ANNOUNCEMENT_TYPE_LABEL[r.type] ?? r.type,
          priority: r.priority ?? 0,
          is_read: r.isRead === true,
          created_at: r.createdAt,
        })),
      },
    });
  });

  /** GET /api/v1/me/announcements/unread-count — 未读公告数 */
  app.get('/api/v1/me/announcements/unread-count', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const rows = (await db.execute(sql`
      SELECT COUNT(*)::int AS unread
      FROM announcements
      WHERE status = 'published'
        AND (publish_at IS NULL OR publish_at <= NOW())
        AND NOT EXISTS (SELECT 1 FROM announcement_reads
                        WHERE announcement_id = announcements.id AND user_id = ${uid})
    `)) as any[];
    const unread = Number(rows[0]?.unread ?? 0);
    return reply.send({ data: { unread } });
  });

  /**
   * POST /api/v1/me/announcements/:id/read — 标记已读（幂等）
   *
   * announcement_reads 主键 (announcement_id, user_id)，onConflictDoNothing 保证
   * 重复调用不报错、不产生重复记录。
   */
  app.post('/api/v1/me/announcements/:id/read', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const id = parseId((request.params as any).id);

    await db.insert(schema.announcementReads)
      .values({ announcementId: id, userId: uid })
      .onConflictDoNothing();

    return reply.send({ data: { ok: true, id } });
  });

  /**
   * POST /api/v1/me/announcements/read-all — 全部标记已读（批量）
   *
   * 先取当前用户未读的已发布公告 id，再批量插入 announcementReads（onConflictDoNothing 幂等）。
   */
  app.post('/api/v1/me/announcements/read-all', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);

    const rows = await db
      .select({ id: schema.announcements.id })
      .from(schema.announcements)
      .where(and(
        eq(schema.announcements.status, 'published'),
        sql`(${schema.announcements.publishAt} IS NULL OR ${schema.announcements.publishAt} <= NOW())`,
        sql`NOT EXISTS (SELECT 1 FROM announcement_reads WHERE announcement_id = ${schema.announcements.id} AND user_id = ${uid})`,
      ));

    let marked = 0;
    if (rows.length > 0) {
      await db.insert(schema.announcementReads)
        .values(rows.map((r) => ({ announcementId: r.id, userId: uid })))
        .onConflictDoNothing();
      marked = rows.length;
    }
    return reply.send({ data: { ok: true, marked } });
  });

  /** GET /api/v1/me/devices — 活跃会话列表（user_sessions，当前用户） */
  app.get('/api/v1/me/devices', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);

    const rows = await db
      .select({
        id: schema.userSessions.id,
        ipAddress: schema.userSessions.ipAddress,
        userAgent: schema.userSessions.userAgent,
        createdAt: schema.userSessions.createdAt,
        expiresAt: schema.userSessions.expiresAt,
      })
      .from(schema.userSessions)
      .where(eq(schema.userSessions.userId, uid))
      .orderBy(desc(schema.userSessions.createdAt));

    return reply.send({
      data: {
        devices: rows.map((r) => ({
          id: r.id,
          ip_address: r.ipAddress,
          user_agent: r.userAgent,
          created_at: r.createdAt,
          expires_at: r.expiresAt,
        })),
      },
    });
  });

  /**
   * POST /api/v1/me/devices/:id/logout — 强制下线指定会话（仅本人）
   *
   * 删除 user_sessions 中 id + userId 同时匹配的记录；跨用户会话视为不存在（404）。
   * 写 audit_logs（action=device.logout）。
   */
  app.post('/api/v1/me/devices/:id/logout', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const id = parseId((request.params as any).id);

    const rows = await db
      .delete(schema.userSessions)
      .where(and(eq(schema.userSessions.id, id), eq(schema.userSessions.userId, uid)))
      .returning({ id: schema.userSessions.id });
    if (rows.length === 0) throw new NotFoundError('会话', id);

    await writeAudit(request, 'device.logout', 'user_session', String(id), { userId: uid });
    return reply.send({ data: { ok: true, id } });
  });

  /**
   * GET /api/v1/me/knowledge-base — 帮助中心文章列表（R3-USER-DRILL-002）
   *
   * 仅返回 status='published' 的文章；支持 search（标题/分类/内容模糊）；
   * 附带 helpful/unhelpful 反馈计数（knowledgeBaseFeedback 聚合）。
   * 对齐 web-console HelpCenterPage：`{ data: { list: [{id,title,category,tags,content,view_count,helpful_count,unhelpful_count}] } }`。
   */
  app.get('/api/v1/me/knowledge-base', { preHandler: [jwtAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, string>;
    const search = String(q.search ?? q.keyword ?? '').trim();
    const limit = Math.min(200, Math.max(1, parseInt(q.limit || '50', 10) || 50));

    const conditions: any[] = [eq(schema.knowledgeBaseArticles.status, 'published')];
    if (search) {
      const kw = `%${search}%`;
      conditions.push(or(
        like(schema.knowledgeBaseArticles.title, kw),
        like(schema.knowledgeBaseArticles.category, kw),
        like(schema.knowledgeBaseArticles.content, kw),
      )!);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db.select({
      id: schema.knowledgeBaseArticles.id,
      title: schema.knowledgeBaseArticles.title,
      category: schema.knowledgeBaseArticles.category,
      content: schema.knowledgeBaseArticles.content,
      updatedAt: schema.knowledgeBaseArticles.updatedAt,
    }).from(schema.knowledgeBaseArticles)
      .where(whereClause)
      .orderBy(desc(schema.knowledgeBaseArticles.updatedAt))
      .limit(limit);

    // 反馈计数聚合（仅对本次列表的文章）
    const ids = rows.map((r) => r.id);
    const agg = ids.length > 0
      ? await db.select({
          articleId: schema.knowledgeBaseFeedback.articleId,
          helpful: schema.knowledgeBaseFeedback.helpful,
          cnt: count(),
        }).from(schema.knowledgeBaseFeedback)
          .where(inArray(schema.knowledgeBaseFeedback.articleId, ids))
          .groupBy(schema.knowledgeBaseFeedback.articleId, schema.knowledgeBaseFeedback.helpful)
      : [];
    const counts = new Map<string, number>();
    for (const a of agg) counts.set(`${a.articleId}:${a.helpful ? 'h' : 'u'}`, Number(a.cnt));

    const list = rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      tags: null, // 表无 tags 列，预留字段（前端可选渲染）
      content: r.content,
      view_count: 0, // 表无浏览计数列，预留
      helpful_count: counts.get(`${r.id}:h`) ?? 0,
      unhelpful_count: counts.get(`${r.id}:u`) ?? 0,
      updated_at: r.updatedAt,
    }));

    return reply.send({ data: { list } });
  });

  /**
   * GET /api/v1/me/knowledge-base/categories — 帮助中心分类（R3-USER-DRILL-002）
   *
   * 已发布文章按 category 聚合计数；对齐 HelpCenterPage：`{ data: { list: [{id, name}] } }`。
   */
  app.get('/api/v1/me/knowledge-base/categories', { preHandler: [jwtAuth] }, async (_request, reply) => {
    const rows = await db.select({
      category: schema.knowledgeBaseArticles.category,
      cnt: count(),
    }).from(schema.knowledgeBaseArticles)
      .where(eq(schema.knowledgeBaseArticles.status, 'published'))
      .groupBy(schema.knowledgeBaseArticles.category)
      .orderBy(desc(count()));

    const list = rows.map((r) => ({ id: r.category, name: r.category, count: Number(r.cnt) }));
    return reply.send({ data: { list } });
  });

  /**
   * POST /api/v1/me/knowledge-base/:id/feedback — 知识库文章反馈
   *
   * body { helpful: boolean, comment?: string } → 写 knowledgeBaseFeedback。
   */
  app.post('/api/v1/me/knowledge-base/:id/feedback', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const id = parseId((request.params as any).id);
    const body = (request.body ?? {}) as Record<string, unknown>;

    const helpful = body.helpful;
    if (typeof helpful !== 'boolean') throw new ValidationError('helpful 必须是布尔值');
    const comment = body.comment !== undefined && body.comment !== null ? String(body.comment).slice(0, 2000) : null;

    const [record] = await db.insert(schema.knowledgeBaseFeedback)
      .values({ articleId: id, userId: uid, helpful, comment })
      .returning({ id: schema.knowledgeBaseFeedback.id });
    if (!record) throw new ValidationError('反馈提交失败');

    return reply.send({ data: { ok: true, id: record.id } });
  });

  /**
   * POST /api/v1/me/notification-settings/:type/email — 邮件通知偏好开关
   *
   * body { enabled: boolean } → 持久化到 system_config：
   * key = `notify_pref.<userId>.<type>`，value = JSON { email: enabled }（upsert，onConflictDoUpdate）。
   * GET /me/notification-settings 保持现有空结构（me.ts），无需改动。
   */
  app.post('/api/v1/me/notification-settings/:type/email', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const type = String((request.params as any).type ?? '').trim();
    if (!/^[a-zA-Z0-9_.-]{1,40}$/.test(type)) throw new ValidationError('通知类型不合法');

    const body = (request.body ?? {}) as Record<string, unknown>;
    const enabled = body.enabled;
    if (typeof enabled !== 'boolean') throw new ValidationError('enabled 必须是布尔值');

    const key = `notify_pref.${uid}.${type}`;
    const value = JSON.stringify({ email: enabled });
    await db.insert(schema.systemConfig)
      .values({ key, value, description: `用户 ${uid} 的「${type}」邮件通知偏好`, updatedBy: uid })
      .onConflictDoUpdate({
        target: schema.systemConfig.key,
        set: { value, updatedBy: uid, updatedAt: new Date() },
      });

    return reply.send({ data: { ok: true, type, email: enabled } });
  });

  /**
   * PATCH /api/v1/me/webhooks/:id — 启用/禁用 Webhook
   *
   * body { isEnabled: boolean }；user_webhooks 表列名为 enabled（见 user-webhooks.ts），
   * 因此 isEnabled 映射到 enabled 列。仅限本人；跨用户 Webhook 视为不存在（404）。
   */
  app.patch('/api/v1/me/webhooks/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const id = parseId((request.params as any).id);
    const body = (request.body ?? {}) as Record<string, unknown>;

    const isEnabled = body.isEnabled;
    if (typeof isEnabled !== 'boolean') throw new ValidationError('isEnabled 必须是布尔值');

    const rows = await db
      .update(schema.userWebhooks)
      .set({ enabled: isEnabled, updatedAt: new Date() })
      .where(and(eq(schema.userWebhooks.id, id), eq(schema.userWebhooks.userId, uid)))
      .returning({ id: schema.userWebhooks.id, enabled: schema.userWebhooks.enabled });
    const row = rows[0];
    if (!row) throw new NotFoundError('Webhook', id);

    return reply.send({ data: { ok: true, id, isEnabled: row.enabled } });
  });

  /* ═══════════ 合规协议确认（ConsentBanner：SPEC-§33.1/33.2） ═══════════
   * 前端 web-console/components/ConsentBanner.tsx 依赖以下 3 个端点：
   *   GET  /api/v1/me/consent/status    — 轮询确认状态（none/privacy_pending/tos_pending/both_pending）
   *   POST /api/v1/me/consent/privacy   — 同意隐私政策
   *   POST /api/v1/me/consent/terms     — 同意服务条款
   * 数据源：consent_policies（key 唯一，编辑版本号 +1）+ consent_logs（action=agree|disagree）。
   * pending 判定：策略 status='published' 且当前用户无 agree 记录。
   */

  /** 内部：取单个已发布策略（key 唯一） */
  async function getPublishedPolicy(key: string) {
    const [policy] = await db
      .select({
        id: schema.consentPolicies.id,
        key: schema.consentPolicies.key,
        name: schema.consentPolicies.name,
        content: schema.consentPolicies.content,
        version: schema.consentPolicies.version,
        updatedAt: schema.consentPolicies.updatedAt,
      })
      .from(schema.consentPolicies)
      .where(and(eq(schema.consentPolicies.key, key), eq(schema.consentPolicies.status, 'published')))
      .limit(1);
    return policy ?? null;
  }

  /** 内部：同意动作（每次同意都写入新记录；版本升级后重新确认即产生新 agree 时间戳） */
  async function agreeConsent(request: any, uid: number, key: string) {
    const policy = await getPublishedPolicy(key);
    if (!policy) throw new NotFoundError('合规策略', key);

    // 不做幂等跳过：策略版本升级后用户需重新确认，每次同意都应落一条新记录
    // （status 以「最新 agree 时间 ≥ 策略更新时间」判定 pending，重复同意幂等无害）。
    await db.insert(schema.consentLogs).values({ userId: uid, policyId: policy.id, action: 'agree' });
    await writeAudit(request, 'consent.agree', 'consent_policy', String(policy.id), {
      policyKey: key,
      version: policy.version,
    });
    return { policyKey: key, policyId: policy.id, version: policy.version };
  }

  /**
   * GET /api/v1/me/consent/status — 协议确认状态
   *
   * status: none | privacy_pending | tos_pending | both_pending；
   * privacy_policy / terms_of_service 为最新已发布策略（前端展示版本与摘要用）。
   *
   * pending 判定（版本语义，全部在 SQL 内用 PG 绝对时间比较，规避客户端时区解析差异）：
   *   用户对该策略最近一次 agree(created_at) 早于策略 updated_at（管理员编辑版本号 +1）
   *   → 待重新确认；从未同意同样 pending。
   */
  app.get('/api/v1/me/consent/status', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const privacy = await getPublishedPolicy('privacy_policy');
    const tos = await getPublishedPolicy('terms_of_service');

    // SQL 内比较（PG 绝对时间，规避客户端时区解析差异）：每策略最新 agree 时间 vs 策略更新时间
    const pendingRows = await db.execute(sql`
          SELECT p.id,
                 (MAX(cl.created_at) IS NULL OR MAX(cl.created_at) < p.updated_at) AS pending
          FROM consent_policies p
          LEFT JOIN consent_logs cl
            ON cl.policy_id = p.id AND cl.user_id = ${uid} AND cl.action = 'agree'
          WHERE p.status = 'published'
          GROUP BY p.id, p.updated_at
        `) as unknown as Array<{ id: number; pending: boolean }>;
    const pendingMap = new Map(pendingRows.map((r) => [Number(r.id), r.pending === true]));

    const isPending = (policy: { id: number } | null): boolean =>
      !!policy && (pendingMap.get(policy.id) ?? true);

    const privacyPending = isPending(privacy);
    const tosPending = isPending(tos);
    const status = privacyPending && tosPending
      ? 'both_pending'
      : privacyPending ? 'privacy_pending' : tosPending ? 'tos_pending' : 'none';

    const toPolicy = (p: typeof privacy) =>
      p ? { id: p.id, version: p.version, title: p.name, summary: null, published_at: p.updatedAt } : null;

    return reply.send({
      data: { status, privacy_policy: toPolicy(privacy), terms_of_service: toPolicy(tos) },
    });
  });

  /** POST /api/v1/me/consent/privacy — 同意隐私政策（幂等） */
  app.post('/api/v1/me/consent/privacy', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const r = await agreeConsent(request, uid, 'privacy_policy');
    return reply.send({ data: { ok: true, ...r } });
  });

  /** POST /api/v1/me/consent/terms — 同意服务条款（幂等） */
  app.post('/api/v1/me/consent/terms', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const r = await agreeConsent(request, uid, 'terms_of_service');
    return reply.send({ data: { ok: true, ...r } });
  });
}
