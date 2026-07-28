import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { commissionLogs, commissionRules, agents, agentClients, agentCustomerConsumption } from "../../db/schema.js";

export async function processCommission(tx: any, userId: number, callLogId: number, callCost: string): Promise<void> {
  const now = new Date();
  const reportDate = now.toISOString().slice(0, 10);
  const [client] = await tx.select({ agentId: agentClients.agentId }).from(agentClients).where(eq(agentClients.clientUserId, userId)).limit(1);
  if (!client) return;

  const [rule] = await tx.select({ rate: commissionRules.rate, isEnabled: commissionRules.isEnabled, maxCap: commissionRules.maxCap })
    .from(commissionRules).where(and(eq(commissionRules.agentId, client.agentId), eq(commissionRules.ruleType, 'sale'), eq(commissionRules.isEnabled, true),
      sql`(${commissionRules.validFrom} IS NULL OR ${commissionRules.validFrom} <= NOW())`, sql`(${commissionRules.validUntil} IS NULL OR ${commissionRules.validUntil} > NOW())`)).limit(1);
  if (!rule) return;
  const rate = Number(rule.rate);
  if (rate <= 0) return;

  let commissionAmount = Number(callCost) * rate;
  const maxCap = rule.maxCap ? Number(rule.maxCap) : null;
  if (maxCap) commissionAmount = Math.min(commissionAmount, maxCap);
  const commissionAmountStr = commissionAmount.toFixed(6);

  await tx.insert(commissionLogs).values({
    agentId: client.agentId, clientCallLogId: callLogId, callCost, commissionAmount: commissionAmountStr,
    sourceCustomerId: userId, commissionType: "sale", ruleSnapshot: JSON.stringify(rule),
    calcDetail: JSON.stringify({ baseAmount: callCost, rate, maxCap: maxCap ?? null }), status: "pending",
  });

  const costNum = Number(callCost);
  const commNum = Number(commissionAmount);
  await tx.execute(sql`INSERT INTO agent_customer_consumption (agent_id, customer_user_id, total_amount, month_amount, commission_amount, order_count, last_order_at)
    VALUES (${client.agentId}, ${userId}, ${costNum.toFixed(6)}, ${costNum.toFixed(6)}, ${commNum.toFixed(6)}, 1, NOW())
    ON CONFLICT (agent_id, customer_user_id) DO UPDATE SET
      total_amount = agent_customer_consumption.total_amount + ${costNum.toFixed(6)},
      month_amount = agent_customer_consumption.month_amount + ${costNum.toFixed(6)},
      commission_amount = agent_customer_consumption.commission_amount + ${commNum.toFixed(6)},
      order_count = agent_customer_consumption.order_count + 1, last_order_at = NOW(), updated_at = NOW()`);

  await processTeamCommission(tx, client.agentId, userId, callLogId, callCost, commissionAmountStr, reportDate);
  await refreshRollupForAgentDate(client.agentId, reportDate, tx);
}

