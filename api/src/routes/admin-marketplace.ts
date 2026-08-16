/**
 * Admin 模型市场 API — /api/v1/admin/models/marketplace
 *
 * 提供 PRD admin-marketplace.md 的数据：
 *   - GET /admin/models/marketplace            — 模型健康度列表（可按 window/keyword/status 过滤）
 *   - GET /admin/models/marketplace/:model/suppliers — 单模型供应商详情（展开行）
 *
 * 数据源：预聚合桶表 model_health_stats（由 model-health-aggregator Worker 写入），
 * 不实时扫对话留痕明细。状态口径与路由引擎 AutoBan 一致（≥95 健康 / 90-95 降级 / <90 异常）。
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { and, eq } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';
import {
  isWindowParam,
  foldModelStats,
  activeModelCatalog,
  foldSupplierStats,
  buildModelStat,
  mapSupplierStatus,
} from '../services/marketplace/health-queries';
import { HEALTH_ORDER, histogramPercentile } from '../lib/latency';
import type { HealthStatus, Histogram } from '../lib/latency';

/* ───────── helpers ───────── */

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

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function adminMarketplaceRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/models/marketplace — 模型健康度列表 */
  app.get('/api/v1/admin/models/marketplace', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = request.query as { window?: string; keyword?: string; status?: string };
    const window = q.window && isWindowParam(q.window) ? q.window : '1h';
    const keyword = (q.keyword ?? '').trim().toLowerCase();
    const statusFilter = new Set<HealthStatus>(
      (q.status ?? '').split(',').filter((s): s is HealthStatus =>
        s === 'healthy' || s === 'degraded' || s === 'unavailable' || s === 'no_data'),
    );

    const [stats, catalog] = await Promise.all([
      foldModelStats(window),
      activeModelCatalog(),
    ]);

    const modelNames = new Set<string>([...stats.keys(), ...catalog.keys()]);
    const items = [];

    for (const model of modelNames) {
      const stat = buildModelStat(model, stats.get(model), catalog.get(model));
      if (keyword && !model.toLowerCase().includes(keyword)) continue;
      if (statusFilter.size > 0 && !statusFilter.has(stat.status)) continue;
      items.push(stat);
    }

    items.sort((a, b) =>
      HEALTH_ORDER[a.status] - HEALTH_ORDER[b.status] || a.model.localeCompare(b.model, 'zh-CN'),
    );

    return reply.send({
      data: {
        window,
        generated_at: new Date().toISOString(),
        items: items.map((it) => ({
          model: it.model,
          supplier_count: it.supplierCount,
          success_rate: it.successRate,
          p50_ms: it.p50Ms,
          p99_ms: it.p99Ms,
          status: it.status,
          min_price: it.minPrice,
          traffic_volume: it.trafficVolume,
        })),
      },
    });
  });

  /** GET /api/v1/admin/models/marketplace/:model/suppliers — 单模型供应商详情 */
  app.get('/api/v1/admin/models/marketplace/:model/suppliers', { preHandler: [adminAuth] }, async (request, reply) => {
    const { model } = request.params as { model: string };
    const q = request.query as { window?: string };
    const window = q.window && isWindowParam(q.window) ? q.window : '1h';

    const [stats, catalog] = await Promise.all([
      foldSupplierStats(model, window),
      db
        .select({
          supplierId: schema.suppliers.id,
          name: schema.suppliers.name,
          supplierStatus: schema.suppliers.status,
          modelStatus: schema.supplierModels.status,
          inputPrice: schema.vendorPricing.inputPrice,
          outputPrice: schema.vendorPricing.outputPrice,
        })
        .from(schema.supplierModels)
        .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id))
        .leftJoin(
          schema.vendorPricing,
          and(
            eq(schema.vendorPricing.supplierModelId, schema.supplierModels.id),
            eq(schema.vendorPricing.status, 'active'),
          ),
        )
        .where(eq(schema.supplierModels.modelName, model)),
    ]);

    // 供应商目录：按 supplier 折叠（最低输入/输出价）
    const catBySupplier = new Map<
      number,
      { name: string; supplierStatus: string; modelStatus: string; priceInput: number | null; priceOutput: number | null }
    >();
    for (const r of catalog) {
      let e = catBySupplier.get(r.supplierId);
      if (!e) {
        e = { name: r.name, supplierStatus: r.supplierStatus, modelStatus: r.modelStatus, priceInput: null, priceOutput: null };
        catBySupplier.set(r.supplierId, e);
      }
      if (r.inputPrice != null) {
        const p = num(r.inputPrice);
        if (e.priceInput === null || p < e.priceInput) e.priceInput = p;
      }
      if (r.outputPrice != null) {
        const p = num(r.outputPrice);
        if (e.priceOutput === null || p < e.priceOutput) e.priceOutput = p;
      }
    }

    const suppliers = [];
    for (const [supplierId, cat] of catBySupplier) {
      const agg = stats.get(supplierId);
      const requestCount = agg?.requestCount ?? 0;
      const successRateV = agg ? Math.round((agg.successCount / requestCount) * 1000) / 10 : null;
      const errorRateV = agg ? Math.round((agg.errorCount / requestCount) * 1000) / 10 : null;
      suppliers.push({
        id: supplierId,
        name: cat.name,
        success_rate: successRateV,
        error_rate: errorRateV,
        p50_ms: agg ? histogramPercentile(agg.latencyHist, 0.5) : 0,
        p99_ms: agg ? histogramPercentile(agg.latencyHist, 0.99) : 0,
        status: mapSupplierStatus(cat.modelStatus, cat.supplierStatus),
        price_input: cat.priceInput,
        price_output: cat.priceOutput,
        traffic_volume: requestCount,
      });
    }

    suppliers.sort((a, b) => b.traffic_volume - a.traffic_volume);

    return reply.send({
      data: {
        model,
        window,
        suppliers,
      },
    });
  });
}
