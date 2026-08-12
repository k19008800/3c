/**
 * 管理端额度管理 API
 *
 * 端点覆盖：
 *   GET   /api/v1/admin/credit/meta               — 全局限流默认值（企业/个人）+ 模型硬顶列表
 *   GET   /api/v1/admin/credit/customers          — 搜索客户（邮箱/名称，附已开例外数）
 *   GET   /api/v1/admin/credit/rules              — 客户全部例外规则（含变更历史）
 *   POST  /api/v1/admin/credit/rules              — 批量开通例外（多模型一条规则一个 + 写历史）
 *   PATCH /api/v1/admin/credit/rules/:id          — 编辑例外 + 写历史
 *   POST  /api/v1/admin/credit/rules/:id/toggle   — 停用 / 启用 + 写历史
 *   GET   /api/v1/admin/credit/rules/:id/history  — 单条规则变更历史
 *
 * 生效值模型（前端解析，后端只存例外规则与全局基线）：
 *   生效值 = min(客户例外 ?? 企业/个人默认, 模型全局限流硬顶)
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';

/* ───────── helpers ───────── */

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

/** 全局限流默认键（与限流设置页 /admin/settings 共用） */
const DEFAULT_KEYS = [
  'enterprise_rpm',
  'enterprise_tpm',
  'personal_rpm',
  'personal_tpm',
] as const;
const DEFAULTS: Record<string, number> = {
  enterprise_rpm: 300,
  enterprise_tpm: 1_000_000,
  personal_rpm: 60,
  personal_tpm: 200_000,
};

/** 读取系统配置值（字符串 → number，带默认兜底） */
async function getConfigNumber(key: string): Promise<number> {
  const [row] = await db
    .select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, key));
  if (!row) return DEFAULTS[key] ?? 0;
  const n = parseInt(row.value, 10);
  return isNaN(n) ? (DEFAULTS[key] ?? 0) : n;
}

function parseId(id: string, label = 'id'): number {
  const n = parseInt(id, 10);
  if (isNaN(n) || n <= 0) throw new ValidationError(`Invalid ${label}`);
  return n;
}

/** 写审计日志 */
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

/* ───────── route plugin ───────── */

