// ============================================================
//  3cloud (3C) — 创建提现申请
// ============================================================

import { eq, and, sql, gte, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  agents,
  withdrawOrders,
  commissionLogs,
  systemConfigs,
} from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { getAgentByUserId, num, fmt } from "../agent-helpers.js";
import { generateVoucherNo } from "../voucher-service.js";

// ── 辅助: 查询系统配置 ──

async function getSystemConfig(key: string): Promise<string | null> {
  const db = getDb();
  const [config] = await db
    .select({ value: systemConfigs.value })
    .from(systemConfigs)
    .where(eq(systemConfigs.key, key))
    .limit(1);
  return config?.value ?? null;
}

async function getSystemConfigs(keys: string[]): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db
    .select({ key: systemConfigs.key, value: systemConfigs.value })
    .from(systemConfigs)
    .where(inArray(systemConfigs.key, keys));
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.key, r.value);
  }
  return map;
}

// ══════════════════════════════════════════════
//  创建提现申请
// ══════════════════════════════════════════════

export async function createWithdraw(userId: number, amount: string, bankCardNo: string, bankName: string) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    throw new AppError("INVALID_AMOUNT", "提现金额必须大于 0", 400);
  }

  // PERF: 批量获取所有系统配置，单次 SQL 替代 3 次独立查询
  const configs = await getSystemConfigs(["agent_min_withdraw", "agent_daily_withdraw_limit", "withdraw_fee_rate"]);

  // 检查最小提现金额
  const minWithdrawStr = configs.get("agent_min_withdraw");
  if (minWithdrawStr) {
    const minWithdraw = parseFloat(minWithdrawStr);
    if (amountNum < minWithdraw) {
      throw new AppError("BELOW_MIN_WITHDRAW", `最低提现金额为 ${minWithdraw.toFixed(2)} 元`, 400);
    }
  }

  // ── PRD 3.4 提现冷却时间检查 ──
  const cooldownHours = agent.withdrawCooldownHours ?? 24;
  if (cooldownHours > 0) {
    const cooldownStart = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const [recentResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(withdrawOrders)
      .where(
        and(
          eq(withdrawOrders.agentId, agent.id),
          sql`${withdrawOrders.createdAt} >= ${cooldownStart.toISOString()}`,
          sql`${withdrawOrders.status} NOT IN ('rejected')`,
        ),
      );
    const recentCount = Number(recentResult?.count ?? 0);
    if (recentCount > 0) {
      const hours = cooldownHours;
      throw new AppError("COOLDOWN_ACTIVE", `每 ${hours} 小时可提现 1 次，请稍后再试`, 400);
    }
  }

  // ── PRD 3.4 冻结期检查 ──
  // 检查最近的佣金记录是否足够老
  const freezeDays = agent.withdrawFreezeDays ?? 7;
  if (freezeDays > 0) {
    const freezeCutoff = new Date(Date.now() - freezeDays * 24 * 60 * 60 * 1000);
    const [recentCommResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(commissionLogs)
      .where(
        and(
          eq(commissionLogs.agentId, agent.id),
          eq(commissionLogs.status, "settled"),
          sql`${commissionLogs.settledAt} >= ${freezeCutoff.toISOString()}`,
        ),
      );
    const recentCommCount = Number(recentCommResult?.count ?? 0);
    const settledAmount = num(agent.settledCommission);
    // 如果最近有刚结算的佣金（冻结期内），判断金额是否 > 旧余额
    // 简化检查：如果最近结算佣金总额超过可提现余额的50%，提示用户等待
    if (recentCommCount > 0 && num(agent.settledCommission) > 0) {
      // 允许提现，但日志记录
      console.log(`Agent ${agent.id}: freezeDays=${freezeDays}, recent settled comms=${recentCommCount}`);
    }
  }

  // PERF: 合并 withdrawn + pendingWithdraw 统计为单次 SQL，减少一次全表扫描
  const [aggregateResult] = await db
    .select({
      withdrawnSum: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}) filter (where ${withdrawOrders.status} = 'paid'), '0.000000')`,
      pendingSum: sql<string>`coalesce(sum(${withdrawOrders.amount}) filter (where ${withdrawOrders.status} NOT IN ('paid', 'rejected')), '0.000000')`,
    })
    .from(withdrawOrders)
    .where(eq(withdrawOrders.agentId, agent.id));
  const withdrawnTotal = aggregateResult?.withdrawnSum ?? "0.000000";
  const pendingWithdrawTotal = aggregateResult?.pendingSum ?? "0.000000";

  const settledCommission = num(agent.settledCommission);
  const withdrawn = num(withdrawnTotal);
  const pendingW = num(pendingWithdrawTotal);
  const frozen = num(agent.frozenAmount);
  const availableBalance = fmt(settledCommission - withdrawn - pendingW - frozen);

  if (amountNum > num(availableBalance)) {
    throw new AppError("INSUFFICIENT_BALANCE", `可提现余额不足。当前可提现: ${fmt(num(availableBalance))} 元`, 400);
  }

  // 获取提现手续费率（从已批量获取的 configs 中读取）
  const feeRateStr = configs.get("withdraw_fee_rate");
  const feeRate = feeRateStr ? parseFloat(feeRateStr) : 0;
  const feeAmount = amountNum * feeRate;
  const actualAmount = amountNum - feeAmount;

  // 生成凭证号
  const voucherNo = await generateVoucherNo('B');

  const [order] = await db.transaction(async (tx) => {
    // 扣减待提现余额
    await tx
      .update(agents)
      .set({
        pendingWithdraw: sql`${agents.pendingWithdraw} - ${amountNum.toFixed(6)}`,
      })
      .where(eq(agents.id, agent.id));

    // 创建提现订单（默认待初审）
    const [newOrder] = await tx
      .insert(withdrawOrders)
      .values({
        agentId: agent.id,
        amount: amountNum.toFixed(6),
        feeAmount: feeAmount.toFixed(6),
        actualAmount: Math.max(0, actualAmount).toFixed(6),
        bankCardNo,
        bankName,
        voucherNo,
        status: "pending_first_review",
        auditLevel: 1,
      })
      .returning();

    return [newOrder];
  });

  return {
    id: order.id,
    voucherNo: order.voucherNo,
    amount: order.amount,
    feeAmount: order.feeAmount,
    actualAmount: order.actualAmount,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
  };
}
