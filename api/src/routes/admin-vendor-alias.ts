/**
 * 供应商旧 6 页别名路由 — /api/v1/admin/vendor-*（gap-fix-spec §10）
 *
 * 背景：前端 AdminVendorCostPage / AdminVendorProfilesPage / AdminVendorPricingPage /
 * AdminVendorStatsPage / AdminVendorPerformancePage / AdminModelServicePage 调用
 * /admin/vendor-*，后端已有 /admin/suppliers/* 体系。本文件按「别名转发」策略
 * 复制 suppliers.ts 的查询/写入逻辑（路径换成 /admin/vendor-*），保证前端零改动。
 *
 * 端点（全部 adminAuth）：
 *   GET/POST    /api/v1/admin/vendor-profiles[/:id]      → suppliers 表
 *   GET/PUT     /api/v1/admin/vendor-pricing[/:id]       → vendor_pricing 表（售价）
 *   POST        /api/v1/admin/vendor-pricing/batch-adjust→ 批量调价
 *   GET/PUT     /api/v1/admin/vendor-costs[/:id]         → supplier_models 表（成本）
 *   GET         /api/v1/admin/vendor-stats?period=       → consumption_records 聚合
 *   GET         /api/v1/admin/vendor-performance?period= → consumption_records 聚合
 *   GET/PUT     /api/v1/admin/vendor-models[/:id]        → supplier_models 表
 *   POST        /api/v1/admin/vendor-keys/:id/toggle     → supplier_keys 启停
 *   DELETE      /api/v1/admin/vendor-keys/:id            → 删除 supplier_keys
 *   POST        /api/v1/admin/vendors/:id/toggle-status  → suppliers 状态切换
 *   POST        /api/v1/admin/vendors/:id/models|keys    → 添加模型 / Key
 *
 * 契约说明：
 *   - 响应统一 { data: ... }；列表含 list（前端读取）+ total/page/pageSize。
 *   - 供应商成本 = supplier_models.inputPrice/outputPrice（与 public/models
 *     cost_input_price 口径一致）；销售价 = vendor_pricing.inputPrice/outputPrice。
 *   - supplier_models 无 priority / is_enabled 列（schema 不可改）：
 *     is_enabled = status === 'active'；priority 落 system_config
 *     `admin.vendor_model_priority`（JSON map modelId → number），读写闭环。
 *   - 所有写操作写 audit_logs（writeAudit）。
 *
 * @module routes
 * @see docs/gap-fix-spec-2026-08-18.md §10
 * @see routes/suppliers.ts（查询逻辑镜像源）
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';

/* ───────── 鉴权 / 审计 helpers（对齐 suppliers.ts） ───────── */

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

/** 管理端操作审计写库（资源统一 vendor_alias） */
async function writeAudit(request: any, action: string, resourceId: string | number | null, details: Record<string, unknown>) {
  const ctx = request.userContext ?? {};
  await db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource: 'vendor_alias',
    resourceId: resourceId != null ? String(resourceId) : null,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/** 路径参数正整数解析 */
function intParam(params: Record<string, unknown>, key: string): number {
  const v = parseInt(String(params[key]), 10);
  if (isNaN(v) || v <= 0) throw new ValidationError(`Invalid ${key}`);
  return v;
}

/** 分页参数：page（默认 1）/ pageSize|page_size（默认 20，上限 100） */
function parsePageQuery(q: Record<string, unknown>): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, parseInt(String(q.page ?? ''), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(q.pageSize ?? q.page_size ?? ''), 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 数值兜底（varchar 价格 → number） */
function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 周期起点（today/week/month/quarter/year；默认不限） */
function periodStart(period: string): Date | undefined {
  const now = new Date();
  switch (period) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week': {
      const day = now.getDay() || 7; // 周日=7
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
      monday.setHours(0, 0, 0, 0);
      return monday;
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      return new Date(now.getFullYear(), q * 3, 1);
    }
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return undefined;
  }
}

/* ───────── supplier_models priority 落点（system_config，schema 不可改） ───────── */

const MODEL_PRIORITY_KEY = 'admin.vendor_model_priority';

/** 读取模型优先级 map（modelId → number）；无配置返回 {} */
async function readModelPriorityMap(): Promise<Record<string, number>> {
  const [row] = await db
    .select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, MODEL_PRIORITY_KEY))
    .limit(1);
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isInteger(n)) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/** 保存单个模型优先级（upsert 到 system_config JSON map） */
async function saveModelPriority(modelId: number, priority: number): Promise<void> {
  const map = await readModelPriorityMap();
  map[String(modelId)] = priority;
  await db.insert(schema.systemConfig)
    .values({ key: MODEL_PRIORITY_KEY, value: JSON.stringify(map) })
    .onConflictDoUpdate({
      target: schema.systemConfig.key,
      set: { value: JSON.stringify(map), updatedAt: new Date() },
    });
}

/* ───────── route plugin ───────── */

