/**
 * 管理端安全路由 — /api/v1/admin/security/ip-blacklist + /api/v1/admin/compliance/report（P2-4）
 *
 * IP 黑名单（表 ip_blacklist，对齐 kb/3cloud/admin-security-ip-blacklist.md）：
 *   GET  /api/v1/admin/security/ip-blacklist            — 列表（status/scope/关键字 ip + 分页）
 *   POST /api/v1/admin/security/ip-blacklist            — 添加（单 IP / IPv4 CIDR；同 ip active → 409）
 *   POST /api/v1/admin/security/ip-blacklist/batch      — 批量导入（逐条校验，返回成功/失败数）
 *   PUT  /api/v1/admin/security/ip-blacklist/:id        — 编辑（reason/scope/expires_at/status）
 *   POST /api/v1/admin/security/ip-blacklist/:id/unblock — 解禁（status → unblocked）
 *
 * 合规报告（services/compliance/report.ts）：
 *   GET  /api/v1/admin/compliance/report?type=export_audit|data_access&format=json|csv&days=N
 *
 * 网关拦截 hook 在 app.ts 注册（onRequest，调用 services/security/ip-blacklist.ts checkIpBlocked）。
 * 所有写操作写 audit_logs（action: security.ip_blacklist.*）。
 *
 * @module routes
 * @see kb/3cloud/admin-security-ip-blacklist.md
 * @see docs/iteration-plan-v2.md P2-4
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { and, desc, eq, ilike, or, sql, count as drizzleCount } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { isValidIpOrCidr } from '../services/security/ip-blacklist';
import { buildComplianceReport, normalizePeriodDays, reportToCsv, type ComplianceReportType } from '../services/compliance/report';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  AppError,
} from '../lib/errors';

/** 合法 scope */
const VALID_SCOPES = ['api', 'admin', 'all'] as const;
/** 合法 status */
const VALID_STATUSES = ['active', 'unblocked'] as const;
/** 合法来源 */
const VALID_SOURCES = ['manual', 'risk', 'apikey', 'import'] as const;
/** 合规报告合法类型 */
const VALID_REPORT_TYPES: ComplianceReportType[] = ['export_audit', 'data_access'];

