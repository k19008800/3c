// ============================================================
//  3cloud (3C) — 配置快照 创建与恢复
//  NOTE: configSnapshots 表尚未添加到 schema（TODO），
//  此模块功能当前不可用，保留代码结构以备后续实现。
// ============================================================

import { eq, desc, and } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { systemConfigs, loginSecurityConfigs, configSnapshots } from "../../db/schema.js";
import type { ConfigType } from "./types.js";
import { batchRecordConfigChanges } from "./batch.js";

// ── 创建配置快照 ──
export async function createConfigSnapshot(params: {
  name: string;
  description?: string;
  configType: ConfigType;
  createdBy?: number;
  isActive?: boolean;
}): Promise<number> {
  const db = getDb();

  // 获取当前配置数据
  let configData: Record<string, any> = {};
  
  if (params.configType === 'system') {
    const configs = await db
      .select({ key: systemConfigs.key, value: systemConfigs.value })
      .from(systemConfigs);
    
    configData = configs.reduce((acc, config) => {
      try {
        acc[config.key] = JSON.parse(config.value);
      } catch {
        acc[config.key] = config.value;
      }
      return acc;
    }, {} as Record<string, any>);
  } else if (params.configType === 'login_security') {
    const configs = await db
      .select({ key: loginSecurityConfigs.key, value: loginSecurityConfigs.value })
      .from(loginSecurityConfigs);
    
    configData = configs.reduce((acc, config) => {
      acc[config.key] = config.value;
      return acc;
    }, {} as Record<string, any>);
  }

  const [row] = await db
    .insert(configSnapshots)
    .values({
      name: params.name,
      description: params.description,
      configType: params.configType,
      configData: configData,
      createdBy: params.createdBy,
      isActive: params.isActive ?? false,
    })
    .returning({ id: configSnapshots.id });

  return row.id;
}

// ── 恢复配置快照 ──
export async function restoreConfigSnapshot(snapshotId: number, restoredBy?: number): Promise<{
  snapshotId: number;
  changesApplied: number;
  versionIds: number[];
}> {
  const db = getDb();

  // 获取快照数据
  const [snapshot] = await db
    .select()
    .from(configSnapshots)
    .where(eq(configSnapshots.id, snapshotId))
    .limit(1);

  if (!snapshot) {
    throw new Error(`快照 ${snapshotId} 不存在`);
  }

  const versionIds: number[] = [];
  const changes: Array<{
    configKey: string;
    configType: ConfigType;
    oldValue: any;
    newValue: any;
  }> = [];

  await db.transaction(async (tx) => {
    const configData = snapshot.configData as Record<string, any>;
    
    if (snapshot.configType === 'system') {
      // 获取当前系统配置
      const currentConfigs = await tx
        .select({ key: systemConfigs.key, value: systemConfigs.value })
        .from(systemConfigs);
      
      const currentConfigMap = new Map(
        currentConfigs.map(c => [c.key, c.value])
      );

      // 准备变更记录
      for (const [key, newValue] of Object.entries(configData)) {
        const oldValue = currentConfigMap.get(key);
        
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes.push({
            configKey: key,
            configType: 'system',
            oldValue: oldValue ? JSON.parse(oldValue) : null,
            newValue
          });

          // 更新配置
          await tx
            .update(systemConfigs)
            .set({
              value: JSON.stringify(newValue),
              updatedAt: new Date()
            })
            .where(eq(systemConfigs.key, key));
        }
      }
    }

    // 批量记录变更
    if (changes.length > 0) {
      const batchVersionIds = await batchRecordConfigChanges({
        changes,
        changedBy: restoredBy,
        changeReason: `从快照 "${snapshot.name}" 恢复配置`,
        source: 'snapshot_restore'
      });
      versionIds.push(...batchVersionIds);
    }

    // 更新快照状态
    await tx
      .update(configSnapshots)
      .set({ isActive: true })
      .where(eq(configSnapshots.id, snapshotId));
  });

  return {
    snapshotId,
    changesApplied: changes.length,
    versionIds
  };
}
