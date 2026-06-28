// ============================================================
//  3cloud (3C) — 厂商熔断服务
//  状态机: CLOSED → OPEN → HALF-OPEN → CLOSED
//  全部状态存 Redis，不增加数据库查询
// ============================================================

import { getRedis } from "../redis.js";
import { loadSecurityConfig } from "./login-security.js";
import { recordSecurityEvent } from "./security-event.js";

// ── Redis Key ──

const KEY = {
  failures: (vmId: number) => `circuit:failures:${vmId}`,
  open: (vmId: number) => `circuit:open:${vmId}`,
  halfOpen: (vmId: number) => `circuit:half:${vmId}`,
  consecSuccess: (vmId: number) => `circuit:success:${vmId}`,
};

// ── 状态枚举 ──

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitStatus {
  vendorModelId: number;
  vendorId: number;
  vendorName: string;
  upstreamModelName: string;
  state: CircuitState;
  failuresSinceTrip: number;
  openedAt: number | null;   // 时间戳
  lastFailAt: number | null;
}

// ═══════════════════════════════════════════════
//  1. 检查厂商是否应被跳过
// ═══════════════════════════════════════════════

/**
 * 检查某个 vendorModel 是否应该被跳过
 * 返回 true = 跳过此厂商（熔断中）
 */
export async function shouldSkipVendor(vendorModelId: number): Promise<boolean> {
  const redis = getRedis();
  const cfg = await loadSecurityConfig();
  const openMs = cfg.circuit_breaker_open_ms ?? 30000;
  const halfOpenMs = cfg.circuit_breaker_halfopen_ms ?? 120000;

  // 1. 检查是否处于 OPEN 状态
  const openRaw = await redis.get(KEY.open(vendorModelId));
  if (openRaw) {
    const openedAt = parseInt(openRaw, 10);
    const elapsed = Date.now() - openedAt;

    if (elapsed < openMs) {
      // 仍在 OPEN 窗口内
      return true;
    }

    // 超过 OPEN 窗口 → 进入 HALF-OPEN
    await redis.del(KEY.open(vendorModelId));
    await redis.setex(KEY.halfOpen(vendorModelId), Math.ceil(halfOpenMs / 1000), String(Date.now()));

    // 记录恢复事件
    recordSecurityEvent({
      userId: null,
      eventType: "circuit_recovery",
      riskLevel: "low",
      detail: { vendorModelId, state: "half-open", openedAt },
    }).catch(() => {});

    return false; // 允许探测请求
  }

  // 2. 检查是否处于 HALF-OPEN 状态
  const halfRaw = await redis.get(KEY.halfOpen(vendorModelId));
  if (halfRaw) {
    // 半开状态 → 允许一次探测请求
    return false;
  }

  // 3. NORMAL 状态：检查是否达到熔断阈值
  const failCount = parseInt(await redis.get(KEY.failures(vendorModelId)) || "0", 10);
  const tripThreshold = cfg.circuit_breaker_trip ?? 3;

  if (failCount >= tripThreshold) {
    // 触发熔断
    await openCircuit(vendorModelId);
    return true;
  }

  return false;
}

// ═══════════════════════════════════════════════
//  2. 打开熔断
// ═══════════════════════════════════════════════

async function openCircuit(vendorModelId: number): Promise<void> {
  const redis = getRedis();
  const cfg = await loadSecurityConfig();
  const openMs = cfg.circuit_breaker_open_ms ?? 30000;

  await redis.setex(KEY.open(vendorModelId), Math.ceil(openMs / 1000) + 30, String(Date.now()));
  await redis.del(KEY.halfOpen(vendorModelId));

  // 记录熔断事件
  recordSecurityEvent({
    userId: null,
    eventType: "circuit_trip",
    riskLevel: "high",
    detail: { vendorModelId, openMs },
  }).catch(() => {});
}

// ═══════════════════════════════════════════════
//  3. 记录失败（调用失败时调用）
// ═══════════════════════════════════════════════

