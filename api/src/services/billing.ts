// ============================================================
//  3cloud (3C) — 计费引擎 (Business Logic)
// ============================================================
//
// ── 业务闭环 ──
//
// 【扣费公式】
//   rawCost = (promptTokens x sellPriceInput + completionTokens x sellPriceOutput)
//   discountedCost = rawCost x pricingMultiplier x discountRate
//   - precision: DECIMAL(18,6), toFixed(6) truncation
//   - all amounts in CNY (元)
//   - sellPriceInput/sellPriceOutput 来自 vendor_models 表，per vendorModelId 缓存 60s
//
// 【状态流转】
//   stream=false: request → charge() (事务内) → call_logs(status=success) + balance_logs(type=consumption) + users.balance -= cost
//   stream=true: request → SSE chunks → [DONE] → charge() → call_logs + balance_logs
//   stream disconnect: request → SSE → client disconnect → call_logs(status=cancelled, cost=0) — 不计费
//   balance exhausted mid-stream: 允许完成 → 余额可负 → 下次充值先回补负数
//
// 【定价层级 (getDiscountRate)】
//   1. user_discounts 表 (priority 最高, effectiveFrom <= NOW() < effectiveUntil)
//   2. users.discountRate (per-user default, nullable)
//   3. enterprise 用户默认 95% (system_configs key: enterprise_discount_rate, default 0.95)
//   4. 普通用户 100% (no discount, returns 1.0)
//   pricingMultiplier 来自 system_configs key: pricing_multiplier，默认 1.01（后台价格管理页可维护）
//
// 【缓存策略】
//   - getPricingMultiplier: 60s TTL 单值缓存 (key: pricing_multiplier)
//   - clearPricingMultiplierCache(): 管理员修改 system_configs 后调用
//   - getDiscountRate: 60s TTL per userId (Map<userId>)
//   - getSellPrices: 60s TTL per vendorModelId (Map<vendorModelId>)
//
// 【余额不足处理 (charge 事务内)】
//   - pre-check: users.balance (FOR UPDATE 行锁) > alert_stop_balance (system_configs, default 10)
//   - balance <= 0 且超过阈值 → 抛出 BALANCE_EXHAUSTED (code 402)
//   - balance 略负 (在阈值内) → 允许通过 (微超机制)
//   - 充值: applyRechargeBalance() → 先回补负数 → negative_repay log → 剩余记 recharge log
//   - 负数余额用户 CANNOT 发起新请求 (balance <= 0 被拦截)
//
// 【代理商分佣 (processCommission, 事务内)】
//   - trigger: call_logs created + user 在 agent_clients 表中
//   - sale 佣金: commission = callCost x commissionRules.rate (ruleType='sale', isEnabled=true, 时间窗口内)
//   - maxCap 封顶: Math.min(commissionAmount, maxCap)
//   - 写 commission_logs (status=pending, commissionType='sale')
//   - upsert agent_customer_consumption (ON CONFLICT ... DO UPDATE 累加)
//   - processTeamCommission: 向上级逐级剥离团队佣金 (maxDepth=10, ruleType='team')
//   - refreshRollupForAgentDate: 实时刷新 commission_daily_rollup
//
// 【续费佣金 (processRenewalCommission)】
//   - 充值确认时调用 (recharge-service.ts), 与计费事务分离
//   - commissionType='renewal', 支持 fixedAmount 固定金额或 rate 比例
//
// 【活动佣金 (processActivityCommission)】
//   - 注册奖励 (register_bonus), 首充奖励 (first_recharge)
//   - 支持 fixedAmount 固定金额或 rate 比例 + maxCap 封顶
//
// 【额度扣减 (deductQuotaAfterCharge)】
//   - 事务外异步执行, 不阻塞计费主流程
//   - 仅 success 状态调用 deductUserQuota (quota-service.ts)
//   - api_keys.quota_balance 在事务内同步扣减 (Key 独立额度)
//
// 【低余额告警】
//   - 阈值: system_configs key=alert_low_balance (default 50 元)
//   - 去重: Redis key alert:low_balance:{userId}, TTL 3600s
//   - 触发: notifyBalanceLow (notification-service.ts)
//
// 【调用链路】
//   proxy route → calculateCost() → charge() [事务] → call_logs + balance_logs + commission_logs + agent_customer_consumption

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import {
  vendorModels,
  users,
  callLogs,
  balanceLogs,
  commissionLogs,
  commissionRules,
  agents,
  agentClients,
  agentCustomerConsumption,
  userDiscounts,
  systemConfigs,
  apiKeys,
} from "../db/schema.js";
import { AppError } from "./auth-service.js";
import { deductUserQuota } from "./quota-service.js";

