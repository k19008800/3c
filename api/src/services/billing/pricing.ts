/**
 * 共享定价服务 — getPricingForModel（六层解析 L5–L1）/ computeCost / 预估费用
 *
 * 背景：chat / messages / responses / anthropic / openai-compat / rerank / ws-relay /
 * task-relay 8 处此前各自复制了一份等价实现（见 docs/iteration-plan-v2.md P0-1 关键约束）。
 * P0-1 抽取为共享服务，P2-1 在其上接入 L5 活动价 / L4 分组价 / L3 代理价。
 *
 * ── 六层定价解析（P2-1）──
 * 优先级 L5 > L4 > L3 > L2 > L1；上层未命中 / 未配置该模型 → 逐层降级；
 * 任一层查询失败静默降级，不阻断主链路（与 P0-1 行为一致）。
 *
 *   L5 活动价  campaigns（status='active' 且 startAt ≤ now ≤ endAt）的 config.pricing：
 *              模型级覆盖（models.<model>.input/output）优先于全局折扣（discount）。
 *              同模型多个进行中活动 → 最近开始（start_at desc, id desc）优先。
 *              config jsonb 格式约定见 parseCampaignPricing JSDoc。
 *   L4 分组价  user_group_memberships → user_groups.pricingGroup → vendor_pricing.pricing_group
 *              匹配该组名且 model_name 匹配的记录；未配置该模型 → 降级。
 *   L3 代理价  agent_customers（status='active'，归属唯一来源=报备划拨）→ agents（status='active'）
 *              → 按 level 查 AGENT_LEVEL_DISCOUNT_RATE 折扣率，乘在 L2/L1 基价上。
 *   L2 模型覆盖价  vendor_pricing.pricing_group='default' 按模型名取价（P0-1 原有逻辑，显式限定默认组）。
 *   L1 平台标准价  DEFAULT_INPUT_PRICE / DEFAULT_OUTPUT_PRICE 兜底。
 *
 * 单位约定：单价为 ¥/1K tokens（P1-4 校验入口保证录入不超 ¥10）。
 *
 * @see docs/iteration-plan-v2.md P0-1 / P2-1
 * @module services/billing
 */

import { db, schema } from '../../db';
import { eq, and, lte, gte, isNotNull, desc } from 'drizzle-orm';

// ============================================================
// 常量
// ============================================================

/** 默认单价（¥ / 1K tokens）——取不到 vendor_pricing 时兜底（L1 平台标准价，与原 chat.ts 一致） */
export const DEFAULT_INPUT_PRICE = 0.002;
export const DEFAULT_OUTPUT_PRICE = 0.008;

/** 默认预估输出 token 上限：预扣金额估算用（max_tokens 未传时的保守封顶） */
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

/** 任务计费单位：1 次任务按 1000 output tokens 计费（任务 API 无 token 语义，与 task-relay 一致） */
export const TASK_BILLING_UNIT_TOKENS = 1000;

/** L2 模型覆盖价的默认定价组名（vendor_pricing.pricing_group） */
const DEFAULT_PRICING_GROUP = 'default';

/**
 * 代理层级 → 折扣系数（L3 代理价，乘在 L2/L1 基价上；1 = 不打折）。
 *
 * 映射方案（P2-1 设计）：新增映射常量，与佣金率（agents.commissionRate）解耦、
 * 简单可单测、运营可直接按层级预期折扣。junior 95 折 / senior 9 折 / partner 85 折。
 */
export const AGENT_LEVEL_DISCOUNT_RATE: Record<string, number> = {
  junior: 0.95,
  senior: 0.9,
  partner: 0.85,
};

/** 未知代理层级回退折扣系数（pgEnum 约束下不可达；防御性兜底 = 不打折） */
export const DEFAULT_AGENT_DISCOUNT_RATE = 1;

/** L5 活动价扫描上限：进行中活动超过该数时只取最近开始的 N 个（防御异常数据膨胀） */
export const CAMPAIGN_PRICE_SCAN_LIMIT = 5;

/** 兜底默认定价（L1） */
const DEFAULT_PRICING = { input: DEFAULT_INPUT_PRICE, output: DEFAULT_OUTPUT_PRICE };