export async function recordVendorModelFailure(
  vendorModelId: number,
  errorMessage?: string,
): Promise<void> {
  const redis = getRedis();
  const cfg = await loadSecurityConfig();
  const tripThreshold = cfg.circuit_breaker_trip ?? 3;

  const failKey = KEY.failures(vendorModelId);
  const count = await redis.incr(failKey);
  // 第一次设置 TTL
  if (count === 1) {
    await redis.expire(failKey, 120);
  }

  // 同时记录最后失败时间
  await redis.setex(KEY.consecSuccess(vendorModelId), 120, "0");
}

// ═══════════════════════════════════════════════
//  4. 记录成功（调用成功时调用）
// ═══════════════════════════════════════════════

export async function recordVendorModelSuccess(
  vendorModelId: number,
): Promise<void> {
  const redis = getRedis();

  // 清除失败计数
  await redis.del(KEY.failures(vendorModelId));
  await redis.del(KEY.open(vendorModelId));
  await redis.del(KEY.halfOpen(vendorModelId));
}

// ═══════════════════════════════════════════════
//  5. 批量获取所有熔断状态（管理端用）
// ═══════════════════════════════════════════════

export async function getAllCircuitStatuses(): Promise<CircuitStatus[]> {
  const redis = getRedis();

  // 扫描所有熔断相关的 key
  const openKeys = await redis.keys("circuit:open:*");
  const failKeys = await redis.keys("circuit:failures:*");
  const resultMap = new Map<number, CircuitStatus>();

  // 解析 OPEN 状态
  for (const key of openKeys) {
    const vmId = parseInt(key.split(":")[2], 10);
    const openedAt = parseInt(await redis.get(key) || "0", 10);
    resultMap.set(vmId, {
      vendorModelId: vmId,
      vendorId: 0,
      vendorName: "",
      upstreamModelName: "",
      state: "open",
      failuresSinceTrip: 0,
      openedAt,
      lastFailAt: null,
    });
  }

  // 填充失败计数
  for (const key of failKeys) {
    const vmId = parseInt(key.split(":")[2], 10);
    const failures = parseInt(await redis.get(key) || "0", 10);
    const existing = resultMap.get(vmId);
    if (existing) {
      existing.failuresSinceTrip = failures;
    } else {
      resultMap.set(vmId, {
        vendorModelId: vmId,
        vendorId: 0,
        vendorName: "",
        upstreamModelName: "",
        state: "closed",
        failuresSinceTrip: failures,
        openedAt: null,
        lastFailAt: null,
      });
    }
  }

  // 填充 vendor 信息（从数据库）
  if (resultMap.size > 0) {
    try {
      const { eq, sql } = await import("drizzle-orm");
      const { getDb } = await import("../db/index.js");
      const { vendorModels, vendors } = await import("../db/schema.js");
      const db = getDb();

      const vmIds = Array.from(resultMap.keys());
      const rows = await db
        .select({
          id: vendorModels.id,
          vendorId: vendorModels.vendorId,
          vendorName: vendors.name,
          upstreamModelName: vendorModels.upstreamModelName,
        })
        .from(vendorModels)
        .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
        .where(sql`${vendorModels.id} IN (${vmIds.join(",")})`);

      for (const row of rows) {
        const existing = resultMap.get(row.id);
        if (existing) {
          existing.vendorId = row.vendorId;
          existing.vendorName = row.vendorName;
          existing.upstreamModelName = row.upstreamModelName;
        }
      }
    } catch (err) {
      console.warn("[CircuitBreaker] 查询 vendor 信息失败:", err);
    }
  }

  return Array.from(resultMap.values());
}

// ═══════════════════════════════════════════════
//  6. 手动重置熔断
// ═══════════════════════════════════════════════

export async function resetCircuit(vendorModelId: number): Promise<void> {
  const redis = getRedis();
  await redis.del(KEY.failures(vendorModelId));
  await redis.del(KEY.open(vendorModelId));
  await redis.del(KEY.halfOpen(vendorModelId));
  await redis.del(KEY.consecSuccess(vendorModelId));
}

// ═══════════════════════════════════════════════
//  7. 获取活跃熔断数（仪表盘用）
// ═══════════════════════════════════════════════

export async function getActiveCircuitCount(): Promise<number> {
  const redis = getRedis();
  const keys = await redis.keys("circuit:open:*");
  return keys.length;
}
