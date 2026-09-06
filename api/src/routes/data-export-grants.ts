/**
 * 数据导出授权管理路由 — /api/v1/me/data-export/grant-status + /api/v1/admin/data-export-grants/*
 *
 * 用户端：
 *   GET /api/v1/me/data-export/grant-status            — 查询当前用户授权状态（前端判断菜单显隐）
 *
 * 管理端（requirePerm 权限点）：
 *   GET    /api/v1/admin/data-export-grants            — 授权记录列表（分页 + status 筛选 + search）
 *   POST   /api/v1/admin/data-export-grants            — 新建授权（对未授权用户）
 *   PUT    /api/v1/admin/data-export-grants/:userId    — 更新授权（启/停 + 备注）
 *   DELETE /api/v1/admin/data-export-grants/:userId    — 删除授权记录
 *
 * 权限点：dataExportGrant.view（列表）/ dataExportGrant.edit（增改删）。
 * 管理端写操作均写 audit_logs（action: data_export_grants.*）。
 *
 * 与既有 /admin/data-requests（合规调取审核）严格独立，不混用（PRD §5.1）。
 *
 * @module routes
 * @see docs/PRD-数据导出授权管理.md §8 API 契约
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, desc, count as drizzleCount, or, ilike } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { requirePerm } from '../middleware/require-perm.js';
import { AppError, NotFoundError, ValidationError, UnauthorizedError } from '../lib/errors.js';
import { verifyToken } from '../services/auth/jwt.js';

/** 授权人 users 别名（grantedBy 关联 users 取授权人姓名） */
const grantorUser = alias(schema.users, 'grantor');

/** JWT 用户鉴权（preHandler，仅登录态；grant-status 面向任意登录用户） */
async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid token');
  request.userContext = payload;
}

/**
 * 严格解析布尔参数（PRD-数据导出授权管理 review P2-2）。
 *
 * 仅接受真实 boolean 或 'true'/'false' 字符串：
 *  - boolean → 原样返回（undefined 时取默认值 defaultValue）
 *  - 'true'/'false' 字符串 → 解析为布尔
 *  - 其它类型（如 "false" 的非布尔变体 / 数字 / null）→ 抛 ValidationError
 *
 * 规避 `Boolean("false") === true` 陷阱：若非严格校验，客户端传字符串 "false"
 * 会被误判为 true，导致本意停用却启用了授权（错误扩大用户权限）。
 */
function parseEnabled(v: unknown, field = 'enabled', defaultValue?: boolean): boolean {
  if (v === undefined || v === null) {
    if (defaultValue === undefined) throw new ValidationError(`${field} 必须提供（布尔值）`);
    return defaultValue;
  }
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  throw new ValidationError(`${field} 必须为布尔值`);
}

/** 默认分页大小 / 上限（coding-standards §2.4） */
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * 管理端操作审计写库。
 *
 * @param request - Fastify 请求（requirePerm 已注入 request.userContext）
 * @param action - 审计动作，如 'data_export_grants.create'
 * @param details - 审计详情（含 userId/enabled 等）
 */