// ── 认证 / 审计 helpers ─────────────────────────────────

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
function writeAudit(request: any, action: string, resourceId: string | number | null, details: Record<string, unknown>) {
  const ctx = request.userContext ?? {};
  return db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource: 'ip_blacklist',
    resourceId: resourceId != null ? String(resourceId) : null,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/** 解析分页参数 */
function parsePagination(q: Record<string, string | undefined>) {
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || q.page_size || '20', 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/**
 * 解析可选过期时间（ISO 字符串 / null）。
 *
 * @param raw - 原始输入
 * @returns Date 或 null（永久）
 * @throws {ValidationError} 400 非法时间格式
 */
function parseExpiresAt(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) throw new ValidationError('expires_at 时间格式非法（需 ISO 8601）');
  return d;
}

/**
 * 校验单条黑名单输入并归一化。
 *
 * @param item - 原始输入 { ip, reason?, scope?, expires_at?, source?, remark? }
 * @returns 归一化插入值
 * @throws {ValidationError} 400 格式非法
 */
function normalizeBlacklistInput(item: Record<string, unknown>, defaultSource: string) {
  const ip = String(item.ip ?? '').trim();
  if (!isValidIpOrCidr(ip)) throw new ValidationError(`IP 或 CIDR 格式非法：${ip || '(empty)'}`);
  const scope = String(item.scope || 'api');
  if (!(VALID_SCOPES as readonly string[]).includes(scope)) throw new ValidationError(`scope 必须为 ${VALID_SCOPES.join(' / ')}`);
  const source = String(item.source || defaultSource);
  if (!(VALID_SOURCES as readonly string[]).includes(source)) throw new ValidationError(`source 必须为 ${VALID_SOURCES.join(' / ')}`);
  const expiresAt = parseExpiresAt(item.expires_at ?? item.expiresAt);
  return {
    ip,
    type: ip.includes('/') ? 'cidr' : 'single',
    reason: item.reason != null ? String(item.reason).slice(0, 200) : null,
    scope,
    source,
    expiresAt,
    remark: item.remark != null ? String(item.remark).slice(0, 1000) : null,
  };
}

/** 检查同 ip 是否已有 active 黑名单（重复添加冲突） */
async function hasActiveEntry(ip: string, excludeId?: number): Promise<boolean> {
  const conditions: any[] = [and(eq(schema.ipBlacklist.ip, ip), eq(schema.ipBlacklist.status, 'active'))];
  if (excludeId) conditions.push(sql`${schema.ipBlacklist.id} != ${excludeId}`);
  const [row] = await db
    .select({ id: schema.ipBlacklist.id })
    .from(schema.ipBlacklist)
    .where(and(...conditions))
    .limit(1);
  return !!row;
}

/** 黑名单记录 DTO */
function toDTO(row: any, creatorName?: string | null) {
  return {
    id: row.id,
    ip: row.ip,
    type: row.type,
    reason: row.reason,
    source: row.source,
    scope: row.scope,
    status: row.status,
    createdBy: row.createdBy,
    creatorName: creatorName ?? null,
    expiresAt: row.expiresAt,
    remark: row.remark,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function adminSecurityRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/admin/security/ip-blacklist — 黑名单列表
   *
   * 筛选：status / scope / ip（模糊关键字）；分页。
   */
  app.get('/api/v1/admin/security/ip-blacklist', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const q = (request.query || {}) as Record<string, string | undefined>;
    const { page, pageSize, offset } = parsePagination(q);
    const conditions: any[] = [];
    if (q.status) conditions.push(eq(schema.ipBlacklist.status, String(q.status)));
    if (q.scope) conditions.push(eq(schema.ipBlacklist.scope, String(q.scope)));
    if (q.ip) conditions.push(ilike(schema.ipBlacklist.ip, `%${String(q.ip).trim()}%`));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.select({
        id: schema.ipBlacklist.id,
        ip: schema.ipBlacklist.ip,
        type: schema.ipBlacklist.type,
        reason: schema.ipBlacklist.reason,
        source: schema.ipBlacklist.source,
        scope: schema.ipBlacklist.scope,
        status: schema.ipBlacklist.status,
        createdBy: schema.ipBlacklist.createdBy,
        creatorName: schema.users.name,
        expiresAt: schema.ipBlacklist.expiresAt,
        remark: schema.ipBlacklist.remark,
        createdAt: schema.ipBlacklist.createdAt,
        updatedAt: schema.ipBlacklist.updatedAt,
      })
        .from(schema.ipBlacklist)
        .leftJoin(schema.users, eq(schema.ipBlacklist.createdBy, schema.users.id))
        .where(whereClause)
        .orderBy(desc(schema.ipBlacklist.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ v: drizzleCount() }).from(schema.ipBlacklist).where(whereClause),
    ]);

    return reply.send({
      data: {
        list: rows.map((r) => toDTO(r, r.creatorName)),
        total: Number(totalRows[0]?.v ?? 0),
        page,
        pageSize,
      },
    });
  });

  /**
   * POST /api/v1/admin/security/ip-blacklist — 添加黑名单（单 IP / IPv4 CIDR）
   *
   * @param ip - 单个 IP 或 CIDR 网段（必填）
   * @param reason - 封禁原因（可选）
   * @param scope - 'api' | 'admin' | 'all'（默认 api）
   * @param expires_at - 过期时间（可选，null/缺省 = 永久）
   * @param source - 来源（默认 manual）
   * @param remark - 备注（可选）
   * @throws {ValidationError} 400 格式非法
   * @throws {AppError} 409 DUPLICATE 同 ip 已存在 active 黑名单
   */
  app.post('/api/v1/admin/security/ip-blacklist', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const normalized = normalizeBlacklistInput(body, 'manual');

    if (await hasActiveEntry(normalized.ip)) {
      throw new AppError(`IP ${normalized.ip} 已在黑名单中（active）`, 409, 'DUPLICATE', { ip: normalized.ip });
    }

    const adminId = request.userContext.userId;
    const [created] = await db
      .insert(schema.ipBlacklist)
      .values({
        ip: normalized.ip,
        type: normalized.type,
        reason: normalized.reason,
        source: normalized.source,
        scope: normalized.scope,
        status: 'active',
        createdBy: adminId,
        expiresAt: normalized.expiresAt,
        remark: normalized.remark,
      })
      .returning();
    if (!created) throw new AppError('黑名单添加失败', 500, 'IP_BLACKLIST_CREATE_FAILED');

    await writeAudit(request, 'security.ip_blacklist.create', created.id, {
      ip: created.ip, type: created.type, scope: created.scope, expiresAt: created.expiresAt,
    });
    return reply.status(201).send({ data: toDTO(created), message: `IP ${created.ip} 已加入黑名单` });
  });

  /**
   * POST /api/v1/admin/security/ip-blacklist/batch — 批量导入
   *
   * 逐条校验：格式非法 / 与已有 active 重复 → 记为失败并跳过；其余插入。
   * 返回成功/失败数与逐条错误原因。
   *
   * @param items - [{ ip, reason?, scope?, expires_at? }]
   */
  app.post('/api/v1/admin/security/ip-blacklist/batch', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const body = (request.body || {}) as { items?: unknown };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) throw new ValidationError('items 不能为空数组');
    if (items.length > 500) throw new ValidationError('单次批量导入最多 500 条');

    const adminId = request.userContext.userId;
    let success = 0;
    const errors: Array<{ index: number; ip: string; reason: string }> = [];

    for (let i = 0; i < items.length; i++) {
      const raw = items[i];
      const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const ip = String(item.ip ?? '').trim();
      try {
        const normalized = normalizeBlacklistInput(item, 'import');
        if (await hasActiveEntry(normalized.ip)) {
          errors.push({ index: i, ip, reason: '该 IP 已有 active 黑名单' });
          continue;
        }
        await db.insert(schema.ipBlacklist).values({
          ip: normalized.ip,
          type: normalized.type,
          reason: normalized.reason,
          source: normalized.source,
          scope: normalized.scope,
          status: 'active',
          createdBy: adminId,
          expiresAt: normalized.expiresAt,
          remark: normalized.remark,
        });
        success++;
      } catch (err) {
        const message = err instanceof ValidationError ? err.message : (err instanceof Error ? err.message : String(err));
        errors.push({ index: i, ip, reason: message });
      }
    }

    await writeAudit(request, 'security.ip_blacklist.batch', null, { total: items.length, success, failed: errors.length });
    return reply.send({
      data: { success, failed: errors.length, total: items.length, errors },
      message: `批量导入完成：成功 ${success} 条，失败 ${errors.length} 条`,
    });
  });

  /**
   * PUT /api/v1/admin/security/ip-blacklist/:id — 编辑黑名单
   *
   * 可改字段：reason / scope / expires_at / status（其余字段不可改）。
   *
   * @throws {NotFoundError} 404
   */
  app.put('/api/v1/admin/security/ip-blacklist/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseInt(String(request.params.id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid id');
    const body = (request.body || {}) as Record<string, unknown>;

    const [row] = await db.select().from(schema.ipBlacklist).where(eq(schema.ipBlacklist.id, id)).limit(1);
    if (!row) throw new NotFoundError('IpBlacklist', id);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.reason !== undefined) patch.reason = String(body.reason).slice(0, 200);
    if (body.scope !== undefined) {
      const scope = String(body.scope);
      if (!(VALID_SCOPES as readonly string[]).includes(scope)) throw new ValidationError(`scope 必须为 ${VALID_SCOPES.join(' / ')}`);
      patch.scope = scope;
    }
    if (body.expires_at !== undefined || body.expiresAt !== undefined) {
      patch.expiresAt = parseExpiresAt(body.expires_at ?? body.expiresAt);
    }
    if (body.status !== undefined) {
      const status = String(body.status);
      if (!(VALID_STATUSES as readonly string[]).includes(status)) throw new ValidationError(`status 必须为 ${VALID_STATUSES.join(' / ')}`);
      patch.status = status;
    }
    if (Object.keys(patch).length <= 1) throw new ValidationError('没有可更新的字段（reason/scope/expires_at/status）');

    const [updated] = await db
      .update(schema.ipBlacklist)
      .set(patch)
      .where(eq(schema.ipBlacklist.id, id))
      .returning();
    await writeAudit(request, 'security.ip_blacklist.update', id, { ip: row.ip, patch: { ...patch, updatedAt: undefined } });
    return reply.send({ data: toDTO(updated), message: '黑名单已更新' });
  });

  /**
   * POST /api/v1/admin/security/ip-blacklist/:id/unblock — 解禁（status → unblocked）
   *
   * 幂等：已是 unblocked 也返回成功。解禁后 checkIpBlocked 不再命中。
   */
  app.post('/api/v1/admin/security/ip-blacklist/:id/unblock', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseInt(String(request.params.id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid id');

    const [row] = await db.select().from(schema.ipBlacklist).where(eq(schema.ipBlacklist.id, id)).limit(1);
    if (!row) throw new NotFoundError('IpBlacklist', id);

    if (row.status !== 'unblocked') {
      const [updated] = await db
        .update(schema.ipBlacklist)
        .set({ status: 'unblocked', updatedAt: new Date() })
        .where(eq(schema.ipBlacklist.id, id))
        .returning();
      await writeAudit(request, 'security.ip_blacklist.unblock', id, { ip: row.ip });
      return reply.send({ data: toDTO(updated), message: `IP ${row.ip} 已解禁` });
    }
    return reply.send({ data: toDTO(row), message: `IP ${row.ip} 已是解禁状态` });
  });

  /**
   * GET /api/v1/admin/compliance/report — 合规报告
   *
   * 参数：
   *   type   - 'export_audit'（导出审计）| 'data_access'（数据访问），默认 export_audit
   *   format - 'json' | 'csv'，默认 json
   *   days   - 统计周期天数，默认 30（上限 3650）
   *
   * 格式约定见 services/compliance/report.ts 文件头注释。
   */
  app.get('/api/v1/admin/compliance/report', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const q = (request.query || {}) as Record<string, string | undefined>;
    const type = String(q.type || 'export_audit') as ComplianceReportType;
    if (!(VALID_REPORT_TYPES as string[]).includes(type)) {
      throw new ValidationError(`type 必须为 ${VALID_REPORT_TYPES.join(' / ')}`);
    }
    const days = normalizePeriodDays(q.days);
    const format = String(q.format || 'json');

    const report = await buildComplianceReport(type, days);

    if (format === 'csv') {
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="compliance-${type}.csv"`);
      return reply.send(reportToCsv(report));
    }
    return reply.send({ data: report });
  });
}
