/**
 * 数据导出流转路由 — /api/v1/me/data-export/* + /api/v1/admin/data-requests/*（P2-4）
 *
 * 状态机（表 data_requests）：
 *   pending ──admin.approve──▶ approved ──admin.export──▶ exported（file_expires_at=+72h）
 *      │                        （幂等：已 exported 直接返回已有文件）
 *      ├──admin.reject──▶ rejected
 *      └──user.cancel──▶ cancelled（仅 pending 可撤）
 *
 * 用户端（jwtAuth）：
 *   POST /api/v1/me/data-export/request        — 提交导出申请（存在 pending → 400）
 *   GET  /api/v1/me/data-export/requests       — 我的申请列表（倒序分页）
 *   GET  /api/v1/me/data-export/:id            — 申请详情（仅本人，越权 403）
 *   POST /api/v1/me/data-export/:id/cancel     — 撤回（仅 pending）
 *   GET  /api/v1/me/data-export/:id/download   — 下载导出文件（exported 且未过期；过期 410）
 *
 * 管理端（adminAuth）：
 *   GET  /api/v1/admin/data-requests           — 申请列表（status/requestType 筛选 + 分页）
 *   POST /api/v1/admin/data-requests/:id/approve — 审核通过（pending→approved）
 *   POST /api/v1/admin/data-requests/:id/reject  — 审核驳回（pending→rejected）
 *   POST /api/v1/admin/data-requests/:id/export  — 生成导出文件（approved→exported，幂等）
 *
 * 管理端写操作均写 audit_logs（action: data_requests.*）。
 *
 * @module routes
 * @see docs/iteration-plan-v2.md P2-4
 * @see docs/api-contract.md §2.1 /me/data-export/request
 */

import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync } from 'fs';
import { db, schema } from '../db';
import { and, desc, eq, or, sql, count as drizzleCount } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  AppError,
} from '../lib/errors';
import { gatherUserData, writeExportFile, exportFileExists, resolveExportPath, ensureExportDir } from '../services/compliance/export';

/** 导出文件有效期（小时） */
const EXPORT_FILE_TTL_HOURS = 72;

/** 合法导出范围 */
const VALID_DATA_SCOPES = ['all', 'consumption', 'apikeys', 'profile'] as const;

// ── 认证 / 审计 helpers ─────────────────────────────────

