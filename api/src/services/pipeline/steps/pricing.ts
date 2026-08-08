/**
 * 定价步骤
 *
 * 职责：
 * - 调用 getEffectivePrice 获取模型阶梯定价
 * - 设置 ctx.inputPrice / ctx.outputPrice / ctx.priceSource
 * - rollback: 无（纯计算）
 *
 * @see services/billing.ts getEffectivePrice
 * @module pipeline/steps
 */

import type { PipelineStep } from "../types";
import type { GatewayContext } from "../types";
import { getEffectivePrice } from "../../billing";

/**
 * 创建定价 Pipeline 步骤
 *
 * execute: 查询有效定价 → 设置 ctx
 * noRollbackOn: true
 */
export function createPricingStep(): PipelineStep<GatewayContext> {
  return {
    name: "pricing",
    noRollbackOn: true,
    execute: async (ctx) => {
      // 此时 vendorModelId 可能尚未确定（定价在路由之前也合理，因为只是取基础定价）
      const price = await getEffectivePrice(ctx.modelId!, ctx.vendorModelId);
      ctx.inputPrice = price.inputPrice;
      ctx.outputPrice = price.outputPrice;
      ctx.priceSource = price.priceSource;
    },
  };
}