// ── 常量 ──

const ALERT_LOW_BALANCE_COOLDOWN = 3600; // 余额不足提醒冷却时间（秒）

// ── 输入类型 ──

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
  status: "success" | "failed" | "timeout" | "cancelled";
  errorMessage?: string;
  ip: string;
  userAgent?: string;
}

export interface BillingResult {
  cost: string;          // 扣费金额
  balanceBefore: string; // 扣费前余额
  balanceAfter: string;  // 扣费后余额
  callLogId: number;     // 对应的调用日志 ID
}

// ── 获取定价倍率（缓存 60 秒） ──

let pricingMultiplierCache: { value: number; expiresAt: number } | null = null;

async function getPricingMultiplier(): Promise<number> {
  const now = Date.now();
  if (pricingMultiplierCache && now < pricingMultiplierCache.expiresAt) {
    return pricingMultiplierCache.value;
  }

  const db = getDb();
  const [cfg] = await db
    .select({ value: systemConfigs.value })
    .from(systemConfigs)
    .where(eq(systemConfigs.key, "pricing_multiplier"))
    .limit(1);

  const value = cfg ? parseFloat(cfg.value) : 1.01;
  pricingMultiplierCache = { value, expiresAt: now + 60_000 };
  return value;
}

/** 清除定价倍率缓存（管理员修改后调用） */
export function clearPricingMultiplierCache() {
  pricingMultiplierCache = null;
}

// ── 获取用户折扣率（缓存 60 秒，按用户） ──

const discountRateCache = new Map<number, { value: number; expiresAt: number }>();

async function getDiscountRate(userId: number): Promise<number> {
  const now = Date.now();
  const cached = discountRateCache.get(userId);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }

  const db = getDb();

  // 1. 查 user_discounts 表（优先级最高）
  const [discount] = await db
    .select({ discountRate: userDiscounts.discountRate })
    .from(userDiscounts)
    .where(
      sql`${eq(userDiscounts.userId, userId)}
          AND ${userDiscounts.effectiveFrom} <= NOW()
          AND (${userDiscounts.effectiveUntil} IS NULL OR ${userDiscounts.effectiveUntil} > NOW())`
    )
    .limit(1);

  if (discount) {
    const value = Number(discount.discountRate);
    discountRateCache.set(userId, { value, expiresAt: now + 60_000 });
    return value;
  }

  // 2. 查 users.discountRate
  const [user] = await db
    .select({ discountRate: users.discountRate, userType: users.userType })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    discountRateCache.set(userId, { value: 1.0, expiresAt: now + 60_000 });
    return 1.0;
  }

  if (user.discountRate) {
    const value = Number(user.discountRate);
    discountRateCache.set(userId, { value, expiresAt: now + 60_000 });
    return value;
  }

  // 3. 企业用户默认折扣
  if (user.userType === "enterprise") {
    const [cfg] = await db
      .select({ value: systemConfigs.value })
      .from(systemConfigs)
      .where(eq(systemConfigs.key, "enterprise_discount_rate"))
      .limit(1);
    const value = cfg ? parseFloat(cfg.value) : 0.95;
    discountRateCache.set(userId, { value, expiresAt: now + 60_000 });
    return value;
  }

  discountRateCache.set(userId, { value: 1.0, expiresAt: now + 60_000 });
  return 1.0;
}

