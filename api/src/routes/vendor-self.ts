// ============================================================
//  3cloud (3C) — 供应商自助管理路由
//  X-Vendor-Key 鉴权
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../db/index.js";
import {
  vendors,
  vendorApiKeys,
  vendorModels,
  models,
  callLogs,
  vendorStatusEnum,
} from "../db/schema.js";
import { AppError } from "../services/auth-service.js";

// ── Vendor auth declaration ──

declare module "fastify" {
  interface FastifyRequest {
    vendor?: {
      id: number;
      userId: number | null;
      name: string;
    };
  }
}

// ── Vendor key authentication middleware ──

async function authenticateVendorKey(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const vendorKey = request.headers["x-vendor-key"] as string;
  if (!vendorKey) {
    reply.status(401).send({
      code: 401,
      data: null,
      message: "缺少 X-Vendor-Key header",
    });
    return;
  }

  const keyHash = createHash("sha256").update(vendorKey).digest("hex");
  const db = getDb();

  const [keyRecord] = await db
    .select({
      id: vendorApiKeys.id,
      vendorId: vendorApiKeys.vendorId,
      status: vendorApiKeys.status,
      vendorStatus: vendors.status,
      vendorName: vendors.name,
      vendorUserId: vendors.userId,
    })
    .from(vendorApiKeys)
    .innerJoin(vendors, eq(vendorApiKeys.vendorId, vendors.id))
    .where(eq(vendorApiKeys.keyHash, keyHash))
    .limit(1);

  if (!keyRecord) {
    reply.status(401).send({
      code: 401,
      data: null,
      message: "无效的 Vendor Key",
    });
    return;
  }

  if (!keyRecord.status) {
    reply.status(403).send({
      code: 403,
      data: null,
      message: "Vendor Key 已被禁用",
    });
    return;
  }

  if (keyRecord.vendorStatus !== "active" && keyRecord.vendorStatus !== "pending") {
    reply.status(403).send({
      code: 403,
      data: null,
      message: `供应商状态异常: ${keyRecord.vendorStatus}`,
    });
    return;
  }

  request.vendor = {
    id: keyRecord.vendorId,
    userId: keyRecord.vendorUserId,
    name: keyRecord.vendorName,
  };
}

