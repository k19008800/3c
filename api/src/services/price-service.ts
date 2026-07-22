// ============================================================
//  3cloud (3C) — 价格管理服务
//  批量更新售价/成本价、定价倍率、价格变更历史
// ============================================================

import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { vendorModels, priceChangeHistory, systemConfigs, models, users } from "../db/schema.js";
import { AppError } from "./auth-service/index.js";

// ── 全局定价倍率默认值 ──
// 1.15 = 15% 加价。所有模块必须引用此常量，确保默认值一致。
export const DEFAULT_PRICING_MULTIPLIER = 1.15;

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

    // PERF: 批量构建 priceChangeHistory INSERT，替代逐行循环 INSERT
    const historyValues: Array<{
      operatorId: number;
      changeType: string;
      targetType: string;
      targetId: number;
      beforeValue: string;
      afterValue: string;
      reason: string;
    }> = [];

    for (const row of currentRows) {
      if (row.sellPriceInput !== sellPriceInput) {
        historyValues.push({
          operatorId,
          changeType: "sell_price",
          targetType: "vendor_model",
          targetId: row.id,
          beforeValue: row.sellPriceInput,
          afterValue: sellPriceInput,
          reason,
        });
      }
      if (row.sellPriceOutput !== sellPriceOutput) {
        historyValues.push({
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

    // PERF: 批量 INSERT（一次 round-trip），减少事务内的 SQL 交互次数
    if (historyValues.length > 0) {
      await tx.insert(priceChangeHistory).values(historyValues);
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

    // PERF: 批量构建 priceChangeHistory INSERT，替代逐行循环 INSERT
    const historyValues: Array<{
      operatorId: number;
      changeType: string;
      targetType: string;
      targetId: number;
      beforeValue: string;
      afterValue: string;
      reason: string;
    }> = [];

    for (const row of currentRows) {
      if (row.costPriceInput !== costPriceInput) {
        historyValues.push({
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
        historyValues.push({
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

    // PERF: 批量 INSERT（一次 round-trip），减少事务内的 SQL 交互次数
    if (historyValues.length > 0) {
      await tx.insert(priceChangeHistory).values(historyValues);
    }
  });

  return { updatedCount: foundIds.length };
}

// ── 3. updatePricingMultiplier — 更新全局定价倍率 ──
// 更新 system_configs 后，自动按比例重算所有非零 sell price。
// 公式: newSellPrice = (oldSellPrice / oldMultiplier) * newMultiplier
// 零价格（用户手动设为 0 的）保持不变。

export async function updatePricingMultiplier(
  value: string,
  reason: string,
  operatorId: number
): Promise<{ beforeValue: string | null }> {
  // ── 值域校验 ──
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new AppError("INVALID_MULTIPLIER", "无效的定价倍率值", 400);
  }
  if (parsed <= 0) {
    throw new AppError("INVALID_MULTIPLIER", "定价倍率必须大于 0", 400);
  }
  if (parsed > 10) {
    throw new AppError("INVALID_MULTIPLIER", "定价倍率不能超过 10", 400);
  }

  const db = getDb();

  // 读取当前值
  const [current] = await db
    .select({ value: systemConfigs.value })
    .from(systemConfigs)
    .where(eq(systemConfigs.key, "pricing_multiplier"))
    .limit(1);

  const beforeValue = current?.value ?? null;
  const oldMultiplier = beforeValue ? parseFloat(beforeValue) : DEFAULT_PRICING_MULTIPLIER;
  const newMultiplier = parsed;

  // 若倍率无变化，跳过重算
  if (oldMultiplier === newMultiplier) {
    // 仍然 upsert 以确保 updatedAt 刷新
    await db.transaction(async (tx) => {
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
          set: { value, updatedBy: operatorId, updatedAt: new Date() },
        });

      await tx.insert(priceChangeHistory).values({
        operatorId,
        changeType: "pricing_multiplier",
        targetType: "system",
        targetId: null as any,
        beforeValue: beforeValue ? parseFloat(beforeValue).toString() : null,
        afterValue: value,
        reason,
      });
    });

    return { beforeValue };
  }

  // ── 事务：更新倍率 + 重算非零 sell price + 写变更历史 ──
  let recalculatedCount = 0;
  let zeroSkippedCount = 0;

  await db.transaction(async (tx) => {
    // 1) upsert system_config
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

    // 2) 获取所有有非零 sell price 的行（当前旧值）
    const priceRows = await tx
      .select({
        id: vendorModels.id,
        sellPriceInput: vendorModels.sellPriceInput,
        sellPriceOutput: vendorModels.sellPriceOutput,
      })
      .from(vendorModels)
      .where(
        sql`${vendorModels.sellPriceInput} > 0
          OR ${vendorModels.sellPriceOutput} > 0`
      );

    // 3) 计算新价格，收集 UPDATE 和 history
    const updateData: Array<{ id: number; newInput: string; newOutput: string }> = [];
    const historyValues: Array<{
      operatorId: number;
      changeType: string;
      targetType: string;
      targetId: number;
      beforeValue: string;
      afterValue: string;
      reason: string;
    }> = [];

    for (const row of priceRows) {
      const oldIn = parseFloat(row.sellPriceInput);
      const oldOut = parseFloat(row.sellPriceOutput);

      const newIn = oldIn > 0
        ? ((oldIn / oldMultiplier) * newMultiplier).toFixed(6)
        : "0.000000";
      const newOut = oldOut > 0
        ? ((oldOut / oldMultiplier) * newMultiplier).toFixed(6)
        : "0.000000";

      // 仅当 sell price 有非零字段才加入更新
      if (oldIn > 0 || oldOut > 0) {
        updateData.push({ id: row.id, newInput: newIn, newOutput: newOut });
        recalculatedCount++;

        if (oldIn > 0) {
          historyValues.push({
            operatorId,
            changeType: "sell_price",
            targetType: "vendor_model",
            targetId: row.id,
            beforeValue: row.sellPriceInput,
            afterValue: newIn,
            reason: `定价倍率变更: ${oldMultiplier} → ${newMultiplier}`,
          });
        }
        if (oldOut > 0) {
          historyValues.push({
            operatorId,
            changeType: "sell_price",
            targetType: "vendor_model",
            targetId: row.id,
            beforeValue: row.sellPriceOutput,
            afterValue: newOut,
            reason: `定价倍率变更: ${oldMultiplier} → ${newMultiplier}`,
          });
        }
      }
    }

    // 4) 【优化】批量 UPDATE vendor_models.sell_price（使用 CASE WHEN 替代循环）
    if (updateData.length > 0) {
      // PostgreSQL 支持批量 UPDATE with CASE WHEN
      const idList = updateData.map(u => u.id);
      const inputCases = updateData.map(u => `WHEN id = ${u.id} THEN '${u.newInput}'`).join(' ');
      const outputCases = updateData.map(u => `WHEN id = ${u.id} THEN '${u.newOutput}'`).join(' ');
      const idListStr = idList.join(',');

      await tx.execute(sql`
        UPDATE vendor_models
        SET
          sell_price_input = CASE ${sql.raw(inputCases)} END,
          sell_price_output = CASE ${sql.raw(outputCases)} END,
          updated_at = NOW()
        WHERE id IN (${sql.raw(idListStr)})
      `);
    }

    // 5) 写倍率变更历史
    await tx.insert(priceChangeHistory).values({
      operatorId,
      changeType: "pricing_multiplier",
      targetType: "system",
      targetId: null as any,
      beforeValue: beforeValue ? parseFloat(beforeValue).toString() : null,
      afterValue: value,
      reason,
    });

    // 6) 写价格重算历史（批量）
    if (historyValues.length > 0) {
      await tx.insert(priceChangeHistory).values(historyValues);
    }
  });

  // ── 事务外：清空 billing cache 使其下次重新读取 ──
  try {
    const { clearPricingMultiplierCache } = await import("./billing/cache.js");
    clearPricingMultiplierCache();
  } catch {
    // billing cache 不可用时不阻塞
  }

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
