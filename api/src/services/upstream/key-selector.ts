/**
 * 多 Key 选择器 — vendor_api_keys 池的轮询/随机选择
 *
 * 职责：
 * - 从 vendor_api_keys 表读取某供应商的 Key 池
 * - 支持 Polling（Round-robin，Redis 原子计数器）和 Random（crypto.randomInt）两种模式
 * - 余额耗尽时自动标记 Key 为 exhausted（Redis key: key:exhausted:{apiKeyId}）
 * - 全部 Key 耗尽 → 返回 null，触发上层降级到备用 channel
 *
 * Redis key 结构：
 *   key:selector:{vendorId}:idx  → 轮询计数器（原子 INCR，并发安全）
 *   key:exhausted:{apiKeyId}     → 余额耗尽标记（set 后持久有效，需手动恢复）
 *
 * 并发安全：
 *   10 个并发请求 polling 同一 supplier → Redis INCR 保证每个请求获得唯一索引
 *   → 取模确定起始位 → 跳过 exhausted Key → 每个请求选中不同 Key
 *
 * @see coding-standards-control-logic.md §2.3 多 Key 轮询
 * @see newapi-migration-guide.md §2.3 多 Key 轮询时某个 Key 余额耗尽
 * @see development-plan.md §1.4
 * @module services/upstream
 */

import { redis } from "../../lib/redis";
import { db } from "../../db/index";
import { vendorApiKeys } from "../../db/schema/vendor-api-keys";
import { eq, and } from "drizzle-orm";
import { randomInt } from "crypto";

// ── Types ──────────────────────────────────────────

/** Key 选择模式 */
export type KeySelectionMode = "polling" | "random";

/**
 * 供应商 API Key（从 DB + Redis 聚合的完整视图）
 *
 * currentSpend / totalQuota 当前从 DB schema 未完整提供，
 * TODO Phase 3：从 vendor_api_key_usage 表或计费系统实时聚合
 */
export interface VendorApiKey {
  /** Key ID */
  id: number;
  /** 所属供应商 ID */
  vendorId: number;
  /** 加密存储的 API Key（运行时解密使用） */
  encryptedKey: string;
  /** Key 前缀（如 sk-xxx，用于展示） */
  keyPrefix: string | null;
  /** DB 启用状态 */
  isEnabled: boolean;
  /** 当前累计消费（分），Phase 3 补全 */
  currentSpend: number;
  /** 总配额（分），null = 无限额，Phase 3 补全 */
  totalQuota: number | null;
}

/** Key 选择结果 */
export interface KeySelectionResult {
  /** 选中的 Key ID，null 表示无可用 Key */
  apiKeyId: number | null;
  /** 加密 Key，null 表示无可用 Key */
  encryptedKey: string | null;
  /** 选择原因 */
  reason: "selected" | "all_exhausted" | "all_disabled" | "no_keys";
}

// ── Redis Key Helpers ─────────────────────────────

/** Key 耗尽标记 */
const EXHAUSTED_KEY = (apiKeyId: number) => `key:exhausted:${apiKeyId}`;
/** 轮询计数器 */
const POLLING_IDX_KEY = (vendorId: number) => `key:selector:${vendorId}:idx`;

// ── Public API ────────────────────────────────────

/**
 * 从供应商 Key 池中选择一个可用 Key
 *
 * 算法流程：
 *   1. 查 vendor_api_keys 表，取该供应商所有 isEnabled=true 的 Key
 *   2. 无 Key → 返回 reason="no_keys"
 *   3. Polling 模式：Redis INCR 原子自增 → 取模 → 从起始位遍历，跳过 exhausted
 *   4. Random 模式：过滤 exhausted → crypto.randomInt 随机选择
 *   5. 全部 Key 都 exhausted → 返回 reason="all_exhausted"
 *
 * @param vendorId - 供应商 ID
 * @param mode - 选择模式："polling"（轮询）或 "random"（随机），默认 polling
 * @returns 选择结果，包含选中的 Key 或降级原因
 *
 * @example
 * ```ts
 * const result = await selectKey(1, "polling");
 * if (result.reason === "selected") {
 *   console.log(`Using key ${result.encryptedKey}`);
 * }
 * ```
 */
export async function selectKey(
  vendorId: number,
  mode: KeySelectionMode = "polling",
): Promise<KeySelectionResult> {
  // 1. 查询该供应商所有启用的 Key
  const rows = await db
    .select()
    .from(vendorApiKeys)
    .where(
      and(
        eq(vendorApiKeys.vendorId, vendorId),
        eq(vendorApiKeys.isEnabled, true),
      ),
    );

  if (rows.length === 0) {
    return { apiKeyId: null, encryptedKey: null, reason: "no_keys" };
  }

  // 转换为 Domain 类型（补充 currentSpend / totalQuota 默认值）
  const keys: VendorApiKey[] = rows.map((r) => ({
    id: r.id,
    vendorId: r.vendorId,
    encryptedKey: r.encryptedKey,
    keyPrefix: r.keyPrefix,
    isEnabled: r.isEnabled,
    currentSpend: 0, // TODO Phase 3: 从计费系统填充
    totalQuota: null, // TODO Phase 3: 从配置填充
  }));

  // 2. 根据模式选择
  if (mode === "polling") {
    return selectKeyPolling(vendorId, keys);
  }
  return selectKeyRandom(keys);
}

