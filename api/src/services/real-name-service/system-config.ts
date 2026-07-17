// ============================================================
//  3cloud (3C) — 实名认证 系统配置加载
// ============================================================

import { getDb } from "../../db/index.js";
import { systemConfigs } from "../../db/schema.js";

let systemConfigCache: Record<string, string> | null = null;
let configLoadedAt = 0;
const CONFIG_CACHE_TTL = 30_000; // 30 秒

export async function loadSystemConfigs(): Promise<Record<string, string>> {
  const now = Date.now();
  if (systemConfigCache && now - configLoadedAt < CONFIG_CACHE_TTL) {
    return systemConfigCache;
  }

  const db = getDb();
  const rows = await db.select().from(systemConfigs);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  systemConfigCache = map;
  configLoadedAt = now;
  return map;
}

export function invalidateConfigCache(): void {
  systemConfigCache = null;
}
