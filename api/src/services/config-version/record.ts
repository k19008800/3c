// ============================================================
//  3cloud (3C) — 配置变更记录
// ============================================================

import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { configVersions, systemConfigs, loginSecurityConfigs } from "../../db/schema.js";
import type { ConfigType } from "./types.js";

// ── 基础配置变更记录 ──
export async function recordConfigChange(params: {
  configKey: string;
  configType: ConfigType;
  oldValue: any;
  newValue: any;
  changedBy?: number;
  changeReason?: string;
  ip?: string;
}): Promise<number> {
  const db = getDb();

  const [row] = await db
    .insert(configVersions)
    .values({
      configKey: params.configKey,
      configType: params.configType,
      oldValue: params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
      newValue: JSON.stringify(params.newValue),
      changedBy: params.changedBy,
      changeReason: params.changeReason,
      ip: params.ip,
    })
    .returning({ id: configVersions.id });

  return row.id;
}

// ── 扩展的配置变更记录 ──
export async function recordEnhancedConfigChange(params: {
  configKey: string;
  configType: ConfigType;
  oldValue: any;
  newValue: any;
  changedBy?: number;
  changeReason?: string;
  ip?: string;
  version?: number;
  source?: 'manual' | 'api' | 'rollback' | 'snapshot_restore' | 'approval';
}): Promise<number> {
  const db = getDb();

  const [row] = await db
    .insert(configVersions)
    .values({
      configKey: params.configKey,
      configType: params.configType,
      oldValue: params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
      newValue: JSON.stringify(params.newValue),
      changedBy: params.changedBy,
      changeReason: params.changeReason,
      ip: params.ip,
    })
    .returning({ id: configVersions.id });

  // 更新配置表的版本信息
  if (params.configType === 'system') {
    await db
      .update(systemConfigs)
      .set({
        version: (params.version ?? 1) + 1,
        lastVersionId: row.id
      })
      .where(eq(systemConfigs.key, params.configKey));
  } else if (params.configType === 'login_security') {
    await db
      .update(loginSecurityConfigs)
      .set({
        version: (params.version ?? 1) + 1,
        lastVersionId: row.id
      })
      .where(eq(loginSecurityConfigs.key, params.configKey));
  }

  return row.id;
}
