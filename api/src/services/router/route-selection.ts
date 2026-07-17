// ============================================================
//  路由策略：候选查询 + 策略选择
// ============================================================

import { eq, and, asc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { vendorModels, vendors } from "../../db/schema.js";
import { decryptApiKey } from "../encryption.js";
import { AppError } from "../auth-service/index.js";
import type { RoutingOptions, VendorModelRoute, RoutingStrategy } from "./types.js";
import { resolveModelId } from "./model-cache.js";

// ── 查询可用路由候选 ──

async function queryAvailableRoutes(modelId: number): Promise<VendorModelRoute[]> {
  const db = getDb();

  const rows = await db
    .select({
      vendorModelId: vendorModels.id,
      vendorId: vendorModels.vendorId,
      vendorName: vendors.name,
      modelId: vendorModels.modelId,
      upstreamModelName: vendorModels.upstreamModelName,
      apiEndpoint: vendorModels.apiEndpoint,
      apiKeyEncrypted: vendorModels.apiKeyEncrypted,
      keyGroupId: vendorModels.keyGroupId,
      sellPriceInput: vendorModels.sellPriceInput,
      sellPriceOutput: vendorModels.sellPriceOutput,
      weight: vendorModels.weight,
      rpmLimit: vendorModels.rpmLimit,
      tpmLimit: vendorModels.tpmLimit,
      healthScore: vendorModels.healthScore,
      isDown: vendorModels.isDown,
    })
    .from(vendorModels)
    .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
    .where(
      and(
        eq(vendorModels.modelId, modelId),
        eq(vendorModels.status, true),
        eq(vendorModels.isDown, false),
        eq(vendors.status, "active"),
      )
    )
    .orderBy(asc(vendorModels.sellPriceInput));

  return rows.map((r) => ({
    vendorModelId: r.vendorModelId,
    vendorId: r.vendorId,
    vendorName: r.vendorName,
    modelId: r.modelId,
    upstreamModelName: r.upstreamModelName,
    apiEndpoint: r.apiEndpoint,
    apiKeyPlain: decryptApiKey(r.apiKeyEncrypted),
    keyGroupId: r.keyGroupId,
    keyGroupItemId: null,
    keySellPriceInput: null,
    keySellPriceOutput: null,
    sellPriceInput: Number(r.sellPriceInput),
    sellPriceOutput: Number(r.sellPriceOutput),
    weight: r.weight,
    rpmLimit: r.rpmLimit,
    tpmLimit: r.tpmLimit,
    healthScore: Number(r.healthScore ?? 1),
    isDown: r.isDown,
  }));
}

// ── 按策略选择 ──

function pickByStrategy(
  candidates: VendorModelRoute[],
  strategy: RoutingStrategy,
  preferredVendorId?: number,
): VendorModelRoute {
  if (candidates.length === 0) {
    throw new AppError("NO_ROUTE", "该模型暂无可用上游厂商", 503);
  }

  switch (strategy) {
    case "lowest_price":
      // 已按 sellPriceInput ASC 排序，取第一个
      return candidates[0];

    case "weighted_random": {
      const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
      if (totalWeight <= 0) return candidates[0];

      let rand = Math.random() * totalWeight;
      for (const c of candidates) {
        rand -= c.weight;
        if (rand <= 0) return c;
      }
      return candidates[candidates.length - 1];
    }

    case "manual": {
      if (!preferredVendorId) {
        throw new AppError("MANUAL_NEEDS_VENDOR", "手动路由需要指定 preferredVendorId", 400);
      }
      const match = candidates.find((c) => c.vendorId === preferredVendorId);
      if (!match) {
        throw new AppError(
          "VENDOR_NOT_AVAILABLE",
          `指定的厂商 (ID ${preferredVendorId}) 对该模型不可用或已下线`,
          400,
        );
      }
      return match;
    }

    default:
      return candidates[0];
  }
}

// ── 解析 Key 分组：用分组选择的实际 Key 覆盖路由的 apiKeyPlain ──

async function resolveKeyGroup(
  route: VendorModelRoute,
  redis: any,
): Promise<VendorModelRoute> {
  if (!route.keyGroupId) return route;
  try {
    const { selectKeyFromGroup } = await import("./key-group.js");
    const result = await selectKeyFromGroup(route.keyGroupId, redis);
    if (!result) {
      // Key 分组无可选 Key，沿用 vendorModel 本身的 Key
      return route;
    }
    const item = result.item;
    return {
      ...route,
      apiKeyPlain: result.apiKeyPlain,
      keyGroupItemId: item.id,
      // Key 级别有专属价格则覆盖 vendorModel 售价
      keySellPriceInput: item.sellPriceInput != null ? Number(item.sellPriceInput) : null,
      keySellPriceOutput: item.sellPriceOutput != null ? Number(item.sellPriceOutput) : null,
    };
  } catch (err) {
    console.warn("[Router] KeyGroup 解析异常，降级使用 vendorModel 默认 Key:", err);
    return route;
  }
}

// ── 对外接口：选择最佳厂商-模型路由（含熔断 + Key 分组解析） ──

export async function selectRoute(options: RoutingOptions): Promise<VendorModelRoute> {
  const modelId = await resolveModelId(options.modelName);
  const strategy = options.strategy ?? "lowest_price";

  let candidates = await queryAvailableRoutes(modelId);

  // 熔断检查：过滤掉熔断中的厂商
  try {
    const { shouldSkipVendor } = await import("../circuit-breaker.js");
    const filtered: VendorModelRoute[] = [];
    for (const c of candidates) {
      const skip = await shouldSkipVendor(c.vendorModelId);
      if (!skip) {
        filtered.push(c);
      }
    }
    // 如果全被熔断，放宽限制，允许最低价的熔断厂商通过（总比不可用强）
    candidates = filtered.length > 0 ? filtered : candidates;
  } catch (err) {
    console.warn("[Router] 熔断检查异常，跳过:", err);
  }

  const selected = pickByStrategy(candidates, strategy, options.preferredVendorId);

  // 若该路由配置了 Key 分组，从分组中解析实际 Key 和价格
  const redis = (await import("../../redis.js")).getRedis();
  return resolveKeyGroup(selected, redis);
}
