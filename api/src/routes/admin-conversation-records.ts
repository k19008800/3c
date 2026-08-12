/**
 * 对话上下文留痕 — 后台查询 API（仅管理员）
 *
 * 用途：交易纠纷举证 / 政府调证 —— 管理员后台查询、回放、导出。
 * 端点：
 *   GET /api/v1/admin/conversation-records           — 列表 + 组合筛选 + 分页
 *   GET /api/v1/admin/conversation-records/retention — 读取保留策略 + 上次执行
 *   PUT /api/v1/admin/conversation-records/retention — 保存保留策略
 *   POST /api/v1/admin/conversation-records/retention/run — 立即执行清理
 *   GET /api/v1/admin/conversation-records/:requestId — 单条详情（会话回放）
 *   GET /api/v1/admin/conversation-records/export     — 导出当前筛选结果（csv / json）
 *
 * 每次查询 / 导出写入 audit_logs，满足「谁能查、查了什么」的监管留痕要求。
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, gte, lte, like, sql, desc, count } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, ValidationError } from '../lib/errors';
import {
  readRetentionConfig,
  saveRetentionConfig,
  runRetentionNow,
  parseRetentionConfig,
  pollPeriodKey,
  RETAIN_UNITS,
  POLL_UNITS,
  type RetainUnit,
  type PollUnit,
} from '../services/audit/retention';

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

/* ───────── 写审计日志（查询/导出留痕） ───────── */

async function writeAudit(request: any, action: string, resourceId: string | null, details: unknown) {
  const ctx = request.userContext ?? {};
  await db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource: 'conversation_record',
    resourceId,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/* ───────── 解析工具 ───────── */

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

function parseOptionalDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) throw new ValidationError(`Invalid date: ${value}`);
  return d;
}

/** jsonb 全文关键词检索：messages::text ILIKE '%kw%' */
function messagesKeyword(kw: string) {
  return sql`${schema.conversationContextRecords.messages}::text ILIKE ${'%' + kw + '%'}`;
}

/* ───────── 筛选条件构建 ───────── */

function buildFilters(query: Record<string, unknown>) {
  const conds = [];

  if (query.requestId) conds.push(eq(schema.conversationContextRecords.requestId, String(query.requestId)));
  if (query.userId) conds.push(eq(schema.conversationContextRecords.userId, parsePositiveInt(query.userId, 0)));
  if (query.apiKeyId) conds.push(eq(schema.conversationContextRecords.apiKeyId, parsePositiveInt(query.apiKeyId, 0)));
  if (query.supplierId) conds.push(eq(schema.conversationContextRecords.supplierId, parsePositiveInt(query.supplierId, 0)));
  if (query.model) conds.push(like(schema.conversationContextRecords.requestedModel, `%${String(query.model)}%`));
  if (query.status) conds.push(eq(schema.conversationContextRecords.status, String(query.status)));

  const from = parseOptionalDate(query.from);
  if (from) conds.push(gte(schema.conversationContextRecords.occurredAt, from));
  const to = parseOptionalDate(query.to);
  if (to) conds.push(lte(schema.conversationContextRecords.occurredAt, to));

  const keyword = String(query.keyword ?? '').trim();
  if (keyword) conds.push(messagesKeyword(keyword));

  return conds.length > 0 ? and(...conds) : undefined;
}

/* ───────── route plugin ───────── */

