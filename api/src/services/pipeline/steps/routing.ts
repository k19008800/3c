/**
 * 路由选择步骤
 *
 * 职责：
 * - 调用 selectRoute 选择最优供应商（加权轮询 + 熔断过滤）
 * - 调用 selectKey 选择 API Key（polling 模式）
 * - 从 DB 读取 vendor 详情（baseUrl）
 * - 设置 ctx.vendorId / ctx.vendorModelId / ctx.upstreamModel / ctx.vendorApiKey / ctx.vendorBaseUrl
 * - 无可用路由 → 503
 *
 * @see services/router.ts selectRoute
 * @see services/upstream/key-selector.ts selectKey
 * @module pipeline/steps
 */

import type { PipelineStep } from "../types";
import type { GatewayContext } from "../types";
import { eq } from "drizzle-orm";
import { db } from "../../../db/index";
import { vendors } from "../../../db/schema/vendors";
import { selectRoute } from "../../router";
import { selectKey } from "../../upstream/key-selector";

/**
 * 创建路由选择 Pipeline 步骤
 *
 * execute: 路由选择 → Key 选择 → 读供应商详情 → 设置 ctx
 * rollback: 无
 */
export function createRoutingStep(): PipelineStep<GatewayContext> {
  return {
    name: "routing",
    execute: async (ctx) => {
      // 1. 选择供应商
      const route = await selectRoute(ctx.modelId!);
      if (!route) {
        throw Object.assign(new Error("无可用供应商"), {
          _httpStatus: 503,
          _code: "ROUTING_ALL_DOWN",
        });
      }

      // 2. 读取供应商信息
      const vendorRow = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, route.vendorId))
        .limit(1);
      const vendor = vendorRow[0];
      if (!vendor) {
        throw Object.assign(new Error("供应商不存在"), {
          _httpStatus: 503,
          _code: "VENDOR_NOT_FOUND",
        });
      }

      // 3. 选择 API Key（polling 模式）
      const keyResult = await selectKey(route.vendorId, "polling");
      if (!keyResult.encryptedKey) {
        throw Object.assign(new Error("供应商无可用的 API Key"), {
          _httpStatus: 503,
          _code: keyResult.reason === "all_exhausted" ? "ALL_KEYS_EXHAUSTED" : "NO_VENDOR_KEY",
        });
      }

      ctx.vendorId = route.vendorId;
      ctx.vendorName = vendor.name;
      ctx.vendorModelId = route.vendorModelId;
      ctx.upstreamModel = route.upstreamModel;
      ctx.vendorApiKey = keyResult.encryptedKey;
      ctx.vendorBaseUrl = vendor.baseUrl;
    },
  };
}
