// ============================================================
//  3cloud (3C) — 利润分析服务
//  月级利润汇总计算、查询、告警
// ============================================================

import { eq, and, sql, gte, lt, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { callLogs, vendorModels, models, vendors, financeProfitRecords } from "../db/schema.js";

// ── Period helpers ──

function periodRange(period: string): { start: Date; end: Date } {
  const [year, month] = period.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

// ── 1. computeProfitRollup — 从 call_logs JOIN vendor_models 计算月利润汇总 ──

export async function computeProfitRollup(period: string): Promise<{ inserted: number }> {
  const db = getDb();
  const { start, end } = periodRange(period);

  // 使用 raw SQL 进行聚合查询（需要跨表引用列计算成本）
  const rows = await db.execute(sql`
    SELECT
      cl.vendor_model_id,
      count(*)::int AS "totalCalls",
      sum(cl.total_tokens)::bigint AS "totalTokens",
      coalesce(sum(cl.cost), '0.000000') AS "totalUserCost",
      coalesce(
        sum(
          cl.prompt_tokens * vm.cost_price_input +
          cl.completion_tokens * vm.cost_price_output
        ),
        '0.000000'
      ) AS "totalCostPrice"
    FROM call_logs cl
    INNER JOIN vendor_models vm ON cl.vendor_model_id = vm.id
    WHERE cl.status = 'success'
      AND cl.created_at >= ${start}
      AND cl.created_at < ${end}
    GROUP BY cl.vendor_model_id
  `);

  const rowList = rows.rows as any[];
  if (rowList.length === 0) return { inserted: 0 };

  // PERF: 预读所有需要的 vendorModel 记录到 Map，避免逐行 SELECT (N+1 → 1)
  const vendorModelIds: number[] = [];
  for (const row of rowList) {
    const id = row.vendor_model_id;
    if (id != null) vendorModelIds.push(Number(id));
  }

  const vmRows = await db
    .select({
      id: vendorModels.id,
      modelId: vendorModels.modelId,
      vendorId: vendorModels.vendorId,
    })
    .from(vendorModels)
    .where(inArray(vendorModels.id, vendorModelIds));

  const vmMap = new Map<number, { modelId: number | null; vendorId: number | null }>();
  for (const vm of vmRows) {
    vmMap.set(vm.id, { modelId: vm.modelId, vendorId: vm.vendorId });
  }

  // PERF: 批量构建 INSERT VALUES，避免逐行 INSERT
  const batchValues: any[] = [];
  const now = new Date();

  for (const row of rowList) {
    const vendorModelId = row.vendor_model_id;
    if (vendorModelId === null || vendorModelId === undefined) continue;

    const vmInfo = vmMap.get(Number(vendorModelId));
    if (!vmInfo) continue;

    const totalUserCost = row.totalUserCost;
    const totalCostPrice = row.totalCostPrice;
    const grossProfit = (parseFloat(totalUserCost) - parseFloat(totalCostPrice)).toFixed(6);
    const grossMargin = parseFloat(totalUserCost) > 0
      ? ((parseFloat(totalUserCost) - parseFloat(totalCostPrice)) / parseFloat(totalUserCost)).toFixed(6)
      : "0.000000";

    batchValues.push({
      period,
      vendorModelId: Number(vendorModelId),
      modelId: vmInfo.modelId,
      vendorId: vmInfo.vendorId,
      totalCalls: row.totalCalls,
      totalTokens: row.totalTokens,
      totalUserCost,
      totalCostPrice,
      grossProfit,
      grossMargin,
      totalCommission: "0.000000",
      computedAt: now,
    });
  }

  // PERF: 批量 INSERT ... ON CONFLICT DO UPDATE (替代逐行 INSERT)
  if (batchValues.length > 0) {
    for (const val of batchValues) {
      await db
        .insert(financeProfitRecords)
        .values(val)
        .onConflictDoUpdate({
          target: [financeProfitRecords.period, financeProfitRecords.vendorModelId],
          set: {
            totalCalls: val.totalCalls,
            totalTokens: val.totalTokens,
            totalUserCost: val.totalUserCost,
            totalCostPrice: val.totalCostPrice,
            grossProfit: val.grossProfit,
            grossMargin: val.grossMargin,
            computedAt: now,
          },
        });
    }
  }

  return { inserted: batchValues.length };
}

// ── 2. getProfitSummary — 按 period/vendor/model 维度聚合 ──

export async function getProfitSummary(filters: {
  period: string;
  granularity: "model" | "vendor";
}) {
  const db = getDb();

  if (filters.granularity === "vendor") {
    const rows = await db
      .select({
        vendorId: financeProfitRecords.vendorId,
        vendorName: vendors.name,
        totalCalls: sql<number>`sum(${financeProfitRecords.totalCalls})::int`,
        totalTokens: sql<string>`sum(${financeProfitRecords.totalTokens})`,
        totalUserCost: sql<string>`sum(${financeProfitRecords.totalUserCost})`,
        totalCostPrice: sql<string>`sum(${financeProfitRecords.totalCostPrice})`,
        grossProfit: sql<string>`sum(${financeProfitRecords.totalUserCost}) - sum(${financeProfitRecords.totalCostPrice})`,
        totalCommission: sql<string>`sum(${financeProfitRecords.totalCommission})`,
      })
      .from(financeProfitRecords)
      .leftJoin(vendors, eq(financeProfitRecords.vendorId, vendors.id))
      .where(eq(financeProfitRecords.period, filters.period))
      .groupBy(financeProfitRecords.vendorId, vendors.name)
      .orderBy(vendors.name);

    return rows.map((r) => ({
      ...r,
      totalTokens: Number(r.totalTokens),
      totalUserCost: Number(r.totalUserCost).toFixed(6),
      totalCostPrice: Number(r.totalCostPrice).toFixed(6),
      grossProfit: Number(r.grossProfit).toFixed(6),
      totalCommission: Number(r.totalCommission).toFixed(6),
    }));
  }

  // granularity === "model"
  const rows = await db
    .select({
      modelId: financeProfitRecords.modelId,
      modelName: models.name,
      modelType: models.type,
      vendorModelId: financeProfitRecords.vendorModelId,
      vendorName: vendors.name,
      totalCalls: sql<number>`sum(${financeProfitRecords.totalCalls})::int`,
      totalTokens: sql<string>`sum(${financeProfitRecords.totalTokens})`,
      totalUserCost: sql<string>`sum(${financeProfitRecords.totalUserCost})`,
      totalCostPrice: sql<string>`sum(${financeProfitRecords.totalCostPrice})`,
      grossProfit: sql<string>`sum(${financeProfitRecords.totalUserCost}) - sum(${financeProfitRecords.totalCostPrice})`,
      totalCommission: sql<string>`sum(${financeProfitRecords.totalCommission})`,
    })
    .from(financeProfitRecords)
    .leftJoin(models, eq(financeProfitRecords.modelId, models.id))
    .leftJoin(vendors, eq(financeProfitRecords.vendorId, vendors.id))
    .where(eq(financeProfitRecords.period, filters.period))
    .groupBy(
      financeProfitRecords.modelId,
      models.name,
      models.type,
      financeProfitRecords.vendorModelId,
      vendors.name
    )
    .orderBy(models.name, vendors.name);

  return rows.map((r) => ({
    ...r,
    totalTokens: Number(r.totalTokens),
    totalUserCost: Number(r.totalUserCost).toFixed(6),
    totalCostPrice: Number(r.totalCostPrice).toFixed(6),
    grossProfit: Number(r.grossProfit).toFixed(6),
    totalCommission: Number(r.totalCommission).toFixed(6),
  }));
}

// ── 3. getProfitTrend — 月度趋势 ──

export async function getProfitTrend(startPeriod: string, endPeriod: string) {
  const db = getDb();

  const rows = await db
    .select({
      period: financeProfitRecords.period,
      totalCalls: sql<number>`sum(${financeProfitRecords.totalCalls})::int`,
      totalTokens: sql<string>`sum(${financeProfitRecords.totalTokens})`,
      totalUserCost: sql<string>`sum(${financeProfitRecords.totalUserCost})`,
      totalCostPrice: sql<string>`sum(${financeProfitRecords.totalCostPrice})`,
      grossProfit: sql<string>`sum(${financeProfitRecords.totalUserCost}) - sum(${financeProfitRecords.totalCostPrice})`,
      totalCommission: sql<string>`sum(${financeProfitRecords.totalCommission})`,
    })
    .from(financeProfitRecords)
    .where(
      and(
        gte(financeProfitRecords.period, startPeriod),
        lt(financeProfitRecords.period, endPeriod)
      )
    )
    .groupBy(financeProfitRecords.period)
    .orderBy(financeProfitRecords.period);

  return rows.map((r) => ({
    period: r.period,
    totalCalls: r.totalCalls,
    totalTokens: Number(r.totalTokens),
    totalUserCost: Number(r.totalUserCost).toFixed(6),
    totalCostPrice: Number(r.totalCostPrice).toFixed(6),
    grossProfit: Number(r.grossProfit).toFixed(6),
    totalCommission: Number(r.totalCommission).toFixed(6),
  }));
}

// ── 4. getLowMarginModels — 毛利率低于 0 的模型告警列表 ──

export async function getLowMarginModels() {
  const db = getDb();

  const rows = await db
    .select({
      id: financeProfitRecords.id,
      period: financeProfitRecords.period,
      vendorModelId: financeProfitRecords.vendorModelId,
      modelName: models.name,
      vendorName: vendors.name,
      totalCalls: financeProfitRecords.totalCalls,
      totalUserCost: financeProfitRecords.totalUserCost,
      totalCostPrice: financeProfitRecords.totalCostPrice,
      grossProfit: financeProfitRecords.grossProfit,
      grossMargin: financeProfitRecords.grossMargin,
    })
    .from(financeProfitRecords)
    .leftJoin(models, eq(financeProfitRecords.modelId, models.id))
    .leftJoin(vendors, eq(financeProfitRecords.vendorId, vendors.id))
    .where(sql`${financeProfitRecords.grossMargin} < 0`)
    .orderBy(sql`${financeProfitRecords.grossProfit} ASC`)
    .limit(100);

  return rows.map((r) => ({
    ...r,
    totalUserCost: r.totalUserCost,
    totalCostPrice: r.totalCostPrice,
    grossProfit: r.grossProfit,
    grossMargin: r.grossMargin,
  }));
}
