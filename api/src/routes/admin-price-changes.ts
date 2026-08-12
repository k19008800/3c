/**
 * 管理端价格变更通知 API
 *
 * 端点覆盖：
 *   GET   /api/v1/admin/price-changes              — 变更日志列表（筛选/分页）
 *   GET   /api/v1/admin/price-changes/stats        — 顶部统计卡（今日变更/待分发/本月影响/紧急通知）
 *   GET   /api/v1/admin/price-changes/:id          — 单条详情
 *   GET   /api/v1/admin/price-changes/:id/impact   — 影响分析（Top10 + 分布 + 替代建议）
 *   POST  /api/v1/admin/price-changes/:id/notify   — 手动重新触发分发
 *   GET   /api/v1/admin/price-changes/dispatch-logs— 分发执行日志（Tab2）
 *   GET   /api/v1/admin/substitutability           — 可替代性系数列表（Tab3）
 *   PATCH /api/v1/admin/substitutability           — 手动覆盖系数
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, gte, lte, inArray, desc, sql } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { evaluateLog, dispatchPriceChange, renotifyPriceChange, computeSubstitutability } from '../services/price-notification';

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

function intParam(params: Record<string, unknown>, key: string): number {
  const v = parseInt(String(params[key]), 10);
  if (isNaN(v)) throw new ValidationError(`Invalid ${key}`);
  return v;
}

interface PriceChangeQuery {
  page?: string;
  pageSize?: string;
  keyword?: string;
  modelId?: string;
  vendorId?: string;
  changeType?: string;   // cost / sale / both
  dispatched?: string;
  startDate?: string;
  endDate?: string;
}

function parsePagination(query: PriceChangeQuery) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || '20', 10) || 20));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

/** 变更类型推断：input/output 是否变化 */
function changeTypeOf(log: any): 'cost' | 'sale' | 'both' {
  const inputChanged = log.oldInputPrice !== log.newInputPrice;
  const outputChanged = log.oldOutputPrice !== log.newOutputPrice;
  if (inputChanged && outputChanged) return 'both';
  if (outputChanged) return 'sale';
  return 'cost';
}

/* ───────── route plugin ───────── */

