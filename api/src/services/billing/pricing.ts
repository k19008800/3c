/**
 * 共享定价服务 — getPricingForModel / computeCost / 预估费用（P0-1 抽取）
 *
 * 背景：chat / messages / responses / anthropic / openai-compat / rerank / ws-relay /
 * task-relay 8 处此前各自复制了一份等价实现（见 docs/iteration-plan-v2.md P0-1 关键约束）。
 * P0-1 抽取为共享服务，预扣判定与冻结只挂在共享 settle/pricing 上 → 8 个入口一次生效。
 *
 * 行为与原各路由私有实现完全等价（回归安全）：
 *   - 定价查询失败或数据非法（NaN / ≤0）→ 静默回退默认价，不阻断主链路；
 *   - computeCost = input/1000×inputPrice + output/1000×outputPrice。
 *
 * @see docs/iteration-plan-v2.md P0-1
 * @module services/billing
 */

import { db, schema } from '../../db';
import { eq } from 'drizzle-orm';

// ============================================================
// 常量
// ============================================================

/** 默认单价（¥ / 1K tokens）——取不到 vendor_pricing 时兜底（与原 chat.ts 一致） */
export const DEFAULT_INPUT_PRICE = 0.002;
export const DEFAULT_OUTPUT_PRICE = 0.008;

/** 默认预估输出 token 上限：预扣金额估算用（max_tokens 未传时的保守封顶） */
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

/** 任务计费单位：1 次任务按 1000 output tokens 计费（任务 API 无 token 语义，与 task-relay 一致） */
export const TASK_BILLING_UNIT_TOKENS = 1000;

/** 兜底默认定价 */
const DEFAULT_PRICING = { input: DEFAULT_INPUT_PRICE, output: DEFAULT_OUTPUT_PRICE };

// ============================================================
// 定价查询
// ============================================================

/**
 * 查找模型定价（vendor_pricing × supplier_models），无则默认
 *
 * 定价查询失败或数据非法（NaN / ≤0）时静默回退默认价，不阻断主链路。
 *
 * @param model - 用户请求的模型名
 * @returns { input, output, cacheDiscountRate } 单价（¥ / 1K tokens）+
 *          模型级缓存命中折扣率（0-1；未配置为 null → 用全局 `billing.cache_hit_discount`）
 */
export async function getPricingForModel(model: string): Promise<{
  input: number;
  output: number;
  cacheDiscountRate: number | null;
}> {
  try {
    const rows = await db.select({
      inputPrice: schema.vendorPricing.inputPrice,
      outputPrice: schema.vendorPricing.outputPrice,
      cacheDiscountRate: schema.vendorPricing.cacheDiscountRate,
    })
      .from(schema.vendorPricing)
      .innerJoin(schema.supplierModels, eq(schema.vendorPricing.supplierModelId, schema.supplierModels.id))
      .where(eq(schema.supplierModels.modelName, model))
      .limit(1);

    if (rows.length > 0) {
      const input = Number(rows[0]!.inputPrice);
      const output = Number(rows[0]!.outputPrice);
      const rate = Number(rows[0]!.cacheDiscountRate);
      // 模型级折扣率：合法（0 < rate ≤ 1）才采信；非法/空 → null（回退全局）
      const cacheDiscountRate = Number.isFinite(rate) && rate > 0 && rate <= 1 ? rate : null;
      if (!isNaN(input) && !isNaN(output) && input > 0 && output > 0) {
        return { input, output, cacheDiscountRate };
      }
    }
  } catch {
    /* 定价查询失败 → 走默认价 */
  }
  return { ...DEFAULT_PRICING, cacheDiscountRate: null };
}

// ============================================================
// 费用计算
// ============================================================

/**
 * 按 token 数与单价计算费用（¥）
 *
 * @param model - 模型名（当前仅用于保持签名与原各路由一致，便于后续按模型差异化计价）
 * @param inputTokens - 输入 token 数
 * @param outputTokens - 输出 token 数
 * @param pricing - 单价，缺省时用默认价
 * @returns 费用（元）
 */
export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  pricing?: { input: number; output: number },
): number {
  const p = pricing ?? DEFAULT_PRICING;
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
}

