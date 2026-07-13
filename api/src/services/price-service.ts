// ============================================================
//  3cloud (3C) — 价格管理服务
//  批量更新售价/成本价、定价倍率、价格变更历史
// ============================================================

import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { vendorModels, priceChangeHistory, systemConfigs, models, users } from "../db/schema.js";
import { AppError } from "./auth-service.js";

// ── 1. batchUpdateSellPrices — 批量更新售价 + 写 change history ──

export async function batchUpdateSellPrices(
  vendorModelIds: number[],
  sellPriceInput: string,
  sellPriceOutput: string,
  reason: string,
  operatorId: number
): Promise<{ updatedCount: number }> {
  const db = getDb();

  if (!vendorModelIds.length) {
    throw new AppError("BAD_REQUEST", "请至少选择一个模型", 400);
  }

  // 获取当前值
  const currentRows = await db
    .select({
      id: vendorModels.id,
      sellPriceInput: vendorModels.sellPriceInput,
      sellPriceOutput: vendorModels.sellPriceOutput,
    })
    .from(vendorModels)
    .where(inArray(vendorModels.id, vendorModelIds));

  if (!currentRows.length) {
    throw new AppError("NOT_FOUND", "未找到对应的供应商模型", 404);
  }

  const foundIds = currentRows.map((r) => r.id);

  // 事务：更新 + 写变更历史
  await db.transaction(async (tx) => {
    // 更新售价
    await tx
      .update(vendorModels)
      .set({
        sellPriceInput,
        sellPriceOutput,
        updatedAt: new Date(),
      })
      .where(inArray(vendorModels.id, foundIds));

    // 写变更历史（每个模型一条）
    for (const row of currentRows) {
      // input price change
      if (row.sellPriceInput !== sellPriceInput) {
        await tx.insert(priceChangeHistory).values({
          operatorId,
          changeType: "sell_price",
          targetType: "vendor_model",
          targetId: row.id,
          beforeValue: row.sellPriceInput,
          afterValue: sellPriceInput,
          reason,
        });
      }
      // output price change
      if (row.sellPriceOutput !== sellPriceOutput) {
        await tx.insert(priceChangeHistory).values({
          operatorId,
          changeType: "sell_price",
          targetType: "vendor_model",
          targetId: row.id,
          beforeValue: row.sellPriceOutput,
          afterValue: sellPriceOutput,
          reason,
        });
      }
    }
  });

  return { updatedCount: foundIds.length };
}

// ── 2. batchUpdateCostPrices — 批量更新成本价 ──

export async function batchUpdateCostPrices(
  vendorModelIds: number[],
  costPriceInput: string,
  costPriceOutput: string,
  reason: string,
  operatorId: number
): Promise<{ updatedCount: number }> {
  const db = getDb();

  if (!vendorModelIds.length) {
    throw new AppError("BAD_REQUEST", "请至少选择一个模型", 400);
  }

  const currentRows = await db
    .select({
      id: vendorModels.id,
      costPriceInput: vendorModels.costPriceInput,
      costPriceOutput: vendorModels.costPriceOutput,
    })
    .from(vendorModels)
    .where(inArray(vendorModels.id, vendorModelIds));

  if (!currentRows.length) {
    throw new AppError("NOT_FOUND", "未找到对应的供应商模型", 404);
  }

  const foundIds = currentRows.map((r) => r.id);

  await db.transaction(async (tx) => {
    await tx
      .update(vendorModels)
      .set({
        costPriceInput,
        costPriceOutput,
        updatedAt: new Date(),
      })
      .where(inArray(vendorModels.id, foundIds));

    for (const row of currentRows) {
      if (row.costPriceInput !== costPriceInput) {
        await tx.insert(priceChangeHistory).values({
          operatorId,
          changeType: "cost_price",
          targetType: "vendor_model",
          targetId: row.id,
          beforeValue: row.costPriceInput,
          afterValue: costPriceInput,
          reason,
        });
      }
      if (row.costPriceOutput !== costPriceOutput) {
        await tx.insert(priceChangeHistory).values({
          operatorId,
          changeType: "cost_price",
          targetType: "vendor_model",
          targetId: row.id,
          beforeValue: row.costPriceOutput,
          afterValue: costPriceOutput,
          reason,
        });
      }
    }
  });

  return { updatedCount: foundIds.length };
}

// ── 3. updatePricingMultiplier — 更新全局定价倍率 ──

export async function updatePricingMultiplier(
  value: string,
  reason: string,
  operatorId: number
): Promise<{ beforeValue: string | null }> {
  const db = getDb();

  // 读取当前值
  const [current] = await db
    .select({ value: systemConfigs.value })
    .from(systemConfigs)
    .where(eq(systemConfigs.key, "pricing_multiplier"))
    .limit(1);

  const beforeValue = current?.value ?? null;

  await db.transaction(async (tx) => {
    // upsert system_config
    await tx
      .insert(systemConfigs)
      .values({
        key: "pricing_multiplier",
        value,
        description: "全局定价倍率",
        updatedBy: operatorId,
      })
      .onConflictDoUpdate({
        target: systemConfigs.key,
        set: {
          value,
          updatedBy: operatorId,
          updatedAt: new Date(),
        },
      });

    // 写变更历史
    await tx.insert(priceChangeHistory).values({
      operatorId,
      changeType: "pricing_multiplier",
      targetType: "system",
      targetId: null,
      beforeValue: beforeValue ? parseFloat(beforeValue).toString() : null,
      afterValue: value,
      reason,
    });
  });

  return { beforeValue };
}

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
