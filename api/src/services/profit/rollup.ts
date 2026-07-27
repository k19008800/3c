// ============================================================
//  3cloud (3C) — 利润分析服务 — 月度汇总计算
// ============================================================

import { eq, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { callLogs, vendorModels, financeProfitRecords } from "../../db/schema.js";

function periodRange(period: string): { start: Date; end: Date } {
  const [year, month] = period.split("-").map(Number);
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0, 23, 59, 59, 999) };
}

export async function computeProfitRollup(period: string): Promise<{ inserted: number }> {
  const db = getDb();
  const { start, end } = periodRange(period);

  const rows = await db.execute(sql`
    SELECT cl.vendor_model_id,
      count(*)::int AS "totalCalls",
      sum(cl.total_tokens)::bigint AS "totalTokens",
      coalesce(sum(cl.cost), '0.000000') AS "totalUserCost",
      coalesce(sum(cl.prompt_tokens * vm.cost_price_input + cl.completion_tokens * vm.cost_price_output), '0.000000') AS "totalCostPrice"
    FROM call_logs cl INNER JOIN vendor_models vm ON cl.vendor_model_id = vm.id
    WHERE cl.status = 'success' AND cl.created_at >= ${start} AND cl.created_at < ${end}
    GROUP BY cl.vendor_model_id
  `);

  const rowList = rows.rows as any[];
  if (rowList.length === 0) return { inserted: 0 };

  const vendorModelIds: number[] = rowList.map(r => Number(r.vendor_model_id)).filter((id: any) => id != null);
  const vmRows = await db.select({ id: vendorModels.id, modelId: vendorModels.modelId, vendorId: vendorModels.vendorId }).from(vendorModels).where(inArray(vendorModels.id, vendorModelIds));
  const vmMap = new Map<number, { modelId: number | null; vendorId: number | null }>();
  for (const vm of vmRows) vmMap.set(vm.id, { modelId: vm.modelId, vendorId: vm.vendorId });

  const batchValues: any[] = [];
  const now = new Date();

  for (const row of rowList) {
    const vendorModelId = row.vendor_model_id;
    if (vendorModelId == null) continue;
    const vmInfo = vmMap.get(Number(vendorModelId));
    if (!vmInfo) continue;
    const totalUserCost = row.totalUserCost;
    const totalCostPrice = row.totalCostPrice;
    const grossProfit = (parseFloat(totalUserCost) - parseFloat(totalCostPrice)).toFixed(6);
    const grossMargin = parseFloat(totalUserCost) > 0 ? ((parseFloat(totalUserCost) - parseFloat(totalCostPrice)) / parseFloat(totalUserCost)).toFixed(6) : "0.000000";
    batchValues.push({ period, vendorModelId: Number(vendorModelId), modelId: vmInfo.modelId, vendorId: vmInfo.vendorId, totalCalls: row.totalCalls, totalTokens: row.totalTokens, totalUserCost, totalCostPrice, grossProfit, grossMargin, totalCommission: "0.000000", computedAt: now });
  }

  for (const val of batchValues) {
    await db.insert(financeProfitRecords).values(val).onConflictDoUpdate({
      target: [financeProfitRecords.period, financeProfitRecords.vendorModelId],
      set: { totalCalls: val.totalCalls, totalTokens: val.totalTokens, totalUserCost: val.totalUserCost, totalCostPrice: val.totalCostPrice, grossProfit: val.grossProfit, grossMargin: val.grossMargin, computedAt: now },
    });
  }

  return { inserted: batchValues.length };
}