// ============================================================
// 类型
// ============================================================

/** 定价结果（getPricingForModel 返回值；computeCost 等消费的单价结构） */
export interface ModelPricing {
  /** 输入单价（¥ / 1K tokens） */
  input: number;
  /** 输出单价（¥ / 1K tokens） */
  output: number;
  /**
   * 模型级缓存命中折扣率（0-1）；未配置为 null → 用全局 `billing.cache_hit_discount`。
   * L5/L3 为折扣推导价 → 恒为 null（跟随全局）。
   */
  cacheDiscountRate: number | null;
}

/**
 * 定价上下文（P2-1）。
 *
 * - userId：必填时启用 L4/L3 解析；缺省（不传 ctx 或空对象）→ 行为与旧签名完全等价（仅 L2/L1）。
 * - groupId / agentId：路由层预解析后可直传；未传时由 getPricingForModel 内部按需惰性
 *   解析（user_group_memberships / agent_customers），同一 ctx 对象只查一次并复用
 *   （WeakMap 记忆，避免每请求多次 DB 往返）。
 */
export interface PricingContext {
  /** 用户 ID（网关从 apiKeyContext / userContext 取） */
  userId?: number;
  /** 用户所属分组 ID（user_groups.id，可预解析传入） */
  groupId?: number;
  /** 用户绑定代理 ID（agents.id，可预解析传入） */
  agentId?: number;
}

/** 活动价规则解析结果（parseCampaignPricing 返回值，判别联合） */
export type CampaignPriceRule =
  /** 模型级覆盖价（¥/1K tokens）——优先于全局折扣 */
  | { kind: 'model'; input: number; output: number }
  /** 全局折扣系数（0 < d ≤ 1，作用于 L2/L1 基价） */
  | { kind: 'discount'; discount: number };

// ============================================================
// 上下文构建（路由层调用）
// ============================================================

/** 按请求对象记忆定价上下文：同一请求多次调用返回同一 ctx（配合内部惰性解析缓存） */
const requestCtxMemo = new WeakMap<object, PricingContext>();

/**
 * 从 Fastify 请求构建定价上下文（P2-1 网关调用点使用）。
 *
 * userId 解析顺序：apiKeyContext（网关 API Key 鉴权后填充）→ userContext（JWT 鉴权）。
 * 同一 request 对象只构建一次（WeakMap 记忆），groupId/agentId 不在此处查询——
 * 由 getPricingForModel 按需惰性解析（见 PricingContext 注释）。
 *
 * @param request - Fastify 请求对象（或任何带 apiKeyContext/userContext 的对象）
 * @returns 定价上下文；无 userId 时返回空对象（走 L2/L1 默认路径）
 *
 * @example
 * ```ts
 * const pricing = await getPricingForModel(req.model, buildPricingContext(c.request));
 * ```
 */
export function buildPricingContext(request: unknown): PricingContext {
  if (!request || typeof request !== 'object') return {};
  const memo = requestCtxMemo.get(request);
  if (memo) return memo;
  const req = request as { apiKeyContext?: { userId?: number }; userContext?: { userId?: number } };
  const userId = req.apiKeyContext?.userId ?? req.userContext?.userId;
  const ctx: PricingContext = userId === undefined ? {} : { userId };
  requestCtxMemo.set(request, ctx);
  return ctx;
}

// ============================================================
// 活动价配置解析（L5）— 纯函数，格式约定在此
// ============================================================

/**
 * 解析活动价配置（L5）。
 *
 * ── campaigns.config jsonb 格式约定（P2-1 设计，运营/活动创建方按此录入）──
 * ```json
 * {
 *   "pricing": {
 *     "models": {
 *       "<平台模型名>": { "input": 1.5, "output": 4.5 }
 *     },
 *     "discount": 0.8
 *   }
 * }
 * ```
 * - `pricing.models`：模型级覆盖价（¥/1K tokens），**优先于全局 discount**；值必须 > 0 的数字。
 * - `pricing.discount`：全局折扣系数（0 < d ≤ 1），作用于该模型的 L2 模型覆盖价（未配置则 L1 平台标准价）。
 * - 两者皆无 / 数值非法 → 该活动对该模型不生效（返回 null，逐层降级）。
 * - 活动生效条件在查询层判定：campaigns.status='active' 且 startAt ≤ now ≤ endAt。
 *
 * @param config - campaigns.config jsonb 原始值
 * @param model - 平台模型名
 * @returns 命中规则（判别联合）；未配置 / 非法 → null
 *
 * @example
 * ```ts
 * parseCampaignPricing({ pricing: { models: { 'gpt-4o': { input: 1.5, output: 4.5 } } } }, 'gpt-4o');
 * // → { kind: 'model', input: 1.5, output: 4.5 }
 * parseCampaignPricing({ pricing: { discount: 0.8 } }, 'gpt-4o');
 * // → { kind: 'discount', discount: 0.8 }
 * ```
 */