/**
 * 预估请求费用（预扣金额用）— 输入 token 实算 + 输出 token 按上限封顶估算
 *
 * P0-1 设计依据：单次请求费用天然有上限（max_tokens 封顶），阈值本身即防打爆屏障。
 * 预扣金额 = computeCost(input 实算, min(max_tokens, 上限) 封顶)，保证冻结额能覆盖
 * 绝大多数实际消费（多退少补兜底）。
 *
 * @param model - 模型名
 * @param inputTokens - 输入 token 数
 * @param pricing - 单价（缺省默认价）
 * @param maxOutputTokens - 请求 max_tokens（未传/非法时用 DEFAULT_MAX_OUTPUT_TOKENS；超上限截断）
 * @returns 预估费用（元）
 */
export function computeEstimatedCost(
  model: string,
  inputTokens: number,
  pricing?: { input: number; output: number },
  maxOutputTokens?: number,
): number {
  const requested = Number(maxOutputTokens);
  const capped = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, DEFAULT_MAX_OUTPUT_TOKENS)
    : DEFAULT_MAX_OUTPUT_TOKENS;
  return computeCost(model, inputTokens, capped, pricing);
}

/**
 * 任务单价（task-relay）：1 次任务 = TASK_BILLING_UNIT_TOKENS 个 output tokens，
 * 即任务单价 = 模型 outputPrice（¥/次）。
 *
 * @param model - 计费模型名（如 mj_imagine / suno_music）
 * @param pricing - 单价，缺省用默认价
 * @returns 单次任务费用（元）
 */
export function computeTaskCost(model: string, pricing?: { input: number; output: number }): number {
  const p = pricing ?? DEFAULT_PRICING;
  return (TASK_BILLING_UNIT_TOKENS / 1000) * p.output;
}

// ============================================================
// 定价录入单位校验（P1-4）
// ============================================================

/**
 * 疑似 ¥/M 误填的提示文案（PRICE_UNIT_SUSPECT 的错误消息）。
 *
 * 路由层用该常量区分错误类型：`validatePricingUnit` 返回的 error 等于此值时，
 * 应答 `400 + code=PRICE_UNIT_SUSPECT`（前端据此展示"单价疑似以 ¥/M 录入"），
 * 其余 error 属于参数非法（400 VALIDATION_ERROR）。
 */
export const PRICE_UNIT_SUSPECT_MESSAGE = '单价疑似以 ¥/M 录入（单位应为 ¥/1K），请确认';

/**
 * 管理端定价录入单位校验 — 从入口拦截 1000× 计费偏差事故（P1-4）
 *
 * 背景：2026-08-17 曾发生计费偏差事故：vendor_pricing 把 ¥/M 值（2/8）误填进
 * ¥/1K 字段 → 计费偏差 1000 倍（742 tokens 扣 ¥5.876，应为 ¥0.0058）。
 * 语义约定：单价单位是 **¥/1K tokens**；任一价格 > 10 视为疑似 ¥/M 误填。
 *
 * 规则：
 *   - 合法范围：(0, 10]，两端都为合法值才通过
 *   - 任一 > 10 → 疑似 ¥/M 误填（error = PRICE_UNIT_SUSPECT_MESSAGE）
 *   - 非数字（NaN/Infinity）或 ≤ 0 → 参数非法
 *
 * @param input - 输入单价（¥/1K tokens）
 * @param output - 输出单价（¥/1K tokens）
 * @returns `{ ok: true }` 合法；`{ ok: false, error }` 拒绝原因（error 等于
 *          PRICE_UNIT_SUSPECT_MESSAGE 时为疑似 ¥/M 误填，其余为参数非法）
 *
 * @example
 * ```ts
 * validatePricingUnit(2, 8);        // { ok: true }
 * validatePricingUnit(2000, 8);     // { ok: false, error: PRICE_UNIT_SUSPECT_MESSAGE }
 * validatePricingUnit(0, 8);        // { ok: false, error: '单价必须为大于 0 的数字（单位 ¥/1K tokens）' }
 * ```
 *
 * @see docs/iteration-plan-v2.md P1-4
 */
export function validatePricingUnit(input: number, output: number): { ok: boolean; error?: string } {
  if (!Number.isFinite(input) || !Number.isFinite(output)) {
    return { ok: false, error: '单价必须为大于 0 的数字（单位 ¥/1K tokens）' };
  }
  if (input <= 0 || output <= 0) {
    return { ok: false, error: '单价必须为大于 0 的数字（单位 ¥/1K tokens）' };
  }
  if (input > 10 || output > 10) {
    return { ok: false, error: PRICE_UNIT_SUSPECT_MESSAGE };
  }
  return { ok: true };
}
