// ============================================================
//  3cloud (3C) — 价格变更历史查询服务
//  查询价格变更历史（targetType 可选，不传则查全部）
// ============================================================

import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { priceChangeHistory, vendorModels, models, users } from "../../db/schema.js";

// ── 4. getPriceChangeHistory — 查询价格变更历史（targetType 可选，不传则查全部） ──

export async function getPriceChangeHistory(
  targetType?: string,
  targetId?: number,
  page: number = 1,
  pageSize: number = 20
) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [];
  if (targetType) {
    conditions.push(eq(priceChangeHistory.targetType, targetType));
  }
  if (targetId !== undefined) {
    conditions.push(eq(priceChangeHistory.targetId, targetId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(priceChangeHistory)
    .where(whereClause);

  const total = Number(totalResult?.count ?? 0);

  // 主查询：联表获取 modelName + operator
  const rows = await db
    .select({
      id: priceChangeHistory.id,
      operatorId: priceChangeHistory.operatorId,
      changeType: priceChangeHistory.changeType,
      targetType: priceChangeHistory.targetType,
      targetId: priceChangeHistory.targetId,
      oldValue: priceChangeHistory.beforeValue,
      newValue: priceChangeHistory.afterValue,
      reason: priceChangeHistory.reason,
      createdAt: priceChangeHistory.createdAt,
      operatorName: users.nickname,
      modelName: models.displayName,
    })
    .from(priceChangeHistory)
    .leftJoin(users, eq(priceChangeHistory.operatorId, users.id))
    .leftJoin(vendorModels, eq(priceChangeHistory.targetId, vendorModels.id))
    .leftJoin(models, eq(vendorModels.modelId, models.id))
    .where(whereClause)
    .orderBy(desc(priceChangeHistory.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      id: r.id,
      modelName: r.modelName || `模型 #${r.targetId ?? "?"}`,
      action: r.changeType,
      oldValue: r.oldValue,
      newValue: r.newValue,
      reason: r.reason,
      operator: r.operatorName || `用户 #${r.operatorId}`,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}