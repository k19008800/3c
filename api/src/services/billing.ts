// ============================================================
//  3cloud (3C) — 计费引擎
//  扣费：usage × 售价 × 折扣
//  余额耗尽允许走完（微超机制）
//  占位 — 后续开发实现
// ============================================================

export interface BillingInput {
  userId: number;
  apiKeyId: number | null;
  modelId: number;
  vendorModelId: number;
  vendorName: string;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  isStreaming: boolean;
  ip: string;
}

/**
 * 执行扣费
 * 公式: (promptTokens × sellPriceInput + completionTokens × sellPriceOutput)
 *        × pricingMultiplier × discountRate
 */
export async function charge(input: BillingInput): Promise<{
  cost: string;
  balanceAfter: string;
}> {
  // TODO: 实现扣费
  // 1. 查询 vendorModels 获取售价
  // 2. 查询 system_configs 获取 pricingMultiplier
  // 3. 查询 user_discounts / users.discountRate 获取折扣
  // 4. 计算扣费金额
  // 5. INSERT call_logs
  // 6. INSERT balance_logs
  // 7. UPDATE users SET balance
  // 8. 如归属代理商，计算分佣
  throw new Error("Not implemented");
}
