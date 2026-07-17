export interface BillingInput {
  userId: number; apiKeyId: number | null; modelId: number; vendorModelId: number;
  vendorName: string; modelName: string; promptTokens: number; completionTokens: number;
  totalTokens: number; durationMs: number; isStreaming: boolean;
  status: "success" | "failed" | "timeout" | "cancelled";
  errorMessage?: string; ip: string; userAgent?: string;
  // 快捷方式：传入 route 自动提取 keyGroup 字段
  route?: { keyGroupItemId?: number | null; keySellPriceInput?: number | null; keySellPriceOutput?: number | null };
  // 或显式传入（优先于 route）
  keyGroupItemId?: number | null;
  keySellPriceInput?: number | null;
  keySellPriceOutput?: number | null;
}

export interface BillingResult { cost: string; balanceBefore: string; balanceAfter: string; callLogId: number; }
export interface SellPrices { sellPriceInput: number; sellPriceOutput: number; }
export interface CostBreakdown { rawCost: number; discountedCost: number; pricingMultiplier: number; discountRate: number; sellPriceInput: number; sellPriceOutput: number; }
export interface BillingCacheStats { pricingMultiplier: { cached: boolean; value: number | null }; discountRateCount: number; sellPriceCount: number; }
