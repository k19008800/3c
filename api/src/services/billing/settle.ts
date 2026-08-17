/**
 * 共享结算服务 — settleBilling（P0-1 抽取）
 *
 * 背景：chat / messages / responses / anthropic / openai-compat / rerank / ws-relay /
 * task-relay 8 处此前各自复制了一份等价实现（见 docs/iteration-plan-v2.md P0-1 关键约束）。
 * P0-1 抽取为共享服务：预扣判定与冻结只写在这里 → 8 个入口一次生效，无遗漏。
 *
 * 行为与原各路由私有实现完全等价（回归安全）：
 *   顺序：扣费（或结算预扣）→ recordConsumption 记消费 → 异步生成佣金 → 更新 key 时间。
 *
 * 预扣语义（opts.preConsume）：
 *   - mode='frozen' → settlePreConsume（Redis 多退少补 + PG 镜像）；
 *   - mode='bypass'（或未传）→ deductBalance 普通扣费；bypass 允许记负
 *     （极端并发竞态兜底：余额 < 0 写 risk_events + 强制预扣标记）；
 *   - 豁免路径（task-relay 等）不传 preConsume → 普通扣费（严格校验，不允许记负）。
 *
 * @see docs/iteration-plan-v2.md P0-1
 * @see coding-standards-api-db-test.md §3 测试规范
 * @module services/billing
 */

import { db, schema } from '../../db';
import { eq } from 'drizzle-orm';
import type { PipelineContext } from '../pipeline/types';
import type { SelectedChannel } from '../upstream/routing';
import { deductBalance } from './balance';
import { recordConsumption } from './consumption-log';
import { generateCommissionForConsumption } from '../agent/commission';
import { settlePreConsume, recordNegativeBalanceRisk, type PreConsumeResult } from './pre-consume';

/** settleBilling 记账标记（与原各路由 opts 完全一致） */
export interface SettleOptions {
  streamed: boolean;
  trustUpstream: boolean;
  fallback: boolean;
  finishReason?: string;
  errorCode?: string;
  cacheHitTokens?: number;
  cacheDiscount?: number;
  /**
   * P0-1 预扣结果：mode='frozen' → 冻结结算（settlePreConsume）；
   * mode='bypass' → 普通扣费 + 允许记负兜底；未传（豁免路径）→ 普通严格扣费。
   */
  preConsume?: PreConsumeResult | null;
}

/**
 * 记账 + 扣费 + 佣金 + 更新 key 最后调用时间（8 处路由共享）
 *
 * @param ctx - 流水线上下文（含 userId / apiKeyId / requestId / model）
 * @param input - 输入 token 数
 * @param output - 输出 token 数
 * @param cost - 费用（¥）
 * @param channel - 选中的渠道；mock 回退时为 null
 * @param opts - 记账标记（含预扣结果）
 * @throws 扣费/结算失败向上抛出（由路由 catch 统一处理），保证不出现"响应成功但未记账"
 */
export async function settleBilling(
  ctx: PipelineContext,
  input: number,
  output: number,
  cost: number,
  channel: SelectedChannel | null,
  opts: SettleOptions,
): Promise<void> {
  // ── 扣费：预扣请求走冻结结算，其余走普通扣费 ──
  if (opts.preConsume?.mode === 'frozen') {
    await settlePreConsume(ctx, cost, opts.preConsume);
  } else {
    // 旁路允许记负（极端并发竞态兜底）；豁免路径（task-relay）严格校验
    const allowNegative = opts.preConsume?.mode === 'bypass';
    const result = await deductBalance(ctx.userId, cost.toFixed(8), 'consumption', ctx.requestId, { allowNegative });
    // 记负兜底：旁路扣费后余额 < 0 → risk_events + 强制预扣标记（充值回正前不旁路）
    if (allowNegative && Number(result.balanceAfter) < 0) {
      await recordNegativeBalanceRisk(ctx, result.balanceAfter);
    }
  }

  // ── 记消费（与原各路由实现一致）──
  const record = await recordConsumption({
    userId: ctx.userId,
    apiKeyId: ctx.apiKeyId,
    model: ctx.model,
    supplierId: channel?.supplier.id,
    // task-relay 的 toSelectedChannel 用 modelMapping.id=0 占位 → 归一化为 undefined
    // （与原各路由实现 `channel?.modelMapping.id || undefined` 行为一致，避免 FK 违规）
    supplierModelId: channel?.modelMapping.id || undefined,
    inputTokens: input,
    outputTokens: output,
    cost: cost.toFixed(8),
    trustUpstream: opts.trustUpstream,
    fallback: opts.fallback,
    streamed: opts.streamed,
    finishReason: opts.finishReason,
    errorCode: opts.errorCode,
    requestId: ctx.requestId,
    // 缓存命中打折信息：表无对应列时 recordConsumption 内部跳过，不报错
    cacheHitTokens: opts.cacheHitTokens,
    cacheDiscount: opts.cacheDiscount,
  });

  // 实时佣金结算（异步，不阻塞响应）：消费产生即结算；无代理绑定则内部跳过。
  // 幂等由 agent_commissions.consumption_record_id 唯一索引保证；进程崩溃由回填调度器自愈。
  if (record?.id) {
    void generateCommissionForConsumption({
      userId: ctx.userId,
      consumptionRecordId: record.id,
      cost: cost.toFixed(8),
    }).catch((e) => {
      console.error(`[settle] commission generation failed for consumption ${record.id}:`, e);
    });
  }

  // 更新 key 最后调用时间（非致命）
  if (ctx.apiKeyId) {
    await db.update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, ctx.apiKeyId))
      .catch(() => { /* 非致命 */ });
  }
}
