// ============================================================
//  3cloud (3C) — 厂商-模型关联管理（管理员）
//  POST   /api/v1/admin/vendor-models           — 创建关联
//  GET    /api/v1/admin/vendor-models           — 列表
//  GET    /api/v1/admin/vendor-models/:id       — 详情
//  PATCH  /api/v1/admin/vendor-models/:id       — 更新
//  DELETE /api/v1/admin/vendor-models/:id       — 下架（软删除，设 status=false）
//  POST   /api/v1/admin/vendor-models/test      — 连通性测试
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { vendorModels, vendors, models, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { encryptApiKey, decryptApiKey } from "../../services/encryption.js";
import {
  createVendorModelSchema,
  updateVendorModelSchema,
} from "../../schemas.js";

export async function adminVendorModelRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 创建关联 ──
  app.post("/api/v1/admin/vendor-models", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    try {
      const body = createVendorModelSchema.parse(request.body);

      // 加密 API Key
      const apiKeyEncrypted = encryptApiKey(body.apiKey);

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

      await db.insert(auditLogs).values({
        operatorId: request.user!.userId,
        action: "model_update",
        targetType: "vendor_model",
        targetId: vm.id,
        after: { vendorId: body.vendorId, modelId: body.modelId, upstreamModelName: body.upstreamModelName },
        ip: request.ip,
        description: `创建厂商-模型关联: vendor#${body.vendorId} → model#${body.modelId}`,
      });

      reply.status(200).send({ code: 0, data: safe, message: "ok" });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
        return;
      }
      if (err?.code === "23505") {
        reply.status(409).send({ code: 409, data: null, message: "该厂商-模型关联已存在" });
        return;
      }
      throw err;
    }
  });

  // ── 列表 ──
  app.get("/api/v1/admin/vendor-models", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
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
  app.get("/api/v1/admin/vendor-models/:id", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
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
  app.patch("/api/v1/admin/vendor-models/:id", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const id = parseInt((request.params as any).id);
      const parsed = updateVendorModelSchema.parse(request.body);

      const updates: Record<string, any> = {};
      const fieldMap: Record<string, string> = {
        upstreamModelName: "upstreamModelName",
        apiEndpoint: "apiEndpoint",
        costPriceInput: "costPriceInput",
        costPriceOutput: "costPriceOutput",
        sellPriceInput: "sellPriceInput",
        sellPriceOutput: "sellPriceOutput",
        weight: "weight",
        rpmLimit: "rpmLimit",
        tpmLimit: "tpmLimit",
        status: "status",
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if ((parsed as any)[key] !== undefined) updates[dbField] = (parsed as any)[key];
      }

      // 如果传了 apiKey，则加密存储
      if (parsed.apiKey) {
        updates.apiKeyEncrypted = encryptApiKey(parsed.apiKey);
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

      await db.insert(auditLogs).values({
        operatorId: request.user!.userId,
        action: "model_update",
        targetType: "vendor_model",
        targetId: id,
        after: updates,
        ip: request.ip,
        description: `编辑厂商-模型关联 #${id}`,
      });

      reply.status(200).send({ code: 0, data: safe, message: "ok" });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
        return;
      }
      throw err;
    }
  });

  // ── 连通性测试 ──
  app.post("/api/v1/admin/vendor-models/test", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { vendorModelId } = (request.body || {}) as { vendorModelId?: number };

    if (!vendorModelId || typeof vendorModelId !== "number") {
      reply.status(400).send({ code: 400, data: null, message: "vendorModelId 必填" });
      return;
    }

    const [vm] = await db
      .select({
        id: vendorModels.id,
        apiEndpoint: vendorModels.apiEndpoint,
        apiKeyEncrypted: vendorModels.apiKeyEncrypted,
        upstreamModelName: vendorModels.upstreamModelName,
        vendorName: vendors.name,
      })
      .from(vendorModels)
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .where(eq(vendorModels.id, vendorModelId))
      .limit(1);

    if (!vm) {
      reply.status(404).send({ code: 404, data: null, message: "映射不存在" });
      return;
    }

    const apiKey = decryptApiKey(vm.apiKeyEncrypted);
    const testBody = JSON.stringify({
      model: vm.upstreamModelName,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
    });

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(vm.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: testBody,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latency = Date.now() - start;

      if (res.ok) {
        reply.status(200).send({
          code: 0,
          data: { ok: true, latency, statusCode: res.status },
          message: `连通正常 (${latency}ms)`,
        });
      } else {
        const errText = await res.text().catch(() => "");
        reply.status(200).send({
          code: 0,
          data: { ok: false, latency, statusCode: res.status, error: errText.slice(0, 200) },
          message: `上游返回 ${res.status}`,
        });
      }
    } catch (err: any) {
      const latency = Date.now() - start;
      reply.status(200).send({
        code: 0,
        data: { ok: false, latency, error: err.message || "连接失败" },
        message: `连接失败 (${latency}ms)`,
      });
    }
  });

  // ── 删除（软删除：下架，设 status = false）──
  app.delete("/api/v1/admin/vendor-models/:id", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
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
