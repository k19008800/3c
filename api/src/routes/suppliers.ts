/**
 * 供应商管理 + 路由矩阵 API — Phase 3
 *
 * 端点覆盖：
 *   供应商 CRUD   — /api/v1/admin/suppliers
 *   供应商模型管理  — /api/v1/admin/suppliers/:id/models
 *   供应商 Key 管理 — /api/v1/admin/suppliers/:id/keys
 *   定价配置       — /api/v1/admin/pricing
 *   公开定价       — /api/v1/public/pricing
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, like, sql, desc, asc, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';

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

function intParam(params: Record<string, unknown>, key: string): number {
  const v = parseInt(String(params[key]), 10);
  if (isNaN(v)) throw new ValidationError(`Invalid ${key}`);
  return v;
}

interface PaginationQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  status?: string;
  sort?: string;
  order?: string;
}

function parsePagination(query: PaginationQuery) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || '20', 10) || 20));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

function paginatedReply(data: unknown[], total: number, page: number, pageSize: number) {
  return {
    data,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

/* ───────── route plugin ───────── */

export async function supplierRoutes(app: FastifyInstance) {
  // ═══════════════════════════════════════════
  // 1. 供应商 CRUD（admin only）
  // ═══════════════════════════════════════════

  /** GET /api/v1/admin/suppliers — 供应商列表（分页 / 搜索 / 状态筛选） */
  app.get('/api/v1/admin/suppliers', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as PaginationQuery;
    const { page, pageSize, offset } = parsePagination(q);

    const conditions: any[] = [];
    if (q.search) {
      conditions.push(
        sql`(${schema.suppliers.name} ILIKE ${'%' + q.search + '%'} OR ${schema.suppliers.code} ILIKE ${'%' + q.search + '%'})`
      );
    }
    if (q.status) {
      conditions.push(eq(schema.suppliers.status, q.status as any));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(schema.suppliers).where(whereClause).limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(schema.suppliers).where(whereClause),
    ]);

    // 每行附带模型数（子查询聚合）
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      const counts = await db
        .select({ supplierId: schema.supplierModels.supplierId, count: sql<number>`count(*)::int` })
        .from(schema.supplierModels)
        .where(inArray(schema.supplierModels.supplierId, ids))
        .groupBy(schema.supplierModels.supplierId);
      const countMap = new Map(counts.map(c => [c.supplierId, c.count]));
      for (const r of rows) {
        (r as any).modelCount = countMap.get(r.id) ?? 0;
      }
    }

    return reply.send(paginatedReply(rows, Number(countResult[0]?.count ?? 0), page, pageSize));
  });

  /** GET /api/v1/admin/suppliers/:id — 供应商详情（含模型 + 密钥） */
  app.get('/api/v1/admin/suppliers/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const [supplier] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, id)).limit(1);
    if (!supplier) throw new NotFoundError('Supplier not found');

    const [models, keys, modelCount] = await Promise.all([
      db.select().from(schema.supplierModels).where(eq(schema.supplierModels.supplierId, id)).orderBy(desc(schema.supplierModels.createdAt)),
      db.select().from(schema.supplierKeys).where(eq(schema.supplierKeys.supplierId, id)).orderBy(desc(schema.supplierKeys.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.supplierModels).where(eq(schema.supplierModels.supplierId, id)),
    ]);

    return reply.send({ supplier: { ...supplier, modelCount: modelCount[0]?.count ?? 0 }, models, keys });
  });

  /** POST /api/v1/admin/suppliers — 创建供应商 */
  app.post('/api/v1/admin/suppliers', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const name = String(body.name || '').trim();
    const code = String(body.code || '').trim();
    const baseUrl = String(body.baseUrl || '').trim();
    const apiType = String(body.apiType || 'openai').trim();
    const description = body.description != null ? String(body.description) : null;

    if (!name || !code || !baseUrl) {
      throw new ValidationError('name, code, and baseUrl are required');
    }

    const [supplier] = await db.insert(schema.suppliers).values({
      name,
      code,
      baseUrl,
      apiType,
      description: description as any,
      status: 'active',
    }).returning();

    return reply.status(201).send({ supplier });
  });

  /** PUT /api/v1/admin/suppliers/:id — 更新供应商 */
  app.put('/api/v1/admin/suppliers/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const body = request.body as Record<string, unknown>;

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) setData.name = String(body.name).trim();
    if (body.code !== undefined) setData.code = String(body.code).trim();
    if (body.baseUrl !== undefined) setData.baseUrl = String(body.baseUrl).trim();
    if (body.apiType !== undefined) setData.apiType = String(body.apiType).trim();
    if (body.status !== undefined) setData.status = String(body.status);
    if (body.description !== undefined) setData.description = body.description !== null ? String(body.description) : null;

    if (Object.keys(setData).length <= 1) {
      throw new ValidationError('No fields to update');
    }

    const [supplier] = await db.update(schema.suppliers)
      .set(setData as any)
      .where(eq(schema.suppliers.id, id))
      .returning();

    if (!supplier) throw new NotFoundError('Supplier', id);

    return reply.send({ supplier });
  });

  /** DELETE /api/v1/admin/suppliers/:id — 软删除供应商 */
  app.delete('/api/v1/admin/suppliers/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');

    const [supplier] = await db.update(schema.suppliers)
      .set({ status: 'offline', updatedAt: new Date() } as any)
      .where(eq(schema.suppliers.id, id))
      .returning();

    if (!supplier) throw new NotFoundError('Supplier', id);

    return reply.send({ message: 'Supplier deactivated', supplier });
  });

  // ═══════════════════════════════════════════
  // 2. 供应商模型管理（admin only）
  // ═══════════════════════════════════════════

  /** GET /api/v1/admin/suppliers/:id/models — 供应商的模型列表 */
  app.get('/api/v1/admin/suppliers/:id/models', { preHandler: [adminAuth] }, async (request, reply) => {
    const supplierId = intParam(request.params as Record<string, unknown>, 'id');

    const models = await db.select().from(schema.supplierModels)
      .where(eq(schema.supplierModels.supplierId, supplierId))
      .orderBy(desc(schema.supplierModels.createdAt));

    return reply.send({ models });
  });

  /** POST /api/v1/admin/suppliers/:id/models — 添加模型 */
  app.post('/api/v1/admin/suppliers/:id/models', { preHandler: [adminAuth] }, async (request, reply) => {
    const supplierId = intParam(request.params as Record<string, unknown>, 'id');
    const body = request.body as Record<string, unknown>;

    const modelName = String(body.modelName || '').trim();
    const platformModel = String(body.platformModel || '').trim();
    const inputPrice = String(body.inputPrice ?? '0');
    const outputPrice = String(body.outputPrice ?? '0');

    if (!modelName || !platformModel) {
      throw new ValidationError('modelName and platformModel are required');
    }

    // Verify supplier exists
    const suppliers = await db.select({ id: schema.suppliers.id })
      .from(schema.suppliers).where(eq(schema.suppliers.id, supplierId)).limit(1);
    if (suppliers.length === 0) throw new NotFoundError('Supplier', supplierId);

    const [model] = await db.insert(schema.supplierModels).values({
      supplierId,
      modelName,
      platformModel,
      inputPrice,
      outputPrice,
      status: 'active',
    }).returning();

    return reply.status(201).send({ model });
  });

  /** PUT /api/v1/admin/models/:id — 更新模型信息 */
  app.put('/api/v1/admin/models/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const body = request.body as Record<string, unknown>;

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.modelName !== undefined) setData.modelName = String(body.modelName).trim();
    if (body.platformModel !== undefined) setData.platformModel = String(body.platformModel).trim();
    if (body.inputPrice !== undefined) setData.inputPrice = String(body.inputPrice);
    if (body.outputPrice !== undefined) setData.outputPrice = String(body.outputPrice);
    if (body.status !== undefined) setData.status = String(body.status);
    if (body.capabilities !== undefined) setData.capabilities = body.capabilities;
    if (body.maxTokens !== undefined) setData.maxTokens = Number(body.maxTokens);
    if (body.description !== undefined) setData.description = body.description !== null ? String(body.description) : null;

    if (Object.keys(setData).length <= 1) {
      throw new ValidationError('No fields to update');
    }

    const [model] = await db.update(schema.supplierModels)
      .set(setData as any)
      .where(eq(schema.supplierModels.id, id))
      .returning();

    if (!model) throw new NotFoundError('Supplier model', id);

    return reply.send({ model });
  });

  // ═══════════════════════════════════════════
  // 3. 供应商 Key 管理（admin only）
  // ═══════════════════════════════════════════

  /** GET /api/v1/admin/suppliers/:id/keys — 供应商的 API Key 列表 */
  app.get('/api/v1/admin/suppliers/:id/keys', { preHandler: [adminAuth] }, async (request, reply) => {
    const supplierId = intParam(request.params as Record<string, unknown>, 'id');

    const keys = await db.select().from(schema.supplierKeys)
      .where(eq(schema.supplierKeys.supplierId, supplierId))
      .orderBy(desc(schema.supplierKeys.createdAt));

    return reply.send({ keys });
  });

  /** POST /api/v1/admin/suppliers/:id/keys — 添加 API Key */
  app.post('/api/v1/admin/suppliers/:id/keys', { preHandler: [adminAuth] }, async (request, reply) => {
    const supplierId = intParam(request.params as Record<string, unknown>, 'id');
    const body = request.body as Record<string, unknown>;

    const keyValue = String(body.keyValue || '').trim();
    const name = (body.name !== undefined) ? String(body.name).trim() : null;
    const selectMode = String(body.selectMode || 'single');
    const priority = body.priority !== undefined ? Number(body.priority) : 0;

    if (!keyValue) throw new ValidationError('keyValue is required');

    // Verify supplier exists
    const suppliers = await db.select({ id: schema.suppliers.id })
      .from(schema.suppliers).where(eq(schema.suppliers.id, supplierId)).limit(1);
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

    // Mask key value in response
    const masked = key.keyValue.slice(0, 8) + '***' + key.keyValue.slice(-4);

    return reply.status(201).send({
      key: { ...key, keyValue: masked },
    });
  });

  /** PUT /api/v1/admin/keys/:id — 更新 Key（状态/优先级） */
  app.put('/api/v1/admin/keys/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const body = request.body as Record<string, unknown>;

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) setData.status = String(body.status);
    if (body.selectMode !== undefined) setData.selectMode = String(body.selectMode);
    if (body.priority !== undefined) setData.priority = Number(body.priority);

    if (Object.keys(setData).length <= 1) {
      throw new ValidationError('No fields to update (status, selectMode, priority)');
    }

    const [key] = await db.update(schema.supplierKeys)
      .set(setData as any)
      .where(eq(schema.supplierKeys.id, id))
      .returning();

    if (!key) throw new NotFoundError('Supplier key', id);

    return reply.send({ key });
  });

  /** DELETE /api/v1/admin/keys/:id — 删除 Key */
  app.delete('/api/v1/admin/keys/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');

    const [key] = await db.delete(schema.supplierKeys)
      .where(eq(schema.supplierKeys.id, id))
      .returning({ id: schema.supplierKeys.id });

    if (!key) throw new NotFoundError('Supplier key', id);

    return reply.send({ message: 'Key deleted', id: key.id });
  });

  // ═══════════════════════════════════════════
  // 4. 定价配置
  // ═══════════════════════════════════════════

  /** GET /api/v1/admin/pricing — 定价列表 */
  app.get('/api/v1/admin/pricing', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as PaginationQuery;
    const { page, pageSize, offset } = parsePagination(q);

    const conditions: any[] = [];
    if (q.status) conditions.push(eq(schema.vendorPricing.status, q.status as any));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(schema.vendorPricing).where(whereClause).limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(schema.vendorPricing).where(whereClause),
    ]);

    return reply.send(paginatedReply(rows, Number(countResult[0]?.count ?? 0), page, pageSize));
  });

  /** POST /api/v1/admin/pricing — 创建定价 */
  app.post('/api/v1/admin/pricing', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const supplierModelId = body.supplierModelId ? Number(body.supplierModelId) : null;
    const inputPrice = String(body.inputPrice ?? '');
    const outputPrice = String(body.outputPrice ?? '');
    const pricingGroup = String(body.pricingGroup || 'default');
    const outputMultiplier = String(body.outputMultiplier ?? '1.0');
    const currency = String(body.currency || 'CNY');
    const status = String(body.status || 'draft');

    if (!supplierModelId || !inputPrice || !outputPrice) {
      throw new ValidationError('supplierModelId, inputPrice, and outputPrice are required');
    }

    const [pricing] = await db.insert(schema.vendorPricing).values({
      supplierModelId,
      pricingGroup,
      inputPrice,
      outputPrice,
      outputMultiplier,
      currency,
      status: status as any,
      createdBy: (request as any).userContext?.userId,
    }).returning();

    return reply.status(201).send({ pricing });
  });

  /** PUT /api/v1/admin/pricing/:id — 更新定价（销售价变更时写入价格变更日志） */
  app.put('/api/v1/admin/pricing/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const body = request.body as Record<string, unknown>;

    // 变更前读取旧价 + 关联模型/供应商
    const [existing] = await db.select({
      inputPrice: schema.vendorPricing.inputPrice,
      outputPrice: schema.vendorPricing.outputPrice,
      supplierModelId: schema.vendorPricing.supplierModelId,
    })
      .from(schema.vendorPricing)
      .where(eq(schema.vendorPricing.id, id))
      .limit(1);
    if (!existing) throw new NotFoundError('Pricing', id);

    const [modelInfo] = await db.select({
      supplierId: schema.supplierModels.supplierId,
      modelName: schema.supplierModels.modelName,
    })
      .from(schema.supplierModels)
      .where(eq(schema.supplierModels.id, existing.supplierModelId))
      .limit(1);

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.inputPrice !== undefined) setData.inputPrice = String(body.inputPrice);
    if (body.outputPrice !== undefined) setData.outputPrice = String(body.outputPrice);
    if (body.outputMultiplier !== undefined) setData.outputMultiplier = String(body.outputMultiplier);
    if (body.pricingGroup !== undefined) setData.pricingGroup = String(body.pricingGroup);
    if (body.currency !== undefined) setData.currency = String(body.currency);
    if (body.status !== undefined) setData.status = String(body.status);

    if (Object.keys(setData).length <= 1) {
      throw new ValidationError('No fields to update');
    }

    const [pricing] = await db.update(schema.vendorPricing)
      .set(setData as any)
      .where(eq(schema.vendorPricing.id, id))
      .returning();

    if (!pricing) throw new NotFoundError('Pricing', id);

    // ── 价格变更捕获（销售价为准）──
    const oldInput = Number(existing.inputPrice);
    const oldOutput = Number(existing.outputPrice);
    const newInput = body.inputPrice !== undefined ? Number(body.inputPrice) : oldInput;
    const newOutput = body.outputPrice !== undefined ? Number(body.outputPrice) : oldOutput;
    const priceChanged = newInput !== oldInput || newOutput !== oldOutput;

    if (priceChanged && modelInfo) {
      // 代表销售价：输出价优先，未变则用输入价
      const oldSale = newOutput === oldOutput ? oldInput : oldOutput;
      const newSale = newOutput === oldOutput ? newInput : newOutput;
      const changeRate = oldSale !== 0 ? Number((((newSale - oldSale) / oldSale) * 100).toFixed(3)) : 0;

      await db.insert(schema.priceChangeLogs).values({
        supplierModelId: existing.supplierModelId,
        vendorId: modelInfo.supplierId,
        oldInputPrice: String(oldInput),
        newInputPrice: String(newInput),
        oldOutputPrice: String(oldOutput),
        newOutputPrice: String(newOutput),
        oldSalePrice: String(oldSale),
        newSalePrice: String(newSale),
        changeRate: String(changeRate),
        effectiveAt: new Date(),
        reason: body.reason != null ? String(body.reason).slice(0, 500) : `平台调整 ${modelInfo.modelName} 销售价`,
        operatorId: (request as any).userContext?.userId ?? null,
      });
    }

    return reply.send({ pricing });
  });

  // ═══════════════════════════════════════════
  // 5. 公开接口
  // ═══════════════════════════════════════════

  /** GET /api/v1/public/pricing — 公开模型定价（无需认证） */
  app.get('/api/v1/public/pricing', async (request, reply) => {
    const pricing = await db.select({
      id: schema.vendorPricing.id,
      pricingGroup: schema.vendorPricing.pricingGroup,
      inputPrice: schema.vendorPricing.inputPrice,
      outputPrice: schema.vendorPricing.outputPrice,
      currency: schema.vendorPricing.currency,
      modelName: schema.supplierModels.modelName,
      supplierName: schema.suppliers.name,
    })
      .from(schema.vendorPricing)
      .innerJoin(schema.supplierModels, eq(schema.vendorPricing.supplierModelId, schema.supplierModels.id))
      .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id))
      .where(eq(schema.vendorPricing.status, 'active' as any));

    return reply.send({ pricing });
  });

  /** GET /api/v1/public/stats — 公开统计（无需认证） */
  app.get('/api/v1/public/stats', async (request, reply) => {
    const [models, vendors, users, totalTokens] = await Promise.all([
      // 接入模型数 = 供应商模型总数（与公开定价口径一致，不按 status 过滤）
      db.select({ value: sql<number>`count(*)` })
        .from(schema.supplierModels),
      // 供应商数 = 供应商总数
      db.select({ value: sql<number>`count(*)` })
        .from(schema.suppliers),
      // 平台用户数 = 有效客户数
      db.select({ value: sql<number>`count(*)` })
        .from(schema.users)
        .where(and(eq(schema.users.role, 'customer'), eq(schema.users.status, 'active'))),
      // 累计 Tokens = 全部消费记录 Token 总和
      db.select({ value: sql<number>`coalesce(sum(${schema.consumptionRecords.totalTokens}), 0)` })
        .from(schema.consumptionRecords),
    ]);

    return reply.send({
      models: Number(models[0]?.value ?? 0),
      vendors: Number(vendors[0]?.value ?? 0),
      users: Number(users[0]?.value ?? 0),
      totalTokens: Number(totalTokens[0]?.value ?? 0),
    });
  });
}