export async function vendorSelfRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  POST /api/vendor/register — 供应商注册
  // ──────────────────────────────────────────────
  app.post("/api/vendor/register", async (request, reply) => {
    const db = getDb();
    const body = request.body as any;

    const { name, baseUrl, description, companyName, contactName, contactPhone, contactEmail } = body || {};

    if (!name || !baseUrl) {
      reply.status(400).send({ code: 400, data: null, message: "name 和 baseUrl 必填" });
      return;
    }

    try {
      const [vendor] = await db
        .insert(vendors)
        .values({
          name,
          baseUrl,
          description,
          status: "pending",
          companyName,
          contactName,
          contactPhone,
          contactEmail,
        })
        .returning();

      reply.status(200).send({
        code: 0,
        data: { id: vendor.id, name: vendor.name, status: "pending" },
        message: "注册成功，请等待管理员审核",
      });
    } catch (err: any) {
      if (err?.code === "23505") {
        reply.status(409).send({ code: 409, data: null, message: "厂商名称已存在" });
        return;
      }
      throw err;
    }
  });

  // ── 以下路由需要 X-Vendor-Key 鉴权 ──
  app.addHook("preHandler", (request, reply, done) => {
    // Skip auth for register route
    if (request.url === "/api/vendor/register" && request.method === "POST") {
      done();
      return;
    }
    authenticateVendorKey(request, reply).then(() => done()).catch((err) => done(err));
  });

  // ──────────────────────────────────────────────
  //  GET /api/vendor/me — 查看自己的信息
  // ──────────────────────────────────────────────
  app.get("/api/vendor/me", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;

    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "供应商不存在" });
      return;
    }

    // Get key info (prefix only, not full hash)
    const [keyRecord] = await db
      .select({ keyPrefix: vendorApiKeys.keyPrefix, status: vendorApiKeys.status })
      .from(vendorApiKeys)
      .where(eq(vendorApiKeys.vendorId, vendorId))
      .limit(1);

    reply.status(200).send({
      code: 0,
      data: {
        id: vendor.id,
        name: vendor.name,
        baseUrl: vendor.baseUrl,
        status: vendor.status,
        description: vendor.description,
        companyName: vendor.companyName,
        contactName: vendor.contactName,
        contactPhone: vendor.contactPhone,
        contactEmail: vendor.contactEmail,
        createdAt: vendor.createdAt.toISOString(),
        vendorKeyPrefix: keyRecord?.keyPrefix ?? null,
        vendorKeyActive: keyRecord?.status ?? false,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  PUT /api/vendor/me — 更新信息
  // ──────────────────────────────────────────────
  app.put("/api/vendor/me", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;
    const body = request.body as any;

    const allowedFields = ["name", "baseUrl", "description", "companyName", "contactName", "contactPhone", "contactEmail"] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    try {
      const [vendor] = await db
        .update(vendors)
        .set(updates)
        .where(eq(vendors.id, vendorId))
        .returning();

      reply.status(200).send({ code: 0, data: vendor, message: "ok" });
    } catch (err: any) {
      if (err?.code === "23505") {
        reply.status(409).send({ code: 409, data: null, message: "厂商名称已存在" });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/vendor/models — 查看自己的模型
  // ──────────────────────────────────────────────
  app.get("/api/vendor/models", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;

    const vms = await db
      .select({
        id: vendorModels.id,
        modelId: vendorModels.modelId,
        modelName: models.name,
        upstreamModelName: vendorModels.upstreamModelName,
        apiEndpoint: vendorModels.apiEndpoint,
        costPriceInput: vendorModels.costPriceInput,
        costPriceOutput: vendorModels.costPriceOutput,
        sellPriceInput: vendorModels.sellPriceInput,
        sellPriceOutput: vendorModels.sellPriceOutput,
        weight: vendorModels.weight,
        status: vendorModels.status,
        rpmLimit: vendorModels.rpmLimit,
        tpmLimit: vendorModels.tpmLimit,
        healthScore: vendorModels.healthScore,
        isDown: vendorModels.isDown,
        circuitState: vendorModels.circuitState,
        circuitFailCount: vendorModels.circuitFailCount,
        createdAt: vendorModels.createdAt,
      })
      .from(vendorModels)
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(eq(vendorModels.vendorId, vendorId))
      .orderBy(desc(vendorModels.createdAt));

    reply.status(200).send({
      code: 0,
      data: vms.map((vm) => ({
        ...vm,
        costPriceInput: vm.costPriceInput.toString(),
        costPriceOutput: vm.costPriceOutput.toString(),
        sellPriceInput: vm.sellPriceInput.toString(),
        sellPriceOutput: vm.sellPriceOutput.toString(),
        createdAt: vm.createdAt.toISOString(),
      })),
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/vendor/models/:id — 上下架模型（切换 status）
  // ──────────────────────────────────────────────
  app.patch("/api/vendor/models/:id", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;
    const vmId = parseInt((request.params as any).id, 10);
    if (isNaN(vmId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模型 ID" });
      return;
    }

    const body = request.body as any;
    if (body.status === undefined) {
      reply.status(400).send({ code: 400, data: null, message: "需要 status 字段" });
      return;
    }

    // Verify ownership
    const [existing] = await db
      .select({ id: vendorModels.id, status: vendorModels.status })
      .from(vendorModels)
      .where(and(eq(vendorModels.id, vmId), eq(vendorModels.vendorId, vendorId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "模型配置不存在" });
      return;
    }

    const [vm] = await db
      .update(vendorModels)
      .set({ status: !!body.status })
      .where(eq(vendorModels.id, vmId))
      .returning();

    reply.status(200).send({
      code: 0,
      data: { id: vm.id, status: vm.status },
      message: body.status ? "模型已上架" : "模型已下架",
    });
  });

  // ──────────────────────────────────────────────
  //  PUT /api/vendor/models/:id/price — 更新模型价格
  // ──────────────────────────────────────────────
  app.put("/api/vendor/models/:id/price", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;
    const vmId = parseInt((request.params as any).id, 10);
    if (isNaN(vmId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模型 ID" });
      return;
    }

    const body = request.body as any;
    const priceFields = ["sellPriceInput", "sellPriceOutput", "costPriceInput", "costPriceOutput"] as const;
    const updates: Record<string, any> = {};
    for (const field of priceFields) {
      if (body[field] !== undefined) updates[field] = String(body[field]);
    }

    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "需要至少一个价格字段" });
      return;
    }

    // Verify ownership
    const [existing] = await db
      .select({ id: vendorModels.id })
      .from(vendorModels)
      .where(and(eq(vendorModels.id, vmId), eq(vendorModels.vendorId, vendorId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "模型配置不存在" });
      return;
    }

    const [vm] = await db
      .update(vendorModels)
      .set(updates)
      .where(eq(vendorModels.id, vmId))
      .returning();

    reply.status(200).send({
      code: 0,
      data: {
        id: vm.id,
        sellPriceInput: vm.sellPriceInput.toString(),
        sellPriceOutput: vm.sellPriceOutput.toString(),
        costPriceInput: vm.costPriceInput.toString(),
        costPriceOutput: vm.costPriceOutput.toString(),
      },
      message: "价格已更新",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/vendor/api-keys — 轮换 API Key（生成新 key）
  // ──────────────────────────────────────────────
  app.post("/api/vendor/api-keys", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;

    // Optionally disable old key
    const body = request.body as any;
    if (body?.revoke_old !== false) {
      await db
        .update(vendorApiKeys)
        .set({ status: false })
        .where(and(eq(vendorApiKeys.vendorId, vendorId), eq(vendorApiKeys.status, true)));
    }

    // Generate new key
    const rawKey = `v_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 8);

    const [keyRecord] = await db.insert(vendorApiKeys).values({
      vendorId,
      keyHash,
      keyPrefix,
      permissions: ["vendor:*"],
      status: body?.auto_activate === true,
    }).returning();

    reply.status(200).send({
      code: 0,
      data: {
        key: rawKey,
        keyPrefix,
        id: keyRecord.id,
        status: keyRecord.status,
      },
      message: body?.auto_activate ? "新 API Key 已生成并激活" : "新 API Key 已生成，等待管理员激活",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/vendor/models — 添加模型
  // ──────────────────────────────────────────────
  app.post("/api/vendor/models", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;
    const body = request.body as any;

    const { modelId, upstreamModelName, apiEndpoint, costPriceInput, costPriceOutput, sellPriceInput, sellPriceOutput, rpmLimit, tpmLimit } = body || {};

    if (!modelId || !upstreamModelName) {
      reply.status(400).send({ code: 400, data: null, message: "modelId 和 upstreamModelName 必填" });
      return;
    }

    // Verify the model exists
    const [model] = await db
      .select({ id: models.id })
      .from(models)
      .where(eq(models.id, modelId))
      .limit(1);

    if (!model) {
      reply.status(404).send({ code: 404, data: null, message: "模型不存在" });
      return;
    }

    // Use vendor's baseUrl if apiEndpoint not provided
    const vendor = await db
      .select({ baseUrl: vendors.baseUrl })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    const endpoint = apiEndpoint || (vendor?.[0]?.baseUrl || "") + "/v1/chat/completions";

    // apiKeyEncrypted will be empty for now; admin will fill it during approval
    try {
      const [vm] = await db
        .insert(vendorModels)
        .values({
          vendorId,
          modelId,
          upstreamModelName,
          apiEndpoint: endpoint,
          apiKeyEncrypted: "",  // Admin will fill during approval
          costPriceInput: costPriceInput || "0.000000",
          costPriceOutput: costPriceOutput || "0.000000",
          sellPriceInput: sellPriceInput || "0.000000",
          sellPriceOutput: sellPriceOutput || "0.000000",
          status: false,  // Needs admin approval
          rpmLimit: rpmLimit || null,
          tpmLimit: tpmLimit || null,
          weight: 100,
        })
        .returning();

      reply.status(200).send({
        code: 0,
        data: vm,
        message: "模型已提交，等待管理员审核",
      });
    } catch (err: any) {
      const isDup = err?.message?.includes?.("duplicate") || err?.code === "23505";
      if (isDup) {
        reply.status(409).send({ code: 409, data: null, message: "该模型已添加" });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  PUT /api/vendor/models/:id — 更新模型/价格
  // ──────────────────────────────────────────────
  app.put("/api/vendor/models/:id", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;
    const vmId = parseInt((request.params as any).id, 10);
    if (isNaN(vmId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模型 ID" });
      return;
    }

    const body = request.body as any;
    const allowedFields = ["sellPriceInput", "sellPriceOutput", "upstreamModelName", "status"] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    // Verify ownership
    const [existing] = await db
      .select({ id: vendorModels.id })
      .from(vendorModels)
      .where(and(eq(vendorModels.id, vmId), eq(vendorModels.vendorId, vendorId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "模型配置不存在" });
      return;
    }

    const [vm] = await db
      .update(vendorModels)
      .set(updates)
      .where(eq(vendorModels.id, vmId))
      .returning();

    reply.status(200).send({ code: 0, data: vm, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/vendor/models/:id — 下架模型
  // ──────────────────────────────────────────────
  app.delete("/api/vendor/models/:id", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;
    const vmId = parseInt((request.params as any).id, 10);
    if (isNaN(vmId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模型 ID" });
      return;
    }

    // Verify ownership
    const [existing] = await db
      .select({ id: vendorModels.id })
      .from(vendorModels)
      .where(and(eq(vendorModels.id, vmId), eq(vendorModels.vendorId, vendorId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "模型配置不存在" });
      return;
    }

    const [vm] = await db
      .update(vendorModels)
      .set({ status: false })
      .where(eq(vendorModels.id, vmId))
      .returning();

    reply.status(200).send({ code: 0, data: vm, message: "模型已下架" });
  });

  // ──────────────────────────────────────────────
  //  PUT /api/vendor/key — 轮换自己的 API Key（申请）
  // ──────────────────────────────────────────────
  app.put("/api/vendor/key", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;

    // Disable current key (pending admin rotation)
    await db
      .update(vendorApiKeys)
      .set({ status: false })
      .where(and(eq(vendorApiKeys.vendorId, vendorId), eq(vendorApiKeys.status, true)));

    // Create a rotate request: new key with status=false, admin will activate
    const rawKey = `v_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 8);

    await db.insert(vendorApiKeys).values({
      vendorId,
      keyHash,
      keyPrefix,
      permissions: ["vendor:*"],
      status: false,  // Needs admin activation
    });

    reply.status(200).send({
      code: 0,
      data: {
        key: rawKey,
        keyPrefix,
        message: "新 Key 已生成，等待管理员激活后可用",
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/vendor/health — 查看通道健康状态
  // ──────────────────────────────────────────────
  app.get("/api/vendor/health", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;

    const vms = await db
      .select({
        id: vendorModels.id,
        modelId: vendorModels.modelId,
        upstreamModelName: vendorModels.upstreamModelName,
        status: vendorModels.status,
        healthScore: vendorModels.healthScore,
        healthSamples: vendorModels.healthSamples,
        consecutiveSuccess: vendorModels.consecutiveSuccess,
        lastHealthCheckAt: vendorModels.lastHealthCheckAt,
        isDown: vendorModels.isDown,
        modelName: models.name,
      })
      .from(vendorModels)
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(eq(vendorModels.vendorId, vendorId))
      .orderBy(desc(vendorModels.healthScore));

    reply.status(200).send({
      code: 0,
      data: vms.map((vm) => ({
        vendorModelId: vm.id,
        modelName: vm.modelName,
        upstreamModelName: vm.upstreamModelName,
        status: vm.status,
        healthScore: vm.healthScore,
        healthSamples: vm.healthSamples,
        consecutiveSuccess: vm.consecutiveSuccess,
        lastHealthCheckAt: vm.lastHealthCheckAt?.toISOString() ?? null,
        isDown: vm.isDown,
      })),
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/vendor/stats — 用量和收入统计
  // ──────────────────────────────────────────────
  app.get("/api/vendor/stats", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;

    // Get vendor_name for call_logs lookup
    const [vendor] = await db
      .select({ name: vendors.name })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "供应商不存在" });
      return;
    }

    // Total calls
    const [totalCallsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callLogs)
      .where(and(
        eq(callLogs.vendorName, vendor.name),
        eq(callLogs.status, "success"),
      ));

    // Today's calls
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayCallsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callLogs)
      .where(and(
        eq(callLogs.vendorName, vendor.name),
        eq(callLogs.status, "success"),
        sql`${callLogs.createdAt} >= ${today}`,
      ));

    // Total revenue (sum of cost)
    const [revenueResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(${callLogs.cost}), '0')` })
      .from(callLogs)
      .where(and(
        eq(callLogs.vendorName, vendor.name),
        eq(callLogs.status, "success"),
      ));

    // Model breakdown
    const modelStats = await db
      .select({
        modelName: callLogs.modelName,
        calls: sql<number>`count(*)`,
        totalTokens: sql<number>`COALESCE(SUM(${callLogs.totalTokens}), 0)`,
        revenue: sql<string>`COALESCE(SUM(${callLogs.cost}), '0')`,
      })
      .from(callLogs)
      .where(and(
        eq(callLogs.vendorName, vendor.name),
        eq(callLogs.status, "success"),
      ))
      .groupBy(callLogs.modelName)
      .orderBy(desc(sql`count(*)`))
      .limit(20);

    reply.status(200).send({
      code: 0,
      data: {
        totalCalls: Number(totalCallsResult?.count ?? 0),
        todayCalls: Number(todayCallsResult?.count ?? 0),
        totalRevenue: revenueResult?.total ?? "0",
        modelStats: modelStats.map((m) => ({
          modelName: m.modelName,
          calls: Number(m.calls),
          totalTokens: Number(m.totalTokens),
          revenue: m.revenue,
        })),
      },
      message: "ok",
    });
  });
}
