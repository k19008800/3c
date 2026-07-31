/**
 * 价格计算 service
 * 提供价格换算的纯函数（不依赖 IO，便于单测）
 * Phase 0 作为 service 层规范示范；Phase 1 扩展完整计费
 */

/**
 * 计算调用费用
 * @param inputTokens 输入 tokens
 * @param outputTokens 输出 tokens
 * @param inputPrice 输入单价（元/1K tokens）
 * @param outputPrice 输出单价（元/1K tokens）
 * @returns 费用（元，保留 8 位）
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  inputPrice: number,
  outputPrice: number,
): number {
  if (inputTokens < 0 || outputTokens < 0) {
    throw new Error("tokens 不能为负数");
  }
  if (inputPrice < 0 || outputPrice < 0) {
    throw new Error("价格不能为负数");
  }
  const inputCost = (inputTokens / 1000) * inputPrice;
  const outputCost = (outputTokens / 1000) * outputPrice;
  return roundCurrency(inputCost + outputCost);
}

/**
 * 金额四舍五入到指定小数位
 */
export function roundCurrency(value: number, decimals = 8): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * 计算折扣后价格
 * @param price 原价
 * @param discountPercent 折扣百分比（如 10 = 9 折）
 */
export function applyDiscount(price: number, discountPercent: number): number {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error("折扣必须在 0-100 之间");
  }
  return roundCurrency(price * (1 - discountPercent / 100));
}
