// ============================================================
//  3cloud (3C) — 计费引擎
//  扣费：usage × 售价 × pricingMultiplier × 折扣
//  余额耗尽允许走完（微超机制）
//  支持流式断连回补、代理商分佣
// ============================================================

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
} from "../db/schema.js";
import { AppError } from "./auth-service.js";
import { refreshRollupForAgentDate } from "./agent-service.js";

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

  const value = cfg ? parseFloat(cfg.value) : 1.33;
  pricingMultiplierCache = { value, expiresAt: now + 60_000 };
  return value;
}

/** 清除定价倍率缓存（管理员修改后调用） */
export function clearPricingMultiplierCache() {
  pricingMultiplierCache = null;
}

// ── 获取用户折扣率 ──

async function getDiscountRate(userId: number): Promise<number> {
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
    return Number(discount.discountRate);
  }

  // 2. 查 users.discountRate
  const [user] = await db
    .select({ discountRate: users.discountRate, userType: users.userType })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return 1.0;

  if (user.discountRate) {
    return Number(user.discountRate);
  }

  // 3. 企业用户默认折扣
  if (user.userType === "enterprise") {
    const [cfg] = await db
      .select({ value: systemConfigs.value })
      .from(systemConfigs)
      .where(eq(systemConfigs.key, "enterprise_discount_rate"))
      .limit(1);
    return cfg ? parseFloat(cfg.value) : 0.95;
  }

  return 1.0;
}

// ── 获取售价 ──

async function getSellPrices(vendorModelId: number): Promise<{
  sellPriceInput: number;
  sellPriceOutput: number;
}> {
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

  return {
    sellPriceInput: Number(vm.sellPriceInput),
    sellPriceOutput: Number(vm.sellPriceOutput),
  };
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

// ── 执行扣费 ──

export async function charge(input: BillingInput): Promise<BillingResult> {
  const db = getDb();
  const redis = getRedis();

  return await db.transaction(async (tx) => {
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

    // 4. 检查余额是否足够（允许微超：余额 > 0 即可，走完再扣到负数）
    //    如果余额已 <= 0 且还被调用了，说明是微超还债场景
    //    如果大幅欠费，则拒绝
    const alertStopBalance = parseFloat(
      (await tx
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "alert_stop_balance"))
        .limit(1))?.[0]?.value ?? "10",
    );

    // 余额已经为 0 且成本大于 0，检查是否需要禁止
    if (balanceBefore <= 0 && discountedCost > 0) {
      // 如果是微超回补场景（balanceBefore 已经为负数），仍然允许
      // 但如果用户是正余额用完为负，允许欠费一次
      // 大幅欠费（低于 alert_stop_balance 且未在还款）则拒绝
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

    // 8. 如归属代理商，计算分佣（基于实际扣费金额）
    await processCommission(tx, input.userId, callLogId, costStr);

    // 9. 余额不足告警（Redis 去重，1 小时内同用户只发一次）
    const lowBalanceThreshold = parseFloat(
      (await tx
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "alert_low_balance"))
        .limit(1))?.[0]?.value ?? "50",
    );

    const userBalanceStr = balanceAfter.toFixed(6);
    const userBalanceNum = balanceAfter;

    // 设置低余额标记，让管理员查看
    if (userBalanceNum > 0 && userBalanceNum < lowBalanceThreshold) {
      const alertKey = `alert:low_balance:${input.userId}`;
      const exists = await redis.get(alertKey);
      if (!exists) {
        await redis.setex(alertKey, ALERT_LOW_BALANCE_COOLDOWN, "1");
        // 异步记录到日志（实际邮件发送待后续接入）
        requestLog(
          `低余额告警: 用户 ${input.userId}, 余额 ${userBalanceStr}, 阈值 ${lowBalanceThreshold}`,
        );
      }
    }

    return {
      cost: costStr,
      balanceBefore: balanceBefore.toFixed(6),
      balanceAfter: userBalanceStr,
      callLogId,
    };
  });
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