/**
 * 标记 Key 余额耗尽
 *
 * 上游返回 429/402 或特定余额不足错误码后调用。
 * Redis 快速标记（无 TTL，持久有效，需手动恢复或夜间任务自动恢复），
 * 同时 setImmediate 异步更新 DB isEnabled 状态。
 *
 * @param apiKeyId - 供应商 API Key ID
 *
 * @example
 * ```ts
 * // 上游返回 429/402
 * await markKeyExhausted(selectedKeyId);
 * ```
 */
export async function markKeyExhausted(apiKeyId: number): Promise<void> {
  // Redis 快速标记（原子 set，所有实例立即可见）
  await redis.set(EXHAUSTED_KEY(apiKeyId), "1");

  // DB 持久化（异步，不阻塞上游响应主流程）
  setImmediate(async () => {
    try {
      await db
        .update(vendorApiKeys)
        .set({ isEnabled: false })
        .where(eq(vendorApiKeys.id, apiKeyId));
    } catch {
      // DB 更新失败不抛：Redis 标记已生效，等对账修复
    }
  });
}

/**
 * 恢复 Key 为可用状态（管理端或充值后触发）
 *
 * 清除 Redis exhausted 标记 + 恢复 DB isEnabled。
 *
 * @param apiKeyId - 供应商 API Key ID
 */
export async function markKeyActive(apiKeyId: number): Promise<void> {
  await redis.del(EXHAUSTED_KEY(apiKeyId));
  await db
    .update(vendorApiKeys)
    .set({ isEnabled: true })
    .where(eq(vendorApiKeys.id, apiKeyId));
}

/**
 * 检查 Key 是否已耗尽（供外部判断使用，如路由层降级逻辑）
 *
 * @param apiKeyId - 供应商 API Key ID
 * @returns true 表示已耗尽
 */
export async function isKeyExhausted(apiKeyId: number): Promise<boolean> {
  const val = await redis.get(EXHAUSTED_KEY(apiKeyId));
  return val !== null;
}

// ── Internal Helpers ──────────────────────────────

/**
 * Polling（轮询）模式选择
 *
 * 算法：
 *   1. Redis INCR 原子自增获取唯一索引值
 *   2. 取模确定起始位置（keys.length）
 *   3. 从起始位置顺时针遍历所有 Key，跳过 Redis exhausted 标记的 Key
 *   4. 找到第一个未耗尽的 Key → 返回
 *   5. 全部耗尽 → 返回 reason="all_exhausted"
 *
 * 并发安全：
 *   Redis INCR 保证 10 个并发请求各自获得唯一索引值，
 *   即使多个请求起始位置相同，skip 逻辑也会将它们导向不同 Key。
 *
 * @param vendorId - 供应商 ID（用于 Redis key）
 * @param keys - 已过滤 isEnabled 的 Key 列表
 */
async function selectKeyPolling(
  vendorId: number,
  keys: VendorApiKey[],
): Promise<KeySelectionResult> {
  // 原子自增获取唯一索引
  const idx = await redis.incr(POLLING_IDX_KEY(vendorId));
  const startIdx = idx % keys.length;

  // 从 startIdx 开始顺时针遍历所有 Key
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(startIdx + i) % keys.length]!;
    const exhausted = await redis.get(EXHAUSTED_KEY(key.id));
    if (!exhausted) {
      return {
        apiKeyId: key.id,
        encryptedKey: key.encryptedKey,
        reason: "selected",
      };
    }
  }

  // 全部 Key 耗尽
  return { apiKeyId: null, encryptedKey: null, reason: "all_exhausted" };
}

/**
 * Random（随机）模式选择
 *
 * 算法：
 *   1. 过滤 Redis exhausted 的 Key → 得到可用 Key 列表
 *   2. 无可用 Key → 返回 reason="all_exhausted"
 *   3. crypto.randomInt 随机选择一个
 *
 * 使用 crypto.randomInt（非 Math.random），加密安全。
 *
 * @param keys - 已过滤 isEnabled 的 Key 列表
 */
async function selectKeyRandom(
  keys: VendorApiKey[],
): Promise<KeySelectionResult> {
  // 过滤已耗尽 Key
  const available: VendorApiKey[] = [];
  for (const key of keys) {
    const exhausted = await redis.get(EXHAUSTED_KEY(key.id));
    if (!exhausted) {
      available.push(key);
    }
  }

  if (available.length === 0) {
    return { apiKeyId: null, encryptedKey: null, reason: "all_exhausted" };
  }

  // crypto.randomInt 加密安全随机
  const selected = available[randomInt(available.length)]!;
  return {
    apiKeyId: selected.id,
    encryptedKey: selected.encryptedKey,
    reason: "selected",
  };
}