export function parseCampaignPricing(config: unknown, model: string): CampaignPriceRule | null {
  if (!config || typeof config !== 'object') return null;
  const pricing = (config as { pricing?: unknown }).pricing;
  if (!pricing || typeof pricing !== 'object') return null;
  const p = pricing as { models?: Record<string, unknown>; discount?: unknown };

  // 1. 模型级覆盖优先
  const modelCfg = p.models?.[model];
  if (modelCfg && typeof modelCfg === 'object') {
    const m = modelCfg as { input?: unknown; output?: unknown };
    const input = Number(m.input);
    const output = Number(m.output);
    if (Number.isFinite(input) && Number.isFinite(output) && input > 0 && output > 0) {
      return { kind: 'model', input, output };
    }
  }

  // 2. 全局折扣（模型级未命中/非法时应用）
  const discount = Number(p.discount);
  if (Number.isFinite(discount) && discount > 0 && discount <= 1) {
    return { kind: 'discount', discount };
  }

  return null;
}

// ============================================================
// 内部查询（每层独立 try/catch 由调用方保证静默降级）
// ============================================================

/** 行 → 定价：数据非法（NaN / ≤0）→ null（与 P0-1 行为一致） */
function toPricing(rows: Array<{
  inputPrice: string | number | null;
  outputPrice: string | number | null;
  cacheDiscountRate: string | number | null;
}>): ModelPricing | null {
  if (rows.length === 0) return null;
  const input = Number(rows[0]!.inputPrice);
  const output = Number(rows[0]!.outputPrice);
  const rate = Number(rows[0]!.cacheDiscountRate);
  const cacheDiscountRate = Number.isFinite(rate) && rate > 0 && rate <= 1 ? rate : null;
  if (!Number.isNaN(input) && !Number.isNaN(output) && input > 0 && output > 0) {
    return { input, output, cacheDiscountRate };
  }
  return null;
}

/** 查询指定定价组下某模型的单价（L2/L4 共用） */
async function queryPricingByGroup(model: string, groupName: string): Promise<ModelPricing | null> {
  const rows = await db.select({
    inputPrice: schema.vendorPricing.inputPrice,
    outputPrice: schema.vendorPricing.outputPrice,
    cacheDiscountRate: schema.vendorPricing.cacheDiscountRate,
  })
    .from(schema.vendorPricing)
    .innerJoin(schema.supplierModels, eq(schema.vendorPricing.supplierModelId, schema.supplierModels.id))
    .where(and(
      eq(schema.supplierModels.modelName, model),
      eq(schema.vendorPricing.pricingGroup, groupName),
    ))
    .limit(1);
  return toPricing(rows);
}

/** L2 模型覆盖价：pricing_group='default' 按模型名取价 */
async function queryDefaultPricing(model: string): Promise<ModelPricing | null> {
  return queryPricingByGroup(model, DEFAULT_PRICING_GROUP);
}

/**
 * L5 活动价查询：进行中活动（status='active' 且 startAt ≤ now ≤ endAt）按
 * 最近开始优先扫描，返回第一个对该模型生效的活动价。
 *
 * @param model - 平台模型名
 * @param now - 判定时间点（默认当前时间；测试可注入固定时间）
 * @returns 活动价；无进行中活动 / 均未配置该模型 → null
 */
