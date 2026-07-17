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
    },
    expiresAt: now + 60_000,
  };
  return configCache.value;
}

/** 清除缓存（管理端修改安全配置后调用） */
export function clearSecurityConfigCache() {
  configCache = null;
}
