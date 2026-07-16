// ============================================================
//  3cloud (3C) — 模板一键导入
//  预置模板 + 应用模板端点
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getDb } from "../../db/index.js";
import { vendors, models, vendorModels, vendorKeyGroups, vendorKeyGroupItems, auditLogs } from "../../db/schema.js";
import { encryptApiKey } from "../../services/encryption.js";
import { eq, and } from "drizzle-orm";

// ── 预置模板定义 ──

interface TemplateModel {
  modelName: string
  upstreamModelName: string
  apiEndpoint: string
  sellPriceInput: string
  sellPriceOutput: string
}

interface Template {
  name: string
  description: string
  vendor: { name: string; baseUrl: string; description: string }
  models: TemplateModel[]
}

const PRESET_TEMPLATES: Record<string, Template> = {
  openai: {
    name: "OpenAI 标准模板",
    description: "接入 OpenAI 官方 API 的完整配置",
    vendor: { name: "OpenAI", baseUrl: "https://api.openai.com", description: "OpenAI Official API" },
    models: [
      { modelName: "gpt-4o", upstreamModelName: "gpt-4o", apiEndpoint: "/v1/chat/completions", sellPriceInput: "0.0025", sellPriceOutput: "0.01" },
      { modelName: "gpt-4o-mini", upstreamModelName: "gpt-4o-mini", apiEndpoint: "/v1/chat/completions", sellPriceInput: "0.00015", sellPriceOutput: "0.0006" },
      { modelName: "o1", upstreamModelName: "o1", apiEndpoint: "/v1/chat/completions", sellPriceInput: "0.015", sellPriceOutput: "0.06" },
      { modelName: "o3-mini", upstreamModelName: "o3-mini", apiEndpoint: "/v1/chat/completions", sellPriceInput: "0.0011", sellPriceOutput: "0.0044" },
      { modelName: "text-embedding-3-small", upstreamModelName: "text-embedding-3-small", apiEndpoint: "/v1/embeddings", sellPriceInput: "0.00002", sellPriceOutput: "0.00002" },
    ],
  },
  deepseek: {
    name: "DeepSeek 标准模板",
    description: "接入 DeepSeek 官方 API",
    vendor: { name: "DeepSeek", baseUrl: "https://api.deepseek.com", description: "DeepSeek API" },
    models: [
      { modelName: "deepseek-chat", upstreamModelName: "deepseek-chat", apiEndpoint: "/v1/chat/completions", sellPriceInput: "0.00027", sellPriceOutput: "0.0011" },
      { modelName: "deepseek-reasoner", upstreamModelName: "deepseek-reasoner", apiEndpoint: "/v1/chat/completions", sellPriceInput: "0.00055", sellPriceOutput: "0.00219" },
    ],
  },
}

export async function adminTemplateRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 获取预置模板列表 ──
  app.get("/api/v1/admin/templates", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (_request, reply) => {
    const list = Object.entries(PRESET_TEMPLATES).map(([key, t]) => ({
      id: key,
      name: t.name,
      description: t.description,
      modelCount: t.models.length,
      vendorName: t.vendor.name,
    }));
    return { code: 0, data: list, message: "ok" };
  });

  // ── 获取模板详情 ──
  app.get("/api/v1/admin/templates/:id", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const template = PRESET_TEMPLATES[id];
    if (!template) {
      return reply.status(404).send({ code: 404, data: null, message: "模板不存在" });
    }
    return { code: 0, data: template, message: "ok" };
  });

  // ── 应用模板 ──
  app.post("/api/v1/admin/templates/:id/apply", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const template = PRESET_TEMPLATES[id];
    if (!template) {
      return reply.status(404).send({ code: 404, data: null, message: "模板不存在" });
    }

    const body = request.body as any;
    if (!body.apiKey) {
      return reply.status(400).send({ code: 400, data: null, message: "apiKey 必填" });
    }

    const db = getDb();
    const operatorId = request.user!.userId;
    const multiplier = body.sellPriceMultiplier ? Number(body.sellPriceMultiplier) : 1.5;
    const vendorName = body.vendorName || template.vendor.name;

    // 1. 创建供应商
    let vendorId: number;
    const existing = await db.select().from(vendors).where(eq(vendors.name, vendorName)).limit(1);
    if (existing.length > 0) {
      vendorId = existing[0].id;
    } else {
      const [v] = await db.insert(vendors).values({
        name: vendorName,
        baseUrl: template.vendor.baseUrl,
        description: template.vendor.description,
      }).returning();
      vendorId = v.id;
    }

    // 2. 创建 Key 分组
    const encryptedKey = encryptApiKey(body.apiKey);
    const keyPrefix = body.apiKey.length > 7
      ? `${body.apiKey.slice(0, 7)}...` : `${body.apiKey.slice(0, 4)}...`;

    const [kg] = await db.insert(vendorKeyGroups).values({
      vendorId,
      name: `${vendorName} 默认分组`,
      strategy: "round_robin",
    }).returning();

    await db.insert(vendorKeyGroupItems).values({
      groupId: kg.id,
      apiKeyEncrypted: encryptedKey,
      apiKeyPrefix: keyPrefix,
      weight: 1,
    });

    // 3. 创建模型映射
    const createdModels: any[] = [];
    const skippedModels: any[] = [];

    for (const tm of template.models) {
      // 查找或创建统一模型
      let modelId: number;
      const [existingModel] = await db.select().from(models).where(eq(models.name, tm.modelName)).limit(1);
      if (existingModel) {
        modelId = existingModel.id;
      } else {
        const [m] = await db.insert(models).values({
          name: tm.modelName,
          displayName: tm.modelName,
          type: "chat",
          status: true,
        }).returning();
        modelId = m.id;
      }

      // 检查映射是否已存在
      const [existingVm] = await db
        .select()
        .from(vendorModels)
        .where(and(eq(vendorModels.vendorId, vendorId), eq(vendorModels.modelId, modelId)))
        .limit(1);

      if (existingVm) {
        skippedModels.push(tm.modelName);
        continue;
      }

      const [vm] = await db.insert(vendorModels).values({
        vendorId,
        modelId,
        upstreamModelName: tm.upstreamModelName,
        apiEndpoint: tm.apiEndpoint,
        apiKeyEncrypted: encryptedKey,
        keyGroupId: kg.id,
        costPriceInput: String(Number(tm.sellPriceInput) / multiplier),
        costPriceOutput: String(Number(tm.sellPriceOutput) / multiplier),
        sellPriceInput: tm.sellPriceInput,
        sellPriceOutput: tm.sellPriceOutput,
        weight: 100,
        status: true,
      }).returning();
      createdModels.push(tm.modelName);
    }

    await db.insert(auditLogs).values({
      operatorId,
      action: "vendor_create",
      targetType: "vendor",
      targetId: vendorId,
      after: { template: id, vendorName, modelCount: template.models.length },
      description: `应用模板 ${id} 到 ${vendorName}`,
      ip: request.ip,
    });

    return {
      code: 0,
      data: {
        vendorId,
        vendorName,
        keyGroupId: kg.id,
        created: createdModels.length,
        skipped: skippedModels.length,
        createdModels,
        skippedModels,
      },
      message: `成功创建 ${createdModels.length} 个通道，跳过 ${skippedModels.length} 个已存在的`,
    };
  });
}