export async function adminConversationRecordsRoutes(app: FastifyInstance) {
  /**
   * 列表 + 组合筛选 + 分页
   * query: page, pageSize, userId, apiKeyId, supplierId, model, status, from, to, keyword, requestId
   */
  app.get('/api/v1/admin/conversation-records', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const page = parsePositiveInt(q.page, 1);
    const pageSize = parsePositiveInt(q.pageSize, 20, 100);
    const where = buildFilters(q);

    // 列表行：含用户邮箱/姓名，便于按人核对
    const rows = await db
      .select({
        requestId: schema.conversationContextRecords.requestId,
        occurredAt: schema.conversationContextRecords.occurredAt,
        completedAt: schema.conversationContextRecords.completedAt,
        userId: schema.conversationContextRecords.userId,
        email: schema.users.email,
        name: schema.users.name,
        requestedModel: schema.conversationContextRecords.requestedModel,
        routedModel: schema.conversationContextRecords.routedModel,
        supplierId: schema.conversationContextRecords.supplierId,
        supplierKeyFp: schema.conversationContextRecords.supplierKeyFp,
        status: schema.conversationContextRecords.status,
        errorCode: schema.conversationContextRecords.errorCode,
        inputTokens: schema.conversationContextRecords.inputTokens,
        outputTokens: schema.conversationContextRecords.outputTokens,
        cost: schema.conversationContextRecords.cost,
        finishReason: schema.conversationContextRecords.finishReason,
        clientIp: schema.conversationContextRecords.clientIp,
      })
      .from(schema.conversationContextRecords)
      .leftJoin(schema.users, eq(schema.conversationContextRecords.userId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.conversationContextRecords.occurredAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const totalRows = await db
      .select({ total: count() })
      .from(schema.conversationContextRecords)
      .where(where);
    const total = totalRows[0]?.total ?? 0;

    await writeAudit(request, 'conversation_records.query', null, { page, pageSize, filters: q });

    return reply.send({
      data: { list: rows, total: Number(total), page, pageSize },
    });
  });

  /**
   * GET /api/v1/admin/conversation-records/retention — 读取保留策略 + 上次执行周期
   */
  app.get('/api/v1/admin/conversation-records/retention', { preHandler: [adminAuth] }, async (request, reply) => {
    const cfg = await readRetentionConfig();
    const [lastRow] = await db.select({ value: schema.systemConfig.value })
      .from(schema.systemConfig)
      .where(sql`${schema.systemConfig.key} = 'conv_retention_last_poll'`);
    await writeAudit(request, 'conversation_records.retention.view', null, {});
    return reply.send({ data: { config: cfg, lastPoll: lastRow?.value ?? null, currentPeriod: pollPeriodKey(cfg.pollUnit) } });
  });

  /**
   * PUT /api/v1/admin/conversation-records/retention — 保存保留策略
   * body: { enabled, retainUnit, retainAmount, pollUnit, pollHour, pollDayOfWeek, pollDayOfMonth, pollMonth }
   */
  app.put('/api/v1/admin/conversation-records/retention', { preHandler: [adminAuth] }, async (request, reply) => {
    const b = (request.body ?? {}) as Record<string, unknown>;
    const cfg = parseRetentionConfig(JSON.stringify(b));
    // 严格校验：若入参含非法值，parse 已兜底为默认；这里再拦非法单位
    if (b.retainUnit !== undefined && !(RETAIN_UNITS as string[]).includes(String(b.retainUnit))) {
      throw new ValidationError(`Invalid retainUnit: ${b.retainUnit}`);
    }
    if (b.pollUnit !== undefined && !(POLL_UNITS as string[]).includes(String(b.pollUnit))) {
      throw new ValidationError(`Invalid pollUnit: ${b.pollUnit}`);
    }
    const saved = await saveRetentionConfig((request as any).userContext?.userId ?? null, cfg);
    await writeAudit(request, 'conversation_records.retention.update', null, { config: saved } as any);
    return reply.send({ data: { config: saved } });
  });

  /**
   * POST /api/v1/admin/conversation-records/retention/run — 立即执行清理
   */
  app.post('/api/v1/admin/conversation-records/retention/run', { preHandler: [adminAuth] }, async (request, reply) => {
    const { deleted, cfg } = await runRetentionNow();
    await writeAudit(request, 'conversation_records.retention.run', null, { deleted, config: cfg } as any);
    return reply.send({ data: { deleted, config: cfg } });
  });

  /**
   * 单条详情 — 会话回放（上文 messages + 响应全文 + 路由/计费明细）
   */
  app.get('/api/v1/admin/conversation-records/:requestId', { preHandler: [adminAuth] }, async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    if (!requestId) throw new ValidationError('requestId is required');

    const rows = await db
      .select({
        record: schema.conversationContextRecords,
        email: schema.users.email,
        name: schema.users.name,
        apiKeyName: schema.apiKeys.name,
        apiKeyPrefix: schema.apiKeys.keyPrefix,
        supplierName: schema.suppliers.name,
      })
      .from(schema.conversationContextRecords)
      .leftJoin(schema.users, eq(schema.conversationContextRecords.userId, schema.users.id))
      .leftJoin(schema.apiKeys, eq(schema.conversationContextRecords.apiKeyId, schema.apiKeys.id))
      .leftJoin(schema.suppliers, eq(schema.conversationContextRecords.supplierId, schema.suppliers.id))
      .where(eq(schema.conversationContextRecords.requestId, requestId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      await writeAudit(request, 'conversation_records.view', requestId, { found: false });
      return reply.status(404).send({ error: { message: 'record not found', code: 404 } });
    }

    await writeAudit(request, 'conversation_records.view', requestId, { found: true });

    return reply.send({ data: row });
  });

  /**
   * 导出当前筛选结果（上限 5 万条）
   * query: format=csv|json，其余筛选同列表
   */
  app.get('/api/v1/admin/conversation-records/export', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const format = String(q.format ?? 'json') === 'csv' ? 'csv' : 'json';
    const where = buildFilters(q);

    const rows = await db
      .select({
        record: schema.conversationContextRecords,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.conversationContextRecords)
      .leftJoin(schema.users, eq(schema.conversationContextRecords.userId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.conversationContextRecords.occurredAt))
      .limit(50000);

    await writeAudit(request, 'conversation_records.export', null, { format, filters: q, exported: rows.length });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'csv') {
      // CSV：内容列太长，仅导出主要字段 + 截断的内容预览
      const header = ['requestId', 'occurredAt', 'userId', 'email', 'name', 'model', 'routedModel', 'supplierId', 'status', 'errorCode', 'inputTokens', 'outputTokens', 'cost', 'finishReason', 'clientIp', 'messagesPreview', 'responsePreview'];
      const esc = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v);
        return '"' + s.replace(/"/g, '""') + '"';
      };
      const lines = rows.map((r) => {
        const rec = r.record;
        const messagesPreview = JSON.stringify(rec.messages ?? []).slice(0, 500);
        const responsePreview = (rec.responseText ?? '').slice(0, 500);
        return [
          rec.requestId, rec.occurredAt, rec.userId, r.email, r.name,
          rec.requestedModel, rec.routedModel, rec.supplierId, rec.status, rec.errorCode,
          rec.inputTokens, rec.outputTokens, rec.cost, rec.finishReason, rec.clientIp,
          messagesPreview, responsePreview,
        ].map(esc).join(',');
      });
      const csv = '﻿' + [header.join(','), ...lines].join('\n'); // BOM 便于 Excel 打开中文
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="conversation-records-${stamp}.csv"`);
      return reply.send(csv);
    }

    // JSON：全量（含 messages / responseText）
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="conversation-records-${stamp}.json"`);
    return reply.send(rows);
  });
}
