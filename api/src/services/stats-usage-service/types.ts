// ============================================================
//  3cloud (3C) — 用量聚合统计 类型定义
// ============================================================

export type PeriodGranularity = "hour" | "day" | "week" | "month";

export interface AggregatedQuery {
  /** 开始时间 ISO 字符串 */
  start?: string;
  /** 结束时间 ISO 字符串 */
  end?: string;
  /** 聚合粒度: hour/day/week/month (默认 day) */
  granularity?: PeriodGranularity;
  /** 按模型名筛选 */
  modelName?: string;
  /** 按供应商筛选 */
  vendorName?: string;
  /** 按用户 ID 筛选（管理后台用） */
  userId?: number;
  /** 最大返回条数 */
  limit?: number;
}

export interface AggregationItem {
  /** 聚合时间桶（ISO 日期/小时） */
  timeBucket: string;
  /** 调用总次数 */
  totalCalls: number;
  /** 成功调用次数 */
  successCalls: number;
  /** 失败调用次数 */
  failedCalls: number;
  /** prompt tokens */
  promptTokens: number;
  /** completion tokens */
  completionTokens: number;
  /** 总 tokens */
  totalTokens: number;
  /** 总成本（字符串，避免精度丢失） */
  totalCost: string;
  /** 平均延迟毫秒 */
  avgDuration: number;
  /** 活跃用户数 */
  uniqueUsers: number;
  /** 活跃模型数 */
  uniqueModels: number;
}

export interface AggregatedResult {
  series: AggregationItem[];
  summary: {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalCost: string;
    avgDuration: number;
    uniqueUsers: number;
    uniqueModels: number;
  };
}

export interface DetailItem {
  timeBucket: string;
  modelName: string | null;
  vendorName: string | null;
  totalCalls: number;
  successCalls: number;
  totalTokens: number;
  totalCost: string;
  avgDuration: number;
}