/** 清除用户折扣缓存 */
export function clearDiscountRateCache(userId?: number) {
  if (userId !== undefined) {
    discountRateCache.delete(userId);
  } else {
    discountRateCache.clear();
  }
}

// ── 获取售价（缓存 60 秒，按 vendorModelId）──

const sellPriceCache = new Map<number, { value: { sellPriceInput: number; sellPriceOutput: number }; expiresAt: number }>();

async function getSellPrices(vendorModelId: number): Promise<{
  sellPriceInput: number;
  sellPriceOutput: number;
}> {
  const now = Date.now();
  const cached = sellPriceCache.get(vendorModelId);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }

  const db = getDb();

  const [vm] = await db
    .select({
      sellPriceInput: vendorModels.sellPriceInput,
      sellPriceOutput: vendorModels.sellPriceOutput,
    })
    .from(vendorModels)
    .where(eq(vendorModels.id, vendorModelId))
    .limit(1);

  if (!vm) {
    throw new AppError("VENDOR_MODEL_NOT_FOUND", `厂商模型关联 (ID ${vendorModelId}) 不存在`, 404);
  }

  const value = {
    sellPriceInput: Number(vm.sellPriceInput),
    sellPriceOutput: Number(vm.sellPriceOutput),
  };

  sellPriceCache.set(vendorModelId, { value, expiresAt: now + 60_000 });
  return value;
}

/** 清除售价缓存（管理员修改 vendor_models 后调用） */
export function clearSellPriceCache(vendorModelId?: number) {
  if (vendorModelId !== undefined) {
    sellPriceCache.delete(vendorModelId);
  } else {
    sellPriceCache.clear();
  }
}

// ── 获取用户余额 ──

