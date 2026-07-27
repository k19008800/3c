// ============================================================
//  3cloud (3C) — 配置版本控制服务
// ============================================================

import { eq, desc, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { configVersions } from "../db/schema.js";

export type ConfigType = "system" | "security" | "login_security";

// ── 记录配置变更 ──
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

// ── 获取配置历史 ──
export async function getConfigHistory(params: {
  configKey?: string;
  configType?: ConfigType;
  page?: number;
  pageSize?: number;
}): Promise<{
  list: Array<{
    id: number;
    configKey: string;
    configType: string;
    oldValue: any;
    newValue: any;
    changedBy: number | null;
    changeReason: string | null;
    ip: string | null;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}> {
  const db = getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  // 构建查询条件
  const conditions = [];
  if (params.configKey) {
    conditions.push(eq(configVersions.configKey, params.configKey));
  }
  if (params.configType) {
    conditions.push(eq(configVersions.configType, params.configType));
  }

  // 查询总数
  const [totalRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(configVersions)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const total = Number(totalRes?.count ?? 0);

  // 查询列表
  const rows = await db
    .select()
    .from(configVersions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(configVersions.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      id: r.id,
      configKey: r.configKey,
      configType: r.configType,
      oldValue: r.oldValue ? JSON.parse(r.oldValue) : null,
      newValue: r.newValue ? JSON.parse(r.newValue) : null,
      changedBy: r.changedBy,
      changeReason: r.changeReason,
      ip: r.ip,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

// ── 获取指定版本 ──
export async function getConfigVersion(versionId: number): Promise<{
  id: number;
  configKey: string;
  configType: string;
  oldValue: any;
  newValue: any;
  changedBy: number | null;
  changeReason: string | null;
  ip: string | null;
  createdAt: Date;
} | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(configVersions)
    .where(eq(configVersions.id, versionId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    configKey: row.configKey,
    configType: row.configType,
    oldValue: row.oldValue ? JSON.parse(row.oldValue) : null,
    newValue: row.newValue ? JSON.parse(row.newValue) : null,
    changedBy: row.changedBy,
    changeReason: row.changeReason,
    ip: row.ip,
    createdAt: row.createdAt,
  };
}

// ── 配置对比（diff） ──
export function diffConfigs(oldValue: any, newValue: any): {
  added: string[];
  removed: string[];
  changed: Array<{ key: string; old: any; new: any }>;
  unchanged: string[];
} {
  const result = {
    added: [] as string[],
    removed: [] as string[],
    changed: [] as Array<{ key: string; old: any; new: any }>,
    unchanged: [] as string[],
  };

  // 如果都是对象，进行深度对比
  if (typeof oldValue === "object" && typeof newValue === "object" && oldValue !== null && newValue !== null) {
    const oldKeys = Object.keys(oldValue);
    const newKeys = Object.keys(newValue);
    const allKeys = new Set([...oldKeys, ...newKeys]);

    for (const key of allKeys) {
      const inOld = key in oldValue;
      const inNew = key in newValue;

      if (!inOld && inNew) {
        result.added.push(key);
      } else if (inOld && !inNew) {
        result.removed.push(key);
      } else if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) {
        result.changed.push({ key, old: oldValue[key], new: newValue[key] });
      } else {
        result.unchanged.push(key);
      }
    }
  } else if (oldValue === undefined || oldValue === null) {
    // 新增配置
    if (typeof newValue === "object" && newValue !== null) {
      result.added = Object.keys(newValue);
    }
  } else if (newValue === undefined || newValue === null) {
    // 删除配置
    if (typeof oldValue === "object" && oldValue !== null) {
      result.removed = Object.keys(oldValue);
    }
  } else {
    // 简单值对比
    if (oldValue !== newValue) {
      result.changed.push({ key: "value", old: oldValue, new: newValue });
    } else {
      result.unchanged.push("value");
    }
  }

  return result;
}