function writeAudit(request: any, action: string, details: Record<string, unknown>) {
  const ctx = request.userContext ?? {};
  return db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource: 'data_export_grant',
    resourceId: details.userId != null ? String(details.userId) : null,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/** 授权记录 DTO（列表项，含用户信息/授权人信息）；对外用 enabled 对齐前端契约 */
function toDTO(row: any) {
  return {
    userId: row.userId,
    email: row.email ?? null,
    name: row.name ?? null,
    enabled: row.isEnabled,
    grantedBy: row.grantedBy ?? null,
    grantedByName: row.grantedByName ?? null,
    grantedAt: row.grantedAt ?? null,
    disabledBy: row.disabledBy ?? null,
    disabledAt: row.disabledAt ?? null,
    remark: row.remark ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 组装授权记录 DTO：由 grant 行补全用户 email/name 与授权人姓名。
 *
 * @param grant - data_export_grants 行（returning() 结果）
 * @returns 完整列表项形状的 DTO
 */
async function fetchGrantDTO(grant: any) {
  const [u] = await db.select({ email: schema.users.email, name: schema.users.name }).from(schema.users).where(eq(schema.users.id, grant.userId)).limit(1);
  const [g] = grant.grantedBy != null
    ? await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, grant.grantedBy)).limit(1)
    : [];
  return toDTO({ ...grant, email: u?.email ?? null, name: u?.name ?? null, grantedByName: g?.name ?? null });
}

export async function dataExportGrantsRoutes(app: FastifyInstance) {
  // ═══ 用户端 ═══

  /**
   * GET /api/v1/me/data-export/grant-status — 查询当前用户授权状态
   *
   * 前端判断「数据导出」菜单显隐：granted && enabled。
   */
  app.get('/api/v1/me/data-export/grant-status', { preHandler: [jwtAuth] }, async (request: any) => {
    const uid = request.userContext.userId;
    const [row] = await db
      .select({ isEnabled: schema.dataExportGrants.isEnabled })
      .from(schema.dataExportGrants)
      .where(eq(schema.dataExportGrants.userId, uid))
      .limit(1);
    const granted = !!row;
    const enabled = granted ? row!.isEnabled : false;
    return { data: { granted, enabled } };
  });

  // ═══ 管理端 ═══

  /**
   * GET /api/v1/admin/data-export-grants — 授权记录列表
   *
   * 筛选：status('enabled'|'disabled'|'all')、search（email/name 模糊）；分页。
   */
  app.get('/api/v1/admin/data-export-grants', { preHandler: [requirePerm('dataExportGrant.view')] }, async (request: any, reply) => {
    const q = (request.query || {}) as Record<string, string | undefined>;
    const page = Math.max(parseInt(q.page || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.pageSize || q.page_size || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    const status = q.status;
    if (status === 'enabled') conditions.push(eq(schema.dataExportGrants.isEnabled, true));
    else if (status === 'disabled') conditions.push(eq(schema.dataExportGrants.isEnabled, false));
    else if (status && status !== 'all') throw new ValidationError(`status 必须为 enabled/disabled/all`);
    if (q.search) {
      const kw = `%${String(q.search).trim()}%`;
      conditions.push(or(
        ilike(schema.users.email, kw),
        ilike(schema.users.name, kw),
      ));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.select({
        userId: schema.dataExportGrants.userId,
        email: schema.users.email,
        name: schema.users.name,
        isEnabled: schema.dataExportGrants.isEnabled,
        grantedBy: schema.dataExportGrants.grantedBy,
        grantedByName: grantorUser.name, // 授权人姓名（grantedBy 关联 users）
        grantedAt: schema.dataExportGrants.grantedAt,
        disabledBy: schema.dataExportGrants.disabledBy,
        disabledAt: schema.dataExportGrants.disabledAt,
        remark: schema.dataExportGrants.remark,
        createdAt: schema.dataExportGrants.createdAt,
        updatedAt: schema.dataExportGrants.updatedAt,
      })
        .from(schema.dataExportGrants)
        .innerJoin(schema.users, eq(schema.dataExportGrants.userId, schema.users.id))
        .leftJoin(grantorUser, eq(schema.dataExportGrants.grantedBy, grantorUser.id))
        .where(whereClause)
        .orderBy(desc(schema.dataExportGrants.updatedAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ v: drizzleCount() })
        .from(schema.dataExportGrants)
        .innerJoin(schema.users, eq(schema.dataExportGrants.userId, schema.users.id))
        .where(whereClause),
    ]);

    return reply.send({
      data: {
        list: rows.map(toDTO),
        total: Number(totalRows[0]?.v ?? 0),
        page,
        pageSize,
      },
    });
  });

  /**
   * POST /api/v1/admin/data-export-grants — 新建授权（对未授权用户）
   *
   * body: { userId, enabled?, remark? }
   *
   * @throws {NotFoundError} 404 用户不存在
   * @throws {AppError} 409 该用户已有授权记录
   */
  app.post('/api/v1/admin/data-export-grants', { preHandler: [requirePerm('dataExportGrant.edit')] }, async (request: any, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const userId = parseInt(String(body.userId), 10);
    if (isNaN(userId) || userId <= 0) throw new ValidationError('userId 必须为正整数');
    const enabled = parseEnabled(body.enabled, 'enabled', true);
    const remark = body.remark != null ? String(body.remark).trim() : undefined;
    if (remark !== undefined && remark.length > 500) throw new ValidationError('remark 过长（最多 500 字符）');

    // 用户必须存在
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!user) throw new NotFoundError('User', userId);

    // 已存在授权记录 → 409
    const [existing] = await db.select({ id: schema.dataExportGrants.id }).from(schema.dataExportGrants).where(eq(schema.dataExportGrants.userId, userId)).limit(1);
    if (existing) throw new AppError('该用户已授权，请使用更新接口', 409, 'DATA_EXPORT_GRANT_EXISTS');

    const operatorId = request.userContext.userId;
    const [created] = await db.insert(schema.dataExportGrants).values({
      userId,
      isEnabled: enabled,
      remark: remark ?? null,
      grantedBy: enabled ? operatorId : null,
      grantedAt: enabled ? new Date() : null,
    }).returning();

    await writeAudit(request, 'data_export_grants.create', { userId, enabled, remark: remark ?? null });
    const dto = await fetchGrantDTO(created);
    return reply.status(201).send({ data: dto, message: '授权已创建' });
  });

  /**
   * PUT /api/v1/admin/data-export-grants/:userId — 更新授权（启/停 + 备注）
   *
   * body: { enabled, remark? }
   * 启用 → 写 grantedBy/grantedAt；停用 → 写 disabledBy/disabledAt。
   *
   * @throws {NotFoundError} 404 授权记录不存在
   */
  app.put('/api/v1/admin/data-export-grants/:userId', { preHandler: [requirePerm('dataExportGrant.edit')] }, async (request: any, reply) => {
    const userId = parseInt(String(request.params.userId), 10);
    if (isNaN(userId) || userId <= 0) throw new ValidationError('userId 必须为正整数');
    const body = (request.body || {}) as Record<string, unknown>;
    if (body.enabled === undefined) throw new ValidationError('enabled 必须提供（布尔值）');
    const enabled = parseEnabled(body.enabled, 'enabled');
    const remark = body.remark !== undefined ? String(body.remark).trim() : undefined;
    if (remark !== undefined && remark.length > 500) throw new ValidationError('remark 过长（最多 500 字符）');

    const [row] = await db.select().from(schema.dataExportGrants).where(eq(schema.dataExportGrants.userId, userId)).limit(1);
    if (!row) throw new NotFoundError('DataExportGrant', userId);

    const operatorId = request.userContext.userId;
    const patch: Record<string, unknown> = { isEnabled: enabled, updatedAt: new Date() };
    if (remark !== undefined) patch.remark = remark || null;
    if (enabled) {
      patch.grantedBy = operatorId;
      patch.grantedAt = new Date();
    } else {
      patch.disabledBy = operatorId;
      patch.disabledAt = new Date();
    }

    const [updated] = await db.update(schema.dataExportGrants).set(patch).where(eq(schema.dataExportGrants.userId, userId)).returning();
    await writeAudit(request, 'data_export_grants.update', { userId, enabled, remark: remark ?? null });
    const dto = await fetchGrantDTO(updated);
    return reply.send({ data: dto, message: '授权已更新' });
  });

  /**
   * DELETE /api/v1/admin/data-export-grants/:userId — 删除授权记录（彻底移除授权）
   *
   * @throws {NotFoundError} 404 授权记录不存在
   */
  app.delete('/api/v1/admin/data-export-grants/:userId', { preHandler: [requirePerm('dataExportGrant.edit')] }, async (request: any, reply) => {
    const userId = parseInt(String(request.params.userId), 10);
    if (isNaN(userId) || userId <= 0) throw new ValidationError('userId 必须为正整数');

    const [row] = await db.select({ id: schema.dataExportGrants.id }).from(schema.dataExportGrants).where(eq(schema.dataExportGrants.userId, userId)).limit(1);
    if (!row) throw new NotFoundError('DataExportGrant', userId);

    await db.delete(schema.dataExportGrants).where(eq(schema.dataExportGrants.userId, userId));
    await writeAudit(request, 'data_export_grants.delete', { userId });
    return reply.status(204).send();
  });
}