async function processTeamCommission(tx: any, agentId: number, customerUserId: number, callLogId: number, callCost: string, saleCommission: string, reportDate: string) {
  let currentAgentId = agentId;
  // 从 system_configs 读取团队佣金追溯深度，默认 10 层
  let maxDepth = 10;
  try {
    const { eq } = await import("drizzle-orm");
    const { systemConfigs } = await import("../../db/schema.js");
    const [cfg] = await tx.select({ value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, "commission_team_max_depth")).limit(1);
    if (cfg?.value) {
      const parsed = parseInt(cfg.value, 10);
      if (parsed > 0 && parsed <= 50) maxDepth = parsed;
    }
  } catch (err) {
    console.warn(`[Billing] 读取 commission_team_max_depth 失败，使用默认值 ${maxDepth}:`, err);
  }
  let depth = 0;
  while (currentAgentId && depth < maxDepth) {
    depth++;
    const [agent] = await tx.select({ parentAgentId: agents.parentAgentId }).from(agents).where(eq(agents.id, currentAgentId)).limit(1);
    if (!agent || !agent.parentAgentId) break;
    const parentId = agent.parentAgentId;
    const [rule] = await tx.select({ rate: commissionRules.rate, isEnabled: commissionRules.isEnabled, maxCap: commissionRules.maxCap })
      .from(commissionRules).where(and(eq(commissionRules.agentId, parentId), eq(commissionRules.ruleType, 'team'), eq(commissionRules.isEnabled, true),
        sql`(${commissionRules.validFrom} IS NULL OR ${commissionRules.validFrom} <= NOW())`, sql`(${commissionRules.validUntil} IS NULL OR ${commissionRules.validUntil} > NOW())`)).limit(1);
    if (!rule || Number(rule.rate) <= 0) { currentAgentId = parentId; continue; }
    const teamRate = Number(rule.rate);
    let teamAmount = Number(saleCommission) * teamRate;
    if (rule.maxCap) teamAmount = Math.min(teamAmount, Number(rule.maxCap));
    if (teamAmount <= 0) { currentAgentId = parentId; continue; }
    await tx.insert(commissionLogs).values({
      agentId: parentId, clientCallLogId: callLogId, callCost, commissionAmount: teamAmount.toFixed(6),
      sourceCustomerId: customerUserId, sourceOrderId: String(callLogId), sourceOrderAmount: callCost,
      commissionType: "team", feeRate: String(teamRate), feeAmount: "0.000000", netAmount: teamAmount.toFixed(6),
      ruleSnapshot: JSON.stringify(rule), calcDetail: JSON.stringify({ baseCommission: saleCommission, teamRate, sourceAgentId: currentAgentId, sourceAgentCallId: callLogId }),
      status: "pending",
    });
    await refreshRollupForAgentDate(parentId, reportDate, tx);
    currentAgentId = parentId;
  }
}

export async function processRenewalCommission(tx: any, userId: number, rechargeOrderId: number, rechargeAmount: string, orderNo: string): Promise<void> {
  const [client] = await tx.select({ agentId: agentClients.agentId }).from(agentClients).where(eq(agentClients.clientUserId, userId)).limit(1);
  if (!client) return;
  const [rule] = await tx.select({ rate: commissionRules.rate, isEnabled: commissionRules.isEnabled, maxCap: commissionRules.maxCap, fixedAmount: commissionRules.fixedAmount })
    .from(commissionRules).where(and(eq(commissionRules.agentId, client.agentId), eq(commissionRules.ruleType, 'renewal'), eq(commissionRules.isEnabled, true),
      sql`(${commissionRules.validFrom} IS NULL OR ${commissionRules.validFrom} <= NOW())`, sql`(${commissionRules.validUntil} IS NULL OR ${commissionRules.validUntil} > NOW())`)).limit(1);
  if (!rule) return;
  const rate = Number(rule.rate);
  const maxCap = rule.maxCap ? Number(rule.maxCap) : null;
  if (rate <= 0 && !rule?.fixedAmount) return;
  let commissionAmount = rule?.fixedAmount ? Number(rule.fixedAmount) : Number(rechargeAmount) * rate;
  if (maxCap) commissionAmount = Math.min(commissionAmount, maxCap);
  if (commissionAmount <= 0) return;
  await tx.insert(commissionLogs).values({
    agentId: client.agentId, clientCallLogId: null, callCost: rechargeAmount, commissionAmount: commissionAmount.toFixed(6),
    sourceCustomerId: userId, sourceOrderId: orderNo, sourceOrderAmount: rechargeAmount, commissionType: "renewal",
    ruleSnapshot: JSON.stringify(rule), calcDetail: JSON.stringify({ baseAmount: rechargeAmount, rate, isFixedAmount: !!rule.fixedAmount, maxCap }), status: "pending",
  });
  await refreshRollupForAgentDate(client.agentId, new Date().toISOString().slice(0, 10), tx);
}

