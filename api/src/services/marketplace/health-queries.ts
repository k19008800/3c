/**
 * 模型市场 — 健康查询公共逻辑
 *
 * 供 admin-marketplace 路由与 portal 公开接口复用：
 *   - 窗口解析
 *   - 桶表行按 model / supplier 折叠
 *   - 活跃模型目录（供应商数 + 最低售价）
 *   - 模型级统计构建（成功率 / 分位延迟 / 状态 / 最低价）
 *
 * 只查预聚合桶表 model_health_stats，不实时扫明细。
 */

import { db, schema } from '../../db';
import { and, eq, gte } from 'drizzle-orm';
import {
  successRate,
  errorRate,
  histogramPercentile,
  mergeHistograms,
  healthStatus,
} from '../../lib/latency';
import type { HealthStatus, Histogram } from '../../lib/latency';

export const WINDOWS = ['5m', '1h', '24h'] as const;
export type WindowParam = (typeof WINDOWS)[number];

export function isWindowParam(v: string): v is WindowParam {
  return (WINDOWS as readonly string[]).includes(v);
}

/** 窗口回溯时长（ms），默认 1h */
export function windowLookbackMs(window: string): number {
  switch (window) {
    case '5m':
      return 5 * 60 * 1000;
    case '24h':
      return 24 * 60 * 60 * 1000;
    default:
      return 60 * 60 * 1000;
  }
}

/** 一个折叠聚合单元的原始统计 */
export interface BucketAgg {
  requestCount: number;
  successCount: number;
  errorCount: number;
  errorCodeDist: Record<string, number>;
  latencyHist: Histogram;
  supplierIds: Set<number>;
}

/** 模型级市场统计（列表接口项） */
export interface ModelHealthStat {
  model: string;
  supplierCount: number;
  successRate: number | null;
  errorRate: number | null;
  p50Ms: number;
  p99Ms: number;
  status: HealthStatus;
  minPrice: number | null;
  trafficVolume: number;
}

/** 供应商级统计（详情接口项） */
export interface SupplierHealthStat {
  id: number;
  name: string;
  successRate: number | null;
  errorRate: number | null;
  p50Ms: number;
  p99Ms: number;
  trafficVolume: number;
  priceInput: number | null;
  priceOutput: number | null;
  status: 'active' | 'disabled' | 'testing';
}

/** 查询窗口内全部桶行，按 platform_model 折叠 */
export async function foldModelStats(window: string): Promise<Map<string, BucketAgg>> {
  const since = new Date(Date.now() - windowLookbackMs(window));
  const rows = await db
    .select({
      platformModel: schema.modelHealthStats.platformModel,
      supplierId: schema.modelHealthStats.supplierId,
      requestCount: schema.modelHealthStats.requestCount,
      successCount: schema.modelHealthStats.successCount,
      errorCount: schema.modelHealthStats.errorCount,
      errorCodeDist: schema.modelHealthStats.errorCodeDist,
      latencyHist: schema.modelHealthStats.latencyHist,
    })
    .from(schema.modelHealthStats)
    .where(gte(schema.modelHealthStats.bucketStart, since));

  const map = new Map<string, BucketAgg>();
  for (const r of rows) {
    let a = map.get(r.platformModel);
    if (!a) {
      a = { requestCount: 0, successCount: 0, errorCount: 0, errorCodeDist: {}, latencyHist: {}, supplierIds: new Set() };
      map.set(r.platformModel, a);
    }
    a.requestCount += r.requestCount;
    a.successCount += r.successCount;
    a.errorCount += r.errorCount;
    for (const [k, v] of Object.entries(r.errorCodeDist ?? {})) {
      a.errorCodeDist[k] = (a.errorCodeDist[k] ?? 0) + v;
    }
    a.latencyHist = mergeHistograms(a.latencyHist, r.latencyHist ?? {});
    a.supplierIds.add(r.supplierId);
  }
  return map;
}

/**
 * 活跃模型目录：每个标准模型名（active supplier_models）的
 * 活跃供应商数 + 最低售价（输入价，取 active vendor_pricing 最小值）。
 */