/** JWT 用户鉴权（preHandler） */
async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid token');
  request.userContext = payload;
}

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
function writeAudit(request: any, action: string, resourceId: string | number, details: Record<string, unknown>) {
  const ctx = request.userContext ?? {};
  return db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource: 'data_request',
    resourceId: String(resourceId),
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

function userId(request: any): number {
  return (request as any).userContext.userId;
}

/** 解析分页参数（page/pageSize，上限 100） */
function parsePagination(q: Record<string, string | undefined>) {
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || q.page_size || '20', 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 申请记录 DTO（用户视角，不暴露 admin 内部字段） */
function toUserDTO(row: any) {
  return {
    id: row.id,
    requestType: row.requestType,
    status: row.status,
    dataScope: row.dataScope,
    reason: row.reason,
    filePath: row.status === 'exported' ? row.filePath : null,
    fileExpiresAt: row.fileExpiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 申请记录 DTO（管理视角，含用户信息） */
function toAdminDTO(row: any) {
  return {
    id: row.id,
    userId: row.userId,
    userEmail: row.userEmail,
    userName: row.userName,
    requestType: row.requestType,
    status: row.status,
    dataScope: row.dataScope,
    reason: row.reason,
    adminId: row.adminId,
    adminNote: row.adminNote,
    filePath: row.filePath,
    fileExpiresAt: row.fileExpiresAt,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function dataRequestsRoutes(app: FastifyInstance) {
  // ═══ 用户端 ═══

  /**
   * POST /api/v1/me/data-export/request — 提交导出申请
   *
   * @param dataScope - 'all' | 'consumption' | 'apikeys' | 'profile'（默认 all）
   * @param reason - 申请理由（可选）
   * @throws {ValidationError} 400 非法范围 / 缺 body
   * @throws {AppError} 400 EXISTS 已有 pending 申请
   */
  app.post('/api/v1/me/data-export/request', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const uid = userId(request);
    const body = (request.body || {}) as Record<string, unknown>;
    const dataScope = String(body.dataScope || 'all');
    const reason = body.reason != null ? String(body.reason).trim() : undefined;

    if (!(VALID_DATA_SCOPES as readonly string[]).includes(dataScope)) {
      throw new ValidationError(`dataScope 必须为 ${VALID_DATA_SCOPES.join(' / ')}`);
    }
    if (reason !== undefined && reason.length > 500) {
      throw new ValidationError('reason 过长（最多 500 字符）');
    }

    // 存在 pending 申请 → 400（同用户同时仅允许一个进行中的导出申请）
    const [existing] = await db
      .select({ id: schema.dataRequests.id })
      .from(schema.dataRequests)
      .where(and(eq(schema.dataRequests.userId, uid), eq(schema.dataRequests.status, 'pending')))
      .limit(1);
    if (existing) {
      throw new AppError('已有进行中的数据导出申请，请等待处理完成', 400, 'EXISTS', { requestId: existing.id });
    }

    const [created] = await db
      .insert(schema.dataRequests)
      .values({ userId: uid, requestType: 'data_export', status: 'pending', dataScope, reason: reason ?? null })
      .returning();
    if (!created) throw new AppError('导出申请创建失败', 500, 'DATA_REQUEST_CREATE_FAILED');

    return reply.status(201).send({ data: toUserDTO(created), message: '导出申请已提交，等待管理员审核' });
  });

  /**
   * GET /api/v1/me/data-export/requests — 我的导出申请列表（创建倒序 + 分页）
   */
  app.get('/api/v1/me/data-export/requests', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const uid = userId(request);
    const { page, pageSize, offset } = parsePagination((request.query || {}) as Record<string, string | undefined>);

    const [rows, totalRows] = await Promise.all([
      db.select()
        .from(schema.dataRequests)
        .where(eq(schema.dataRequests.userId, uid))
        .orderBy(desc(schema.dataRequests.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ v: drizzleCount() }).from(schema.dataRequests).where(eq(schema.dataRequests.userId, uid)),
    ]);

    return reply.send({
      data: {
        list: rows.map(toUserDTO),
        total: Number(totalRows[0]?.v ?? 0),
        page,
        pageSize,
      },
    });
  });

  /**
   * GET /api/v1/me/data-export/:id — 申请详情（仅本人）
   *
   * @throws {NotFoundError} 404 不存在
   * @throws {ForbiddenError} 403 越权访问他人申请
   */
  app.get('/api/v1/me/data-export/:id', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const uid = userId(request);
    const id = parseInt(String(request.params.id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid id');

    const [row] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, id)).limit(1);
    if (!row) throw new NotFoundError('DataRequest', id);
    if (row.userId !== uid) throw new ForbiddenError('无权访问他人导出申请');

    return reply.send({ data: toUserDTO(row) });
  });

  /**
   * POST /api/v1/me/data-export/:id/cancel — 撤回申请（仅 pending）
   *
   * @throws {NotFoundError} 404 / {ForbiddenError} 403 / {AppError} 400 状态不允许
   */
  app.post('/api/v1/me/data-export/:id/cancel', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const uid = userId(request);
    const id = parseInt(String(request.params.id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid id');

    const [row] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, id)).limit(1);
    if (!row) throw new NotFoundError('DataRequest', id);
    if (row.userId !== uid) throw new ForbiddenError('无权操作他人导出申请');
    if (row.status !== 'pending') {
      throw new AppError(`当前状态（${row.status}）不允许撤回，仅 pending 可撤回`, 400, 'INVALID_STATE');
    }

    const [updated] = await db
      .update(schema.dataRequests)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(schema.dataRequests.id, id))
      .returning();
    return reply.send({ data: toUserDTO(updated), message: '导出申请已撤回' });
  });

  /**
   * GET /api/v1/me/data-export/:id/download — 下载导出文件
   *
   * 前置：status='exported' 且 file_expires_at > NOW()。
   *
   * @throws {NotFoundError} 404 / {ForbiddenError} 403
   * @throws {AppError} 400 FILE_NOT_READY 未生成文件 / 410 FILE_EXPIRED 文件已过期
   */
  app.get('/api/v1/me/data-export/:id/download', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const uid = userId(request);
    const id = parseInt(String(request.params.id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid id');

    const [row] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, id)).limit(1);
    if (!row) throw new NotFoundError('DataRequest', id);
    if (row.userId !== uid) throw new ForbiddenError('无权下载他人导出文件');

    if (row.status !== 'exported' || !row.filePath) {
      throw new AppError('导出文件尚未生成', 400, 'FILE_NOT_READY');
    }
    // 过期判定在 SQL 侧做（timestamp 无时区语义，避免 JS Date 时区偏移误判）
    const [fresh] = await db
      .select({ id: schema.dataRequests.id })
      .from(schema.dataRequests)
      .where(and(
        eq(schema.dataRequests.id, id),
        sql`${schema.dataRequests.fileExpiresAt} > NOW()`,
      ))
      .limit(1);
    if (!fresh) {
      throw new AppError('导出文件已过期，请重新申请', 410, 'FILE_EXPIRED');
    }
    if (!exportFileExists(row.filePath)) {
      throw new AppError('导出文件缺失，请联系管理员', 404, 'FILE_MISSING');
    }

    const absPath = resolveExportPath(row.filePath);
    const filename = absPath.split(/[\\/]/).pop() || `data-export-${id}.json`;
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(createReadStream(absPath));
  });

  // ═══ 管理端 ═══

  /**
   * GET /api/v1/admin/data-requests — 申请列表
   *
   * 筛选：status（pending/approved/rejected/exported/cancelled）、requestType、userId；分页。
   */
  app.get('/api/v1/admin/data-requests', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const q = (request.query || {}) as Record<string, string | undefined>;
    const { page, pageSize, offset } = parsePagination(q);
    const conditions: any[] = [];
    if (q.status) conditions.push(eq(schema.dataRequests.status, String(q.status)));
    if (q.requestType) conditions.push(eq(schema.dataRequests.requestType, String(q.requestType)));
    if (q.userId) conditions.push(eq(schema.dataRequests.userId, parseInt(String(q.userId), 10)));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.select({
        id: schema.dataRequests.id,
        userId: schema.dataRequests.userId,
        userEmail: schema.users.email,
        userName: schema.users.name,
        requestType: schema.dataRequests.requestType,
        status: schema.dataRequests.status,
        dataScope: schema.dataRequests.dataScope,
        reason: schema.dataRequests.reason,
        adminId: schema.dataRequests.adminId,
        adminNote: schema.dataRequests.adminNote,
        filePath: schema.dataRequests.filePath,
        fileExpiresAt: schema.dataRequests.fileExpiresAt,
        reviewedAt: schema.dataRequests.reviewedAt,
        createdAt: schema.dataRequests.createdAt,
        updatedAt: schema.dataRequests.updatedAt,
      })
        .from(schema.dataRequests)
        .leftJoin(schema.users, eq(schema.dataRequests.userId, schema.users.id))
        .where(whereClause)
        .orderBy(desc(schema.dataRequests.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ v: drizzleCount() }).from(schema.dataRequests).where(whereClause),
    ]);

    return reply.send({
      data: {
        list: rows.map(toAdminDTO),
        total: Number(totalRows[0]?.v ?? 0),
        page,
        pageSize,
      },
    });
  });

  /**
   * POST /api/v1/admin/data-requests/:id/approve — 审核通过（pending→approved）
   *
   * @param note - 审核备注（可选）
   * @throws {AppError} 400 INVALID_STATE 非 pending
   */
  app.post('/api/v1/admin/data-requests/:id/approve', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseInt(String(request.params.id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid id');
    const note = String((request.body as Record<string, unknown> | undefined)?.note ?? '').trim() || null;

    const [row] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, id)).limit(1);
    if (!row) throw new NotFoundError('DataRequest', id);
    if (row.status !== 'pending') {
      throw new AppError(`当前状态（${row.status}）不允许审核通过，仅 pending 可 approve`, 400, 'INVALID_STATE');
    }

    const adminId = request.userContext.userId;
    const [updated] = await db
      .update(schema.dataRequests)
      .set({ status: 'approved', adminId, adminNote: note ?? row.adminNote, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.dataRequests.id, id))
      .returning();
    await writeAudit(request, 'data_requests.approve', id, { userId: row.userId, dataScope: row.dataScope });
    return reply.send({ data: toAdminDTO({ ...updated, userEmail: null, userName: null }), message: '导出申请已通过' });
  });

  /**
   * POST /api/v1/admin/data-requests/:id/reject — 审核驳回（pending→rejected）
   *
   * @param note - 驳回原因（可选）
   * @throws {AppError} 400 INVALID_STATE 非 pending
   */
  app.post('/api/v1/admin/data-requests/:id/reject', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseInt(String(request.params.id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid id');
    const note = String((request.body as Record<string, unknown> | undefined)?.note ?? '').trim() || null;

    const [row] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, id)).limit(1);
    if (!row) throw new NotFoundError('DataRequest', id);
    if (row.status !== 'pending') {
      throw new AppError(`当前状态（${row.status}）不允许驳回，仅 pending 可 reject`, 400, 'INVALID_STATE');
    }

    const adminId = request.userContext.userId;
    const [updated] = await db
      .update(schema.dataRequests)
      .set({ status: 'rejected', adminId, adminNote: note ?? row.adminNote, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.dataRequests.id, id))
      .returning();
    await writeAudit(request, 'data_requests.reject', id, { userId: row.userId, dataScope: row.dataScope, note });
    return reply.send({ data: toAdminDTO({ ...updated, userEmail: null, userName: null }), message: '导出申请已驳回' });
  });

  /**
   * POST /api/v1/admin/data-requests/:id/export — 生成导出文件（approved→exported）
   *
   * 幂等：已 exported 且文件存在 → 直接返回已有文件信息（不重新生成）；
   * 已 exported 但文件缺失（磁盘清理等）→ 自愈重新生成。
   * file_expires_at = NOW() + 72h（SQL 侧写入，避免时区偏移）。
   *
   * @throws {AppError} 400 INVALID_STATE 非 approved/exported
   */
  app.post('/api/v1/admin/data-requests/:id/export', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseInt(String(request.params.id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid id');

    const [row] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, id)).limit(1);
    if (!row) throw new NotFoundError('DataRequest', id);

    // 幂等分支：已 exported 且文件在 → 返回已有文件
    if (row.status === 'exported' && row.filePath && exportFileExists(row.filePath)) {
      return reply.send({
        data: {
          id: row.id,
          status: 'exported',
          filePath: row.filePath,
          fileExpiresAt: row.fileExpiresAt,
          message: '复用已有导出文件（幂等）',
        },
        message: '导出文件已存在',
      });
    }
    if (row.status !== 'approved' && row.status !== 'exported') {
      throw new AppError(`当前状态（${row.status}）不允许生成导出文件，仅 approved 可 export`, 400, 'INVALID_STATE');
    }

    // 聚合数据 → 落盘
    const data = await gatherUserData(row.userId, row.dataScope);
    ensureExportDir();
    const relPath = writeExportFile(row.id, data);

    const [updated] = await db
      .update(schema.dataRequests)
      .set({
        status: 'exported',
        filePath: relPath,
        fileExpiresAt: sql`NOW() + (${EXPORT_FILE_TTL_HOURS} || ' hours')::interval`,
        updatedAt: new Date(),
      })
      .where(eq(schema.dataRequests.id, id))
      .returning();
    await writeAudit(request, 'data_requests.export', id, {
      userId: row.userId,
      dataScope: row.dataScope,
      filePath: relPath,
      fileExpiresAtHours: EXPORT_FILE_TTL_HOURS,
    });
    return reply.send({
      data: { id: updated!.id, status: updated!.status, filePath: updated!.filePath, fileExpiresAt: updated!.fileExpiresAt },
      message: '导出文件已生成',
    });
  });
}
