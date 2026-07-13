// ============================================================
//  3cloud (3C) — 熔断器配置管理
//  从 circuit-breaker.ts 中拆出的配置管理功能
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { vendorModels } from "../db/schema.js";
import { loadSecurityConfig } from "./login-security.js";

// ═══════════════════════════════════════════════
//  12. 更新熔断配置（阈值/时间窗口）
//      config 存储在 security_config 中，route 层调用时
//      覆盖当前 vendor_model 的熔断行为
// ═══════════════════════════════════════════════

export interface CircuitConfigUpdate {
  openMs?: number;         // Level 2 半开窗口
  halfOpenMs?: number;     // 半开探测窗口
  tripThreshold?: number;  // 兼容原有阈值
  level1Threshold?: number; // 软降级阈值
  level2Threshold?: number; // 硬熔断阈值
  level3ProbeLimit?: number; // 永久关停阈值
}

export async function updateCircuitConfig(
  vmId: number,
  config: CircuitConfigUpdate,
): Promise<{ success: boolean; message: string }> {
  const db = getDb();

  // Verify vendor_model exists
  const [vm] = await db
    .select({ id: vendorModels.id })
    .from(vendorModels)
    .where(eq(vendorModels.id, vmId))
    .limit(1);

  if (!vm) {
    return { success: false, message: "VendorModel 不存在" };
  }

  // Store per-vendor-model config in security configs table
  const cfg = await loadSecurityConfig();
  const circuitOverrides = (cfg as any).circuit_breaker_overrides ?? {};

  circuitOverrides[String(vmId)] = {
    ...circuitOverrides[String(vmId)],
    ...config,
    updatedAt: new Date().toISOString(),
  };

  // Persist to DB
  const { loginSecurityConfigs } = await import("../db/schema.js");
  await db
    .insert(loginSecurityConfigs)
    .values({
      key: "circuit_breaker_overrides",
      value: circuitOverrides,
      description: "熔断器单通道覆盖配置",
    })
    .onConflictDoUpdate({
      target: loginSecurityConfigs.key,
      set: { value: circuitOverrides, updatedAt: new Date() },
    });

  return { success: true, message: "熔断配置已更新" };
}

// ═══════════════════════════════════════════════
//  13. 获取特定 vendor_model 的覆盖配置
// ═══════════════════════════════════════════════

export async function getCircuitConfig(vmId: number): Promise<CircuitConfigUpdate | null> {
  try {
    const cfg = await loadSecurityConfig();
    const overrides = (cfg as any).circuit_breaker_overrides ?? {};
    return overrides[String(vmId)] ?? null;
  } catch {
    return null;
  }
}