async function queryCampaignPricing(model: string, now: Date = new Date()): Promise<ModelPricing | null> {
  const rows = await db.select({
    id: schema.campaigns.id,
    name: schema.campaigns.name,
    config: schema.campaigns.config,
    startAt: schema.campaigns.startAt,
    endAt: schema.campaigns.endAt,
  })
    .from(schema.campaigns)
    .where(and(
      eq(schema.campaigns.status, 'active'),
      isNotNull(schema.campaigns.startAt),
      isNotNull(schema.campaigns.endAt),
      lte(schema.campaigns.startAt, now),
      gte(schema.campaigns.endAt, now),
    ))
    .orderBy(desc(schema.campaigns.startAt), desc(schema.campaigns.id))
    .limit(CAMPAIGN_PRICE_SCAN_LIMIT);

  for (const row of rows) {
    const rule = parseCampaignPricing(row.config, model);
    if (!rule) continue;
    if (rule.kind === 'model') {
      return { input: rule.input, output: rule.output, cacheDiscountRate: null };
    }
    // 全局折扣：作用于 L2 模型覆盖价（未配置 → L1 平台标准价）
    const base = (await queryDefaultPricing(model)) ?? DEFAULT_PRICING;
    return {
      input: base.input * rule.discount,
      output: base.output * rule.discount,
      cacheDiscountRate: null,
    };
  }
  return null;
}

// ── L4/L3 惰性解析（每 ctx 对象只查一次并复用）──

/** 用户定价组名解析缓存（键 = PricingContext 对象 → 该请求只查一次） */
const groupNameMemo = new WeakMap<PricingContext, Promise<string | null>>();
/** 用户代理层级解析缓存（键 = PricingContext 对象 → 该请求只查一次） */
const agentLevelMemo = new WeakMap<PricingContext, Promise<string | null>>();

/**
 * 解析用户生效定价组名（L4）。
 *
 * 优先用 ctx.groupId（路由预解析）；否则查 user_group_memberships（一用户一组）。
 * 组无 pricingGroup（NULL）→ 视为未配置该组价，返回 null 降级。
 * 查询失败 → null（静默降级）。同一 ctx 对象结果缓存（WeakMap）。
 *
 * @param ctx - 定价上下文（须含 userId 或 groupId）
 * @returns 定价组名（如 'vip'）；未分组 / 组无定价组名 / 查询失败 → null
 */
function resolvePricingGroupName(ctx: PricingContext): Promise<string | null> {
  let p = groupNameMemo.get(ctx);
  if (!p) {
    p = (async () => {
      let groupId = ctx.groupId;
      if (groupId === undefined) {
        const [membership] = await db
          .select({ groupId: schema.userGroupMemberships.groupId })
          .from(schema.userGroupMemberships)
          .where(eq(schema.userGroupMemberships.userId, ctx.userId!))
          .limit(1);
        groupId = membership?.groupId;
      }
      if (groupId === undefined) return null;
      const [group] = await db
        .select({ pricingGroup: schema.userGroups.pricingGroup })
        .from(schema.userGroups)
        .where(eq(schema.userGroups.id, groupId))
        .limit(1);
      return group?.pricingGroup ?? null;
    })().catch(() => null);
    groupNameMemo.set(ctx, p);
  }
  return p;
}

/**
 * 解析用户绑定代理层级（L3）。
 *
 * 优先用 ctx.agentId（路由预解析）；否则查 agent_customers（status='active'）→
 * agents（status='active'）。绑定或代理非 active → 视为未命中，返回 null 降级。
 * 查询失败 → null（静默降级）。同一 ctx 对象结果缓存（WeakMap）。
 *
 * @param ctx - 定价上下文（须含 userId 或 agentId）
 * @returns 代理层级（junior/senior/partner）；未绑定 / 非 active / 查询失败 → null
 */
function resolveAgentLevel(ctx: PricingContext): Promise<string | null> {
  let p = agentLevelMemo.get(ctx);
  if (!p) {
    p = (async () => {
      if (ctx.agentId !== undefined) {
        const [agent] = await db
          .select({ level: schema.agents.level })
          .from(schema.agents)
          .where(eq(schema.agents.id, ctx.agentId))
          .limit(1);
        return agent?.level ?? null;
      }
      const [binding] = await db
        .select({ level: schema.agents.level })
        .from(schema.agentCustomers)
        .innerJoin(schema.agents, eq(schema.agentCustomers.agentId, schema.agents.id))
        .where(and(
          eq(schema.agentCustomers.customerUserId, ctx.userId!),
          eq(schema.agentCustomers.status, 'active'),
          eq(schema.agents.status, 'active'),
        ))
        .limit(1);
      return binding?.level ?? null;
    })().catch(() => null);
    agentLevelMemo.set(ctx, p);
  }
  return p;
}