async function getUserBalance(userId: number): Promise<number> {
  const db = getDb();

  const [user] = await db
    .select({ balance: users.balance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
  }

  return Number(user.balance);
}

// ── 计算扣费金额 ──

export async function calculateCost(
  promptTokens: number,
  completionTokens: number,
  vendorModelId: number,
  userId: number,
): Promise<{
  rawCost: number;           // 原始费用（不含折扣）
  discountedCost: number;    // 折扣后费用
  pricingMultiplier: number;
  discountRate: number;
  sellPriceInput: number;
  sellPriceOutput: number;
}> {
  const prices = await getSellPrices(vendorModelId);
  const multiplier = await getPricingMultiplier();
  const discountRate = await getDiscountRate(userId);

  const rawCost =
    promptTokens * prices.sellPriceInput +
    completionTokens * prices.sellPriceOutput;

  const discountedCost = rawCost * multiplier * discountRate;

  return {
    rawCost,
    discountedCost,
    pricingMultiplier: multiplier,
    discountRate,
    sellPriceInput: prices.sellPriceInput,
    sellPriceOutput: prices.sellPriceOutput,
  };
}

// ── 执行扣费（含额度扣减） ──

export async function charge(input: BillingInput): Promise<BillingResult> {
  const db = getDb();
  const redis = getRedis();

  const billingResult = await db.transaction(async (tx) => {
    // 1. 获取售价
    const prices = await getSellPrices(input.vendorModelId);
    const multiplier = await getPricingMultiplier();
    const discountRate = await getDiscountRate(input.userId);

    const rawCost =
      input.promptTokens * prices.sellPriceInput +
      input.completionTokens * prices.sellPriceOutput;

    const discountedCost = rawCost * multiplier * discountRate;

    // 将成本格式化为 DECIMAL(18,6) 字符串
    const costStr = discountedCost.toFixed(6);
    const rawCostStr = rawCost.toFixed(6);

    // 2. 获取用户当前余额（FOR UPDATE 锁行防止并发）
    const [user] = await tx
      .select({
        balance: users.balance,
        userType: users.userType,
        status: users.status,
        disabledUntil: users.disabledUntil,
      })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1)
      .for('update');

    if (!user) {
      throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
    }

    // 3. 检查状态
    if (user.status === "disabled") {
      const until = user.disabledUntil
        ? `，解封时间: ${user.disabledUntil.toISOString()}`
        : "（永久封禁）";
      throw new AppError("USER_DISABLED", `账号已被禁用${until}`, 403);
    }

    if (user.status === "deleted") {
      throw new AppError("USER_DELETED", "账号已注销", 403);
    }

    const balanceBefore = Number(user.balance);
    const balanceAfter = Math.max(0, balanceBefore - discountedCost);

    // 4. 检查余额是否足够（允许微超）
    const alertStopBalance = parseFloat(
      (await tx
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "alert_stop_balance"))
        .limit(1))?.[0]?.value ?? "10",
    );

    if (balanceBefore <= 0 && discountedCost > 0) {
      if (balanceBefore < -alertStopBalance) {
        throw new AppError("BALANCE_EXHAUSTED", "余额已耗尽，请充值", 402);
      }
    }

    // 5. INSERT call_logs
    const [log] = await tx
      .insert(callLogs)
      .values({
        userId: input.userId,
        apiKeyId: input.apiKeyId,
        modelId: input.modelId,
        vendorModelId: input.vendorModelId,
        vendorName: input.vendorName,
        modelName: input.modelName,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens: input.totalTokens,
        cost: costStr,
        durationMs: input.durationMs,
        status: input.status,
        errorMessage: input.errorMessage,
        isStreaming: input.isStreaming,
        ip: input.ip,
        userAgent: input.userAgent,
      })
      .returning({ id: callLogs.id });

    const callLogId = log.id;

    // 6. UPDATE users.balance
    await tx
      .update(users)
      .set({ balance: balanceAfter.toFixed(6) })
      .where(eq(users.id, input.userId));

    // 6.5. UPDATE api_keys.quota_balance（Key 独立额度扣减）
    if (input.apiKeyId && input.status === "success") {
      const [keyRow] = await tx
        .select({ quotaBalance: apiKeys.quotaBalance })
        .from(apiKeys)
        .where(eq(apiKeys.id, input.apiKeyId))
        .limit(1);

      if (keyRow?.quotaBalance !== null && keyRow?.quotaBalance !== undefined) {
        const keyBalanceAfter = Number(keyRow.quotaBalance) - Number(costStr);
        await tx
          .update(apiKeys)
          .set({ quotaBalance: keyBalanceAfter.toFixed(6) })
          .where(eq(apiKeys.id, input.apiKeyId));
      }
    }

    // 7. INSERT balance_logs
    await tx.insert(balanceLogs).values({
      userId: input.userId,
      amount: costStr,
      balanceAfter: balanceAfter.toFixed(6),
      type: "consumption",
      refType: "call",
      refId: callLogId,
      description: `${input.modelName} / ${input.vendorName} (輸入:${input.promptTokens} 輸出:${input.completionTokens} 耗時:${input.durationMs}ms${input.isStreaming ? " 流式" : ""})`,
    });

    // 8. 如归属代理商，计算分佣
    await processCommission(tx, input.userId, callLogId, costStr);

    // 9. 余额不足告警（Redis 去重）
    const lowBalanceThreshold = parseFloat(
      (await tx
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "alert_low_balance"))
        .limit(1))?.[0]?.value ?? "50",
    );

    const userBalanceNum = balanceAfter;
    const userBalanceStr = balanceAfter.toFixed(6);

    if (userBalanceNum > 0 && userBalanceNum < lowBalanceThreshold) {
      const alertKey = `alert:low_balance:${input.userId}`;
      const exists = await redis.get(alertKey);
      if (!exists) {
        await redis.setex(alertKey, ALERT_LOW_BALANCE_COOLDOWN, "1");
        try {
          const { notifyBalanceLow } = await import("./notification-service.js");
          await notifyBalanceLow(input.userId, userBalanceStr, lowBalanceThreshold.toFixed(6));
        } catch (e) {
          console.error(`[Billing] balance_low 通知发送失败 (userId=${input.userId}):`, e);
        }
      }
    }

    return {
      cost: costStr,
      balanceBefore: balanceBefore.toFixed(6),
      balanceAfter: userBalanceStr,
      callLogId,
    };
  });

  // ── 用户维度周期额度扣减（事务外执行，不阻塞计费主流程） ──
  // 仅成功调用才扣减额度
  if (input.status === "success") {
    deductQuotaAfterCharge(input.userId, billingResult.cost).catch((err) => {
      console.error(`[Billing] 额度扣减失败 (userId=${input.userId}):`, err);
    });
  }

  return billingResult;
}

