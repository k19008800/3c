import { redis } from "../lib/redis";

/**
 * 限流引擎（§5.3）四级限流：
 * L1 全局 QPS / L2 用户 QPS / L3 Key QPS / L4 模型 QPS
 * 实现：Redis 固定窗口计数器（简化，Phase 1 可升级滑动窗口）
 */

export type LimitType = "global_qps" | "user_qps" | "key_qps" | "model_qps" | "model_user_qps";

interface RateLimitConfig {
  /** 每窗口允许多少请求 */
  limit: number;
  /** 窗口毫秒 */
  windowMs: number;
}

const DEFAULT_LIMITS: Record<LimitType, RateLimitConfig> = {
  global_qps: { limit: 10000, windowMs: 60000 },
  user_qps: { limit: 100, windowMs: 60000 },
  key_qps: { limit: 50, windowMs: 60000 },
  model_qps: { limit: 2000, windowMs: 60000 },
  model_user_qps: { limit: 50, windowMs: 60000 },
};

interface CheckResult {
  limited: boolean;
  limitType?: LimitType;
  limitValue?: number;
  currentValue?: number;
  retryAfterMs?: number;
}

/**
 * 对单个维度计数并检查限流（原子）
 * @returns true=被限流
 */
async function checkWindow(keyType: LimitType, scopedKey: string, config?: Partial<RateLimitConfig>): Promise<boolean> {
  const base = DEFAULT_LIMITS[keyType];
  const cfg: RateLimitConfig = { limit: base.limit, windowMs: base.windowMs, ...config };
  const key = `rl:${keyType}:${scopedKey}:${Math.floor(Date.now() / cfg.windowMs)}`;

  // INCR + 设过期（防泄漏）
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, Math.ceil(cfg.windowMs / 1000) + 1);
  }
  return current > cfg.limit;
}

/**
 * 四级限流全链路检查
 * @returns 若 limited=true 则返回最严格的一级
 */
export async function checkRateLimit(params: {
  userId?: number;
  apiKeyId?: number;
  modelId?: number;
  overrides?: Partial<Record<LimitType, RateLimitConfig>>;
}): Promise<CheckResult> {
  const { userId, apiKeyId, modelId, overrides = {} } = params;

  // L1 全局（所有请求共享一个全局窗口）
  const globalLimited = await checkWindow("global_qps", "all", overrides["global_qps"]);
  if (globalLimited) return { limited: true, limitType: "global_qps", limitValue: DEFAULT_LIMITS.global_qps.limit };

  // L2 用户
  if (userId) {
    const userLimited = await checkWindow("user_qps", String(userId), overrides["user_qps"]);
    if (userLimited) return { limited: true, limitType: "user_qps", limitValue: DEFAULT_LIMITS.user_qps.limit, currentValue: undefined };
  }

  // L3 Key
  if (apiKeyId) {
    const keyLimited = await checkWindow("key_qps", String(apiKeyId), overrides["key_qps"]);
    if (keyLimited) return { limited: true, limitType: "key_qps", limitValue: DEFAULT_LIMITS.key_qps.limit };
  }

  // L4 模型 + 模型-用户
  if (modelId) {
    const modelLimited = await checkWindow("model_qps", String(modelId), overrides["model_qps"]);
    if (modelLimited) return { limited: true, limitType: "model_qps", limitValue: DEFAULT_LIMITS.model_qps.limit };
    if (userId) {
      const modelUserLimited = await checkWindow("model_user_qps", `${modelId}:${userId}`, overrides["model_user_qps"]);
      if (modelUserLimited) return { limited: true, limitType: "model_user_qps", limitValue: DEFAULT_LIMITS.model_user_qps.limit };
    }
  }

  return { limited: false };
}

/** 生成 429 限流错误响应体（对齐 SPEC-§5.3） */
export function rateLimitError(result: CheckResult) {
  return {
    error: {
      code: "rate_limit_exceeded",
      message: "请求频率超限，请稍后重试",
      limit_type: result.limitType,
      limit_value: result.limitValue,
      current_value: result.currentValue,
      retry_after: result.retryAfterMs ? Math.ceil(result.retryAfterMs / 1000) : undefined,
    },
  };
}
