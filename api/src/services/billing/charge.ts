import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { users, callLogs, balanceLogs, systemConfigs, apiKeys } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { deductUserQuota } from "../quota-service.js";
import { getPricingMultiplier, getDiscountRate, getSellPrices } from "./cache.js";
import { processCommission } from "./commission.js";
import type { BillingInput, BillingResult } from "./types.js";

const ALERT_LOW_BALANCE_COOLDOWN = 3600;

export async function charge(input: BillingInput): Promise<BillingResult> {
  const db = getDb();
  const redis = getRedis();

  // 从 route 自动提取 keyGroup 字段（优先级：显式设置 > route 提取）
  const keyGroupItemId = input.keyGroupItemId ?? input.route?.keyGroupItemId ?? null;
  const keySellPriceInput = input.keySellPriceInput ?? input.route?.keySellPriceInput ?? null;
  const keySellPriceOutput = input.keySellPriceOutput ?? input.route?.keySellPriceOutput ?? null;

  const billingResult = await db.transaction(async (tx) => {
    // 读取 vendorModel 基价
    const prices = await getSellPrices(input.vendorModelId);

    // Key 级价格覆盖：如果请求走了 Key 分组且设了专属价，覆盖 vendorModel 基价
    const actualInputPrice = keySellPriceInput != null ? keySellPriceInput : prices.sellPriceInput;
    const actualOutputPrice = keySellPriceOutput != null ? keySellPriceOutput : prices.sellPriceOutput;

    // 全局倍率已在 sync 阶段应用到 sellPrice，此处不再重复应用
    // 修复：移除 multiplier，避免倍率被应用两次（sync × charge）
    const discountRate = await getDiscountRate(input.userId);
    // 价格单位为 元/百万tokens，÷1,000,000 得到 元/token
    const rawCost = (input.promptTokens * actualInputPrice + input.completionTokens * actualOutputPrice) / 1_000_000;
    const discountedCost = rawCost * discountRate;
    const costStr = discountedCost.toFixed(6);

    const [user] = await tx.select({ balance: users.balance, userType: users.userType, status: users.status, disabledUntil: users.disabledUntil })
      .from(users).where(eq(users.id, input.userId)).limit(1).for('update');
    if (!user) throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
    if (user.status === "disabled") throw new AppError("USER_DISABLED", `账号已被禁用${user.disabledUntil ? `，解封时间: ${user.disabledUntil.toISOString()}` : "（永久封禁）"}`, 403);
    if (user.status === "deleted") throw new AppError("USER_DELETED", "账号已注销", 403);

    const balanceBefore = Number(user.balance);
    const balanceAfter = Math.max(0, balanceBefore - discountedCost);
    const alertStopBalance = parseFloat((await tx.select({ value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, "alert_stop_balance")).limit(1))?.[0]?.value ?? "10");
    if (balanceBefore <= 0 && discountedCost > 0 && balanceBefore < -alertStopBalance) throw new AppError("BALANCE_EXHAUSTED", "余额已耗尽，请充值", 402);

    // 确定定价源
    let priceSource: string | null = null;
    let priceSourceId: number | null = null;
    let discountType: string | null = null;
    if (keySellPriceInput != null || keySellPriceOutput != null) {
      if (input.priceSource) {
        priceSource = input.priceSource;
        priceSourceId = input.priceSourceId ?? null;
        discountType = priceSource === 'key_model' ? 'percent' : null;
      } else if (keyGroupItemId != null) {
        priceSource = 'key_item';
        priceSourceId = keyGroupItemId;
      }
    }

    const [log] = await tx.insert(callLogs).values({
      userId: input.userId, apiKeyId: input.apiKeyId, modelId: input.modelId, vendorModelId: input.vendorModelId,
      vendorName: input.vendorName, modelName: input.modelName, promptTokens: input.promptTokens,
      completionTokens: input.completionTokens, totalTokens: input.totalTokens, cost: costStr,
      durationMs: input.durationMs, status: input.status, errorMessage: input.errorMessage,
      isStreaming: input.isStreaming, ip: input.ip, userAgent: input.userAgent,
      keyGroupItemId: keyGroupItemId ?? null,
      keySellPriceInput: keySellPriceInput != null ? String(keySellPriceInput) : null,
      keySellPriceOutput: keySellPriceOutput != null ? String(keySellPriceOutput) : null,
      priceSource,
      priceSourceId,
      discountType,
    }).returning({ id: callLogs.id });
    const callLogId = log.id;

    await tx.update(users).set({ balance: balanceAfter.toFixed(6) }).where(eq(users.id, input.userId));

    if (input.apiKeyId && input.status === "success") {
      const [keyRow] = await tx.select({ quotaBalance: apiKeys.quotaBalance }).from(apiKeys).where(eq(apiKeys.id, input.apiKeyId)).limit(1);
      if (keyRow?.quotaBalance !== null && keyRow?.quotaBalance !== undefined) {
        await tx.update(apiKeys).set({ quotaBalance: (Number(keyRow.quotaBalance) - Number(costStr)).toFixed(6) }).where(eq(apiKeys.id, input.apiKeyId));
      }
    }

    await tx.insert(balanceLogs).values({
      userId: input.userId, amount: costStr, balanceAfter: balanceAfter.toFixed(6), type: "consumption",
      refType: "call", refId: callLogId,
      description: `${input.modelName} / ${input.vendorName} (输入:${input.promptTokens} 输出:${input.completionTokens} 耗时:${input.durationMs}ms${input.isStreaming ? " 流式" : ""})`,
    });

    await processCommission(tx, input.userId, callLogId, costStr);

    const lowBalanceThreshold = parseFloat((await tx.select({ value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, "alert_low_balance")).limit(1))?.[0]?.value ?? "50");
    const userBalanceNum = balanceAfter;
    const userBalanceStr = balanceAfter.toFixed(6);

    if (userBalanceNum > 0 && userBalanceNum < lowBalanceThreshold) {
      const alertKey = `alert:low_balance:${input.userId}`;
      if (!(await redis.get(alertKey))) {
        await redis.setex(alertKey, ALERT_LOW_BALANCE_COOLDOWN, "1");
        try { const { notifyBalanceLow } = await import("../notification-service.js"); await notifyBalanceLow(input.userId, userBalanceStr, lowBalanceThreshold.toFixed(6)); } catch (e) { console.error(`[Billing] balance_low 通知发送失败 (userId=${input.userId}):`, e); }
      }
    }

    return { cost: costStr, balanceBefore: balanceBefore.toFixed(6), balanceAfter: userBalanceStr, callLogId };
  });

  if (input.status === "success") {
    deductQuotaAfterCharge(input.userId, billingResult.cost).catch((err) => console.error(`[Billing] 额度扣减失败 (userId=${input.userId}):`, err));
  }

  return billingResult;
}

async function deductQuotaAfterCharge(userId: number, cost: string): Promise<void> {
  try { await deductUserQuota(userId, cost); } catch (err) { console.warn(`[Billing] deductQuotaAfterCharge error:`, err); }
}
