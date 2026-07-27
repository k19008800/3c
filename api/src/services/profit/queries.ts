// ============================================================
//  3cloud (3C) — 利润分析服务 — 查询
// ============================================================

import { eq, and, gte, lt, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { vendorModels, models, vendors, financeProfitRecords } from "../../db/schema.js";

export async function getProfitSummary(filters: { period: string; granularity: "model" | "vendor" }) {
  const db = getDb();
  if (filters.granularity === "vendor") {
    const rows = await db.select({
      vendorId: financeProfitRecords.vendorId, vendorName: vendors.name,
      totalCalls: sql<number>`sum(${financeProfitRecords.totalCalls})::int`,
      totalTokens: sql<string>`sum(${financeProfitRecords.totalTokens})`,
      totalUserCost: sql<string>`sum(${financeProfitRecords.totalUserCost})`,
      totalCostPrice: sql<string>`sum(${financeProfitRecords.totalCostPrice})`,
      grossProfit: sql<string>`sum(${financeProfitRecords.totalUserCost}) - sum(${financeProfitRecords.totalCostPrice})`,
      totalCommission: sql<string>`sum(${financeProfitRecords.totalCommission})`,
    }).from(financeProfitRecords).leftJoin(vendors, eq(financeProfitRecords.vendorId, vendors.id))
      .where(eq(financeProfitRecords.period, filters.period)).groupBy(financeProfitRecords.vendorId, vendors.name).orderBy(vendors.name);
    return rows.map(r => ({ ...r, totalTokens: Number(r.totalTokens), totalUserCost: Number(r.totalUserCost).toFixed(6), totalCostPrice: Number(r.totalCostPrice).toFixed(6), grossProfit: Number(r.grossProfit).toFixed(6), totalCommission: Number(r.totalCommission).toFixed(6) }));
  }
  const rows = await db.select({
    modelId: financeProfitRecords.modelId, modelName: models.name, modelType: models.type,
    vendorModelId: financeProfitRecords.vendorModelId, vendorName: vendors.name,
    totalCalls: sql<number>`sum(${financeProfitRecords.totalCalls})::int`,
    totalTokens: sql<string>`sum(${financeProfitRecords.totalTokens})`,
    totalUserCost: sql<string>`sum(${financeProfitRecords.totalUserCost})`,
    totalCostPrice: sql<string>`sum(${financeProfitRecords.totalCostPrice})`,
    grossProfit: sql<string>`sum(${financeProfitRecords.totalUserCost}) - sum(${financeProfitRecords.totalCostPrice})`,
    totalCommission: sql<string>`sum(${financeProfitRecords.totalCommission})`,
  }).from(financeProfitRecords).leftJoin(models, eq(financeProfitRecords.modelId, models.id))
    .leftJoin(vendors, eq(financeProfitRecords.vendorId, vendors.id))
    .where(eq(financeProfitRecords.period, filters.period))
    .groupBy(financeProfitRecords.modelId, models.name, models.type, financeProfitRecords.vendorModelId, vendors.name)
    .orderBy(models.name, vendors.name);
  return rows.map(r => ({ ...r, totalTokens: Number(r.totalTokens), totalUserCost: Number(r.totalUserCost).toFixed(6), totalCostPrice: Number(r.totalCostPrice).toFixed(6), grossProfit: Number(r.grossProfit).toFixed(6), totalCommission: Number(r.totalCommission).toFixed(6) }));
}

export async function getProfitTrend(startPeriod: string, endPeriod: string) {
  const db = getDb();
  const rows = await db.select({
    period: financeProfitRecords.period, totalCalls: sql<number>`sum(${financeProfitRecords.totalCalls})::int`,
    totalTokens: sql<string>`sum(${financeProfitRecords.totalTokens})`,
    totalUserCost: sql<string>`sum(${financeProfitRecords.totalUserCost})`,
    totalCostPrice: sql<string>`sum(${financeProfitRecords.totalCostPrice})`,
    grossProfit: sql<string>`sum(${financeProfitRecords.totalUserCost}) - sum(${financeProfitRecords.totalCostPrice})`,
    totalCommission: sql<string>`sum(${financeProfitRecords.totalCommission})`,
  }).from(financeProfitRecords)
    .where(and(gte(financeProfitRecords.period, startPeriod), lt(financeProfitRecords.period, endPeriod)))
    .groupBy(financeProfitRecords.period).orderBy(financeProfitRecords.period);
  return rows.map(r => ({ period: r.period, totalCalls: r.totalCalls, totalTokens: Number(r.totalTokens), totalUserCost: Number(r.totalUserCost).toFixed(6), totalCostPrice: Number(r.totalCostPrice).toFixed(6), grossProfit: Number(r.grossProfit).toFixed(6), totalCommission: Number(r.totalCommission).toFixed(6) }));
}

export async function getLowMarginModels() {
  const db = getDb();
  const rows = await db.select({
    id: financeProfitRecords.id, period: financeProfitRecords.period, vendorModelId: financeProfitRecords.vendorModelId,
    modelName: models.name, vendorName: vendors.name, totalCalls: financeProfitRecords.totalCalls,
    totalUserCost: financeProfitRecords.totalUserCost, totalCostPrice: financeProfitRecords.totalCostPrice,
    grossProfit: financeProfitRecords.grossProfit, grossMargin: financeProfitRecords.grossMargin,
  }).from(financeProfitRecords).leftJoin(models, eq(financeProfitRecords.modelId, models.id))
    .leftJoin(vendors, eq(financeProfitRecords.vendorId, vendors.id))
    .where(sql`${financeProfitRecords.grossMargin} < 0`).orderBy(sql`${financeProfitRecords.grossProfit} ASC`).limit(100);
  return rows.map(r => ({ ...r }));
}
