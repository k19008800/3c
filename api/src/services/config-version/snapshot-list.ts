// ============================================================
//  3cloud (3C) — 配置快照查询
//  NOTE: configSnapshots 表尚未添加到 schema（TODO）
// ============================================================

import { eq, desc, and, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { configSnapshots } from "../../db/schema.js";
import type { ConfigType } from "./types.js";

// ── 获取配置快照列表 ──
export async function getConfigSnapshots(params: {
  configType?: ConfigType;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{
  list: Array<{
    id: number;
    name: string;
    description: string | null;
    configType: string;
    createdBy: number | null;
    isActive: boolean;
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
  if (params.configType) {
    conditions.push(eq(configSnapshots.configType, params.configType));
  }
  if (params.isActive !== undefined) {
    conditions.push(eq(configSnapshots.isActive, params.isActive));
  }

  // 查询总数
  const [totalRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(configSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const total = Number(totalRes?.count ?? 0);

  // 查询列表
  const rows = await db
    .select()
    .from(configSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(configSnapshots.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      configType: r.configType,
      createdBy: r.createdBy,
      isActive: r.isActive,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}