export async function adminPriceChangeRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/price-changes — 变更日志列表 */
  app.get('/api/v1/admin/price-changes', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as PriceChangeQuery;
    const { page, pageSize, offset } = parsePagination(q);

    const conditions: any[] = [];
    if (q.modelId) conditions.push(eq(schema.priceChangeLogs.supplierModelId, Number(q.modelId)));
    if (q.vendorId) conditions.push(eq(schema.priceChangeLogs.vendorId, Number(q.vendorId)));
    if (q.changeType === 'cost') conditions.push(sql`${schema.priceChangeLogs.oldInputPrice} <> ${schema.priceChangeLogs.newInputPrice}`);
    if (q.changeType === 'sale') conditions.push(sql`${schema.priceChangeLogs.oldOutputPrice} <> ${schema.priceChangeLogs.newOutputPrice}`);
    if (q.changeType === 'both') conditions.push(sql`(${schema.priceChangeLogs.oldInputPrice} <> ${schema.priceChangeLogs.newInputPrice} AND ${schema.priceChangeLogs.oldOutputPrice} <> ${schema.priceChangeLogs.newOutputPrice})`);
    if (q.dispatched === 'true') conditions.push(eq(schema.priceChangeLogs.dispatched, true));
    if (q.dispatched === 'false') conditions.push(eq(schema.priceChangeLogs.dispatched, false));
    if (q.startDate) conditions.push(gte(schema.priceChangeLogs.effectiveAt, new Date(q.startDate)));
    if (q.endDate) conditions.push(lte(schema.priceChangeLogs.effectiveAt, new Date(q.endDate)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(schema.priceChangeLogs)
        .where(whereClause)
        .orderBy(desc(schema.priceChangeLogs.effectiveAt))
        .limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(schema.priceChangeLogs).where(whereClause),
    ]);

    // 附带模型名/供应商名
    const list = await Promise.all(rows.map(async (log) => {
      const modelRows = await db.select({ modelName: schema.supplierModels.modelName })
        .from(schema.supplierModels)
        .where(eq(schema.supplierModels.id, log.supplierModelId))
        .limit(1);
      const vendorRows = await db.select({ name: schema.suppliers.name })
        .from(schema.suppliers)
        .where(eq(schema.suppliers.id, log.vendorId))
        .limit(1);
      const l: any = { ...log };
      l.model_name = modelRows[0]?.modelName ?? '';
      l.vendor_name = vendorRows[0]?.name ?? '';
      l.change_type = changeTypeOf(log);
      l.change_rate = Number(log.changeRate);
      l.change_pct = Math.abs(Number(log.changeRate));
      l.direction = Number(log.changeRate) >= 0 ? 'up' : 'down';
      return l;
    }));

    return reply.send({
      data: { list, total: Number(countResult[0]?.count ?? 0), page, pageSize },
    });
  });

  /** GET /api/v1/admin/price-changes/stats — 统计卡 */
  app.get('/api/v1/admin/price-changes/stats', { preHandler: [adminAuth] }, async (_request, reply) => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    const [todayCount, pendingCount, monthUsers, monthA] = await Promise.all([
      db.select({ v: sql<number>`count(*)` }).from(schema.priceChangeLogs)
        .where(gte(schema.priceChangeLogs.effectiveAt, startOfDay)),
      db.select({ v: sql<number>`count(*)` }).from(schema.priceChangeLogs)
        .where(eq(schema.priceChangeLogs.dispatched, false)),
      db.select({ v: sql<number>`count(distinct ${schema.userNotifications.userId})` })
        .from(schema.userNotifications)
        .where(gte(schema.userNotifications.createdAt, startOfMonth)),
      db.select({ v: sql<number>`count(*)` }).from(schema.userNotifications)
        .where(and(eq(schema.userNotifications.tier, 'A'), gte(schema.userNotifications.createdAt, startOfMonth))),
    ]);

    return reply.send({
      data: {
        today_changes: Number(todayCount[0]?.v ?? 0),
        pending_changes: Number(pendingCount[0]?.v ?? 0),
        month_impacted_users: Number(monthUsers[0]?.v ?? 0),
        month_urgent: Number(monthA[0]?.v ?? 0),
      },
    });
  });

  /** GET /api/v1/admin/price-changes/:id — 单条详情 */
  app.get('/api/v1/admin/price-changes/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const [log] = await db.select().from(schema.priceChangeLogs)
      .where(eq(schema.priceChangeLogs.id, id))
      .limit(1);
    if (!log) throw new NotFoundError('Price change', id);

    const modelRows = await db.select({ modelName: schema.supplierModels.modelName })
      .from(schema.supplierModels).where(eq(schema.supplierModels.id, log.supplierModelId)).limit(1);
    const vendorRows = await db.select({ name: schema.suppliers.name })
      .from(schema.suppliers).where(eq(schema.suppliers.id, log.vendorId)).limit(1);

    return reply.send({ data: { ...log, model_name: modelRows[0]?.modelName ?? '', vendor_name: vendorRows[0]?.name ?? '' } });
  });

  /** GET /api/v1/admin/price-changes/:id/impact — 影响分析 */
  app.get('/api/v1/admin/price-changes/:id/impact', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    let result;
    try {
      result = await evaluateLog(id);
    } catch (err: any) {
      throw new NotFoundError(err.message || 'Price change');
    }

    const top10 = result.rows.slice(0, 10).map((r) => ({
      user_id: r.userId,
      email: r.email,
      share: r.share,
      coefficient: r.coefficient,
      score: r.score,
      tier: r.tier,
      channel: r.channel === 'in_app+email' ? '站内+邮件' : r.channel === 'in_app' ? '站内' : '—',
      status: r.tier === 'C' ? '仅记录' : '待发送',
    }));

    const alternatives = await (async () => {
      const rows = await db.execute(sql`
        SELECT DISTINCT sm.model_name AS model_name,
               (SELECT vp2.output_price::numeric FROM vendor_pricing vp2
                 JOIN supplier_models sm2 ON sm2.id = vp2.supplier_model_id
                 WHERE sm2.model_name = sm.model_name AND vp2.status = 'active'
                 ORDER BY vp2.output_price::numeric ASC LIMIT 1) AS min_price
        FROM supplier_models sm
        JOIN vendor_pricing vp ON vp.supplier_model_id = sm.id AND vp.status = 'active'
        WHERE sm.model_name <> ${result.model.modelName} AND sm.status = 'active'
        ORDER BY min_price ASC
        LIMIT 3
      `);
      return (rows as any[]).map((r) => ({ model_name: r.model_name, min_price: r.min_price != null ? Number(r.min_price) : null }));
    })();

    return reply.send({
      data: {
        model: result.model,
        old_sale_price: result.oldSalePrice,
        new_sale_price: result.newSalePrice,
        change_rate: result.changeRate,
        effective_at: result.effectiveAt,
        auto_coefficient: result.autoCoefficient,
        effective_coefficient: result.effectiveCoefficient,
        coefficient_basis: result.coefficientBasis,
        tier_distribution: result.tierCounts,
        total_users_evaluated: result.total,
        top_users: top10,
        alternatives,
      },
    });
  });

  /** POST /api/v1/admin/price-changes/:id/notify — 手动重新触发分发 */
  app.post('/api/v1/admin/price-changes/:id/notify', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    try {
      const r = await renotifyPriceChange(id);
      return reply.send({ data: { ok: true, ...r }, message: '通知已重新触发' });
    } catch (err: any) {
      throw new NotFoundError(err.message || 'Price change');
    }
  });

  /** GET /api/v1/admin/price-changes/dispatch-logs — 分发执行日志 */
  app.get('/api/v1/admin/price-changes/dispatch-logs', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as PriceChangeQuery;
    const { page, pageSize, offset } = parsePagination(q);
    const [rows, countResult] = await Promise.all([
      db.select().from(schema.priceChangeDispatchLog)
        .orderBy(desc(schema.priceChangeDispatchLog.dispatchedAt))
        .limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(schema.priceChangeDispatchLog),
    ]);

    const list = await Promise.all(rows.map(async (d) => {
      const log = d.priceChangeLogId ? await db.select({
        modelName: schema.supplierModels.modelName,
      }).from(schema.priceChangeLogs)
        .innerJoin(schema.supplierModels, eq(schema.priceChangeLogs.supplierModelId, schema.supplierModels.id))
        .where(eq(schema.priceChangeLogs.id, d.priceChangeLogId)).limit(1) : [];
      return { ...d, model_name: log[0]?.modelName ?? '' };
    }));

    return reply.send({ data: { list, total: Number(countResult[0]?.count ?? 0), page, pageSize } });
  });

  /** GET /api/v1/admin/substitutability — 可替代性系数列表 */
  app.get('/api/v1/admin/substitutability', { preHandler: [adminAuth] }, async (_request, reply) => {
    const models = await db.select({
      id: schema.supplierModels.id,
      modelName: schema.supplierModels.modelName,
      status: schema.supplierModels.status,
    }).from(schema.supplierModels).orderBy(schema.supplierModels.modelName);

    const list = [];
    for (const m of models) {
      const sub = await computeSubstitutability(m.id, m.modelName);
      const peerCount = sub.peerCount;
      list.push({
        model_id: m.id,
        model_name: m.modelName,
        status: m.status,
        auto_coefficient: sub.autoCoefficient,
        manual_coefficient: sub.manual,
        effective_coefficient: sub.effectiveCoefficient,
        peer_count: peerCount,
        coefficient_basis: sub.coefficientBasis,
      });
    }
    return reply.send({ data: { list } });
  });

  /** PATCH /api/v1/admin/substitutability — 手动覆盖系数（manual_coefficient=null 恢复自动） */
  app.patch('/api/v1/admin/substitutability', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const modelId = body.modelId != null ? Number(body.modelId) : null;
    if (!modelId) throw new ValidationError('modelId is required');

    const [model] = await db.select({ id: schema.supplierModels.id })
      .from(schema.supplierModels).where(eq(schema.supplierModels.id, modelId)).limit(1);
    if (!model) throw new NotFoundError('Supplier model', modelId);

    const manual = body.manual_coefficient != null && body.manual_coefficient !== '' ? Number(body.manual_coefficient) : null;
    if (manual != null && (manual < 0.3 || manual > 2.0)) {
      throw new ValidationError('manual_coefficient must be within 0.3-2.0');
    }
    if (manual != null && !body.reason) {
      throw new ValidationError('reason is required when overriding');
    }

    await db.insert(schema.modelSubstitutability)
      .values({
        modelId,
        autoCoefficient: '1.0',
        manualCoefficient: manual != null ? String(manual) : null,
        manualReason: manual != null ? String(body.reason).slice(0, 500) : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.modelSubstitutability.modelId,
        set: {
          manualCoefficient: manual != null ? String(manual) : null,
          manualReason: manual != null ? String(body.reason).slice(0, 500) : null,
          updatedAt: new Date(),
        },
      });

    return reply.send({ data: { ok: true, model_id: modelId, manual_coefficient: manual } });
  });
}
