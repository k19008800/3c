/**
 * 自动熔断器 — 滑动窗口错误率方案
 *
 * 职责：
 * - 用 Redis Sorted Set 维护 5 分钟滑动窗口请求记录
 * - 错误率 > 30% → 自动熔断（OPEN），拒绝后续请求
 * - 冷却 60s 后半开（HALF_OPEN），放行 1 个探针请求
 * - 探针成功 → 恢复 CLOSED，窗口清零
 * - 探针失败 → 继续 OPEN，重置冷却计时
 * - 最小样本 10：窗口内 < 10 次请求不触发（防误判）
 * - 手动恢复覆盖自动熔断
 *
 * 三态状态机：
 * ```
 * CLOSED(active) → [错误率>30%] → OPEN(tripped)
 * OPEN → [冷却60s] → HALF_OPEN
 * HALF_OPEN → [探针成功] → CLOSED
 * HALF_OPEN → [探针失败] → OPEN
 * ```
 *
 * Redis Key 结构:
 *   cb:window:{vendorModelId}  → Sorted Set (score=timestamp_ms, member="ok:{ts}"|"err:{ts}")
 *   cb:state:{vendorModelId}   → String "closed"|"open"|"half_open"
 *   cb:opened:{vendorModelId}  → String (进入 OPEN 时间戳 ms)
 *   cb:probe:{vendorModelId}   → String "1" (探针进行中标记，TTL 15s)
 *
 * @see development-plan.md §1.5
 * @see newapi-migration-guide.md §2.4 熔断对照
 * @see coding-standards-control-logic.md §四 熔断器
 * @module services/circuit-breaker
 */

import { redis } from "../lib/redis";

// ── 配置常量 ──────────────────────────────────────────────

/** 滑动窗口大小（毫秒） */
const WINDOW_MS = 5 * 60 * 1000;

/** 错误率阈值 */
const ERROR_THRESHOLD = 0.30;

/** 最小样本量：窗口内请求数低于此值不触发熔断 */
const MIN_SAMPLE = 10;

/** 熔断冷却时长（毫秒） */
const COOLDOWN_MS = 60 * 1000;

/** 探针锁 TTL（毫秒，防止死锁） */
const PROBE_LOCK_TTL_MS = 15_000;

// ── 类型 ───────────────────────────────────────────────────

/** 熔断器三态 */
export type CircuitState = "closed" | "open" | "half_open";

/**
 * 熔断器配置参数（保留向后兼容，滑动窗口方案中不使用）
 * @deprecated 滑动窗口方案使用常量配置，不再需要外部传入
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  circuitTimeoutSec: number;
  probeCount: number;
  probeIntervalSec: number;
}

// ── Redis Key 工具函数 ─────────────────────────────────────

const WINDOW_KEY = (id: number) => `cb:window:${id}`;
const STATE_KEY = (id: number) => `cb:state:${id}`;
const OPENED_KEY = (id: number) => `cb:opened:${id}`;
const PROBE_KEY = (id: number) => `cb:probe:${id}`;

// ── 导出函数 ──────────────────────────────────────────────

/**
 * 检查 channel 是否允许请求通过。
 *
 * 同时负责状态机转移：
 * - CLOSED：统计窗口错误率，超阈值则 OPEN + 拒绝
 * - OPEN：检查冷却，到期则 HALF_OPEN + 放行
 * - HALF_OPEN：只放行 1 个探针请求（SETNX 防并发）
 *
 * @param vendorModelId - 供应商模型 ID
 * @param _cfg - 已弃用，保留向后兼容
 * @returns true=允许请求，false=熔断拦截
 *
 * @example
 * ```ts
 * if (await allowRequest(channelId)) {
 *   // 放行，执行上游调用
 * } else {
 *   // 熔断中，返回 503
 * }
 * ```
 */
export async function allowRequest(
  vendorModelId: number,
  _cfg?: Partial<CircuitBreakerConfig>,
): Promise<boolean> {
  const now = Date.now();
  const state = ((await redis.get(STATE_KEY(vendorModelId))) as CircuitState) || "closed";

  // ── OPEN：检查冷却是否到期 ──
  if (state === "open") {
    const openedAt = Number(await redis.get(OPENED_KEY(vendorModelId)) || 0);
    if (now - openedAt >= COOLDOWN_MS) {
      // 冷却到期 → 进入半开
      await redis.set(STATE_KEY(vendorModelId), "half_open");
      // 半开放行第一个探针请求（继续走下面 HALF_OPEN 逻辑）
    } else {
      return false; // 仍在冷却中，拒绝
    }
  }

  // ── HALF_OPEN：只放行 1 个探针 ──
  if (state === "half_open" || (await redis.get(STATE_KEY(vendorModelId))) === "half_open") {
    // SET NX with PX：原子地获取探针锁
    const locked = await redis.set(
      PROBE_KEY(vendorModelId),
      "1",
      "PX",
      PROBE_LOCK_TTL_MS,
      "NX",
    );
    return locked === "OK";
  }

  // ── CLOSED：统计窗口错误率 ──
  const windowStart = now - WINDOW_MS;
  const total = await redis.zcount(WINDOW_KEY(vendorModelId), windowStart, now);

  // 样本不足 → 不触发
  if (total < MIN_SAMPLE) return true;

  // 统计窗口内错误数
  const members = await redis.zrangebyscore(WINDOW_KEY(vendorModelId), windowStart, now);
  const errors = members.filter((m: string) => m.startsWith("err:")).length;
  const errorRate = errors / total;

  if (errorRate > ERROR_THRESHOLD) {
    // 触发熔断 → OPEN
    await redis
      .multi()
      .set(STATE_KEY(vendorModelId), "open")
      .set(OPENED_KEY(vendorModelId), now)
      .exec();
    return false;
  }

  return true;
}

