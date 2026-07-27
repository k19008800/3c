// ============================================================
//  3cloud (3C) — 增强版配置版本控制 — 批量变更记录
// ============================================================

import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { configVersions, systemConfigs, loginSecurityConfigs } from "../../db/schema.js";
import type { ConfigType } from "./types.js";

// ── 批量配置变更记录 ──
export async function batchRecordConfigChanges(params: {
  changes: Array<{
    configKey: string;
    configType: ConfigType;
    oldValue: any;
    newValue: any;
  }>;
  changedBy?: number;
  changeReason?: string;
  ip?: string;
  source?: 'manual' | 'api' | 'rollback' | 'snapshot_restore' | 'approval';
}): Promise<number[]> {
  const db = getDb();
  const versionIds: number[] = [];

  await db.transaction(async (tx) => {
    for (const change of params.changes) {
      const [row] = await tx
        .insert(configVersions)
        .values({
          configKey: change.configKey,
          configType: change.configType,
          oldValue: change.oldValue !== undefined ? JSON.stringify(change.oldValue) : null,
          newValue: JSON.stringify(change.newValue),
          changedBy: params.changedBy,
          changeReason: params.changeReason,
          ip: params.ip,
        })
        .returning({ id: configVersions.id });

      versionIds.push(row.id);

      // 更新配置表的版本信息
      if (change.configType === 'system') {
        const [config] = await tx
          .select({ version: systemConfigs.version })
          .from(systemConfigs)
          .where(eq(systemConfigs.key, change.configKey))
          .limit(1);

        await tx
          .update(systemConfigs)
          .set({
            version: (config?.version ?? 1) + 1,
            lastVersionId: row.id
          })
          .where(eq(systemConfigs.key, change.configKey));
      } else if (change.configType === 'login_security') {
        const [config] = await tx
          .select({ version: loginSecurityConfigs.version })
          .from(loginSecurityConfigs)
          .where(eq(loginSecurityConfigs.key, change.configKey))
          .limit(1);

        await tx
          .update(loginSecurityConfigs)
          .set({
            version: (config?.version ?? 1) + 1,
            lastVersionId: row.id
          })
          .where(eq(loginSecurityConfigs.key, change.configKey));
      }
    }
  });

  return versionIds;
}