// ============================================================
// 六层定价解析（主入口）
// ============================================================

/**
 * 查找模型定价 — 六层解析（L5 活动价 → L4 分组价 → L3 代理价 → L2 模型覆盖价 → L1 平台标准价）
 *
 * 算法流程（P2-1）：
 *   1. L5：进行中活动（status='active' 且 startAt ≤ now ≤ endAt）命中 → 活动价；
 *      模型级覆盖优先于全局折扣；未配置该模型 → 降级。
 *   2. L4：用户分组（user_group_memberships → user_groups.pricingGroup）匹配
 *      vendor_pricing.pricing_group 的单价；未配置该模型 → 降级。
 *   3. L3：用户绑定代理（agent_customers → agents）按层级折扣（AGENT_LEVEL_DISCOUNT_RATE），
 *      折扣乘在 L2/L1 基价上。
 *   4. L2：pricing_group='default' 按模型名取价（原 P0-1 逻辑，显式限定默认组）。
 *   5. L1：DEFAULT_INPUT_PRICE / DEFAULT_OUTPUT_PRICE 兜底。
 *
 * 任一层查询失败或数据非法（NaN / ≤0）→ 静默降级，不阻断主链路（与 P0-1 一致）。
 * 不传 ctx（旧调用）→ 行为与原实现完全等价（仅 L2/L1）。
 *
 * @param model - 用户请求的模型名
 * @param ctx - 定价上下文（可选；userId 启用 L4/L3，groupId/agentId 可预解析）
 * @returns { input, output, cacheDiscountRate } 单价（¥ / 1K tokens）+
 *          模型级缓存命中折扣率（0-1；未配置为 null → 用全局 `billing.cache_hit_discount`）
 *
 * @example
 * ```ts
 * // 旧调用（兼容）：只走 L2/L1
 * const p1 = await getPricingForModel('gpt-4o');
 * // 新调用：按用户上下文解析 L5/L4/L3
 * const p2 = await getPricingForModel('gpt-4o', { userId: 42 });
 * ```
 *
 * @see docs/iteration-plan-v2.md P2-1
 */
export async function getPricingForModel(model: string, ctx?: PricingContext): Promise<ModelPricing> {
  const c: PricingContext = ctx ?? {};

  // ── L5 活动价 ──
  try {
    const campaignPrice = await queryCampaignPricing(model);
    if (campaignPrice) return campaignPrice;
  } catch {
    /* 活动价查询失败 → 静默降级 */
  }

  // L4 / L3 依赖用户上下文（无 userId 直接跳过）
  if (c.userId !== undefined) {
    // ── L4 分组价 ──
    try {
      const groupName = await resolvePricingGroupName(c);
      if (groupName) {
        const groupPrice = await queryPricingByGroup(model, groupName);
        if (groupPrice) return groupPrice;
      }
    } catch {
      /* 分组价查询失败 → 静默降级 */
    }

    // ── L3 代理价 ──
    try {
      const level = await resolveAgentLevel(c);
      if (level) {
        const rate = AGENT_LEVEL_DISCOUNT_RATE[level] ?? DEFAULT_AGENT_DISCOUNT_RATE;
        const base = (await queryDefaultPricing(model)) ?? DEFAULT_PRICING;
        return {
          input: base.input * rate,
          output: base.output * rate,
          cacheDiscountRate: null,
        };
      }
    } catch {
      /* 代理价查询失败 → 静默降级 */
    }
  }

  // ── L2 模型覆盖价（pricing_group='default'）──
  try {
    const defaultPrice = await queryDefaultPricing(model);
    if (defaultPrice) return defaultPrice;
  } catch {
    /* 模型覆盖价查询失败 → 静默降级 */
  }

  // ── L1 平台标准价 ──
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
