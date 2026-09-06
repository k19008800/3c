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
import { db, schema } from '../db/index.js';
import { and, eq, or, ilike, count, sql } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import {
  isWindowParam,
  foldModelStats,
  activeModelCatalog,
  foldSupplierStats,
  buildModelStat,
  mapSupplierStatus,
} from '../services/marketplace/health-queries.js';
import { HEALTH_ORDER, histogramPercentile } from '../lib/latency.js';
import type { HealthStatus } from '../lib/latency.js';

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
  /**
   * GET /api/v1/admin/models — 平台模型列表（AdminModelsPage）
   *
   * 无独立 models 表，目录 = 跨供应商聚合的 platform model（supplier_models 按 modelName 去重）。
   * 语义对照 GET /public/models（public.ts）：
   *    name         → modelName（规范模型名）
   *    display_name → platformModel（上游/展示名，COALESCE 到 modelName 防 null）
   * 过滤：R8 测试模型（market-test-/alias-/compat-/verify- 前缀）不进入目录。
   * 聚合字段：
   *    id            → MIN(supplier_models.id)（真实 supplier_models.id，保证既有
   *                    PUT /admin/models/:id / PATCH :id/status 按该行继续生效）
   *    context_length→ MAX(maxTokens) 按 /1024 取整（页面渲染 `${N}K`）
   *    status        → 组内任一 supplier_models.status='active' 即 'active'，否则 'offline'
   *    vendor_count  → COUNT(DISTINCT supplier_id)
   * 分页：page / page_size（页面固定 page_size=50）；total 统计去重后模型数。
   */
  app.get('/api/v1/admin/models', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = request.query as { keyword?: string; page?: string; page_size?: string };
    const page = Math.max(1, parseInt(String(q.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(q.page_size ?? '20'), 10) || 20));
    const offset = (page - 1) * pageSize;
    const keyword = (q.keyword ?? '').trim();

    const filters = [
      // R8：目录过滤测试模型（与 public.ts /public/models 同源口径）
      sql`${schema.supplierModels.modelName} NOT LIKE 'market-test-%'
          AND ${schema.supplierModels.modelName} NOT LIKE 'alias-%'
          AND ${schema.supplierModels.modelName} NOT LIKE 'compat-%'
          AND ${schema.supplierModels.modelName} NOT LIKE 'verify-%'`,
    ];
    if (keyword) {
      filters.push(or(
        ilike(schema.supplierModels.modelName, `%${keyword}%`),
        ilike(schema.supplierModels.platformModel, `%${keyword}%`),
      )!);
    }

    const [totalRows, rows] = await Promise.all([
      // total 统计：按模型名去重后的模型总数（含过滤）
      db.select({ total: count() })
        .from(
          db.select({ modelName: schema.supplierModels.modelName })
            .from(schema.supplierModels)
            .where(and(...filters))
            .groupBy(schema.supplierModels.modelName)
            .as('m'),
        ),
      db.select({
        id: sql<number>`min(${schema.supplierModels.id})`,
        name: schema.supplierModels.modelName,
        display_name: sql<string>`coalesce(${schema.supplierModels.platformModel}, ${schema.supplierModels.modelName})`,
        context_length: sql<number>`max(${schema.supplierModels.maxTokens})`,
        description: sql<string>`coalesce((array_agg(${schema.supplierModels.description})
                                    FILTER (WHERE ${schema.supplierModels.description} IS NOT NULL))[1], '')`,
        vendor_count: sql<number>`count(distinct ${schema.supplierModels.supplierId})`,
        active_rows: sql<number>`count(*) FILTER (WHERE ${schema.supplierModels.status} = 'active')`,
      })
        .from(schema.supplierModels)
        .where(and(...filters))
        .groupBy(schema.supplierModels.modelName, schema.supplierModels.platformModel)
        .orderBy(schema.supplierModels.modelName)
        .limit(pageSize)
        .offset(offset),
    ]);

    const list = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      display_name: r.display_name ?? r.name,
      category: 'chat', // 无干净来源；保持 'chat'（页面默认分类）
      context_length: Math.round((Number(r.context_length ?? 0) || 0) / 1024),
      description: r.description ?? '',
      status: Number(r.active_rows) > 0 ? 'active' : 'offline',
      vendor_count: Number(r.vendor_count),
    }));

    return reply.send({
      data: {
        list,
        pagination: { page, page_size: pageSize, total: Number(totalRows[0]?.total ?? 0) },
      },
    });
  });

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

  /**
   * GET /api/v1/admin/marketplace?keyword=&category= — 模型市场卡片列表（AdminMarketplacePage）
   *
   * 前端 AdminMarketplacePage.tsx 走 `GET /admin/marketplace`（复数路径），读取
   *   { list: [{ id, model_name, display_name, vendor_name, category, description,
   *              sell_input_price, sell_output_price, status, tags }] }
   * 数据源：supplier_models.join(suppliers).leftJoin(vendorPricing)，按模型×供应商行出卡片。
   * keyword 匹配模型名/上游平台名/供应商名；category 匹配 capabilities 或模型名域名。
   */
  app.get('/api/v1/admin/marketplace', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = request.query as { keyword?: string; category?: string };
    const keyword = (q.keyword ?? '').trim().toLowerCase();
    const category = (q.category ?? '').trim().toLowerCase();

    const filters = [
      // R8：过滤测试/临时模型
      sql`${schema.supplierModels.modelName} NOT LIKE 'market-test-%'
          AND ${schema.supplierModels.modelName} NOT LIKE 'alias-%'
          AND ${schema.supplierModels.modelName} NOT LIKE 'compat-%'
          AND ${schema.supplierModels.modelName} NOT LIKE 'verify-%'`,
    ];
    if (keyword) {
      filters.push(or(
        ilike(schema.supplierModels.modelName, `%${keyword}%`),
        ilike(schema.supplierModels.platformModel, `%${keyword}%`),
        ilike(schema.suppliers.name, `%${keyword}%`),
      )!);
    }
    if (category) {
      const kw = category;
      filters.push(sql`(
        coalesce(${schema.supplierModels.capabilities}, '[]')::text ILIKE ${`%${kw}%`}
        OR ${schema.supplierModels.modelName} ILIKE ${`%${kw}%`}
        OR ${schema.supplierModels.platformModel} ILIKE ${`%${kw}%`}
      )`);
    }

    const rows = await db.select({
      id: schema.supplierModels.id,
      modelName: schema.supplierModels.modelName,
      platformModel: schema.supplierModels.platformModel,
      description: schema.supplierModels.description,
      capabilities: schema.supplierModels.capabilities,
      maxTokens: schema.supplierModels.maxTokens,
      status: schema.supplierModels.status,
      vendorName: schema.suppliers.name,
      sellInput: schema.vendorPricing.inputPrice,
      sellOutput: schema.vendorPricing.outputPrice,
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
      .where(and(...filters))
      .orderBy(schema.supplierModels.modelName);

    const list = rows.map((r) => {
      const caps: string[] = Array.isArray(r.capabilities) ? (r.capabilities as string[]) : [];
      const category = (caps.filter((c) => ['text', 'chat', 'vision', 'audio', 'reasoning', 'embedding'].includes(c))[0]
        ?? (/(vision|image)/i.test(r.modelName) ? 'vision'
          : /(embedding)/i.test(r.modelName) ? 'embedding'
          : /(reasoning|reason)/i.test(r.modelName) ? 'reasoning'
          : 'text'));
      return {
        id: r.id,
        model_name: r.modelName,
        display_name: r.platformModel ?? r.modelName,
        vendor_name: r.vendorName,
        category,
        description: r.description ?? '',
        sell_input_price: num(r.sellInput),
        sell_output_price: num(r.sellOutput),
        status: r.status === 'active' ? 'active' : 'offline',
        tags: caps,
      };
    });

    return reply.send({ data: { list } });
  });
}
