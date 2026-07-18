// ============================================================
//  3cloud (3C) — Key-Model 交叉价格管理路由
//  同一 Key 分组内，不同 Key 对不同模型设专属折扣/价格
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  vendorKeyGroupItems,
  vendorKeyGroupModelPrices,
  vendorModels,
  models,
} from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminKeyModelPricesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 获取某个 Key 的所有模型交叉价清单 ──
  // GET /api/v1/admin/key-group-items/:itemId/model-prices
  app.get("/api/v1/admin/key-group-items/:itemId/model-prices", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { itemId } = request.params as any;
    const db = getDb();

    // 校验 Key 存在
    const [item] = await db
      .select({ id: vendorKeyGroupItems.id, groupId: vendorKeyGroupItems.groupId })
      .from(vendorKeyGroupItems)
      .where(eq(vendorKeyGroupItems.id, Number(itemId)));
    if (!item) {
      return reply.status(404).send({ code: 404, data: null, message: "Key 不存在" });
    }

    // 获取该分组下的所有 vendor_models（通道），及其已有的交叉价格
    const vendorModelRows = await db
      .select({
        vendorModelId: vendorModels.id,
        modelId: vendorModels.modelId,
        modelName: models.name,
        modelDisplayName: models.displayName,
        upstreamModelName: vendorModels.upstreamModelName,
        status: vendorModels.status,
        sellPriceInput: vendorModels.sellPriceInput,
        sellPriceOutput: vendorModels.sellPriceOutput,
      })
      .from(vendorModels)
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(eq(vendorModels.keyGroupId, item.groupId))
      .orderBy(asc(models.displayName));

    // 已有价格的 Key-Model 映射
    const existingPrices = await db
      .select()
      .from(vendorKeyGroupModelPrices)
      .where(eq(vendorKeyGroupModelPrices.keyGroupItemId, Number(itemId)));

    const priceMap = new Map(
      existingPrices.map((p) => [p.vendorModelId, p])
    );

    // 合并：每个通道带上它已有的交叉价（如有）
    const list = vendorModelRows.map((vm) => {
      const price = priceMap.get(vm.vendorModelId);
      return {
        vendorModelId: vm.vendorModelId,
        modelId: vm.modelId,
        modelName: vm.modelName,
        modelDisplayName: vm.modelDisplayName,
        upstreamModelName: vm.upstreamModelName,
        status: vm.status,
        baseSellPriceInput: Number(vm.sellPriceInput),
        baseSellPriceOutput: Number(vm.sellPriceOutput),
        // 交叉价（可空）
        priceId: price?.id ?? null,
        type: price?.type ?? null,
        inputValue: price?.inputValue != null ? Number(price.inputValue) : null,
        outputValue: price?.outputValue != null ? Number(price.outputValue) : null,
      };
    });

    return { code: 0, data: list, message: "ok" };
  });

  // ── 批量设置 Key 的模型交叉价 ──
  // POST /api/v1/admin/key-group-items/:itemId/model-prices/batch
  // Body: { prices: [{ vendorModelId, type, inputValue, outputValue }] }
  app.post("/api/v1/admin/key-group-items/:itemId/model-prices/batch", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { itemId } = request.params as any;
    const db = getDb();
    const body = request.body as any;
    const prices: Array<{ vendorModelId: number; type: string; inputValue: number | null; outputValue: number | null }> = body.prices ?? [];

    // 校验 Key 存在
    const [item] = await db
      .select({ id: vendorKeyGroupItems.id })
      .from(vendorKeyGroupItems)
      .where(eq(vendorKeyGroupItems.id, Number(itemId)));
    if (!item) {
      return reply.status(404).send({ code: 404, data: null, message: "Key 不存在" });
    }

    const keyGroupItemId = Number(itemId);
    const now = new Date();

    // 逐条 upsert
    const results: any[] = [];
    for (const p of prices) {
      if (!p.vendorModelId) continue;

      const type = p.type || "percent";
      const existing = await db
        .select()
        .from(vendorKeyGroupModelPrices)
        .where(
          and(
            eq(vendorKeyGroupModelPrices.keyGroupItemId, keyGroupItemId),
            eq(vendorKeyGroupModelPrices.vendorModelId, p.vendorModelId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // 更新
        const [updated] = await db
          .update(vendorKeyGroupModelPrices)
          .set({
            type: type as any,
            inputValue: p.inputValue != null ? String(p.inputValue) : null,
            outputValue: p.outputValue != null ? String(p.outputValue) : null,
            updatedAt: now,
          })
          .where(eq(vendorKeyGroupModelPrices.id, existing[0].id))
          .returning();
        results.push(updated);
      } else {
        // 新增
        const [created] = await db
          .insert(vendorKeyGroupModelPrices)
          .values({
            keyGroupItemId,
            vendorModelId: p.vendorModelId,
            type: type as any,
            inputValue: p.inputValue != null ? String(p.inputValue) : null,
            outputValue: p.outputValue != null ? String(p.outputValue) : null,
          })
          .returning();
        results.push(created);
      }
    }

    return { code: 0, data: { count: results.length }, message: "ok" };
  });

  // ── 删除某个 Key 对某模型的交叉价（清除 = 回退到 Key 统一价/通道价）──
  // DELETE /api/v1/admin/key-model-prices/:priceId
  app.delete("/api/v1/admin/key-model-prices/:priceId", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { priceId } = request.params as any;

    const db = getDb();
    await db
      .delete(vendorKeyGroupModelPrices)
      .where(eq(vendorKeyGroupModelPrices.id, Number(priceId)));
    return { code: 0, data: null, message: "ok" };
  });

  // ── 清空 Key 的所有模型交叉价 ──
  // DELETE /api/v1/admin/key-group-items/:itemId/model-prices
  app.delete("/api/v1/admin/key-group-items/:itemId/model-prices", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { itemId } = request.params as any;

    const db = getDb();
    await db
      .delete(vendorKeyGroupModelPrices)
      .where(eq(vendorKeyGroupModelPrices.keyGroupItemId, Number(itemId)));
    return { code: 0, data: null, message: "ok" };
  });
}
