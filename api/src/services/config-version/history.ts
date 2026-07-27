// ============================================================
//  3cloud (3C) — 配置变更历史查询
// ============================================================

import { eq, desc, and, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { configVersions } from "../../db/schema.js";
import type { ConfigType } from "./types.js";

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
  const conditions: any[] = [];
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