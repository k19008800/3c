// ============================================================
//  3cloud (3C) — 公共模型列表 API
//  GET /api/v1/models — 返回所有可用模型及价格
//  无需 API Key，公开访问
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { models, vendorModels, vendors } from "../db/schema.js";

interface ModelPriceInfo {
  inputPrice: string;   // 售价（每千 tokens）
  outputPrice: string;
  costInputPrice: string;
  costOutputPrice: string;
}

interface ModelVendorInfo {
  vendorId: number;
  vendorName: string;
  vendorStatus: string;
  inputPrice: string;
  outputPrice: string;
  weight: number;
  status: boolean;
}

interface ModelListItem {
  id: number;
  name: string;
  displayName: string | null;
  description: string | null;
  type: string;
  vendors: ModelVendorInfo[];
}

interface ModelsListResponse {
  list: ModelListItem[];
  total: number;
}

export async function modelListRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/models — 公开模型列表
  // ──────────────────────────────────────────────

  // 兼容 OpenAI SDK 默认地址
  app.get("/v1/models", async (_request, reply) => {
    return handleModelList(_request, reply);
  });

  app.get("/api/v1/models", async (_request, reply) => {
    return handleModelList(_request, reply);
  });

  async function handleModelList(_request: any, reply: any) {
    const db = getDb();

    // 查询所有活跃模型及其绑定的厂商
    const rows = await db
      .select({
        modelId: models.id,
        modelName: models.name,
        modelDescription: models.description,
        modelDisplayName: models.displayName,
        modelType: models.type,
        vendorId: vendors.id,
        vendorName: vendors.name,
        vendorStatus: vendors.status,
        vmId: vendorModels.id,
        vmInputPrice: vendorModels.sellPriceInput,
        vmOutputPrice: vendorModels.sellPriceOutput,
        vmCostInputPrice: vendorModels.costPriceInput,
        vmCostOutputPrice: vendorModels.costPriceOutput,
        vmWeight: vendorModels.weight,
        vmStatus: vendorModels.status,
      })
      .from(models)
      .innerJoin(
        vendorModels,
        and(
          eq(vendorModels.modelId, models.id),
          eq(vendorModels.status, true),
        ),
      )
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .where(eq(models.status, true))
      .orderBy(asc(models.name), asc(vendorModels.weight));

    // 聚合为模型 → 厂商列表
    const modelMap = new Map<number, ModelListItem>();

    for (const row of rows) {
      let item = modelMap.get(row.modelId);
      if (!item) {
        item = {
          id: row.modelId,
          name: row.modelName,
          displayName: row.modelDisplayName,
          description: row.modelDescription,
          type: row.modelType,
          vendors: [],
        };
        modelMap.set(row.modelId, item);
      }

      item.vendors.push({
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        vendorStatus: row.vendorStatus,
        inputPrice: row.vmInputPrice,
        outputPrice: row.vmOutputPrice,
        weight: row.vmWeight,
        status: row.vmStatus,
      });
    }

    const list = Array.from(modelMap.values());

    reply.status(200).send({
      code: 0,
      data: {
        list,
        total: list.length,
      },
      message: "ok",
    });
  }
}
