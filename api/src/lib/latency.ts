/**
 * 模型健康度 — 延迟直方图 / 分位数 / 状态判定
 *
 * 模型市场页面的核心口径定义，聚合 Worker 与查询接口共用。
 * 所有常量与计算函数保持单一来源，避免口径漂移。
 */

/** 延迟直方图桶上界（ms）。[0, 50, 100, ..., 5000]，超上限进 "5000_inf" */
export const LATENCY_BOUNDARIES = [0, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000] as const;

export type Histogram = Record<string, number>;

/** 空直方图 */
export function emptyHistogram(): Histogram {
  const h: Histogram = {};
  h[histKey(0)] = 0;
  return h;
}

/** 根据延迟(ms)返回所在桶的 key，如 0 / 50 / 100 ... 5000 */
export function histKey(latencyMs: number): number {
  let key = 0;
  for (const b of LATENCY_BOUNDARIES) {
    if (latencyMs >= b) key = b;
    else break;
  }
  return key;
}

/** 直方图 key 的展示名：数值上界，"5000_inf" 表示超上限 */
export function histLabel(key: number): string {
  if (key === 0) return '0_50';
  if (key === LATENCY_BOUNDARIES[LATENCY_BOUNDARIES.length - 1]) return `${key}_inf`;
  return `${key}_${nextBoundary(key)}`;
}

function nextBoundary(key: number): number {
  for (const b of LATENCY_BOUNDARIES) {
    if (b > key) return b;
  }
  return key;
}

/** 判定一条请求的延迟归属桶 key，负值/异常值归入首桶 */
export function latencyBucketKey(latencyMs: number): number {
  return histKey(Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : 0);
}

/** 将 raw 延迟累加进直方图 */
export function addToHistogram(hist: Histogram, latencyMs: number): Histogram {
  const k = latencyBucketKey(latencyMs);
  return { ...hist, [k]: (hist[k] ?? 0) + 1 };
}

/** 合并多个直方图 */
export function mergeHistograms(hist: Histogram, ...others: Histogram[]): Histogram {
  const out: Histogram = { ...hist };
  for (const o of others) {
    for (const [k, v] of Object.entries(o)) {
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

/** 直方图总样本数 */
export function histTotal(hist: Histogram): number {
  return Object.values(hist).reduce((a, b) => a + b, 0);
}

/**
 * 从直方图估算 P50 / P99（线性插值）。
 *
 * 基于固定桶边界：目标样本序号 = percentile * total，找到它所在的桶，
 * 在桶上界区间内线性插值。近似于精确分位，桶足够细时误差可忽略。
 */
export function histogramPercentile(hist: Histogram, p: number): number {
  const total = histTotal(hist);
  if (total <= 0) return 0;
  const target = p * total;

  const keys = Object.keys(hist)
    .map(Number)
    .sort((a, b) => a - b);

  let acc = 0;
  for (const key of keys) {
    const count = hist[key] ?? 0;
    if (count <= 0) continue;
    const bucketStart = key; // 该桶覆盖 [key, nextBoundary)
    const next = nextBoundary(key);
    acc += count;
    if (acc >= target) {
      const inBucket = count > 0 ? (target - (acc - count)) / count : 0;
      // 桶内线性插值；末桶无上界时取上界（超上限场景取上界近似）
      return Math.round(bucketStart + inBucket * (next - bucketStart));
    }
  }
  return Math.round(LATENCY_BOUNDARIES[LATENCY_BOUNDARIES.length - 1]!);
}

/** 成功率（0-100，保留 1 位小数）。无样本返回 null */
export function successRate(success: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((success / total) * 1000) / 10;
}

/** 错误率（0-100，保留 1 位小数）。无样本返回 null */
export function errorRate(errors: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((errors / total) * 1000) / 10;
}

export type HealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'no_data';

/**
 * 综合健康状态判定（与路由引擎 AutoBan 口径一致）：
 *   - 零流量 / 无数据 → no_data
 *   - 成功率 >= 95% → healthy
 *   - 90% <= 成功率 < 95% → degraded
 *   - 成功率 < 90% → unavailable
 */
export function healthStatus(successRateValue: number | null, totalRequests: number): HealthStatus {
  if (totalRequests <= 0 || successRateValue === null) return 'no_data';
  if (successRateValue >= 95) return 'healthy';
  if (successRateValue >= 90) return 'degraded';
  return 'unavailable';
}

/** 状态排序权重：healthy → degraded → unavailable → no_data */
export const HEALTH_ORDER: Record<HealthStatus, number> = {
  healthy: 0,
  degraded: 1,
  unavailable: 2,
  no_data: 3,
};
