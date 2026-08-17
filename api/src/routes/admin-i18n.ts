/**
 * 管理端 i18n 路由 — /api/v1/admin/i18n/entries（P2-3）
 *
 * 端点（对齐 SPEC-§23 §23.4 + 调度方 P2-3 任务契约）：
 *   GET    /api/v1/admin/i18n/entries            — 条目列表（key/lang/scope/status 筛选 + 分页）
 *   POST   /api/v1/admin/i18n/entries            — 新增（同 key+lang 已存在 → 409 CONFLICT）
 *   PUT    /api/v1/admin/i18n/entries/:id        — 更新 value/status/scope
 *   DELETE /api/v1/admin/i18n/entries/:id        — 删除（软删 status='disabled'，见下方说明）
 *   POST   /api/v1/admin/i18n/entries/import     — 批量导入（JSON：{key: {lang: value}}，upsert）
 *
 * 删除语义（已文档化）：采用**软删除**（status='disabled'）。
 * 公开端点 /public/i18n/entries 只返回 status='active' 的条目，因此 disabled 等效下线；
 * 列表接口可通过 status=disabled 过滤查看，并可用 PUT 恢复（status='active'）。
 * 注意：软删后 (key, lang) 唯一索引仍生效，重新创建同 key+lang 需先恢复或改 key。
 *
 * 审计约定：所有写操作（POST/PUT/DELETE/import）写 audit_logs（resource='i18n_entry'），只读 GET 不写。
 *
 * 数据模型：i18n_entries 为「一行 = 一个 key × 一个 lang」的行式存储
 * （key/lang/value/scope/status/updated_by，unique(key, lang)），
 * 与旧版按 namespace + 固定四语言列的管理页模型不同——管理页 AdminI18nPage 已按本契约适配。
 *
 * @module routes
 * @see docs/SPEC-§23-系统级能力增强.md §23.4
 * @see docs/iteration-plan-v2.md P2-3
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, like, desc, count, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';

/** 允许的 scope 值（portal=门户默认；console/admin/error/email/notification 供管理页分组） */
const SUPPORTED_SCOPES = ['portal', 'console', 'common', 'admin', 'error', 'email', 'notification'];
/** 允许的 status 值 */
const SUPPORTED_STATUSES = ['active', 'disabled'];
/** key 最长长度（对齐表 varchar(200)） */
const KEY_MAX_LENGTH = 200;
/** lang 最长长度（对齐表 varchar(10)） */
const LANG_MAX_LENGTH = 10;

/* ───────── auth / audit helpers ───────── */