// ── 额度扣减辅助函数 ──

async function deductQuotaAfterCharge(
  userId: number,
  cost: string,
): Promise<void> {
  try {
    await deductUserQuota(userId, cost);
  } catch (err) {
    console.warn(`[Billing] deductQuotaAfterCharge error:`, err);
  }
}

// ── 代理商分佣处理 ──

async function processCommission(
  tx: any,
  userId: number,
  callLogId: number,
  callCost: string,
): Promise<void> {
  // 固定本次佣金发生时刻，确保 rollup 日期与 createdAt 一致
  const now = new Date();
  const reportDate = now.toISOString().slice(0, 10);
  // 查询用户是否代理商客户
  const [client] = await tx
    .select({
      agentId: agentClients.agentId,
    })
    .from(agentClients)
    .where(
      eq(agentClients.clientUserId, userId),
    )
    .limit(1);

  if (!client) return; // 无代理商归属

  // 从 commission_rules 查询销售佣金规则
  const [rule] = await tx
    .select({
      rate: commissionRules.rate,
      isEnabled: commissionRules.isEnabled,
      maxCap: commissionRules.maxCap,
    })
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.agentId, client.agentId),
        eq(commissionRules.ruleType, 'sale'),
        eq(commissionRules.isEnabled, true),
        sql`(${commissionRules.validFrom} IS NULL OR ${commissionRules.validFrom} <= NOW())`,
        sql`(${commissionRules.validUntil} IS NULL OR ${commissionRules.validUntil} > NOW())`,
      ),
    )
    .limit(1);

  if (!rule) return; // 无销售佣金规则
  const rate = Number(rule.rate);
  if (rate <= 0) return; // 分佣比例为 0，不分佣

  let commissionAmount = Number(callCost) * rate;

  // 封顶
  const maxCap = rule.maxCap ? Number(rule.maxCap) : null;
  if (maxCap) {
    commissionAmount = Math.min(commissionAmount, maxCap);
  }

  const commissionAmountStr = commissionAmount.toFixed(6);

  // 写入佣金流水（状态为 pending，余额在结算时更新）
  await tx.insert(commissionLogs).values({
    agentId: client.agentId,
    clientCallLogId: callLogId,
    callCost: callCost,
    commissionAmount: commissionAmountStr,
    sourceCustomerId: userId,
    commissionType: "sale",
    ruleSnapshot: JSON.stringify(rule),
    calcDetail: JSON.stringify({
      baseAmount: callCost,
      rate,
      maxCap: maxCap ?? null,
    }),
    status: "pending",
  });

  // 同步更新客户消费汇总表（upsert）
  const costNum = Number(callCost);
  const commNum = Number(commissionAmount);
  await tx.execute(sql`
    INSERT INTO agent_customer_consumption (agent_id, customer_user_id, total_amount, month_amount, commission_amount, order_count, last_order_at)
    VALUES (${client.agentId}, ${userId}, ${costNum.toFixed(6)}, ${costNum.toFixed(6)}, ${commNum.toFixed(6)}, 1, NOW())
    ON CONFLICT (agent_id, customer_user_id)
    DO UPDATE SET
      total_amount = agent_customer_consumption.total_amount + ${costNum.toFixed(6)},
      month_amount = agent_customer_consumption.month_amount + ${costNum.toFixed(6)},
      commission_amount = agent_customer_consumption.commission_amount + ${commNum.toFixed(6)},
      order_count = agent_customer_consumption.order_count + 1,
      last_order_at = NOW(),
      updated_at = NOW()
  `);

  // 新增：向上级代理商分发团队佣金（传递固定 reportDate）
  await processTeamCommission(tx, client.agentId, userId, callLogId, callCost, commissionAmountStr, reportDate);

  // 刷新 rollup 汇总（使用与 createdAt 一致的日期）
  await refreshRollupForAgentDate(client.agentId, reportDate, tx);
}