export async function adminCreditRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/admin/credit/meta — 全局限流默认值 + 模型硬顶
   */
  app.get('/api/v1/admin/credit/meta', { preHandler: [adminAuth] }, async (_request, reply) => {
    const [erpm, etpm, prpm, ptpm] = await Promise.all([
      getConfigNumber('enterprise_rpm'),
      getConfigNumber('enterprise_tpm'),
      getConfigNumber('personal_rpm'),
      getConfigNumber('personal_tpm'),
    ]);
    const models = await db
      .select({
        name: schema.modelRateLimits.modelName,
        vendor: schema.modelRateLimits.vendor,
        capRpm: schema.modelRateLimits.capRpm,
        capTpm: schema.modelRateLimits.capTpm,
        baseRpm: schema.modelRateLimits.baseRpm,
        baseTpm: schema.modelRateLimits.baseTpm,
      })
      .from(schema.modelRateLimits)
      .orderBy(schema.modelRateLimits.id);

    return reply.send({
      data: {
        defaults: {
          enterprise: { rpm: erpm, tpm: etpm },
          personal: { rpm: prpm, tpm: ptpm },
        },
        models: models.map((m) => ({
          name: m.name,
          vendor: m.vendor,
          capRpm: m.capRpm,
          capTpm: m.capTpm,
          baseRpm: m.baseRpm,
          baseTpm: m.baseTpm,
        })),
      },
    });
  });

  /**
   * GET /api/v1/admin/credit/customers?kw=&type= — 搜索客户（附已开例外数）
   */
  app.get('/api/v1/admin/credit/customers', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { kw?: string; type?: string };
    const conditions: any[] = [eq(schema.users.role, 'customer')];
    if (q.kw) {
      conditions.push(
        sql`(${schema.users.email} ILIKE ${'%' + q.kw + '%'} OR ${schema.users.name} ILIKE ${'%' + q.kw + '%'})`,
      );
    }
    if (q.type === 'enterprise' || q.type === 'personal') {
      conditions.push(eq(schema.users.customerType, q.type));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        type: schema.users.customerType,
      })
      .from(schema.users)
      .where(whereClause)
      .orderBy(desc(schema.users.createdAt))
      .limit(50);

    // 已开例外数（规则 + 客户）聚合
    const ids = rows.map((r) => r.id);
    const counts = ids.length
      ? await db
          .select({
            customerId: schema.quotaExceptionRules.customerId,
            cnt: sql<number>`count(*)`,
          })
          .from(schema.quotaExceptionRules)
          .where(and(
            inArray(schema.quotaExceptionRules.customerId, ids),
            eq(schema.quotaExceptionRules.status, 'active'),
          ))
          .groupBy(schema.quotaExceptionRules.customerId)
      : [];
    const countMap = new Map(counts.map((c) => [c.customerId, Number(c.cnt)]));

    return reply.send({
      data: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        type: r.type,
        activeRuleCount: countMap.get(r.id) ?? 0,
      })),
    });
  });

  /**
   * GET /api/v1/admin/credit/customers/:id — 单个客户（额度页 ?customer=<id> 直达定位）
   */
  app.get('/api/v1/admin/credit/customers/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseId(request.params.id, 'customer_id');
    const [row] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        type: schema.users.customerType,
      })
      .from(schema.users)
      .where(and(eq(schema.users.id, id), eq(schema.users.role, 'customer')));
    if (!row) throw new NotFoundError('Customer');

    const [cnt] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.quotaExceptionRules)
      .where(and(eq(schema.quotaExceptionRules.customerId, id), eq(schema.quotaExceptionRules.status, 'active')));

    return reply.send({
      data: { id: row.id, email: row.email, name: row.name, type: row.type, activeRuleCount: Number(cnt?.n ?? 0) },
    });
  });

  /**
   * GET /api/v1/admin/credit/rules?customer_id= — 客户全部例外规则（含变更历史）
   */
  app.get('/api/v1/admin/credit/rules', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const customerId = parseId(request.query?.customer_id, 'customer_id');
    const rules = await db
      .select()
      .from(schema.quotaExceptionRules)
      .where(eq(schema.quotaExceptionRules.customerId, customerId))
      .orderBy(desc(schema.quotaExceptionRules.createdAt));

    if (rules.length === 0) return reply.send({ data: [] });

    const ruleIds = rules.map((r) => r.id);
    const histRows = await db
      .select()
      .from(schema.quotaExceptionHistory)
      .where(inArray(schema.quotaExceptionHistory.ruleId, ruleIds))
      .orderBy(desc(schema.quotaExceptionHistory.createdAt));

    const histByRule = new Map<number, typeof histRows>();
    for (const h of histRows) {
      if (!histByRule.has(h.ruleId)) histByRule.set(h.ruleId, []);
      histByRule.get(h.ruleId)!.push(h);
    }

    // 操作人邮箱
    const operatorIds = [...new Set(histRows.map((h) => h.operatorId).filter(Boolean))] as number[];
    const ops = operatorIds.length
      ? await db
          .select({ id: schema.users.id, email: schema.users.email })
          .from(schema.users)
          .where(inArray(schema.users.id, operatorIds))
      : [];
    const opEmail = new Map(ops.map((o) => [o.id, o.email]));

    const list = rules.map((r) => {
      const hist = (histByRule.get(r.id) ?? []).map((h) => ({
        t: h.createdAt,
        op: h.op,
        who: h.operatorId ? (opEmail.get(h.operatorId) ?? `#${h.operatorId}`) : '—',
        note: h.note ?? '',
        beforeRpm: h.beforeRpm,
        beforeTpm: h.beforeTpm,
        afterRpm: h.afterRpm,
        afterTpm: h.afterTpm,
      }));
      return {
        id: r.id,
        customerId: r.customerId,
        model: r.modelName,
        rpm: r.rpm,
        tpm: r.tpm,
        period: r.period,
        start: r.startDate,
        end: r.endDate,
        status: r.status,
        reason: r.reason ?? '',
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
        history: hist,
      };
    });

    return reply.send({ data: list });
  });

  /**
   * GET /api/v1/admin/credit/rules/:id/history — 单条规则变更历史
   */
  app.get('/api/v1/admin/credit/rules/:id/history', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseId(request.params.id);
    const [rule] = await db
      .select()
      .from(schema.quotaExceptionRules)
      .where(eq(schema.quotaExceptionRules.id, id));
    if (!rule) throw new NotFoundError('Rule');

    const histRows = await db
      .select()
      .from(schema.quotaExceptionHistory)
      .where(eq(schema.quotaExceptionHistory.ruleId, id))
      .orderBy(desc(schema.quotaExceptionHistory.createdAt));

    const operatorIds = [...new Set(histRows.map((h) => h.operatorId).filter(Boolean))] as number[];
    const ops = operatorIds.length
      ? await db
          .select({ id: schema.users.id, email: schema.users.email })
          .from(schema.users)
          .where(inArray(schema.users.id, operatorIds))
      : [];
    const opEmail = new Map(ops.map((o) => [o.id, o.email]));

    return reply.send({
      data: histRows.map((h) => ({
        t: h.createdAt,
        op: h.op,
        who: h.operatorId ? (opEmail.get(h.operatorId) ?? `#${h.operatorId}`) : '—',
        note: h.note ?? '',
      })),
    });
  });

  /**
   * POST /api/v1/admin/credit/rules — 批量开通例外
   * body: { customerId, models: [{ model, rpm, tpm }], period, start?, end?, reason }
   * 同一 quota 批量下发给多个模型，每个模型一条规则 + 各写一条「开通」历史。
   */
  app.post('/api/v1/admin/credit/rules', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const body = (request.body || {}) as {
      customerId: number;
      models: Array<{ model: string; rpm: number | null; tpm: number | null }>;
      period: string;
      start?: string;
      end?: string;
      reason?: string;
    };
    const { customerId, period = 'forever', start, end, reason = '' } = body;
    const models = Array.isArray(body.models) ? body.models : [];

    if (!Number.isInteger(customerId)) throw new ValidationError('customerId is required');
    if (models.length === 0) throw new ValidationError('至少选择一个模型');
    if (!reason.trim()) throw new ValidationError('原因备注为必填');
    if (period === 'range' && (!start || !end)) throw new ValidationError('指定范围需提供起止日期');
    if (period === 'range' && start! > end!) throw new ValidationError('开始日期不能晚于结束日期');

    // 客户必须存在且为 customer 角色
    const [cust] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, customerId), eq(schema.users.role, 'customer')));
    if (!cust) throw new NotFoundError('Customer');

    const ctx = request.userContext ?? {};
    const operatorId = ctx.userId ?? null;

    // 同一客户×模型已存在规则时，更新而不是重复插入
    const created: any[] = [];
    for (const m of models) {
      if (!m.model || (m.rpm == null && m.tpm == null)) throw new ValidationError(`模型 ${m.model ?? ''} 需至少填写 RPM 或 TPM`);

      const [existing] = await db
        .select({ id: schema.quotaExceptionRules.id })
        .from(schema.quotaExceptionRules)
        .where(and(
          eq(schema.quotaExceptionRules.customerId, customerId),
          eq(schema.quotaExceptionRules.modelName, m.model),
        ));

      if (existing) {
        const [row] = await db
          .update(schema.quotaExceptionRules)
          .set({
            rpm: m.rpm,
            tpm: m.tpm,
            period,
            startDate: period === 'range' ? start! : null,
            endDate: period === 'range' ? end! : null,
            status: 'active',
            reason,
            updatedBy: operatorId,
            updatedAt: sql`NOW()`,
          })
          .where(eq(schema.quotaExceptionRules.id, existing.id))
          .returning();
        if (!row) throw new NotFoundError('Rule');
        await db.insert(schema.quotaExceptionHistory).values({
          ruleId: row.id,
          op: '编辑',
          operatorId,
          beforeRpm: null,
          beforeTpm: null,
          afterRpm: m.rpm,
          afterTpm: m.tpm,
          note: reason,
        });
        created.push(row);
      } else {
        const [row] = await db
          .insert(schema.quotaExceptionRules)
          .values({
            customerId,
            modelName: m.model,
            rpm: m.rpm,
            tpm: m.tpm,
            period,
            startDate: period === 'range' ? start! : null,
            endDate: period === 'range' ? end! : null,
            status: 'active',
            reason,
            createdBy: operatorId,
          })
          .returning();
        if (!row) throw new NotFoundError('Rule');
        await db.insert(schema.quotaExceptionHistory).values({
          ruleId: row.id,
          op: '开通',
          operatorId,
          beforeRpm: null,
          beforeTpm: null,
          afterRpm: m.rpm,
          afterTpm: m.tpm,
          note: reason,
        });
        created.push(row);
      }
    }

    await writeAudit(request, 'quota.open', 'quota_exception_rule', null, {
      customerId,
      models: models.map((m) => m.model),
      reason,
    });

    return reply.send({
      data: created.map((r) => ({ id: r.id, customerId: r.customerId, model: r.modelName })),
    });
  });

  /**
   * PATCH /api/v1/admin/credit/rules/:id — 编辑例外
   * body: { rpm, tpm, period?, start?, end?, reason }
   */
  app.patch('/api/v1/admin/credit/rules/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseId(request.params.id);
    const body = (request.body || {}) as {
      rpm: number | null;
      tpm: number | null;
      period?: string;
      start?: string;
      end?: string;
      reason?: string;
    };
    if (body.rpm == null && body.tpm == null) throw new ValidationError('需至少填写 RPM 或 TPM');
    const reason = (body.reason ?? '').trim();
    if (!reason) throw new ValidationError('原因备注为必填');

    const [rule] = await db
      .select()
      .from(schema.quotaExceptionRules)
      .where(eq(schema.quotaExceptionRules.id, id));
    if (!rule) throw new NotFoundError('Rule');

    const period = body.period ?? rule.period;
    const start = body.start ?? rule.startDate;
    const end = body.end ?? rule.endDate;
    if (period === 'range' && (!start || !end)) throw new ValidationError('指定范围需提供起止日期');
    if (period === 'range' && start! > end!) throw new ValidationError('开始日期不能晚于结束日期');

    const ctx = request.userContext ?? {};
    const operatorId = ctx.userId ?? null;

    const [row] = await db
      .update(schema.quotaExceptionRules)
      .set({
        rpm: body.rpm,
        tpm: body.tpm,
        period,
        startDate: period === 'range' ? start! : null,
        endDate: period === 'range' ? end! : null,
        reason,
        updatedBy: operatorId,
        updatedAt: sql`NOW()`,
      })
      .where(eq(schema.quotaExceptionRules.id, id))
      .returning();
    if (!row) throw new NotFoundError('Rule');

    await db.insert(schema.quotaExceptionHistory).values({
      ruleId: id,
      op: '编辑',
      operatorId,
      beforeRpm: rule.rpm,
      beforeTpm: rule.tpm,
      afterRpm: body.rpm,
      afterTpm: body.tpm,
      note: reason,
    });

    await writeAudit(request, 'quota.update', 'quota_exception_rule', String(id), {
      customerId: rule.customerId,
      model: rule.modelName,
      reason,
    });

    return reply.send({ data: { id: row.id } });
  });

  /**
   * POST /api/v1/admin/credit/rules/:id/toggle — 停用 / 启用
   */
  app.post('/api/v1/admin/credit/rules/:id/toggle', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseId(request.params.id);
    const [rule] = await db
      .select()
      .from(schema.quotaExceptionRules)
      .where(eq(schema.quotaExceptionRules.id, id));
    if (!rule) throw new NotFoundError('Rule');

    const ctx = request.userContext ?? {};
    const operatorId = ctx.userId ?? null;
    const nextStatus = rule.status === 'active' ? 'stopped' : 'active';
    const op = nextStatus === 'stopped' ? '停用' : '启用';

    await db
      .update(schema.quotaExceptionRules)
      .set({ status: nextStatus, updatedBy: operatorId, updatedAt: sql`NOW()` })
      .where(eq(schema.quotaExceptionRules.id, id));

    await db.insert(schema.quotaExceptionHistory).values({
      ruleId: id,
      op,
      operatorId,
      beforeRpm: rule.rpm,
      beforeTpm: rule.tpm,
      afterRpm: rule.rpm,
      afterTpm: rule.tpm,
      note: op === '停用' ? '手动停用，恢复默认' : '手动重新启用',
    });

    await writeAudit(request, 'quota.toggle', 'quota_exception_rule', String(id), {
      customerId: rule.customerId,
      model: rule.modelName,
      nextStatus,
    });

    return reply.send({ data: { id, status: nextStatus } });
  });
}