/**
 * 记录一次请求的结果（成功或失败）。
 *
 * 操作：
 * 1. ZADD 写入窗口有序集合（member = "ok:{ts}" 或 "err:{ts}"）
 * 2. ZREMRANGEBYSCORE 清理 5 分钟前的过期记录
 * 3. 如果在 HALF_OPEN：成功→CLOSED+清零 / 失败→OPEN+重置冷却
 *
 * @param vendorModelId - 供应商模型 ID
 * @param success - true=成功，false=失败
 * @param _cfg - 已弃用，保留向后兼容
 *
 * @example
 * ```ts
 * await recordResult(channelId, true);  // 记录成功
 * await recordResult(channelId, false); // 记录失败
 * ```
 */
export async function recordResult(
  vendorModelId: number,
  success: boolean,
  _cfg?: Partial<CircuitBreakerConfig>,
): Promise<void> {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const member = `${success ? "ok" : "err"}:${now}`;

  // 写入当前结果 + 清理过期数据（同步完成，不依赖 multi）
  await redis.zadd(WINDOW_KEY(vendorModelId), now, member);
  await redis.zremrangebyscore(WINDOW_KEY(vendorModelId), 0, windowStart);

  const state = ((await redis.get(STATE_KEY(vendorModelId))) as CircuitState) || "closed";

  // ── HALF_OPEN 探针结果处理 ──
  if (state === "half_open") {
    // 清除探针锁
    await redis.del(PROBE_KEY(vendorModelId));

    if (success) {
      // 探针成功 → 恢复 CLOSED，清空窗口重新开始
      await redis
        .multi()
        .set(STATE_KEY(vendorModelId), "closed")
        .del(WINDOW_KEY(vendorModelId))
        .exec();
    } else {
      // 探针失败 → 继续 OPEN，重置冷却计时
      await redis
        .multi()
        .set(STATE_KEY(vendorModelId), "open")
        .set(OPENED_KEY(vendorModelId), now)
        .exec();
    }
  }
}

/**
 * 手动熔断（管理端强制将 channel 设为 OPEN）。
 *
 * 会覆盖当前状态，直接写入 OPEN + 当前时间戳。
 *
 * @param vendorModelId - 供应商模型 ID
 */
export async function manualOpen(vendorModelId: number): Promise<void> {
  await redis
    .multi()
    .set(STATE_KEY(vendorModelId), "open")
    .set(OPENED_KEY(vendorModelId), Date.now())
    .exec();
}

/**
 * 手动恢复（管理端覆盖自动熔断，强制恢复 active）。
 *
 * 清除：状态 → CLOSED、熔断时间戳、探针锁、窗口数据。
 * 计数器完全重置。
 *
 * @param vendorModelId - 供应商模型 ID
 */
export async function manualClose(vendorModelId: number): Promise<void> {
  await redis
    .multi()
    .set(STATE_KEY(vendorModelId), "closed")
    .del(OPENED_KEY(vendorModelId))
    .del(PROBE_KEY(vendorModelId))
    .del(WINDOW_KEY(vendorModelId))
    .exec();
}

/**
 * 查询熔断器当前状态。
 *
 * @param vendorModelId - 供应商模型 ID
 * @returns 状态对象：状态名、active/tripped 标记、窗口统计
 *
 * @example
 * ```ts
 * const s = await getState(channelId);
 * // { state: "open", status: "tripped", windowStats: { total: 25, errors: 10, errorRate: 0.4 } }
 * ```
 */
export async function getState(vendorModelId: number): Promise<{
  state: CircuitState;
  status: "active" | "tripped";
  windowStats?: { total: number; errors: number; errorRate: number };
}> {
  const state = ((await redis.get(STATE_KEY(vendorModelId))) as CircuitState) || "closed";
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const total = await redis.zcount(WINDOW_KEY(vendorModelId), windowStart, now);
  const members = await redis.zrangebyscore(WINDOW_KEY(vendorModelId), windowStart, now);
  const errors = members.filter((m: string) => m.startsWith("err:")).length;
  const errorRate = total > 0 ? errors / total : 0;

  return {
    state,
    status: state === "closed" ? "active" : "tripped",
    windowStats: { total, errors, errorRate },
  };
}
