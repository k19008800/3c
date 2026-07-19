// ============================================================
//  3cloud (3C) — 厂商管理路由（管理员）
//  POST   /api/v1/admin/vendors           — 创建厂商
//  GET    /api/v1/admin/vendors           — 列表
//  GET    /api/v1/admin/vendors/:id       — 详情
//  PATCH  /api/v1/admin/vendors/:id       — 更新
//  DELETE /api/v1/admin/vendors/:id       — 删除
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, asc, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { vendors, vendorModels, vendorApiKeys, auditLogs, models, vendorKeyGroups, vendorKeyGroupItems, systemConfigs } from "../../db/schema.js";
import { getDb } from "../../db/index.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { syncVendorModels } from "../../services/vendor-sync.js";
import { encryptApiKey } from "../../services/encryption.js";

export async function adminVendorRoutes(app: FastifyInstance) {
  // 所有路由需要 admin/super_admin 权限
  app.addHook("preHandler", authenticateJWT);

  // ── 创建厂商 ──
  app.post("/api/v1/admin/vendors", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body || {} as any;
    const { name, baseUrl, description } = body as {
      name: string;
      baseUrl: string;
      description?: string;
    };

    if (!name || !baseUrl) {
      reply.status(400).send({ code: 400, data: null, message: "name 和 baseUrl 必填" });
      return;
    }

    const operatorId = request.user!.userId;

    try {
      const [vendor] = await db
        .insert(vendors)
        .values({ name, baseUrl, description })
        .returning();

      await db.insert(auditLogs).values({
        operatorId,
        action: "vendor_create",
        targetType: "vendor",
        targetId: vendor.id,
        after: { name, baseUrl, description },
        ip: request.ip,
        description: `创建厂商: ${name}`,
      });

      reply.status(200).send({ code: 0, data: vendor, message: "ok" });
    } catch (err: any) {
      if (err?.code === "23505") {
        reply.status(409).send({ code: 409, data: null, message: "厂商名称已存在" });
        return;
      }
      throw err;
    }
  });

  // ── 列表 ──
  app.get("/api/v1/admin/vendors", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const keyword = query.keyword?.trim();
    const statusFilter = query.status?.trim();
    const offset = (page - 1) * pageSize;

    // Build conditions
    const conditions = [];
    if (keyword) {
      conditions.push(sql`${vendors.name} ILIKE ${`%${keyword}%`}`);
    }
    if (statusFilter) {
      conditions.push(eq(vendors.status, statusFilter as any));
    }

    const whereClause = conditions.length > 0 ? sql`${conditions.reduce((a, b) => sql`${a} AND ${b}`)}` : undefined;

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(vendors)
      .where(whereClause);
    const total = Number(totalResult?.count ?? 0);

    // 主查询带 JOIN：model count
    const rows = await db
      .select({
        id: vendors.id,
        name: vendors.name,
        baseUrl: vendors.baseUrl,
        status: vendors.status,
        description: vendors.description,
        userId: vendors.userId,
        companyName: vendors.companyName,
        contactName: vendors.contactName,
        contactPhone: vendors.contactPhone,
        contactEmail: vendors.contactEmail,
        createdAt: vendors.createdAt,
        updatedAt: vendors.updatedAt,
        modelCount: sql<number>`COALESCE(vm_counts.cnt, 0)`,
      })
      .from(vendors)
      .leftJoin(
        sql`(SELECT vendor_id, count(*) AS cnt FROM vendor_models WHERE status = true GROUP BY vendor_id) AS vm_counts`,
        eq(vendors.id, sql`vm_counts.vendor_id`)
      )
      .where(whereClause)
      .orderBy(asc(vendors.id))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: { list: rows, total, page, pageSize },
      message: "ok",
    });
  });

  // ── 详情（含熔断状态） ──
  app.get("/api/v1/admin/vendors/:id", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的厂商 ID" });
      return;
    }
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "厂商不存在" });
      return;
    }

    // 加载熔断状态
    let circuitInfo: any = null;
    try {
      const { getAllCircuitStatuses } = await import("../../services/circuit-breaker.js");
      const allCircuits = await getAllCircuitStatuses();
      // 查找属于这个厂商的熔断记录
      const vendorCircuits = allCircuits.filter((c) => c.vendorId === id);
      if (vendorCircuits.length > 0) {
        circuitInfo = vendorCircuits;
      }
    } catch {}

    reply.status(200).send({
      code: 0,
      data: {
        ...vendor,
        circuit: circuitInfo,
      },
      message: "ok",
    });
  });

  // ── 获取厂商下的模型映射列表（用于行内展开） ──
  app.get("/api/v1/admin/vendors/:id/models", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const vendorId = parseInt((request.params as any).id, 10);
    if (isNaN(vendorId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的厂商 ID" });
      return;
    }

    const rows = await db
      .select({
        id: vendorModels.id,
        vendorId: vendorModels.vendorId,
        modelId: vendorModels.modelId,
        modelName: models.name,
        modelType: models.type,
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
        healthSamples: vendorModels.healthSamples,
        isDown: vendorModels.isDown,
        circuitState: vendorModels.circuitState,
        circuitOpenedAt: vendorModels.circuitOpenedAt,
        circuitRetryAfter: vendorModels.circuitRetryAfter,
        circuitFailCount: vendorModels.circuitFailCount,
        createdAt: vendorModels.createdAt,
        updatedAt: vendorModels.updatedAt,
      })
      .from(vendorModels)
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(eq(vendorModels.vendorId, vendorId))
      .orderBy(asc(vendorModels.modelId));

    reply.status(200).send({ code: 0, data: rows, message: "ok" });
  });

  // ── 更新 ──
  app.patch("/api/v1/admin/vendors/:id", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id);
    const body = request.body as Record<string, any>;

    const allowedFields = ["baseUrl", "description", "status", "name", "companyName", "contactName", "contactPhone", "contactEmail"] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    // 校验 status 必须是有效的供应商状态枚举值
    const VALID_VENDOR_STATUSES = ["pending", "active", "down", "degraded", "disabled", "rejected"];
    if (updates.status !== undefined && !VALID_VENDOR_STATUSES.includes(updates.status)) {
      reply.status(400).send({ code: 400, data: null, message: `无效的状态值: ${updates.status}，有效值: ${VALID_VENDOR_STATUSES.join(", ")}` });
      return;
    }

    const operatorId = request.user!.userId;

    // 获取变更前快照
    const [before] = await db
      .select({ name: vendors.name, status: vendors.status })
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1);

    const [vendor] = await db
      .update(vendors)
      .set(updates)
      .where(eq(vendors.id, id))
      .returning();
    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "厂商不存在" });
      return;
    }

    await db.insert(auditLogs).values({
      operatorId,
      action: "vendor_update",
      targetType: "vendor",
      targetId: id,
      before: before ?? null,
      after: updates,
      ip: request.ip,
      description: `编辑厂商: ${before?.name ?? `#${id}`}`,
    });

    reply.status(200).send({ code: 0, data: vendor, message: "ok" });
  });

  // ── 删除 ──
  app.delete("/api/v1/admin/vendors/:id", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id);

    // 检查是否有关联的 vendor_models
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(vendorModels)
      .where(eq(vendorModels.vendorId, id));

    if (Number(countResult?.count || 0) > 0) {
      reply.status(400).send({
        code: 400,
        data: null,
        message: "该厂商下有关联的模型配置，请先删除关联",
      });
      return;
    }

    const operatorId = request.user!.userId;

    // 获取变更前快照
    const [before] = await db
      .select({ name: vendors.name })
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1);

    const [vendor] = await db
      .delete(vendors)
      .where(eq(vendors.id, id))
      .returning({ id: vendors.id });
    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "厂商不存在" });
      return;
    }

    await db.insert(auditLogs).values({
      operatorId,
      action: "vendor_update",
      targetType: "vendor",
      targetId: id,
      before: before ?? null,
      ip: request.ip,
      description: `删除厂商: ${before?.name ?? `#${id}`}`,
    });

    reply.status(200).send({ code: 0, data: null, message: "ok" });
  });

  // ══════════════════════════════════════════════
  //  供应商自助管理 — 管理员审核路由
  // ══════════════════════════════════════════════

  // ── POST /api/v1/admin/vendors/:id/approve — 审核通过供应商注册 ──
  app.post("/api/v1/admin/vendors/:id/approve", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的厂商 ID" });
      return;
    }

    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "厂商不存在" });
      return;
    }

    if (vendor.status !== "pending") {
      reply.status(400).send({ code: 400, data: null, message: `当前状态为 ${vendor.status}，不可审核` });
      return;
    }

    const operatorId = request.user!.userId;
    const now = new Date();

    const [updated] = await db
      .update(vendors)
      .set({ status: "active", approvedAt: now, approvedBy: operatorId })
      .where(eq(vendors.id, id))
      .returning();

    // Generate a vendor API key automatically upon approval (if not exists)
    const [existingKey] = await db
      .select({ id: vendorApiKeys.id })
      .from(vendorApiKeys)
      .where(eq(vendorApiKeys.vendorId, id))
      .limit(1);

    let rawKey: string | null = null;
    let keyPrefix: string | null = null;

    if (!existingKey) {
      rawKey = `v_${randomBytes(24).toString("hex")}`;
      keyPrefix = rawKey.slice(0, 8);
      const keyHash = createHash("sha256").update(rawKey).digest("hex");

      await db.insert(vendorApiKeys).values({
        vendorId: id,
        keyHash,
        keyPrefix,
        permissions: ["vendor:*"],
        status: true,
      });
    }

    await db.insert(auditLogs).values({
      operatorId,
      action: "vendor_approve",
      targetType: "vendor",
      targetId: id,
      before: { status: "pending" },
      after: { status: "active", approvedAt: now.toISOString(), approvedBy: operatorId },
      ip: request.ip,
      description: `审核通过供应商: ${vendor.name}`,
    });

    reply.status(200).send({
      code: 0,
      data: {
        vendor: updated,
        vendorKey: rawKey,
        vendorKeyPrefix: keyPrefix,
      },
      message: existingKey
        ? "供应商已审核通过"
        : "供应商已审核通过，以下为 Vendor Key（请妥善保管）：" + rawKey!.slice(0, 8) + "..."
    });
  });

  // ── PATCH /api/v1/admin/vendors/:id/reject — 拒绝供应商注册 ──
  app.patch("/api/v1/admin/vendors/:id/reject", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的厂商 ID" });
      return;
    }

    const body = request.body as { reason?: string } | null;
    const reason = body?.reason?.trim();

    if (!reason) {
      reply.status(400).send({ code: 400, data: null, message: "请填写拒绝原因" });
      return;
    }

    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "厂商不存在" });
      return;
    }

    const operatorId = request.user!.userId;

    const [updated] = await db
      .update(vendors)
      .set({
        status: "rejected" as any,
        rejectReason: reason,
      })
      .where(eq(vendors.id, id))
      .returning();

    await db.insert(auditLogs).values({
      operatorId,
      action: "vendor_reject" as any,
      targetType: "vendor",
      targetId: id,
      before: { status: vendor.status },
      after: { status: "rejected", rejectReason: reason },
      ip: request.ip,
      description: `拒绝供应商: ${vendor.name}，原因: ${reason}`,
    });

    reply.status(200).send({
      code: 0,
      data: updated,
      message: `供应商 ${vendor.name} 已被拒绝`,
    });
  });

  // ── POST /api/v1/admin/vendors/:id/vendor-key — 为供应商生成/重置 API Key ──
  app.post("/api/v1/admin/vendors/:id/vendor-key", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的厂商 ID" });
      return;
    }

    const [vendor] = await db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1);

    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "厂商不存在" });
      return;
    }

    const operatorId = request.user!.userId;

    // Disable all existing keys
    await db
      .update(vendorApiKeys)
      .set({ status: false })
      .where(eq(vendorApiKeys.vendorId, id));

    // Generate new key
    const rawKey = `v_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 8);

    await db.insert(vendorApiKeys).values({
      vendorId: id,
      keyHash,
      keyPrefix,
      permissions: ["vendor:*"],
      status: true,
    });

    await db.insert(auditLogs).values({
      operatorId,
      action: "vendor_key_generate",
      targetType: "vendor",
      targetId: id,
      ip: request.ip,
      description: `为供应商 ${vendor.name} 生成新的 API Key`,
    });

    reply.status(200).send({
      code: 0,
      data: { vendorKey: rawKey, keyPrefix },
      message: "Vendor Key 已生成"
    });
  });

  // ── POST /api/v1/admin/vendor-models/:id/approve — 审核供应商模型变更 ──
  app.post("/api/v1/admin/vendor-models/:id/approve", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const vmId = parseInt((request.params as any).id, 10);
    if (isNaN(vmId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模型配置 ID" });
      return;
    }

    const body = request.body as { apiKey?: string; costPriceInput?: string; costPriceOutput?: string } | null;

    const [vm] = await db
      .select({
        id: vendorModels.id,
        vendorId: vendorModels.vendorId,
        modelId: vendorModels.modelId,
        upstreamModelName: vendorModels.upstreamModelName,
        status: vendorModels.status,
        apiEndpoint: vendorModels.apiEndpoint,
        apiKeyEncrypted: vendorModels.apiKeyEncrypted,
      })
      .from(vendorModels)
      .where(eq(vendorModels.id, vmId))
      .limit(1);

    if (!vm) {
      reply.status(404).send({ code: 404, data: null, message: "模型配置不存在" });
      return;
    }

    const operatorId = request.user!.userId;

    // Prepare updates
    const updates: Record<string, any> = { status: true };

    // If apiKey provided, encrypt it
    if (body?.apiKey) {
      const { encryptApiKey } = await import("../../services/encryption.js");
      updates.apiKeyEncrypted = encryptApiKey(body.apiKey);
    }

    // If cost prices provided, update them
    if (body?.costPriceInput !== undefined) updates.costPriceInput = body.costPriceInput;
    if (body?.costPriceOutput !== undefined) updates.costPriceOutput = body.costPriceOutput;

    const [updated] = await db
      .update(vendorModels)
      .set(updates)
      .where(eq(vendorModels.id, vmId))
      .returning();

    await db.insert(auditLogs).values({
      operatorId,
      action: "vendor_model_approve",
      targetType: "vendor_model",
      targetId: vmId,
      before: { status: vm.status },
      after: updates,
      ip: request.ip,
      description: `审核通过供应商模型配置: ${vm.upstreamModelName}`,
    });

    reply.status(200).send({ code: 0, data: updated, message: "模型配置已审核通过" });
  });

  // ── 同步上游模型：拉取供应商 /v1/models 并自动创建 models + vendor_models ──
  app.post("/api/v1/admin/vendors/:id/sync-models", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const vendorId = parseInt((request.params as any).id);
    const body = request.body as { apiKey?: string; apiEndpoint?: string; keyGroupId?: number } | undefined;

    // 查供应商信息
    const [vendor] = await db
      .select({ id: vendors.id, name: vendors.name, baseUrl: vendors.baseUrl })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    // 如果有 keyGroupId，校验它属于该供应商
    if (body?.keyGroupId) {
      const [kg] = await db
        .select({ id: vendorKeyGroups.id })
        .from(vendorKeyGroups)
        .where(and(eq(vendorKeyGroups.id, body.keyGroupId), eq(vendorKeyGroups.vendorId, vendorId)))
        .limit(1);
      if (!kg) {
        reply.status(400).send({ code: 400, data: null, message: "指定的 Key 分组不属于该供应商" });
        return;
      }
    }

    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "供应商不存在" });
      return;
    }

    const apiKeyRaw = body?.apiKey?.trim() || "";
    // 自动清除非 ASCII 字符（如 Unicode 省略号 …、长破折号等常见粘贴污染）
    const apiKey = apiKeyRaw.replace(/[^\x20-\x7E]/g, "").trim();
    if (!apiKey) {
      reply.status(400).send({ code: 400, data: null, message: "apiKey 必填" });
      return;
    }
    if (apiKey !== apiKeyRaw) {
      request.log.warn({ apiKeyRaw, apiKeySanitized: apiKey }, "API Key 包含非 ASCII 字符，已自动清理");
    }

    // 默认从供应商 baseUrl 推导 /v1/models 接口，也可手动指定覆盖
    let baseEndpoint = (body?.apiEndpoint?.trim() || vendor.baseUrl.replace(/\/+$/, ""));
    if (baseEndpoint.endsWith("/v1/chat/completions")) {
      baseEndpoint = baseEndpoint.replace("/v1/chat/completions", "/v1/models");
    } else if (baseEndpoint.endsWith("/chat/completions")) {
      baseEndpoint = baseEndpoint.replace("/chat/completions", "/models");
    } else if (baseEndpoint.endsWith("/v1")) {
      // 标准 OpenAI 兼容 baseUrl (如 api.openai.com/v1)，追加 /models
      baseEndpoint += "/models";
    } else {
      // 裸域名或非标准路径，追加 /v1/models（标准 OpenAI 格式）
      baseEndpoint = baseEndpoint.replace(/\/+$/, "") + "/v1/models";
    }

    // 拉取上游模型列表
    let upstreamModels: { id: string; owned_by?: string }[] = [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(baseEndpoint, {
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        reply.status(502).send({ code: 502, data: null, message: `上游返回 ${res.status}: ${errText.slice(0, 200)}` });
        return;
      }

      const data = await res.json() as any;
      upstreamModels = data?.data ?? [];
      if (!Array.isArray(upstreamModels) || upstreamModels.length === 0) {
        reply.status(502).send({ code: 502, data: null, message: "上游未返回有效模型列表" });
        return;
      }
    } catch (err: any) {
      reply.status(502).send({ code: 502, data: null, message: `连接上游失败: ${err.message || err}` });
      return;
    }

    // 推断模型类型
    const typeHints: Record<string, string> = {
      embedding: "embedding", embed: "embedding",
      rerank: "rerank", reranker: "rerank",
      image: "image", dalle: "image", dall: "image", dale: "image",
      video: "video", happyhorse: "video", seedance: "video",
      audio: "audio", tts: "audio", whisper: "audio", speech: "audio",
      moderation: "moderation",
      realtime: "realtime",
    };

    function guessModelType(id: string): string {
      const lower = id.toLowerCase();
      for (const [kw, t] of Object.entries(typeHints)) {
        if (lower.includes(kw)) return t;
      }
      return "chat";
    }

    const encryptedKey = encryptApiKey(apiKey);
    const apiEndpoint = baseEndpoint.replace(/\/models$/, "/chat/completions");

    // ── 自动管理 Key 分组：将同步的 API Key 纳入 Key 分组管理 ──
    // 如果用户没有手动指定 keyGroupId，则自动创建/复用默认分组
    let resolvedKeyGroupId = body?.keyGroupId ?? null;
    if (!resolvedKeyGroupId) {
      // 查找该供应商是否已有默认 Key 分组
      const [existingGroup] = await db
        .select({ id: vendorKeyGroups.id })
        .from(vendorKeyGroups)
        .where(
          and(
            eq(vendorKeyGroups.vendorId, vendorId),
            eq(vendorKeyGroups.name, "default"),
            eq(vendorKeyGroups.status, true),
          )
        )
        .limit(1);

      if (existingGroup) {
        resolvedKeyGroupId = existingGroup.id;
      } else {
        // 创建默认 Key 分组（round_robin 策略，后续可手工改）
        const [newGroup] = await db
          .insert(vendorKeyGroups)
          .values({
            vendorId,
            name: "default",
            strategy: "round_robin",
            description: `同步 ${vendor.name} 上游模型时自动创建`,
          })
          .returning({ id: vendorKeyGroups.id });
        resolvedKeyGroupId = newGroup.id;
      }

    }

    // 将 API Key 添加到 Key 分组（无论手动还是自动分组都执行，避免重复：同前缀的不重复添加）
    const keyPrefix = apiKey.slice(0, 8);
    const [existingKeyItem] = await db
      .select({ id: vendorKeyGroupItems.id })
      .from(vendorKeyGroupItems)
      .where(
        and(
          eq(vendorKeyGroupItems.groupId, resolvedKeyGroupId),
          eq(vendorKeyGroupItems.apiKeyPrefix, keyPrefix),
          eq(vendorKeyGroupItems.deletedAt, null as any),
        )
      )
      .limit(1);

    if (!existingKeyItem) {
      await db.insert(vendorKeyGroupItems).values({
        groupId: resolvedKeyGroupId,
        apiKeyEncrypted: encryptedKey,
        apiKeyPrefix: keyPrefix,
        weight: 1,
        priority: 0,
      });
    }

    // ── 定价数据 ──（CNY per 1K tokens，cost price 从上游获取/使用默认值）
    // 从 system_configs 读取全局定价倍率，没有则 fallback 1.15
    const [multiplierCfg] = await db
      .select({ value: systemConfigs.value })
      .from(systemConfigs)
      .where(eq(systemConfigs.key, "pricing_multiplier"))
      .limit(1);
    const pricingMultiplier = multiplierCfg ? parseFloat(multiplierCfg.value) : 1.15;
    const KNOWN_PRICES: Record<string, { input: number; output: number }> = {
      'claude-opus-4-8':  { input: 104500, output: 522300 },
      'claude-opus-4.7':  { input: 104500, output: 522300 },
      'claude-sonnet-5':  { input: 20900, output: 104500 },
      'claude-sonnet-4.6':{ input: 20900, output: 104500 },
      'claude-haiku-4-5': { input: 5200, output: 26100 },
      'gpt-5.4':          { input: 36500, output: 146000 },
      'gpt-4o':           { input: 15700, output: 62600 },
      'gpt-4o-mini':      { input: 1000, output: 4200 },
      // DeepSeek (updated 2026-07: 元/百万tokens)
      'deepseek-chat':    { input: 1000, output: 2000 },
      'deepseek-v4-pro':  { input: 3000, output: 6000 },
      'deepseek-v4-flash':{ input: 1000, output: 2000 },
      'gemini-2.5-pro':   { input: 8300, output: 33300 },
      'gemini-2.5-flash': { input: 1500, output: 6000 },
    };
    const defaultPrice = { input: 3000, output: 15000 };

    function getPrices(name: string) {
      const direct = KNOWN_PRICES[name];
      if (direct) return direct;
      // try lowercased match
      for (const [k, v] of Object.entries(KNOWN_PRICES)) {
        if (k.toLowerCase() === name.toLowerCase()) return v;
      }
      return defaultPrice;
    }

    let createdModels = 0;
    let skippedModels = 0;
    let createdMappings = 0;
    let reenabledMappings = 0;
    let skippedMappings = 0;
    let updatedPrices = 0;

    for (const um of upstreamModels) {
      const modelName = um.id?.trim();
      if (!modelName) continue;

      const modelType = guessModelType(modelName);

      // Upsert model
      let modelId: number;
      const [existingModel] = await db
        .select({ id: models.id })
        .from(models)
        .where(eq(models.name, modelName))
        .limit(1);

      if (existingModel) {
        modelId = existingModel.id;
        skippedModels++;
      } else {
        const [newModel] = await db
          .insert(models)
          .values({
            name: modelName,
            displayName: modelName,
            type: modelType as any,
          })
          .returning({ id: models.id });
        modelId = newModel.id;
        createdModels++;
      }

      // Check existing mapping
      const [existingMapping] = await db
        .select({ id: vendorModels.id, status: vendorModels.status, costPriceInput: vendorModels.costPriceInput, costPriceOutput: vendorModels.costPriceOutput, sellPriceInput: vendorModels.sellPriceInput, sellPriceOutput: vendorModels.sellPriceOutput })
        .from(vendorModels)
        .where(sql`${vendorModels.vendorId} = ${vendorId} AND ${vendorModels.modelId} = ${modelId}`)
        .limit(1);

      const prices = getPrices(modelName);
      const sellInput = String((prices.input * pricingMultiplier).toFixed(6));
      const sellOutput = String((prices.output * pricingMultiplier).toFixed(6));

      if (existingMapping) {
        // 如果已有映射被停用（status=false），重新启用 + 更新凭据/价格
        if (!existingMapping.status) {
          await db.update(vendorModels).set({
            status: true,
            apiKeyEncrypted: encryptedKey,
            apiEndpoint,
            keyGroupId: resolvedKeyGroupId,
            costPriceInput: String(prices.input),
            costPriceOutput: String(prices.output),
            sellPriceInput: sellInput,
            sellPriceOutput: sellOutput,
          }).where(eq(vendorModels.id, existingMapping.id));
          reenabledMappings++;
          continue;
        }

        // Update pricing if existing mapping has zero/outdated prices
        const hasNoPrice = Number(existingMapping.sellPriceInput) === 0 && Number(existingMapping.sellPriceOutput) === 0;
        if (hasNoPrice) {
          await db.update(vendorModels).set({
            costPriceInput: String(prices.input), costPriceOutput: String(prices.output),
            sellPriceInput: sellInput, sellPriceOutput: sellOutput,
          }).where(eq(vendorModels.id, existingMapping.id));
          updatedPrices++;
        }
        skippedMappings++;
        continue;
      }

      await db.insert(vendorModels).values({
        vendorId, modelId, upstreamModelName: modelName, apiEndpoint,
        apiKeyEncrypted: encryptedKey,
        keyGroupId: resolvedKeyGroupId,
        costPriceInput: String(prices.input), costPriceOutput: String(prices.output),
        sellPriceInput: sellInput, sellPriceOutput: sellOutput,
        weight: 100,
      });
      createdMappings++;
    }

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "vendor_update",
      targetType: "vendor",
      targetId: vendorId,
      after: {
        totalUpstream: upstreamModels.length,
        createdModels,
        skippedModels,
        createdMappings,
        reenabledMappings,
        skippedMappings,
      },
      ip: request.ip,
      description: `${vendor.name}: 同步 ${upstreamModels.length} 个上游模型 (新增模型 ${createdModels}, 新增映射 ${createdMappings}, 重新启用 ${reenabledMappings}, 跳过 ${skippedMappings})`,
    });

    reply.status(200).send({
      code: 0,
      data: {
        vendorId,
        vendorName: vendor.name,
        totalUpstream: upstreamModels.length,
        createdModels,
        skippedModels,
        createdMappings,
        reenabledMappings,
        skippedMappings,
        keyGroupId: resolvedKeyGroupId,
      },
      message: `成功同步 ${createdMappings} 个新映射，重新启用 ${reenabledMappings} 个旧映射，跳过 ${skippedMappings} 个已有映射${updatedPrices > 0 ? `，${updatedPrices} 个定价更新` : ''}`,
    });
  });

  // ── 查询同步状态 ──
  app.get("/api/v1/admin/vendors/:id/sync-status", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const vendorId = parseInt((request.params as any).id);
    const { getSyncStatus } = await import("../../services/vendor-sync.js");
    const status = getSyncStatus(vendorId);
    reply.send({ code: 0, data: status, message: "ok" });
  });
}
