// ============================================================
//  3cloud (3C) — 售价管理服务
//  批量更新售价 + 写变更历史
// ============================================================

import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { vendorModels, priceChangeHistory, systemConfigs, models, users } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { DEFAULT_PRICING_MULTIPLIER } from "./constants.js";

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