/** 管理端鉴权：JWT 且角色为 admin / super_admin（与 admin-ops.ts 同构） */
export async function adminAuth(request: any, _reply: any) {
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

/**
 * 写入 i18n 审计日志（不 await，异步落库；失败不影响主流程）
 *
 * @param request - Fastify 请求（含 userContext/ip/headers）
 * @param action - 动作名（create/update/delete/import）
 * @param entryId - 关联条目 id（可为 null）
 * @param details - 审计详情（变更前后等）
 */
export function writeI18nAudit(
  request: any,
  action: string,
  entryId: number | null,
  details: Record<string, unknown>,
) {
  const ctx = request.userContext ?? {};
  return db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action: `i18n.${action}`,
    resource: 'i18n_entry',
    resourceId: entryId != null ? String(entryId) : null,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/* ───────── 类型 ───────── */

/** 列表返回的条目形状（snake_case 输出，对齐管理页消费习惯） */
function toRow(t: any) {
  return {
    id: t.id,
    key: t.key,
    lang: t.lang,
    value: t.value,
    scope: t.scope,
    status: t.status,
    updated_by: t.updatedBy,
    updated_at: t.updatedAt,
    created_at: t.createdAt,
  };
}

/* ───────── route plugin ───────── */

export async function adminI18nRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/admin/i18n/entries — 条目列表
   *
   * query: key（模糊匹配）、lang、scope、status（精确匹配）、page/pageSize（分页）
   */
  app.get('/api/v1/admin/i18n/entries', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || '20', 10) || 20));
    const offset = (page - 1) * pageSize;

    const conds = [];
    if (q.key) conds.push(like(schema.i18nEntries.key, `%${q.key}%`));
    if (q.lang) conds.push(eq(schema.i18nEntries.lang, q.lang));
    if (q.scope) conds.push(eq(schema.i18nEntries.scope, q.scope));
    if (q.status) conds.push(eq(schema.i18nEntries.status, q.status));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.select()
        .from(schema.i18nEntries)
        .where(where)
        .orderBy(desc(schema.i18nEntries.id))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(schema.i18nEntries).where(where),
    ]);

    return reply.send({
      data: {
        items: rows.map(toRow),
        total: Number(totalRows[0]?.total ?? 0),
        page,
        pageSize,
      },
    });
  });

  /**
   * POST /api/v1/admin/i18n/entries — 新增条目
   *
   * body: { key, lang, value, scope?, status? }
   * 同 key+lang 已存在 → 409 CONFLICT（unique(key, lang) 兜底，应用层先查给出友好提示）
   */
  app.post('/api/v1/admin/i18n/entries', { preHandler: [adminAuth] }, async (request, reply) => {
    const b = (request.body || {}) as Record<string, unknown>;
    const key = String(b.key ?? '').trim();
    const lang = String(b.lang ?? '').trim();
    const value = String(b.value ?? '');
    const scope = String(b.scope ?? 'portal').trim();
    const status = String(b.status ?? 'active').trim();

    if (!key || key.length > KEY_MAX_LENGTH) throw new ValidationError(`key 必填且不超过 ${KEY_MAX_LENGTH} 字符`);
    if (!lang || lang.length > LANG_MAX_LENGTH) throw new ValidationError(`lang 必填且不超过 ${LANG_MAX_LENGTH} 字符`);
    if (!value) throw new ValidationError('value 不能为空');
    if (!SUPPORTED_SCOPES.includes(scope)) throw new ValidationError(`scope 仅支持: ${SUPPORTED_SCOPES.join('/')}`);
    if (!SUPPORTED_STATUSES.includes(status)) throw new ValidationError(`status 仅支持: ${SUPPORTED_STATUSES.join('/')}`);

    const [exists] = await db.select({ id: schema.i18nEntries.id })
      .from(schema.i18nEntries)
      .where(and(eq(schema.i18nEntries.key, key), eq(schema.i18nEntries.lang, lang)))
      .limit(1);
    if (exists) {
      return reply.status(409).send({
        code: 409,
        message: `已存在相同 key+lang 的翻译条目（key=${key}, lang=${lang}），请用 PUT 更新或先恢复`,
        requestId: request.id,
      });
    }

    const ctx = (request as any).userContext ?? {};
    const [row] = await db.insert(schema.i18nEntries).values({
      key,
      lang,
      value,
      scope,
      status,
      updatedBy: ctx.userId ?? null,
    }).returning();
    if (!row) throw new NotFoundError('i18n entry');

    try {
      await writeI18nAudit(request, 'create', row.id, {
        key, lang, scope, status, entry_id: row.id,
      });
    } catch (err) {
      app.log.warn({ err }, 'i18n audit write failed');
    }

    return reply.status(201).send({ data: toRow(row), message: '翻译条目已创建' });
  });

  /**
   * PUT /api/v1/admin/i18n/entries/:id — 更新条目（value/status/scope）
   *
   * body: { value?, status?, scope? }（至少一项）
   */
  app.put('/api/v1/admin/i18n/entries/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = Number((request.params as Record<string, unknown>).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid entry id');

    const b = (request.body || {}) as Record<string, unknown>;
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (b.value !== undefined) {
      if (typeof b.value !== 'string' || !b.value) throw new ValidationError('value 不能为空');
      setData.value = b.value;
    }
    if (b.status !== undefined) {
      const status = String(b.status);
      if (!SUPPORTED_STATUSES.includes(status)) throw new ValidationError(`status 仅支持: ${SUPPORTED_STATUSES.join('/')}`);
      setData.status = status;
    }
    if (b.scope !== undefined) {
      const scope = String(b.scope);
      if (!SUPPORTED_SCOPES.includes(scope)) throw new ValidationError(`scope 仅支持: ${SUPPORTED_SCOPES.join('/')}`);
      setData.scope = scope;
    }
    if (Object.keys(setData).length <= 1) throw new ValidationError('至少提供一个可更新字段（value/status/scope）');

    const ctx = (request as any).userContext ?? {};
    setData.updatedBy = ctx.userId ?? null;

    const [before] = await db.select().from(schema.i18nEntries).where(eq(schema.i18nEntries.id, id)).limit(1);
    if (!before) throw new NotFoundError('i18n entry', id);

    const [row] = await db.update(schema.i18nEntries)
      .set(setData)
      .where(eq(schema.i18nEntries.id, id))
      .returning();
    if (!row) throw new NotFoundError('i18n entry', id);

    try {
      await writeI18nAudit(request, 'update', id, {
        key: before.key,
        lang: before.lang,
        before: { value: before.value, status: before.status, scope: before.scope },
        after: { value: row.value, status: row.status, scope: row.scope },
      });
    } catch (err) {
      app.log.warn({ err }, 'i18n audit write failed');
    }

    return reply.send({ data: toRow(row), message: '翻译条目已更新' });
  });

  /**
   * DELETE /api/v1/admin/i18n/entries/:id — 删除条目（软删 status='disabled'）
   *
   * 软删理由：保留审计追溯、避免误删后无法恢复；公开端点天然过滤 disabled。
   */
  app.delete('/api/v1/admin/i18n/entries/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = Number((request.params as Record<string, unknown>).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid entry id');

    const [before] = await db.select().from(schema.i18nEntries).where(eq(schema.i18nEntries.id, id)).limit(1);
    if (!before) throw new NotFoundError('i18n entry', id);
    if (before.status === 'disabled') {
      return reply.status(204).send();
    }

    const [row] = await db.update(schema.i18nEntries)
      .set({ status: 'disabled', updatedAt: new Date(), updatedBy: (request as any).userContext?.userId ?? null })
      .where(eq(schema.i18nEntries.id, id))
      .returning();
    if (!row) throw new NotFoundError('i18n entry', id);

    try {
      await writeI18nAudit(request, 'delete', id, {
        key: before.key, lang: before.lang, soft_delete: true,
      });
    } catch (err) {
      app.log.warn({ err }, 'i18n audit write failed');
    }

    return reply.status(204).send();
  });

  /**
   * POST /api/v1/admin/i18n/entries/import — 批量导入（upsert）
   *
   * body: { key: { lang: value } }（原始 JSON 映射），可选顶层 scope/status 统一覆盖。
   * 已存在 (key, lang) 的条目更新 value（并置 status='active'），否则新建。
   * 返回 { imported, created, updated, failed } 统计。
   *
   * @example
   * ```json
   * { "nav.pricing": { "zh-CN": "定价", "en": "Pricing" }, "nav.blog": { "zh-CN": "博客", "en": "Blog" } }
   * ```
   */
  app.post('/api/v1/admin/i18n/entries/import', { preHandler: [adminAuth] }, async (request, reply) => {
    const raw = (request.body ?? {}) as Record<string, unknown>;
    const scope = String(raw.scope ?? 'portal').trim();
    if (!SUPPORTED_SCOPES.includes(scope)) throw new ValidationError(`scope 仅支持: ${SUPPORTED_SCOPES.join('/')}`);
    const status = String(raw.status ?? 'active').trim();
    if (!SUPPORTED_STATUSES.includes(status)) throw new ValidationError(`status 仅支持: ${SUPPORTED_STATUSES.join('/')}`);

    // 解析 { key: { lang: value } }，跳过非对象条目与空值
    const entries: Array<{ key: string; lang: string; value: string }> = [];
    const failed: string[] = [];
    for (const [key, langMap] of Object.entries(raw)) {
      if (key === 'scope' || key === 'status') continue;
      if (!key.trim() || key.length > KEY_MAX_LENGTH) { failed.push(key); continue; }
      if (typeof langMap !== 'object' || langMap === null || Array.isArray(langMap)) { failed.push(key); continue; }
      const langObj = langMap as Record<string, unknown>;
      if (Object.keys(langObj).length === 0) { failed.push(key); continue; }
      for (const [lang, value] of Object.entries(langObj)) {
        if (!lang.trim() || lang.length > LANG_MAX_LENGTH) continue;
        if (typeof value !== 'string' || !value) continue;
        entries.push({ key: key.trim(), lang: lang.trim(), value });
      }
    }
    if (entries.length === 0) throw new ValidationError('导入内容为空：请提供 {key: {lang: value}} 格式的 JSON');

    // 预查已存在的 (key, lang) 以区分 created / updated
    const keys = [...new Set(entries.map((e) => e.key))];
    const existingRows = await db.select({ id: schema.i18nEntries.id, key: schema.i18nEntries.key, lang: schema.i18nEntries.lang })
      .from(schema.i18nEntries)
      .where(inArray(schema.i18nEntries.key, keys));
    const existingSet = new Set(existingRows.map((r) => `${r.key}\u0000${r.lang}`));

    const ctx = (request as any).userContext ?? {};
    let created = 0;
    let updated = 0;
    for (const e of entries) {
      const exists = existingSet.has(`${e.key}\u0000${e.lang}`);
      if (exists) {
        await db.update(schema.i18nEntries)
          .set({ value: e.value, status, updatedAt: new Date(), updatedBy: ctx.userId ?? null })
          .where(and(eq(schema.i18nEntries.key, e.key), eq(schema.i18nEntries.lang, e.lang)));
        updated++;
      } else {
        await db.insert(schema.i18nEntries).values({
          key: e.key, lang: e.lang, value: e.value, scope, status, updatedBy: ctx.userId ?? null,
        }).onConflictDoNothing({ target: [schema.i18nEntries.key, schema.i18nEntries.lang] });
        created++;
      }
    }

    try {
      await writeI18nAudit(request, 'import', null, {
        scope, status, imported: entries.length, created, updated, failed,
      });
    } catch (err) {
      app.log.warn({ err }, 'i18n audit write failed');
    }

    return reply.send({
      data: { imported: entries.length, created, updated, failed },
      message: `导入完成：新增 ${created} 条，更新 ${updated} 条${failed.length ? `，跳过无效 ${failed.length} 条` : ''}`,
    });
  });
}
