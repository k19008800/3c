// ============================================================
//  3cloud (3C) — 登录风控 配置加载
// ============================================================

import { getDb } from "../../db/index.js";
import { loginSecurityConfigs } from "../../db/schema.js";
import type { SecurityConfigMap } from "./types.js";

let configCache: { value: SecurityConfigMap; expiresAt: number } | null = null;

export async function loadSecurityConfig(): Promise<SecurityConfigMap> {
  const now = Date.now();
  if (configCache && now < configCache.expiresAt) {
    return configCache.value;
  }

  const db = getDb();
  const rows = await db
    .select({ key: loginSecurityConfigs.key, value: loginSecurityConfigs.value })
    .from(loginSecurityConfigs);

  const cfg: any = {};
  for (const row of rows) {
    try {
      cfg[row.key] = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    } catch {
      cfg[row.key] = row.value;
    }
  }

  configCache = {
    value: {
      maxIpFailPerMin: cfg.max_ip_fail_per_min ?? 5,
      ipBanMinutes: cfg.ip_ban_minutes ?? 5,
      maxUserFailPerMin: cfg.max_user_fail_per_min ?? 5,
      userCaptchaAfter: cfg.user_captcha_after ?? 3,
      userBanMinutes: cfg.user_ban_minutes ?? 15,
      maxUserFail24h: cfg.max_user_fail_24h ?? 10,
      // 熔断器（向下兼容 SecurityConfig.tsx 已有字段）
      circuit_breaker_trip: cfg.circuit_breaker_trip ?? 3,
      circuit_breaker_open_ms: cfg.circuit_breaker_open_ms ?? 30000,
      circuit_breaker_halfopen_ms: cfg.circuit_breaker_halfopen_ms ?? 120000,
      // 熔断器阈值（可从管理端配置）
      circuit_breaker_level1_threshold: cfg.circuit_breaker_level1_threshold ?? 5,
      circuit_breaker_level2_threshold: cfg.circuit_breaker_level2_threshold ?? 10,
      circuit_breaker_level3_probe_limit: cfg.circuit_breaker_level3_probe_limit ?? 3,
      circuit_breaker_weight_reduced: cfg.circuit_breaker_weight_reduced ?? 10,
      // 健康检查参数（PRD 5.1.4 新增）
      health_check_interval_ms: cfg.health_check_interval_ms ?? 30000,
      failure_threshold: cfg.failure_threshold ?? 5,
      probe_count: cfg.probe_count ?? 3,
      probe_interval_ms: cfg.probe_interval_ms ?? 10000,
      circuit_timeout_ms: cfg.circuit_timeout_ms ?? 30000,
    },
    expiresAt: now + 60_000,
  };
  return configCache.value;
}

/** 清除缓存（管理端修改安全配置后调用） */
export function clearSecurityConfigCache() {
  configCache = null;
}
