/**
 * 余额预扣步骤
 *
 * 职责：
 * - 根据定价计算预估费用：estInput ~ 100, estOutput = max_tokens || 200
 * - 调用 reserveBalance 预扣余额（行级锁保证原子性）
 * - 设置 ctx.estimatedCost / ctx.balanceReserved
 * - 预扣失败 → 402 余额不足
 *
 * rollback: 调用 refundBalance 退还预扣金额
 *
 * @see services/billing.ts reserveBalance / refundBalance
 * @module pipeline/steps
 */

import type { PipelineStep } from "../types";
import type { GatewayContext } from "../types";
import { calcCost, reserveBalance, refundBalance } from "../../billing";

/**
 * 创建余额预扣 Pipeline 步骤
 *
 * execute: 计算预估费用 → 预扣余额 → 设置 ctx
 * rollback: 退还预扣金额
 */
export function createPreConsumeStep(): PipelineStep<GatewayContext> {
  return {
    name: "pre-consume",
    execute: async (ctx) => {
      const estInput = 100; // 保守估算输入 token
      const estOutput = (ctx.body.max_tokens as number) ?? 200;
      const inputPrice = ctx.inputPrice ?? 0;
      const outputPrice = ctx.outputPrice ?? 0;
      ctx.estimatedCost = calcCost(estInput, estOutput, inputPrice, outputPrice);

      const result = await reserveBalance(ctx.userId!, ctx.estimatedCost, "api_call");
      if (!result.ok) {
        throw Object.assign(new Error(result.error ?? "余额不足"), {
          _httpStatus: 402,
          _code: result.error ?? "INSUFFICIENT_BALANCE",
        });
      }
      ctx.balanceBefore = result.balanceAfter!; // 预扣后余额
      ctx.balanceReserved = true;
    },
    rollback: async (ctx) => {
      if (ctx.balanceReserved && ctx.estimatedCost && ctx.estimatedCost > 0.0001) {
        await refundBalance(ctx.userId!, ctx.estimatedCost).catch(() => {});
        ctx.balanceReserved = false;
      }
    },
  };
}