// ── 向上级代理商分发团队佣金（逐级剥皮） ──

async function processTeamCommission(
  tx: any,
  agentId: number,
  customerUserId: number,
  callLogId: number,
  callCost: string,
  saleCommission: string,
  reportDate: string,
) {
  let currentAgentId = agentId;
  const maxDepth = 10;
  let depth = 0;

  while (currentAgentId && depth < maxDepth) {
    depth++;
    const [agent] = await tx
      .select({ parentAgentId: agents.parentAgentId })
      .from(agents)
      .where(eq(agents.id, currentAgentId))
      .limit(1);

    if (!agent || !agent.parentAgentId) break;
    const parentId = agent.parentAgentId;

    const [rule] = await tx
      .select({
        rate: commissionRules.rate,
        isEnabled: commissionRules.isEnabled,
        maxCap: commissionRules.maxCap,
      })
      .from(commissionRules)
      .where(
        and(
          eq(commissionRules.agentId, parentId),
          eq(commissionRules.ruleType, 'team'),
          eq(commissionRules.isEnabled, true),
          sql`(${commissionRules.validFrom} IS NULL OR ${commissionRules.validFrom} <= NOW())`,
          sql`(${commissionRules.validUntil} IS NULL OR ${commissionRules.validUntil} > NOW())`,
        ),
      )
      .limit(1);

    if (!rule || Number(rule.rate) <= 0) {
      currentAgentId = parentId;
      continue;
    }

    const teamRate = Number(rule.rate);
    const baseAmount = Number(saleCommission);
    let teamAmount = baseAmount * teamRate;
    if (rule.maxCap) {
      teamAmount = Math.min(teamAmount, Number(rule.maxCap));
    }
    if (teamAmount <= 0) {
      currentAgentId = parentId;
      continue;
    }

    await tx.insert(commissionLogs).values({
      agentId: parentId,
      clientCallLogId: callLogId,
      callCost: callCost,
      commissionAmount: teamAmount.toFixed(6),
      sourceCustomerId: customerUserId,
      sourceOrderId: String(callLogId),
      sourceOrderAmount: callCost,
      commissionType: "team",
      feeRate: String(teamRate),
      feeAmount: "0.000000",
      netAmount: teamAmount.toFixed(6),
      ruleSnapshot: JSON.stringify(rule),
      calcDetail: JSON.stringify({
        baseCommission: saleCommission,
        teamRate,
        sourceAgentId: currentAgentId,
        sourceAgentCallId: callLogId,
      }),
      status: "pending",
    });

    await refreshRollupForAgentDate(parentId, reportDate, tx);
    currentAgentId = parentId;
  }
}

// ── 续费佣金处理 ──