/**
 * 从当前代理商逐级向上，按团队规则抽成
 * @param tx - 复用上层事务
 * @param agentId - 直接代理商的 agentId
 * @param customerUserId - 消费客户
 * @param callLogId - 调用日志ID
 * @param callCost - 调用成本
 * @param saleCommission - 直接代理商获得的销售佣金金额
 */
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
  const maxDepth = 10; // 安全限制
  let depth = 0;

  while (currentAgentId && depth < maxDepth) {
    depth++;

    // 查当前代理商的上级
    const [agent] = await tx
      .select({ parentAgentId: agents.parentAgentId })
      .from(agents)
      .where(eq(agents.id, currentAgentId))
      .limit(1);

    if (!agent || !agent.parentAgentId) break;

    const parentId = agent.parentAgentId;

    // 查上级的团队佣金规则
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

    // 写入团队佣金
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

    // 刷新上级代理商的 rollup 汇总（使用与销售佣金一致的日期）
    await refreshRollupForAgentDate(parentId, reportDate, tx);

    // 继续向上走
    currentAgentId = parentId;
  }
}

// ── 续费佣金处理（充值到账时调用） ──

/**
 * 处理续费佣金
 * @param tx - 复用上层事务
 * @param userId - 充值用户ID
 * @param rechargeOrderId - 充值订单ID
 * @param rechargeAmount - 充值金额
 * @param orderNo - 订单号
 */
export async function processRenewalCommission(
  tx: any,
  userId: number,
  rechargeOrderId: number,
  rechargeAmount: string,
  orderNo: string,
): Promise<void> {
  // 1. 查客户归属的代理商
  const [client] = await tx
    .select({
      agentId: agentClients.agentId,
    })
    .from(agentClients)
    .where(eq(agentClients.clientUserId, userId))
    .limit(1);

  if (!client) return; // 无代理商归属

  // 2. 查续费规则（仅从 commission_rules 读取）
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

  let rate: number;
  let isFixedAmount = false;
  let maxCap: number | null = null;

  rate = Number(rule.rate);
  isFixedAmount = rule.fixedAmount ? true : false;
  maxCap = rule.maxCap ? Number(rule.maxCap) : null;

  if (rate <= 0 && !rule?.fixedAmount) return;

  const amountNum = Number(rechargeAmount);
  let commissionAmount = rule?.fixedAmount
    ? Number(rule.fixedAmount)
    : amountNum * rate;

  // 封顶
  if (maxCap) {
    commissionAmount = Math.min(commissionAmount, maxCap);
  }

  if (commissionAmount <= 0) return;

  // 3. 记录续费佣金（不更新 agent_customer_consumption，续费不触发消费汇总）
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

  // 刷新 rollup 汇总（使用实际佣金发生日期）
  const now = new Date();
  await refreshRollupForAgentDate(client.agentId, now.toISOString().slice(0, 10), tx);
}

// ── 活动奖励佣金处理（注册/首充等触点调用） ──

/**
 * 处理活动奖励佣金
 * @param tx - 复用上层事务（若无事务可传 null，内部自己创建）
 * @param agentId - 代理商ID
 * @param customerUserId - 客户用户ID
 * @param activityType - 活动类型
 * @param triggerAmount - 触发金额（如充值金额），可选
 * @param refId - 关联ID（订单号等）
 */
export async function processActivityCommission(
  tx: any,
  agentId: number,
  customerUserId: number,
  activityType: string,
  triggerAmount?: string,
  refId?: string,
): Promise<void> {
  const db = tx ?? getDb();

  // 查活动规则
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

  // 刷新 rollup 汇总（使用实际佣金发生日期）
  const now = new Date();
  await refreshRollupForAgentDate(agentId, now.toISOString().slice(0, 10), tx);
}

// ── 简单日志输出（生产应替换为正式 logger） ──

function requestLog(msg: string) {
  console.log(`[Billing] ${msg}`);
}
