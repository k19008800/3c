// ============================================================
//  3cloud (3C) — 兑换码过期定时任务 (Scheduler)
//
//  功能：
//  1. 扫描已过期的批次，将关联的未使用码标记为 expired
//  2. 对代理锁定余额解冻（过期码未使用部分退还）
//  3. 每 60 分钟执行一次
// ============================================================

import { eq, and, sql, lt } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { agents, redemptionBatches, redemptionCodes, agentBalanceLedger } from "../db/schema.js";

/**
 * 执行兑换码过期扫描
 * 1. 找所有 expired_at < now 且 status = 'active' 的批次
 * 2. 更新批次状态为 expired
 * 3. 更新批次下所有 status = 'unused' 的码为 expired
 * 4. 如果批次由代理创建，解冻已锁定的未使用余额
 */
export async function runRedemptionExpiryScan(): Promise<{
  expiredBatches: number;
  expiredCodes: number;
  unfrozenAmount: number;
}> {
  const db = getDb();
  const now = new Date();

  // 找出已过期的批次（expiresAt < now, status = active）
  const expiredBatches = await db
    .select({
      id: redemptionBatches.id,
      creatorId: redemptionBatches.creatorId,
      totalCount: redemptionBatches.totalCount,
      usedCount: redemptionBatches.usedCount,
      amount: redemptionBatches.amount,
    })
    .from(redemptionBatches)
    .where(
      and(
        eq(redemptionBatches.status, "active"),
        lt(redemptionBatches.expiresAt, now),
      ),
    );

  let expiredCodesCount = 0;
  let unfrozenAmount = 0;

  for (const batch of expiredBatches) {
    const unusedCount = batch.totalCount - batch.usedCount;

    // 更新批次状态
    await db
      .update(redemptionBatches)
      .set({ status: "expired", updatedAt: now })
      .where(eq(redemptionBatches.id, batch.id));

    // 更新该批次下所有未使用的兑换码
    await db
      .update(redemptionCodes)
      .set({ status: "expired" })
      .where(
        and(
          eq(redemptionCodes.batchId, batch.id),
          eq(redemptionCodes.status, "unused"),
        ),
      );

    expiredCodesCount += unusedCount;

    // ---- 代理创建的批次：解冻未使用部分 ----
    // 查创建者角色是否为 agent
    const [creatorInfo] = await db
      .select({ role: sql<string>`role` })
      .from(require("../db/schema.js").users)
      .where(eq(require("../db/schema.js").users.id, batch.creatorId))
      .limit(1) as any[];

    if (creatorInfo?.role === "agent") {
      // 计算未使用的总金额
      const unusedAmount = parseFloat(batch.amount as string) * unusedCount;
      const amountStr = unusedAmount.toFixed(6);

      // redemptionLocked → settledCommission 解冻
      await db
        .update(agents)
        .set({
          settledCommission: sql`${agents.settledCommission} + ${amountStr}`,
          redemptionLocked: sql`GREATEST(0, ${agents.redemptionLocked} - ${amountStr})`,
        })
        .where(eq(agents.userId, batch.creatorId));

      // 查询解冻后的余额写入 ledger
      const [updatedAgent] = await db
        .select({ settledCommission: agents.settledCommission })
        .from(agents)
        .where(eq(agents.userId, batch.creatorId))
        .limit(1);

      const settledAfter = parseFloat(updatedAgent?.settledCommission as string ?? "0");
      const settledBefore = settledAfter - unusedAmount;

      // 写入余额流水
      await db.insert(agentBalanceLedger).values({
        agentId: batch.creatorId, // 这里实际存的是 userId, 需要转为 agentId
        balanceType: "available",
        changeType: "unfreeze",
        amount: Math.round(unusedAmount * 100), // 分
        balanceBefore: Math.round(settledBefore * 100),
        balanceAfter: Math.round(settledAfter * 100),
        refType: "redemption_batch",
        refId: batch.id,
        remark: `兑换码批次 #${batch.id} 过期解冻 ${amountStr} 元`,
      });

      unfrozenAmount += unusedAmount;
    }
  }

  return {
    expiredBatches: expiredBatches.length,
    expiredCodes: expiredCodesCount,
    unfrozenAmount,
  };
}

/**
 * 注册定时任务（每 60 分钟执行一次）
 * @param app FastifyInstance
 */
export function registerRedemptionScheduler(app: any): void {
  const INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

  const run = async () => {
    try {
      const result = await runRedemptionExpiryScan();
      if (result.expiredBatches > 0 || result.expiredCodes > 0) {
        app.log.info(
          { expiredBatches: result.expiredBatches, expiredCodes: result.expiredCodes, unfrozenAmount: result.unfrozenAmount },
          "[Redemption Scheduler] 兑换码过期扫描完成",
        );
      }
    } catch (err) {
      app.log.error({ err }, "[Redemption Scheduler] 过期扫描失败");
    }
  };

  // 立即执行一次，然后定时执行
  run();
  const timer = setInterval(run, INTERVAL_MS);

  // 应用关闭时清理定时器
  app.addHook("onClose", (_instance: any, done: any) => {
    clearInterval(timer);
    done();
  });

  app.log.info(`[Redemption Scheduler] 已注册，每 ${INTERVAL_MS / 60000} 分钟执行一次`);
}