export async function processRenewalCommission(
  tx: any,
  userId: number,
  rechargeOrderId: number,
  rechargeAmount: string,
  orderNo: string,
): Promise<void> {
  const [client] = await tx
    .select({ agentId: agentClients.agentId })
    .from(agentClients)
    .where(eq(agentClients.clientUserId, userId))
    .limit(1);

  if (!client) return;

  const [rule] = await tx
    .select({
      rate: commissionRules.rate,
      isEnabled: commissionRules.isEnabled,
      maxCap: commissionRules.maxCap,
      fixedAmount: commissionRules.fixedAmount,
    })
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.agentId, client.agentId),
        eq(commissionRules.ruleType, 'renewal'),
        eq(commissionRules.isEnabled, true),
        sql`(${commissionRules.validFrom} IS NULL OR ${commissionRules.validFrom} <= NOW())`,
        sql`(${commissionRules.validUntil} IS NULL OR ${commissionRules.validUntil} > NOW())`,
      ),
    )
    .limit(1);

  if (!rule) return;

  let rate = Number(rule.rate);
  let isFixedAmount = !!rule.fixedAmount;
  let maxCap = rule.maxCap ? Number(rule.maxCap) : null;

  if (rate <= 0 && !rule?.fixedAmount) return;

  const amountNum = Number(rechargeAmount);
  let commissionAmount = rule?.fixedAmount
    ? Number(rule.fixedAmount)
    : amountNum * rate;

  if (maxCap) {
    commissionAmount = Math.min(commissionAmount, maxCap);
  }
  if (commissionAmount <= 0) return;

  await tx.insert(commissionLogs).values({
    agentId: client.agentId,
    clientCallLogId: null,
    callCost: rechargeAmount,
    commissionAmount: commissionAmount.toFixed(6),
    sourceCustomerId: userId,
    sourceOrderId: orderNo,
    sourceOrderAmount: rechargeAmount,
    commissionType: "renewal",
    ruleSnapshot: JSON.stringify(rule),
    calcDetail: JSON.stringify({
      baseAmount: rechargeAmount,
      rate,
      isFixedAmount,
      maxCap,
    }),
    status: "pending",
  });

  const now = new Date();
  await refreshRollupForAgentDate(client.agentId, now.toISOString().slice(0, 10), tx);
}

// ── 活动奖励佣金处理 ──

export async function processActivityCommission(
  tx: any,
  agentId: number,
  customerUserId: number,
  activityType: string,
  triggerAmount?: string,
  refId?: string,
): Promise<void> {
  const db = tx ?? getDb();

  const [rule] = await db
    .select({
      rate: commissionRules.rate,
      isEnabled: commissionRules.isEnabled,
      maxCap: commissionRules.maxCap,
      fixedAmount: commissionRules.fixedAmount,
      activityName: commissionRules.activityName,
    })
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.agentId, agentId),
        eq(commissionRules.ruleType, 'activity'),
        eq(commissionRules.activityType, activityType as any),
        eq(commissionRules.isEnabled, true),
        sql`(${commissionRules.validFrom} IS NULL OR ${commissionRules.validFrom} <= NOW())`,
        sql`(${commissionRules.validUntil} IS NULL OR ${commissionRules.validUntil} > NOW())`,
      ),
    )
    .limit(1);

  if (!rule) return;

  let amount = rule.fixedAmount
    ? Number(rule.fixedAmount)
    : (triggerAmount ? Number(triggerAmount) * Number(rule.rate) : 0);

  if (rule.maxCap) {
    amount = Math.min(amount, Number(rule.maxCap));
  }
  if (amount <= 0) return;

  await db.insert(commissionLogs).values({
    agentId,
    clientCallLogId: null,
    callCost: triggerAmount ?? "0.000000",
    commissionAmount: amount.toFixed(6),
    sourceCustomerId: customerUserId,
    sourceOrderId: refId ?? null,
    sourceOrderAmount: triggerAmount ?? null,
    commissionType: "activity",
    ruleSnapshot: JSON.stringify(rule),
    calcDetail: JSON.stringify({
      activityType,
      isFixed: !!rule.fixedAmount,
      rate: rule.rate,
      triggerAmount,
    }),
    status: "pending",
  });

  const now = new Date();
  await refreshRollupForAgentDate(agentId, now.toISOString().slice(0, 10), tx);
}

// ── 刷新代理商日汇总 ──

async function refreshRollupForAgentDate(
  agentId: number,
  reportDate: string,
  tx: any,
): Promise<void> {
  try {
    const { refreshRollupForAgentDate: refreshFn } = await import("./agent-finance.js");
    await refreshFn(agentId, reportDate, tx);
  } catch (err) {
    console.warn(`[Billing] refreshRollupForAgentDate error (agent=${agentId}):`, err);
  }
}
