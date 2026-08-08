/**
 * 计费结算步骤
 *
 * 职责：
 * - 成功：计算实际费用，退还差额（estimatedCost - actualCost）
 * - 失败：全额退还预估费用
 * - 落库 call_logs + billing_logs
 * - 更新幂等缓存为实际结果
 * - 设置 ctx.actualCost / ctx.balanceAfter
 *
 * rollback: 无（退款已在 pre-consume rollback 处理）
 *
 * @see services/billing.ts calcCost / refundBalance / recordBilling / recordCallLog
 * @module pipeline/steps
 */

import type { PipelineStep } from "../types";
import type { GatewayContext } from "../types";
import { redis } from "../../../lib/redis";
import { pool } from "../../../db/index";
import { calcCost, refundBalance, recordBilling, recordCallLog } from "../../billing";

/**
 * 创建计费结算 Pipeline 步骤
 *
 * execute: 实扣计费 → 退差额 → 落库 → 更新缓存 → 设置 ctx
 */
export function createSettleStep(): PipelineStep<GatewayContext> {
  return {
    name: "settle",
    execute: async (ctx) => {
      const response = ctx.upstreamResponse;
      const estimatedCost = ctx.estimatedCost ?? 0;

      if (!response) return; // 不应发生

      let actualCost = 0;
      let inputTokens = 0;
      let outputTokens = 0;

      if (response.ok && response.usage) {
        inputTokens = response.usage.inputTokens;
        outputTokens = response.usage.outputTokens;
        actualCost = calcCost(inputTokens, outputTokens, ctx.inputPrice ?? 0, ctx.outputPrice ?? 0);
        ctx.actualCost = actualCost;

        // 退还差额（精算）
        const refund = estimatedCost - actualCost;
        if (refund > 0.0001 && ctx.balanceReserved) {
          await refundBalance(ctx.userId!, refund);
        }
      } else {
        // 失败：全额退还
        actualCost = 0;
        ctx.actualCost = 0;
        if (ctx.balanceReserved && estimatedCost > 0.0001) {
          await refundBalance(ctx.userId!, estimatedCost);
        }
      }

      // 读最终余额
      const balanceRows = await pool.query("SELECT balance FROM users WHERE id=$1", [ctx.userId!]);
      ctx.balanceAfter = Number(balanceRows.rows[0]?.balance ?? 0);

      // 落库：调用日志
      const callLogId = Number(Date.now());
      await recordCallLog({
        id: callLogId,
        userId: ctx.userId!,
        apiKeyId: ctx.apiKeyId,
        modelId: ctx.modelId!,
        vendorId: ctx.vendorId,
        requestId: ctx.req.id as string,
        provider: "vendor",
        upstreamModel: ctx.upstreamModel,
        requestTokens: inputTokens,
        responseTokens: outputTokens,
        costCents: Math.round(actualCost * 100),
        status: response.ok ? "success" : "failed",
        errorCode: response.ok ? undefined : response.error?.code,
        latencyMs: response.latencyMs,
        fallbackUsed: false,
      });

      // 落库：计费日志
      await recordBilling({
        userId: ctx.userId!,
        callLogId,
        priceSource: ctx.priceSource ?? "unknown",
        inputPrice: ctx.inputPrice ?? 0,
        outputPrice: ctx.outputPrice ?? 0,
        inputTokens,
        outputTokens,
        balanceBefore: ctx.balanceBefore ?? 0,
        balanceAfter: ctx.balanceAfter,
      });

      // 更新幂等缓存为实际响应
      if (ctx._idempotencyCacheKey && ctx.upstreamData) {
        await redis
          .setex(
            ctx._idempotencyCacheKey,
            24 * 60 * 60,
            JSON.stringify(ctx.upstreamData),
          )
          .catch(() => {});
      }
    },
  };
}
