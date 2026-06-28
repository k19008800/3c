// ============================================================
//  3cloud (3C) — 厂商-模型关联管理（管理员）
//  POST   /api/v1/admin/vendor-models           — 创建关联
//  GET    /api/v1/admin/vendor-models           — 列表
//  GET    /api/v1/admin/vendor-models/:id       — 详情
//  PATCH  /api/v1/admin/vendor-models/:id       — 更新
//  DELETE /api/v1/admin/vendor-models/:id       — 下架（软删除，设 status=false）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { vendorModels, vendors, models } from "../../db/schema.js";
import { authenticateJWT, requireRole } from "../../middleware/auth.js";
import { encryptApiKey, decryptApiKey } from "../../services/encryption.js";

export async function adminVendorModelRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requireRole("super_admin", "admin"));

  // ── 创建关联 ──
  app.post("/api/v1/admin/vendor-models", async (request, reply) => {
    const db = getDb();
    const body = request.body as {
      vendorId: number;
      modelId: number;
      upstreamModelName: string;
      apiEndpoint: string;
      apiKey: string;
      costPriceInput?: string;
      costPriceOutput?: string;
      sellPriceInput?: string;
      sellPriceOutput?: string;
      weight?: number;
      rpmLimit?: number;
      tpmLimit?: number;
    };

    if (!body.vendorId || !body.modelId || !body.upstreamModelName || !body.apiEndpoint || !body.apiKey) {
      reply.status(400).send({
        code: 400,
        data: null,
        message: "vendorId, modelId, upstreamModelName, apiEndpoint, apiKey 必填",
      });
      return;
    }

    // 加密 API Key
    const apiKeyEncrypted = encryptApiKey(body.apiKey);

    try {
      const [vm] = await db
        .insert(vendorModels)
        .values({
          vendorId: body.vendorId,
          modelId: body.modelId,
          upstreamModelName: body.upstreamModelName,
          apiEndpoint: body.apiEndpoint,
          apiKeyEncrypted,
          costPriceInput: body.costPriceInput || "0.000000",
          costPriceOutput: body.costPriceOutput || "0.000000",
          sellPriceInput: body.sellPriceInput || "0.000000",
          sellPriceOutput: body.sellPriceOutput || "0.000000",
          weight: body.weight || 100,
          rpmLimit: body.rpmLimit || null,
          tpmLimit: body.tpmLimit || null,
        })
        .returning();

      // 返回时不包含加密的 API Key
      const { apiKeyEncrypted: _, ...safe } = vm;
      reply.status(200).send({ code: 0, data: safe, message: "ok" });
    } catch (err: any) {
      if (err?.code === "23505") {
        reply.status(409).send({ code: 409, data: null, message: "该厂商-模型关联已存在" });
        return;
      }
      throw err;
    }
  });

  // ── 列表 ──
  app.get("/api/v1/admin/vendor-models", async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const vendorId = query.vendorId;
    const modelId = query.modelId;
    const statusFilter = query.status;
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    if (vendorId) conditions.push(eq(vendorModels.vendorId, parseInt(vendorId)));
    if (modelId) conditions.push(eq(vendorModels.modelId, parseInt(modelId)));
    // 默认只显示启用的映射，除非显式指定了 status 筛选
    if (statusFilter) {
      conditions.push(eq(vendorModels.status, statusFilter === "true"));
    } else {
      conditions.push(eq(vendorModels.status, true));
    }

    const selectFields = {
      id: vendorModels.id,
      vendorId: vendorModels.vendorId,
      vendorName: vendors.name,
      modelId: vendorModels.modelId,
      modelName: models.name,
      upstreamModelName: vendorModels.upstreamModelName,
      apiEndpoint: vendorModels.apiEndpoint,
      costPriceInput: vendorModels.costPriceInput,
      costPriceOutput: vendorModels.costPriceOutput,
      sellPriceInput: vendorModels.sellPriceInput,
      sellPriceOutput: vendorModels.sellPriceOutput,
      weight: vendorModels.weight,
      rpmLimit: vendorModels.rpmLimit,
      tpmLimit: vendorModels.tpmLimit,
      status: vendorModels.status,
      healthScore: vendorModels.healthScore,
      isDown: vendorModels.isDown,
      createdAt: vendorModels.createdAt,
      updatedAt: vendorModels.updatedAt,
    };

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(vendorModels)
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(and(...conditions));
    const total = Number(totalResult?.count ?? 0);

    const list = await db
      .select(selectFields)
      .from(vendorModels)
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(and(...conditions))
      .orderBy(asc(vendorModels.id))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({ code: 0, data: { list, total, page, pageSize }, message: "ok" });
  });

  // ── 详情 ──

  // ── 详情 ──
  app.get("/api/v1/admin/vendor-models/:id", async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id);

    const [vm] = await db
      .select({
        id: vendorModels.id,
        vendorId: vendorModels.vendorId,
        vendorName: vendors.name,
        modelId: vendorModels.modelId,
        modelName: models.name,
        upstreamModelName: vendorModels.upstreamModelName,
        apiEndpoint: vendorModels.apiEndpoint,
        costPriceInput: vendorModels.costPriceInput,
        costPriceOutput: vendorModels.costPriceOutput,
        sellPriceInput: vendorModels.sellPriceInput,
        sellPriceOutput: vendorModels.sellPriceOutput,
        weight: vendorModels.weight,
        rpmLimit: vendorModels.rpmLimit,
        tpmLimit: vendorModels.tpmLimit,
        status: vendorModels.status,
        healthScore: vendorModels.healthScore,
        isDown: vendorModels.isDown,
        createdAt: vendorModels.createdAt,
        updatedAt: vendorModels.updatedAt,
      })
      .from(vendorModels)
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(eq(vendorModels.id, id))
      .limit(1);

    if (!vm) {
      reply.status(404).send({ code: 404, data: null, message: "关联不存在" });
      return;
    }
    reply.status(200).send({ code: 0, data: vm, message: "ok" });
  });

  // ── 更新 ──
  app.patch("/api/v1/admin/vendor-models/:id", async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id);
    const body = request.body as Record<string, any>;

    const allowedFields = [
      "upstreamModelName", "apiEndpoint", "costPriceInput", "costPriceOutput",
      "sellPriceInput", "sellPriceOutput", "weight", "rpmLimit", "tpmLimit",
      "status",
    ] as const;

    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    // 如果传了 apiKey，则加密存储
    if (body.apiKey) {
      updates.apiKeyEncrypted = encryptApiKey(body.apiKey);
    }

    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    const [vm] = await db
      .update(vendorModels)
      .set(updates)
      .where(eq(vendorModels.id, id))
      .returning();

    if (!vm) {
      reply.status(404).send({ code: 404, data: null, message: "关联不存在" });
      return;
    }

    const { apiKeyEncrypted: _, ...safe } = vm;
    reply.status(200).send({ code: 0, data: safe, message: "ok" });
  });

  // ── 删除（软删除：下架，设 status = false）──
  app.delete("/api/v1/admin/vendor-models/:id", async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id);

    const [vm] = await db
      .update(vendorModels)
      .set({ status: false })
      .where(eq(vendorModels.id, id))
      .returning({ id: vendorModels.id });

    if (!vm) {
      reply.status(404).send({ code: 404, data: null, message: "关联不存在" });
      return;
    }
    reply.status(200).send({ code: 0, data: null, message: "ok" });
  });
}