export async function activeModelCatalog(): Promise<
  Map<string, { supplierCount: number; minPrice: number | null }>
> {
  const rows = await db
    .select({
      modelName: schema.supplierModels.modelName,
      supplierId: schema.supplierModels.supplierId,
      inputPrice: schema.vendorPricing.inputPrice,
    })
    .from(schema.supplierModels)
    .leftJoin(
      schema.vendorPricing,
      and(
        eq(schema.vendorPricing.supplierModelId, schema.supplierModels.id),
        eq(schema.vendorPricing.status, 'active'),
      ),
    )
    .where(eq(schema.supplierModels.status, 'active'));

  const map = new Map<string, { supplierCount: number; minPrice: number | null }>();
  for (const r of rows) {
    let e = map.get(r.modelName);
    if (!e) {
      e = { supplierCount: 0, minPrice: null };
      map.set(r.modelName, e);
    }
    if (r.supplierId != null) e.supplierCount += 1;
    if (r.inputPrice != null) {
      const p = Number(r.inputPrice);
      if (Number.isFinite(p) && (e.minPrice === null || p < e.minPrice)) e.minPrice = p;
    }
  }
  return map;
}

/** 查询单个模型的窗口内桶行，按 supplier_id 折叠 */
export async function foldSupplierStats(model: string, window: string): Promise<Map<number, BucketAgg>> {
  const since = new Date(Date.now() - windowLookbackMs(window));
  const rows = await db
    .select({
      supplierId: schema.modelHealthStats.supplierId,
      requestCount: schema.modelHealthStats.requestCount,
      successCount: schema.modelHealthStats.successCount,
      errorCount: schema.modelHealthStats.errorCount,
      errorCodeDist: schema.modelHealthStats.errorCodeDist,
      latencyHist: schema.modelHealthStats.latencyHist,
    })
    .from(schema.modelHealthStats)
    .where(and(
      eq(schema.modelHealthStats.platformModel, model),
      gte(schema.modelHealthStats.bucketStart, since),
    ));

  const map = new Map<number, BucketAgg>();
  for (const r of rows) {
    let a = map.get(r.supplierId);
    if (!a) {
      a = { requestCount: 0, successCount: 0, errorCount: 0, errorCodeDist: {}, latencyHist: {}, supplierIds: new Set() };
      map.set(r.supplierId, a);
    }
    a.requestCount += r.requestCount;
    a.successCount += r.successCount;
    a.errorCount += r.errorCount;
    for (const [k, v] of Object.entries(r.errorCodeDist ?? {})) {
      a.errorCodeDist[k] = (a.errorCodeDist[k] ?? 0) + v;
    }
    a.latencyHist = mergeHistograms(a.latencyHist, r.latencyHist ?? {});
  }
  return map;
}

/** 由折叠聚合产出模型级统计 */
export function buildModelStat(
  model: string,
  agg: BucketAgg | undefined,
  catalog: { supplierCount: number; minPrice: number | null } | undefined,
): ModelHealthStat {
  const requestCount = agg?.requestCount ?? 0;
  const successRateV = successRate(agg?.successCount ?? 0, requestCount);
  return {
    model,
    supplierCount: catalog?.supplierCount ?? agg?.supplierIds.size ?? 0,
    successRate: successRateV,
    errorRate: errorRate(agg?.errorCount ?? 0, requestCount),
    p50Ms: histogramPercentile(agg?.latencyHist ?? {}, 0.5),
    p99Ms: histogramPercentile(agg?.latencyHist ?? {}, 0.99),
    status: healthStatus(successRateV, requestCount),
    minPrice: catalog?.minPrice ?? null,
    trafficVolume: requestCount,
  };
}

/** 供应商状态映射（active/disabled/testing） */
export function mapSupplierStatus(modelStatus: string, supplierStatus: string): 'active' | 'disabled' | 'testing' {
  if (supplierStatus !== 'active') return 'disabled';
  if (modelStatus === 'beta') return 'testing';
  if (modelStatus !== 'active') return 'disabled';
  return 'active';
}