export async function adminVendorAliasRoutes(app: FastifyInstance) {
  // ═══════════════════════════════════════════
  // 1. 厂商资料（suppliers 表映射）
  // ═══════════════════════════════════════════

  /**
   * GET /api/v1/admin/vendor-profiles?keyword= — 厂商资料列表
   *
   * 数据源 suppliers 表（id/name/status/description/base_url/created_at）；
   * 附带 logo_url / credit_rating / is_recommended 空字段，保证旧页面渲染零改动。
   */
  app.get('/api/v1/admin/vendor-profiles', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const keyword = String(q.keyword ?? '').trim();

    const conditions: any[] = [];
    if (keyword) {
      conditions.push(
        sql`(${schema.suppliers.name} ILIKE ${'%' + keyword + '%'} OR ${schema.suppliers.code} ILIKE ${'%' + keyword + '%'})`,
      );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select()
        .from(schema.suppliers)
        .where(whereClause)
        .orderBy(desc(schema.suppliers.createdAt))
        .limit(100),
      db.select({ total: sql<number>`count(*)::int` }).from(schema.suppliers).where(whereClause),
    ]);

    const list = rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      description: r.description,
      base_url: r.baseUrl,
      created_at: r.createdAt,
      // 旧页面兼容字段（suppliers 表无对应列 → 固定空值）
      logo_url: null,
      credit_rating: null,
      is_recommended: false,
    }));

    return reply.send({ data: { list, total: Number(countResult[0]?.total ?? 0), page: 1, pageSize: 100 } });
  });

  /**
   * POST /api/v1/admin/vendor-profiles — 新增厂商（旧页面「＋新增厂商」）
   *
   * body: { name, description?, logo_url?, credit_rating? }。
   * code 自动生成（suppliers.code 唯一约束），base_url 默认空串。
   */
  app.post('/api/v1/admin/vendor-profiles', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    if (!name) throw new ValidationError('name 不能为空');

    const [supplier] = await db.insert(schema.suppliers).values({
      name,
      code: `ven-${Date.now()}`,
      baseUrl: String(body.base_url ?? body.baseUrl ?? ''),
      apiType: String(body.api_type ?? body.apiType ?? 'openai'),
      description: body.description != null ? String(body.description) : null,
      status: 'active',
    }).returning();
    if (!supplier) throw new Error('Failed to create supplier');

    await writeAudit(request, 'vendor_profiles.create', supplier.id, { name });
    return reply.status(201).send({ data: { id: supplier.id, name: supplier.name, status: supplier.status, created_at: supplier.createdAt } });
  });

  /**
   * PUT /api/v1/admin/vendor-profiles/:id — 更新厂商资料（部分字段）
   *
   * body 可含 name / status / description / base_url（baseUrl）/ code；
   * 旧页面的 logo_url / credit_rating / is_recommended 无对应列，忽略。
   */
  app.put('/api/v1/admin/vendor-profiles/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const body = (request.body ?? {}) as Record<string, unknown>;

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) setData.name = String(body.name).trim();
    if (body.status !== undefined) setData.status = String(body.status);
    if (body.description !== undefined) setData.description = body.description !== null ? String(body.description) : null;
    if (body.base_url !== undefined) setData.baseUrl = String(body.base_url).trim();
    if (body.baseUrl !== undefined) setData.baseUrl = String(body.baseUrl).trim();
    if (body.code !== undefined) setData.code = String(body.code).trim();

    if (Object.keys(setData).length <= 1) {
      throw new ValidationError('没有可更新的字段（name/status/description/base_url/code）');
    }

    const [supplier] = await db.update(schema.suppliers)
      .set(setData as any)
      .where(eq(schema.suppliers.id, id))
      .returning();
    if (!supplier) throw new NotFoundError('Supplier', id);

    await writeAudit(request, 'vendor_profiles.update', id, { fields: Object.keys(setData).filter((k) => k !== 'updatedAt') });
    return reply.send({
      data: {
        id: supplier.id,
        name: supplier.name,
        status: supplier.status,
        description: supplier.description,
        base_url: supplier.baseUrl,
        created_at: supplier.createdAt,
        logo_url: null,
        credit_rating: null,
        is_recommended: false,
      },
    });
  });

  // ═══════════════════════════════════════════
  // 2. 厂商定价（vendor_pricing 表 + supplier_models 成本）
  // ═══════════════════════════════════════════

  /**
   * GET /api/v1/admin/vendor-pricing?keyword=&page_size= — 厂商定价列表
   *
   * list 每项：{ id, model, provider, input_price, output_price, status, created_at,
   * model_name, vendor_name, display_name, sell_input_price, sell_output_price,
   * cost_input_price, cost_output_price }。
   * 售价 = vendor_pricing；成本 = supplier_models（public/models cost_* 口径一致）。
   */
  app.get('/api/v1/admin/vendor-pricing', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize, offset } = parsePageQuery(q);
    const keyword = String(q.keyword ?? '').trim();

    const conditions: any[] = [];
    if (keyword) {
      conditions.push(
        sql`(${schema.supplierModels.modelName} ILIKE ${'%' + keyword + '%'} OR ${schema.suppliers.name} ILIKE ${'%' + keyword + '%'})`,
      );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const base = db.select({
      id: schema.vendorPricing.id,
      model: schema.supplierModels.modelName,
      provider: schema.suppliers.name,
      input_price: schema.vendorPricing.inputPrice,
      output_price: schema.vendorPricing.outputPrice,
      status: schema.vendorPricing.status,
      created_at: schema.vendorPricing.createdAt,
      cost_input_price: schema.supplierModels.inputPrice,
      cost_output_price: schema.supplierModels.outputPrice,
    })
      .from(schema.vendorPricing)
      .innerJoin(schema.supplierModels, eq(schema.vendorPricing.supplierModelId, schema.supplierModels.id))
      .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id));

    const [rows, countResult] = await Promise.all([
      base.where(whereClause).orderBy(desc(schema.vendorPricing.updatedAt)).limit(pageSize).offset(offset),
      db.select({ total: sql<number>`count(*)::int` })
        .from(schema.vendorPricing)
        .innerJoin(schema.supplierModels, eq(schema.vendorPricing.supplierModelId, schema.supplierModels.id))
        .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id))
        .where(whereClause),
    ]);

    const list = rows.map((r) => {
      const input = toNum(r.input_price);
      const output = toNum(r.output_price);
      return {
        ...r,
        input_price: input,
        output_price: output,
        sell_input_price: input,
        sell_output_price: output,
        cost_input_price: toNum(r.cost_input_price),
        cost_output_price: toNum(r.cost_output_price),
        model_name: r.model,
        vendor_name: r.provider,
        display_name: r.model,
      };
    });

    return reply.send({ data: { list, total: Number(countResult[0]?.total ?? 0), page, pageSize } });
  });

  /**
   * PUT /api/v1/admin/vendor-pricing/:id — 更新定价（部分字段）
   *
   * body 兼容新旧字段名：sell_input_price / sell_output_price（旧页面）
   * 与 input_price / output_price（新契约）；另有 status / pricing_group / currency。
   */
  app.put('/api/v1/admin/vendor-pricing/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const body = (request.body ?? {}) as Record<string, unknown>;

    const inputVal = body.sell_input_price !== undefined ? body.sell_input_price : body.input_price;
    const outputVal = body.sell_output_price !== undefined ? body.sell_output_price : body.output_price;

    const [existing] = await db.select({ id: schema.vendorPricing.id })
      .from(schema.vendorPricing)
      .where(eq(schema.vendorPricing.id, id))
      .limit(1);
    if (!existing) throw new NotFoundError('Pricing', id);

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (inputVal !== undefined) setData.inputPrice = String(inputVal);
    if (outputVal !== undefined) setData.outputPrice = String(outputVal);
    if (body.status !== undefined) setData.status = String(body.status);
    if (body.pricing_group !== undefined) setData.pricingGroup = String(body.pricing_group);
    if (body.currency !== undefined) setData.currency = String(body.currency);

    if (Object.keys(setData).length <= 1) {
      throw new ValidationError('没有可更新的字段（sell_input_price/sell_output_price/status）');
    }

    const [pricing] = await db.update(schema.vendorPricing)
      .set(setData as any)
      .where(eq(schema.vendorPricing.id, id))
      .returning();
    if (!pricing) throw new NotFoundError('Pricing', id);

    await writeAudit(request, 'vendor_pricing.update', id, { fields: Object.keys(setData).filter((k) => k !== 'updatedAt') });
    return reply.send({
      data: {
        id: pricing.id,
        input_price: toNum(pricing.inputPrice),
        output_price: toNum(pricing.outputPrice),
        status: pricing.status,
        created_at: pricing.createdAt,
      },
    });
  });

  /**
   * POST /api/v1/admin/vendor-pricing/batch-adjust — 批量调价
   *
   * body：{ ids?: number[] | { filter? }, multiplier?: number, input_price?, output_price? }
   *   - ids 数组（旧页面 { ids, multiplier }）或 filter { keyword?, status? } 圈定目标行；
   *   - multiplier 提供 → 在现价基础上乘以系数；input_price/output_price 提供 → 绝对赋值；
   *   - 无 multiplier 也无 input_price/output_price → 400。
   * 至少需 ids 或 filter 圈定范围，防止误全表。
   */
  app.post('/api/v1/admin/vendor-pricing/batch-adjust', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const body = (request.body ?? {}) as {
      ids?: unknown;
      filter?: unknown;
      multiplier?: unknown;
      input_price?: unknown;
      output_price?: unknown;
    };

    // 1. 圈定目标行
    const ids = Array.isArray(body.ids) ? body.ids.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0) : [];
    const filter = (body.filter && typeof body.filter === 'object' ? body.filter : {}) as Record<string, unknown>;
    if (ids.length === 0 && !Object.keys(filter).length) {
      throw new ValidationError('需提供 ids 数组或 filter 条件圈定目标行');
    }

    const conditions: any[] = [];
    if (ids.length > 0) {
      conditions.push(inArray(schema.vendorPricing.id, ids));
    } else {
      const keyword = String(filter.keyword ?? '').trim();
      if (keyword) {
        conditions.push(
          sql`(${schema.supplierModels.modelName} ILIKE ${'%' + keyword + '%'} OR ${schema.suppliers.name} ILIKE ${'%' + keyword + '%'})`,
        );
      }
      const status = String(filter.status ?? '').trim();
      if (status) conditions.push(eq(schema.vendorPricing.status, status as any));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 2. 调价参数
    const multiplier = body.multiplier !== undefined ? Number(body.multiplier) : NaN;
    const inputAbs = body.input_price !== undefined ? Number(body.input_price) : NaN;
    const outputAbs = body.output_price !== undefined ? Number(body.output_price) : NaN;
    const hasAbs = !Number.isNaN(inputAbs) || !Number.isNaN(outputAbs);
    if (!hasAbs && Number.isNaN(multiplier)) {
      throw new ValidationError('需提供 multiplier（倍率）或 input_price/output_price（绝对价格）');
    }
    if (!hasAbs && !(Number.isFinite(multiplier) && multiplier > 0)) {
      throw new ValidationError('multiplier 必须为正数');
    }
    if (hasAbs && (Number.isNaN(inputAbs) || Number.isNaN(outputAbs))) {
      throw new ValidationError('input_price 与 output_price 需同时提供（绝对赋值模式）');
    }

    // 3. 取目标行现价（multiplier 模式需要）
    const targetRows = await db.select({
      id: schema.vendorPricing.id,
      inputPrice: schema.vendorPricing.inputPrice,
      outputPrice: schema.vendorPricing.outputPrice,
    })
      .from(schema.vendorPricing)
      .innerJoin(schema.supplierModels, eq(schema.vendorPricing.supplierModelId, schema.supplierModels.id))
      .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id))
      .where(whereClause);
    if (targetRows.length === 0) {
      return reply.send({ data: { updated: 0 } });
    }

    // 4. 事务内逐行更新
    let updated = 0;
    await db.transaction(async (tx) => {
      for (const row of targetRows) {
        const newInput = hasAbs ? inputAbs : Number(row.inputPrice) * multiplier;
        const newOutput = hasAbs ? outputAbs : Number(row.outputPrice) * multiplier;
        const result = await tx.update(schema.vendorPricing)
          .set({ inputPrice: String(newInput), outputPrice: String(newOutput), updatedAt: new Date() })
          .where(eq(schema.vendorPricing.id, row.id))
          .returning({ id: schema.vendorPricing.id });
        if (result.length > 0) updated += 1;
      }
    });

    await writeAudit(request, 'vendor_pricing.batch_adjust', null, {
      ids: ids.length > 0 ? ids : filter,
      multiplier: hasAbs ? null : multiplier,
      input_price: hasAbs ? inputAbs : null,
      output_price: hasAbs ? outputAbs : null,
      updated,
    });
    return reply.send({ data: { updated }, message: `批量调价完成：更新 ${updated} 条` });
  });

  // ═══════════════════════════════════════════
  // 3. 供应商成本（supplier_models 成本字段映射）
  // ═══════════════════════════════════════════

  /**
   * GET /api/v1/admin/vendor-costs?keyword=&page_size= — 供应商成本列表
   *
   * 数据源 supplier_models（id/supplier_id/model/cost_per_1k/created_at），
   * 附售价（vendor_pricing active 优先 default 分组）+ 旧页面成本/售价双列。
   */
  app.get('/api/v1/admin/vendor-costs', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize, offset } = parsePageQuery(q);
    const keyword = String(q.keyword ?? '').trim();

    const conditions: any[] = [];
    if (keyword) {
      conditions.push(
        sql`(${schema.supplierModels.modelName} ILIKE ${'%' + keyword + '%'} OR ${schema.supplierModels.platformModel} ILIKE ${'%' + keyword + '%'} OR ${schema.suppliers.name} ILIKE ${'%' + keyword + '%'})`,
      );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select({
        id: schema.supplierModels.id,
        supplier_id: schema.supplierModels.supplierId,
        model: schema.supplierModels.modelName,
        cost_per_1k: schema.supplierModels.inputPrice,
        cost_output_price: schema.supplierModels.outputPrice,
        // F09：供应商缓存成本价（P0 建列 cost_cache_read_input_price/write）
        cost_cache_read_input_price: schema.supplierModels.costCacheReadInputPrice,
        cost_cache_write_input_price: schema.supplierModels.costCacheWriteInputPrice,
        created_at: schema.supplierModels.createdAt,
        vendor_name: schema.suppliers.name,
        sell_input_price: sql<string>`(
          SELECT vp.input_price FROM vendor_pricing vp
          WHERE vp.supplier_model_id = ${schema.supplierModels.id} AND vp.status = 'active'
          ORDER BY (vp.pricing_group = 'default') DESC, vp.id LIMIT 1
        )`,
        sell_output_price: sql<string>`(
          SELECT vp.output_price FROM vendor_pricing vp
          WHERE vp.supplier_model_id = ${schema.supplierModels.id} AND vp.status = 'active'
          ORDER BY (vp.pricing_group = 'default') DESC, vp.id LIMIT 1
        )`,
        // F09：售价侧缓存价（vendor_pricing 显式 cache_read_input_price / cache_write_input_price）
        sell_cache_read_input_price: sql<string>`(
          SELECT vp.cache_read_input_price FROM vendor_pricing vp
          WHERE vp.supplier_model_id = ${schema.supplierModels.id} AND vp.status = 'active'
          ORDER BY (vp.pricing_group = 'default') DESC, vp.id LIMIT 1
        )`,
        sell_cache_write_input_price: sql<string>`(
          SELECT vp.cache_write_input_price FROM vendor_pricing vp
          WHERE vp.supplier_model_id = ${schema.supplierModels.id} AND vp.status = 'active'
          ORDER BY (vp.pricing_group = 'default') DESC, vp.id LIMIT 1
        )`,
      })
        .from(schema.supplierModels)
        .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierModels.supplierId))
        .where(whereClause)
        .orderBy(desc(schema.supplierModels.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: sql<number>`count(*)::int` })
        .from(schema.supplierModels)
        .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierModels.supplierId))
        .where(whereClause),
    ]);

    const list = rows.map((r) => ({
      ...r,
      cost_per_1k: toNum(r.cost_per_1k),
      cost_input_price: toNum(r.cost_per_1k),
      cost_output_price: toNum(r.cost_output_price),
      sell_input_price: toNum(r.sell_input_price),
      sell_output_price: toNum(r.sell_output_price),
      model_name: r.model,
      display_name: r.model,
    }));

    return reply.send({ data: { list, total: Number(countResult[0]?.total ?? 0), page, pageSize } });
  });

  /**
   * PUT /api/v1/admin/vendor-costs/:id — 更新采购成本
   *
   * body 兼容新旧字段名：cost_input_price / cost_output_price（旧页面）
   * 与 input_price / output_price（新契约）→ 更新 supplier_models 成本列。
   */
  app.put('/api/v1/admin/vendor-costs/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const body = (request.body ?? {}) as Record<string, unknown>;

    const inputVal = body.cost_input_price !== undefined ? body.cost_input_price : body.input_price;
    const outputVal = body.cost_output_price !== undefined ? body.cost_output_price : body.output_price;

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (inputVal !== undefined) {
      const p = Number(inputVal);
      if (Number.isNaN(p) || p < 0) throw new ValidationError('cost_input_price 必须为非负数字');
      setData.inputPrice = String(p);
    }
    if (outputVal !== undefined) {
      const p = Number(outputVal);
      if (Number.isNaN(p) || p < 0) throw new ValidationError('cost_output_price 必须为非负数字');
      setData.outputPrice = String(p);
    }
    if (Object.keys(setData).length <= 1) {
      throw new ValidationError('没有可更新的字段（cost_input_price/cost_output_price）');
    }

    const [model] = await db.update(schema.supplierModels)
      .set(setData as any)
      .where(eq(schema.supplierModels.id, id))
      .returning();
    if (!model) throw new NotFoundError('Supplier model', id);

    await writeAudit(request, 'vendor_costs.update', id, { fields: Object.keys(setData).filter((k) => k !== 'updatedAt') });
    return reply.send({
      data: {
        id: model.id,
        supplier_id: model.supplierId,
        model: model.modelName,
        cost_per_1k: toNum(model.inputPrice),
        cost_input_price: toNum(model.inputPrice),
        cost_output_price: toNum(model.outputPrice),
        created_at: model.createdAt,
      },
    });
  });

  // ═══════════════════════════════════════════
  // 4. 用户选购统计（consumption_records 聚合）
  // ═══════════════════════════════════════════

  /**
   * GET /api/v1/admin/vendor-stats?period= — 用户选购统计
   *
   * period: week|month|quarter|year（默认 month）。
   * data.list：按 (supplier, model) 聚合 { supplier_name, model, calls, tokens, cost, users }；
   * 附 data.summary / data.vendors 供旧页面统计卡片与分布表渲染。
   */
  app.get('/api/v1/admin/vendor-stats', { preHandler: [adminAuth] }, async (request, reply) => {
    const period = String((request.query as any)?.period ?? 'month');
    const start = periodStart(period);
    const since = start ? start.toISOString() : '1970-01-01T00:00:00.000Z';

    const rows = (await db.execute(sql`
      SELECT COALESCE(s.name, '未归属') AS supplier_name,
             c.model,
             COUNT(*)::int AS calls,
             COALESCE(SUM(c.total_tokens), 0)::bigint AS tokens,
             COALESCE(SUM(c.cost), 0)::float8 AS cost,
             COUNT(DISTINCT c.user_id)::int AS users
      FROM consumption_records c
      LEFT JOIN suppliers s ON s.id = c.supplier_id
      WHERE c.created_at >= ${since}
      GROUP BY s.name, c.model
      ORDER BY calls DESC, supplier_name, model
    `)) as any[];

    const list = rows.map((r) => ({
      supplier_name: r.supplier_name,
      model: r.model,
      calls: Number(r.calls ?? 0),
      tokens: Number(r.tokens ?? 0),
      cost: Number(r.cost ?? 0),
      users: Number(r.users ?? 0),
    }));

    // 供应商维度分布（旧页面 vendors 表 + summary 卡片）
    const vendorRows = (await db.execute(sql`
      SELECT COALESCE(s.name, '未归属') AS name,
             COUNT(DISTINCT c.user_id)::int AS user_count,
             COUNT(*)::int AS calls,
             COALESCE(SUM(c.cost), 0)::float8 AS revenue
      FROM consumption_records c
      LEFT JOIN suppliers s ON s.id = c.supplier_id
      WHERE c.created_at >= ${since} AND c.supplier_id IS NOT NULL
      GROUP BY s.name
      ORDER BY calls DESC
    `)) as any[];

    const totalUsers = vendorRows.reduce((acc, v) => acc + Number(v.user_count ?? 0), 0);
    const totalRevenue = vendorRows.reduce((acc, v) => acc + Number(v.revenue ?? 0), 0);
    const vendors = vendorRows.map((v) => ({
      name: v.name,
      user_count: Number(v.user_count ?? 0),
      percentage: totalUsers > 0 ? Math.round((Number(v.user_count ?? 0) / totalUsers) * 1000) / 10 : 0,
      // 切换率 / 价格敏感度：consumption_records 无跨供应商时间序列，返回 0 / null
      switch_rate: 0,
      price_sensitivity: null,
      revenue_contribution: Math.round(Number(v.revenue ?? 0) * 100) / 100,
    }));

    const topVendor = vendorRows.length > 0 ? vendorRows[0]!.name : null;

    return reply.send({
      data: {
        list,
        summary: {
          user_count: totalUsers,
          switch_rate: 0,
          revenue: Math.round(totalRevenue * 100) / 100,
          top_vendor: topVendor,
        },
        vendors,
      },
    });
  });

  // ═══════════════════════════════════════════
  // 5. 供应商绩效（consumption_records + model_health_stats 聚合）
  // ═══════════════════════════════════════════

  /** 直方图加权平均延迟（ms）；桶中点近似，末桶取上界+1s */
  function histogramAvgMs(hist: Record<string, number>): number {
    const BOUNDS = [0, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];
    let total = 0;
    let weighted = 0;
    for (const [k, rawCount] of Object.entries(hist)) {
      const key = Number(k);
      const count = Number(rawCount);
      if (!Number.isFinite(key) || !Number.isFinite(count) || count <= 0) continue;
      const idx = BOUNDS.indexOf(key);
      const mid = idx >= 0 && idx < BOUNDS.length - 1
        ? (BOUNDS[idx]! + BOUNDS[idx + 1]!) / 2
        : key + 1000; // 末桶（5000_inf）近似
      total += count;
      weighted += mid * count;
    }
    return total > 0 ? Math.round((weighted / total) * 10) / 10 : 0;
  }

  /**
   * GET /api/v1/admin/vendor-performance?period= — 供应商绩效
   *
   * period: week|month|quarter（默认 month）。
   * data.list：{ supplier_name, calls, success_rate, avg_latency_ms, error_count }
   * （success = error_code 为空；延迟来自 model_health_stats.latency_hist 加权均值，
   * 无数据为 0）；附 data.summary / data.vendors（uptime/avg_latency/success_rate/
   * total_calls/score/grade）供旧页面渲染。
   */
  app.get('/api/v1/admin/vendor-performance', { preHandler: [adminAuth] }, async (request, reply) => {
    const period = String((request.query as any)?.period ?? 'month');
    const start = periodStart(period);
    const since = start ? start.toISOString() : '1970-01-01T00:00:00.000Z';

    const [rows, healthRows] = await Promise.all([
      db.execute(sql`
        SELECT COALESCE(s.name, '未归属') AS supplier_name,
               COALESCE(c.supplier_id, 0) AS supplier_id,
               COUNT(*)::int AS calls,
               COUNT(*) FILTER (WHERE c.error_code IS NOT NULL)::int AS error_count,
               COALESCE(SUM(c.cost), 0)::float8 AS cost
        FROM consumption_records c
        LEFT JOIN suppliers s ON s.id = c.supplier_id
        WHERE c.created_at >= ${since}
        GROUP BY s.name, c.supplier_id
        ORDER BY calls DESC
      `),
      db.execute(sql`
        SELECT supplier_id, latency_hist
        FROM model_health_stats
        WHERE bucket_start >= ${since} AND latency_hist IS NOT NULL
      `),
    ]) as any[];

    // 按供应商合并延迟直方图（model_health_stats.latency_hist）
    const histBySupplier = new Map<string, Record<string, number>>();
    for (const h of healthRows ?? []) {
      const hist = h.latency_hist;
      if (!hist || typeof hist !== 'object') continue;
      const key = String(h.supplier_id ?? '');
      if (!key) continue;
      const merged = histBySupplier.get(key) ?? {};
      for (const [k, v] of Object.entries(hist)) {
        merged[k] = (merged[k] ?? 0) + Number(v ?? 0);
      }
      histBySupplier.set(key, merged);
    }

    const list = (rows ?? []).map((r: any) => {
      const calls = Number(r.calls ?? 0);
      const errorCount = Number(r.error_count ?? 0);
      const successRateVal = calls > 0 ? Math.round((1 - errorCount / calls) * 1000) / 10 : 0;
      // 延迟：按 supplier_id 关联健康度直方图（无数据为 0）
      const histKey = r.supplier_id != null && Number(r.supplier_id) > 0 ? String(r.supplier_id) : null;
      const avgLatency = histKey && histBySupplier.has(histKey)
        ? histogramAvgMs(histBySupplier.get(histKey)!)
        : 0;
      return {
        supplier_name: r.supplier_name,
        calls,
        success_rate: successRateVal,
        avg_latency_ms: avgLatency,
        error_count: errorCount,
      };
    });

    // 旧页面 vendors 排名（uptime ≈ success_rate；score/grade 综合成功率 + 延迟）
    const vendors = list.map((item: any) => {
      const latencyPenalty = Math.min(100, item.avg_latency_ms / 100);
      const score = Math.round(item.success_rate * 0.7 + (100 - latencyPenalty) * 0.3);
      const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D';
      return {
        name: item.supplier_name,
        uptime: item.success_rate,
        avg_latency: item.avg_latency_ms,
        success_rate: item.success_rate,
        total_calls: item.calls,
        score,
        grade,
      };
    });

    const totalCalls = list.reduce((acc: number, item: any) => acc + item.calls, 0);
    const totalErrors = list.reduce((acc: number, item: any) => acc + item.error_count, 0);
    const overallSuccess = totalCalls > 0 ? Math.round((1 - totalErrors / totalCalls) * 1000) / 10 : 0;
    const avgUptime = vendors.length > 0
      ? Math.round((vendors.reduce((acc: number, v: any) => acc + v.uptime, 0) / vendors.length) * 10) / 10
      : 0;
    const avgLatency = vendors.length > 0
      ? Math.round((vendors.reduce((acc: number, v: any) => acc + v.avg_latency, 0) / vendors.length) * 10) / 10
      : 0;
    const topPerformer = vendors.length > 0
      ? vendors.reduce((best: any, v: any) => (v.score > best.score ? v : best), vendors[0]).name
      : null;

    return reply.send({
      data: {
        list,
        summary: {
          avg_uptime: avgUptime,
          avg_latency: avgLatency,
          success_rate: overallSuccess,
          top_performer: topPerformer,
        },
        vendors,
      },
    });
  });

  // ═══════════════════════════════════════════
  // 6. 模型服务（supplier_models 映射）
  // ═══════════════════════════════════════════

  /**
   * GET /api/v1/admin/vendor-models?keyword=&vendor_id=&page_size= — 模型服务列表
   *
   * list 每项：{ id, supplier_id, model, name, is_enabled, priority, created_at,
   * model_name, upstream_model, vendor_name, display_name, cost_input_price,
   * cost_output_price }。is_enabled = status==='active'；priority 读 system_config。
   */
  app.get('/api/v1/admin/vendor-models', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize, offset } = parsePageQuery(q);
    const keyword = String(q.keyword ?? '').trim();
    const vendorId = String(q.vendor_id ?? '').trim();

    const conditions: any[] = [];
    if (keyword) {
      conditions.push(
        sql`(${schema.supplierModels.modelName} ILIKE ${'%' + keyword + '%'} OR ${schema.supplierModels.platformModel} ILIKE ${'%' + keyword + '%'} OR ${schema.suppliers.name} ILIKE ${'%' + keyword + '%'})`,
      );
    }
    if (vendorId && /^\d+$/.test(vendorId)) {
      conditions.push(eq(schema.supplierModels.supplierId, Number(vendorId)));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult, priorityMap] = await Promise.all([
      db.select({
        id: schema.supplierModels.id,
        supplier_id: schema.supplierModels.supplierId,
        model: schema.supplierModels.modelName,
        name: schema.supplierModels.platformModel,
        status: schema.supplierModels.status,
        created_at: schema.supplierModels.createdAt,
        cost_input_price: schema.supplierModels.inputPrice,
        cost_output_price: schema.supplierModels.outputPrice,
        vendor_name: schema.suppliers.name,
      })
        .from(schema.supplierModels)
        .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierModels.supplierId))
        .where(whereClause)
        .orderBy(desc(schema.supplierModels.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: sql<number>`count(*)::int` })
        .from(schema.supplierModels)
        .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierModels.supplierId))
        .where(whereClause),
      readModelPriorityMap(),
    ]);

    const list = rows.map((r) => {
      const priority = priorityMap[String(r.id)] ?? 0;
      return {
        id: r.id,
        supplier_id: r.supplier_id,
        model: r.model,
        name: r.name,
        is_enabled: r.status === 'active',
        priority,
        created_at: r.created_at,
        model_name: r.model,
        upstream_model: r.name,
        vendor_name: r.vendor_name,
        display_name: r.model,
        cost_input_price: toNum(r.cost_input_price),
        cost_output_price: toNum(r.cost_output_price),
      };
    });

    return reply.send({ data: { list, total: Number(countResult[0]?.total ?? 0), page, pageSize } });
  });

  /**
   * PUT /api/v1/admin/vendor-models/:id — 更新模型服务
   *
   * body：{ is_enabled?: boolean, priority?: number }。
   * is_enabled → supplier_models.status（active/inactive）；priority 无对应列，
   * 落 system_config `admin.vendor_model_priority`（读写闭环）。
   */
  app.put('/api/v1/admin/vendor-models/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const body = (request.body ?? {}) as Record<string, unknown>;

    const [row] = await db.select().from(schema.supplierModels).where(eq(schema.supplierModels.id, id)).limit(1);
    if (!row) throw new NotFoundError('Supplier model', id);

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.is_enabled !== undefined) {
      const enabled = Boolean(body.is_enabled);
      setData.status = enabled ? 'active' : 'inactive';
    } else if (body.status !== undefined) {
      const status = String(body.status);
      if (!['active', 'inactive', 'deprecated', 'beta'].includes(status)) {
        throw new ValidationError('status 非法，可选 active/inactive/deprecated/beta');
      }
      setData.status = status;
    }

    let priority: number | undefined;
    if (body.priority !== undefined) {
      priority = Number(body.priority);
      if (!Number.isInteger(priority)) throw new ValidationError('priority 必须为整数');
    }

    if (Object.keys(setData).length <= 1 && priority === undefined) {
      throw new ValidationError('没有可更新的字段（is_enabled/priority）');
    }

    if (Object.keys(setData).length > 1) {
      const [updated] = await db.update(schema.supplierModels)
        .set(setData as any)
        .where(eq(schema.supplierModels.id, id))
        .returning();
      if (!updated) throw new NotFoundError('Supplier model', id);
    }
    if (priority !== undefined) {
      await saveModelPriority(id, priority);
    }

    await writeAudit(request, 'vendor_models.update', id, {
      is_enabled: body.is_enabled !== undefined ? Boolean(body.is_enabled) : undefined,
      status: setData.status,
      priority,
    });
    return reply.send({
      data: {
        id,
        is_enabled: setData.status ? setData.status === 'active' : row.status === 'active',
        priority: priority ?? (await readModelPriorityMap())[String(id)] ?? 0,
      },
    });
  });

  // ═══════════════════════════════════════════
  // 7. 供应商 Key（supplier_keys 映射）
  // ═══════════════════════════════════════════

  /**
   * POST /api/v1/admin/vendor-keys/:id/toggle — 启停供应商 Key
   *
   * body: { is_enabled: boolean } → supplier_keys.status（active/inactive）。
   */
  app.post('/api/v1/admin/vendor-keys/:id/toggle', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.is_enabled === undefined) throw new ValidationError('is_enabled 必填');

    const [key] = await db.update(schema.supplierKeys)
      .set({
        status: body.is_enabled ? 'active' : 'inactive',
        updatedAt: new Date(),
      })
      .where(eq(schema.supplierKeys.id, id))
      .returning();
    if (!key) throw new NotFoundError('Supplier key', id);

    await writeAudit(request, 'vendor_keys.toggle', id, { is_enabled: Boolean(body.is_enabled), status: key.status });
    return reply.send({ data: { id: key.id, is_enabled: key.status === 'active', status: key.status } });
  });

  /**
   * DELETE /api/v1/admin/vendor-keys/:id — 删除供应商 Key（镜像 suppliers.ts）
   */
  app.delete('/api/v1/admin/vendor-keys/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');

    const [key] = await db.delete(schema.supplierKeys)
      .where(eq(schema.supplierKeys.id, id))
      .returning({ id: schema.supplierKeys.id });
    if (!key) throw new NotFoundError('Supplier key', id);

    await writeAudit(request, 'vendor_keys.delete', id, {});
    return reply.send({ data: { ok: true, id: key.id }, message: 'Key deleted' });
  });

  // ═══════════════════════════════════════════
  // 8. 供应商状态切换 / 添加模型 / 添加 Key（suppliers.ts 镜像）
  // ═══════════════════════════════════════════

  /**
   * POST /api/v1/admin/vendors/:id/toggle-status — 供应商状态切换
   *
   * body: { status }，status ∈ active|maintenance|offline|deprecated。
   */
  app.post('/api/v1/admin/vendors/:id/toggle-status', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const body = (request.body ?? {}) as Record<string, unknown>;
    const status = String(body.status ?? '').trim();
    if (!['active', 'maintenance', 'offline', 'deprecated'].includes(status)) {
      throw new ValidationError('status 非法，可选 active/maintenance/offline/deprecated');
    }

    const [supplier] = await db.update(schema.suppliers)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(schema.suppliers.id, id))
      .returning();
    if (!supplier) throw new NotFoundError('Supplier', id);

    await writeAudit(request, 'vendors.toggle_status', id, { status });
    return reply.send({ data: { id: supplier.id, name: supplier.name, status: supplier.status } });
  });

  /**
   * POST /api/v1/admin/vendors/:id/models — 添加供应商模型（镜像 suppliers.ts）
   *
   * body: { modelName, platformModel, inputPrice?, outputPrice? }
   */
  app.post('/api/v1/admin/vendors/:id/models', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const supplierId = intParam(request.params as Record<string, unknown>, 'id');
    const body = (request.body ?? {}) as Record<string, unknown>;

    const modelName = String(body.modelName ?? body.model_name ?? '').trim();
    const platformModel = String(body.platformModel ?? body.name ?? '').trim();
    const inputPrice = String(body.inputPrice ?? body.input_price ?? '0');
    const outputPrice = String(body.outputPrice ?? body.output_price ?? '0');

    if (!modelName || !platformModel) {
      throw new ValidationError('modelName and platformModel are required');
    }

    const suppliers = await db.select({ id: schema.suppliers.id })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.id, supplierId))
      .limit(1);
    if (suppliers.length === 0) throw new NotFoundError('Supplier', supplierId);

    const [model] = await db.insert(schema.supplierModels).values({
      supplierId,
      modelName,
      platformModel,
      inputPrice,
      outputPrice,
      status: 'active',
    }).returning();
    if (!model) throw new Error('Failed to create supplier model');

    await writeAudit(request, 'vendors.add_model', supplierId, { modelId: model.id, modelName });
    return reply.status(201).send({ data: { id: model.id, supplier_id: model.supplierId, model: model.modelName, name: model.platformModel, created_at: model.createdAt } });
  });

  /**
   * POST /api/v1/admin/vendors/:id/keys — 添加供应商 Key（镜像 suppliers.ts）
   *
   * body: { keyValue, name?, selectMode?, priority? }；响应 key_value 打码。
   */
  app.post('/api/v1/admin/vendors/:id/keys', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const supplierId = intParam(request.params as Record<string, unknown>, 'id');
    const body = (request.body ?? {}) as Record<string, unknown>;

    const keyValue = String(body.keyValue ?? body.key_value ?? '').trim();
    const name = body.name !== undefined ? String(body.name).trim() : null;
    const selectMode = String(body.selectMode ?? body.select_mode ?? 'single');
    const priority = body.priority !== undefined ? Number(body.priority) : 0;

    if (!keyValue) throw new ValidationError('keyValue is required');

    const suppliers = await db.select({ id: schema.suppliers.id })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.id, supplierId))
      .limit(1);
    if (suppliers.length === 0) throw new NotFoundError('Supplier', supplierId);

    const [key] = await db.insert(schema.supplierKeys).values({
      supplierId,
      keyValue,
      name: name as any,
      status: 'active',
      selectMode: selectMode as any,
      priority,
    }).returning();
    if (!key) throw new Error('Failed to create supplier key');

    await writeAudit(request, 'vendors.add_key', supplierId, { keyId: key.id });
    const masked = key.keyValue.slice(0, 8) + '***' + key.keyValue.slice(-4);
    return reply.status(201).send({ data: { id: key.id, name: key.name, keyValue: masked, priority: key.priority, status: key.status } });
  });
}
