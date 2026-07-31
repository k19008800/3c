import { redis } from "../lib/redis";

/**
 * 熔断器（§5.1）
 * 三态：CLOSED(关闭) → OPEN(打开) → HALF_OPEN(半开) → CLOSED/OPEN
 * 状态持久化到 Redis（跨实例共享），原子操作避免竞态
 *
 * Redis key 结构:
 *  state: circuit:{vendorModelId}:state       → closed|open|half_open
 *  fail:  circuit:{vendorModelId}:failcount  → 连续失败计数
 *  opened:circuit:{vendorModelId}:openedat   → 进入 OPEN 时间戳(ms)
 *  probe: circuit:{vendorModelId}:probesuccess  → 半开探针成功数
 */

export type CircuitState = "closed" | "open" | "half_open";

const STATE_KEY = (id: number) => `circuit:${id}:state`;
const FAIL_KEY = (id: number) => `circuit:${id}:failcount`;
const OPENED_KEY = (id: number) => `circuit:${id}:openedat`;
const PROBE_KEY = (id: number) => `circuit:${id}:probeok`;

export interface CircuitBreakerConfig {
  failureThreshold: number; // 连续失败触发半开
  circuitTimeoutSec: number; // OPEN → HALF_OPEN 等待
  probeCount: number; // 半开探针成功 → 恢复
  probeIntervalSec: number; // 探针间隔
}

/** 内存缓存默认配置（后续从 circuit_breaker_configs 表读取覆盖） */
const defaultConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  circuitTimeoutSec: 30,
  probeCount: 3,
  probeIntervalSec: 10,
};

/**
 * 检查某 supplier 是否允许放行（返回 true=可转发，false=熔断拦截）
 * 同时管理状态机转移
 */
export async function allowRequest(vendorModelId: number, cfg?: Partial<CircuitBreakerConfig>): Promise<boolean> {
  const config = { ...defaultConfig, ...cfg };

  // 当前状态
  const state = (await redis.get(STATE_KEY(vendorModelId))) as CircuitState | null;

  if (state === "open") {
    // 检查超时是否到期 → 尝试半开
    const openedAtStr = await redis.get(OPENED_KEY(vendorModelId));
    const openedAt = openedAtStr ? Number(openedAtStr) : 0;
    if (Date.now() - openedAt >= config.circuitTimeoutSec * 1000) {
      // 进入半开，重置探针计数
      await redis.multi()
        .set(STATE_KEY(vendorModelId), "half_open")
        .set(PROBE_KEY(vendorModelId), 0)
        .del(FAIL_KEY(vendorModelId))
        .exec();
      // 半开放行一个探测请求
      return true;
    }
    return false; // OPEN 熔断中，拒绝
  }

  if (state === "half_open") {
    // 半开：若已用满探针配额则拒绝（等结果），否则放行一个
    const probeOk = Number(await redis.get(PROBE_KEY(vendorModelId)) || 0);
    return probeOk < config.probeCount;
  }

  // CLOSED：正常放行
  return true;
}

/**
 * 记录请求结果（成功/失败）
 */
export async function recordResult(vendorModelId: number, success: boolean, cfg?: Partial<CircuitBreakerConfig>): Promise<void> {
  const config = { ...defaultConfig, ...cfg };
  const state = (await redis.get(STATE_KEY(vendorModelId))) as CircuitState | null;

  if (success) {
    // 成功
    if (state === "half_open") {
      // 探针成功计数
      const probeOk = Number(await redis.get(PROBE_KEY(vendorModelId)) || 0) + 1;
      await redis.set(PROBE_KEY(vendorModelId), probeOk);
      if (probeOk >= config.probeCount) {
        // 半开探针全部成功 → 恢复到 CLOSED
        await redis.multi()
          .set(STATE_KEY(vendorModelId), "closed")
          .del(FAIL_KEY(vendorModelId))
          .del(PROBE_KEY(vendorModelId))
          .exec();
      }
    } else if (state === "open") {
      // OPEN 下不处理成功（放行探测由 allowRequest 管理）
    } else {
      // CLOSED：成功清空失败计数（通常不在这里做，防误熔断；简单实现：重置）
    }
    if (state !== "half_open") {
      await redis.del(FAIL_KEY(vendorModelId));
    }
    return;
  }

  // 失败
  if (state === "half_open") {
    // 半开探针失败 → 回到 OPEN
    const now = Date.now();
    await redis.multi()
      .set(STATE_KEY(vendorModelId), "open")
      .set(OPENED_KEY(vendorModelId), now)
      .del(PROBE_KEY(vendorModelId))
      .exec();
    return;
  }

  // CLOSED：累加失败计数
  const fail = await redis.incr(FAIL_KEY(vendorModelId));
  if (fail >= config.failureThreshold) {
    // 触发熔断 → OPEN
    const now = Date.now();
    await redis.multi()
      .set(STATE_KEY(vendorModelId), "open")
      .set(OPENED_KEY(vendorModelId), now)
      .exec();
  }
}

/**
 * 手动熔断 / 手动恢复（管理端）
 */
export async function manualOpen(vendorModelId: number): Promise<void> {
  await redis.multi()
    .set(STATE_KEY(vendorModelId), "open")
    .set(OPENED_KEY(vendorModelId), Date.now())
    .exec();
}

export async function manualClose(vendorModelId: number): Promise<void> {
  await redis.multi()
    .set(STATE_KEY(vendorModelId), "closed")
    .del(FAIL_KEY(vendorModelId))
    .del(PROBE_KEY(vendorModelId))
    .exec();
}

/** 查询当前状态 */
export async function getState(vendorModelId: number): Promise<{ state: CircuitState; status: "active" | "tripped" }> {
  const state = ((await redis.get(STATE_KEY(vendorModelId))) as CircuitState) || "closed";
  return { state, status: state === "closed" ? "active" : "tripped" };
}