export async function processActivityCommission(tx: any, agentId: number, customerUserId: number, activityType: string, triggerAmount?: string, refId?: string): Promise<void> {
  const db = tx ?? getDb();
  const [rule] = await db.select({ rate: commissionRules.rate, isEnabled: commissionRules.isEnabled, maxCap: commissionRules.maxCap, fixedAmount: commissionRules.fixedAmount, activityName: commissionRules.activityName })
    .from(commissionRules).where(and(eq(commissionRules.agentId, agentId), eq(commissionRules.ruleType, 'activity'), eq(commissionRules.activityType, activityType as any), eq(commissionRules.isEnabled, true),
      sql`(${commissionRules.validFrom} IS NULL OR ${commissionRules.validFrom} <= NOW())`, sql`(${commissionRules.validUntil} IS NULL OR ${commissionRules.validUntil} > NOW())`)).limit(1);
  if (!rule) return;
  let amount = rule.fixedAmount ? Number(rule.fixedAmount) : (triggerAmount ? Number(triggerAmount) * Number(rule.rate) : 0);
  if (rule.maxCap) amount = Math.min(amount, Number(rule.maxCap));
  if (amount <= 0) return;
  await db.insert(commissionLogs).values({
    agentId, clientCallLogId: null, callCost: triggerAmount ?? "0.000000", commissionAmount: amount.toFixed(6),
    sourceCustomerId: customerUserId, sourceOrderId: refId ?? null, sourceOrderAmount: triggerAmount ?? null,
    commissionType: "activity", ruleSnapshot: JSON.stringify(rule),
    calcDetail: JSON.stringify({ activityType, isFixed: !!rule.fixedAmount, rate: rule.rate, triggerAmount }), status: "pending",
  });
  await refreshRollupForAgentDate(agentId, new Date().toISOString().slice(0, 10), tx);
}

/**
 * 处理推荐注册佣金
 * 当新用户通过推荐码注册时，推荐人（代理商）获得佣金
 */
export async function processReferralCommission(
  tx: any,
  agentId: number,
  newUserId: number,
  referralCode: string,
): Promise<void> {
  const db = tx ?? getDb();
  const [rule] = await db
    .select({ rate: commissionRules.rate, isEnabled: commissionRules.isEnabled, maxCap: commissionRules.maxCap, fixedAmount: commissionRules.fixedAmount })
    .from(commissionRules)
    .where(and(
      eq(commissionRules.agentId, agentId),
      eq(commissionRules.ruleType, 'referral'),
      eq(commissionRules.isEnabled, true),
      sql`(${commissionRules.validFrom} IS NULL OR ${commissionRules.validFrom} <= NOW())`,
      sql`(${commissionRules.validUntil} IS NULL OR ${commissionRules.validUntil} > NOW())`,
    ))
    .limit(1);
  if (!rule) return;

  let amount = rule.fixedAmount ? Number(rule.fixedAmount) : 0;
  if (rule.maxCap) amount = Math.min(amount, Number(rule.maxCap));
  if (amount <= 0) return;

  await db.insert(commissionLogs).values({
    agentId,
    clientCallLogId: null,
    callCost: "0.000000",
    commissionAmount: amount.toFixed(6),
    sourceCustomerId: newUserId,
    sourceOrderId: referralCode,
    sourceOrderAmount: "0.000000",
    commissionType: "referral",
    ruleSnapshot: JSON.stringify(rule),
    calcDetail: JSON.stringify({ referralCode, isFixed: !!rule.fixedAmount, rate: Number(rule.rate), amount }),
    status: "pending",
  });

  await refreshRollupForAgentDate(agentId, new Date().toISOString().slice(0, 10), tx);
}

async function refreshRollupForAgentDate(agentId: number, reportDate: string, tx: any): Promise<void> {
  try { const { refreshRollupForAgentDate: refreshFn } = await import("../agent-finance.js"); await refreshFn(agentId, reportDate, tx); }
  catch (err) { console.warn(`[Billing] refreshRollupForAgentDate error (agent=${agentId}):`, err); }
}
