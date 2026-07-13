// ============================================================
//  3cloud (3C) — 兑换码过期定时任务
//  每小时检查一次，将已过期的批次和代码标记为 expired
//  代理商创建的批次：退还未使用兑换码的 redemptionLocked 金额
// ============================================================

import { getDb } from "../db/index.js";
import { redemptionBatches, redemptionCodes, agents, balanceLogs } from "../db/schema.js";
import { lt, eq, and, inArray, sql } from "drizzle-orm";

/**
 * 执行兑换码过期检查：
 *  1. 查询所有 status='active' 且 expires_at 已过去的批次
 *  2. 统计代理商批次中未使用兑换码的总面值
 *  3. 退还 redemptionLocked -> settledCommission
 *  4. 将该批次的 status 更新为 'expired'
 *  5. 将该批次下所有 status='unused' 的代码更新为 'expired'
 *  6. 输出日志
 */
export async function runCodeExpiryCheck(): Promise<void> {
  try {
    const db = getDb();
    const now = new Date();

    // 1. 查找已过期的活跃批次
    const expiredBatches = await db
      .select({ id: redemptionBatches.id, creatorId: redemptionBatches.creatorId })
      .from(redemptionBatches)
      .where(
        and(
          eq(redemptionBatches.status, "active"),
          lt(redemptionBatches.expiresAt, now),
          sql`${redemptionBatches.expiresAt} IS NOT NULL`
        )
      );

    if (expiredBatches.length === 0) {
      console.log(`[Cron] Code expiry check: no expired batches found`);
      return;
    }

    const batchIds = expiredBatches.map((b) => b.id);

    // 2. 批量查出哪些批次是代理商创建的（一次 JOIN 替代 N+1）
    const creatorIds = [...new Set(expiredBatches.map(b => b.creatorId))];
    const agentCreators = await db
      .select({ userId: agents.userId })
      .from(agents)
      .where(inArray(agents.userId, creatorIds));
    const creatorIdSet = new Set(agentCreators.map(a => a.userId));

    const agentBatchMap = new Map<number, number>(); // batchId -> creatorId (for refund)
    for (const batch of expiredBatches) {
      if (creatorIdSet.has(batch.creatorId)) {
        agentBatchMap.set(batch.id, batch.creatorId);
      }
    }

    // 3. 统计代理商批次中未使用兑换码总额
    const batchRefundMap = new Map<number, number>(); // batchId -> total unused face value
    if (agentBatchMap.size > 0) {
      const agentBatchesArr = [...agentBatchMap.keys()];
      const unusedCodes = await db
        .select({
          batchId: redemptionCodes.batchId,
          amount: redemptionCodes.amount,
        })
        .from(redemptionCodes)
        .where(
          and(
            inArray(redemptionCodes.batchId, agentBatchesArr),
            eq(redemptionCodes.status, "unused"),
          )
        );

      for (const code of unusedCodes) {
        const current = batchRefundMap.get(code.batchId) ?? 0;
        batchRefundMap.set(code.batchId, current + parseFloat(code.amount));
      }
    }

    // 4. 批量退款 + 更新状态
    await db.transaction(async (tx) => {
      for (const batch of expiredBatches) {
        const refundAmount = batchRefundMap.get(batch.id);
        if (refundAmount && refundAmount > 0) {
          const creatorId = agentBatchMap.get(batch.id)!;

          await tx
            .update(agents)
            .set({
              settledCommission: sql`${agents.settledCommission} + ${refundAmount.toFixed(6)}`,
              redemptionLocked: sql`${agents.redemptionLocked} - ${refundAmount.toFixed(6)}`,
            })
            .where(eq(agents.userId, creatorId));

          // 查更新后的余额写入 balance_logs
          const [updated] = await tx
            .select({ settledCommission: agents.settledCommission })
            .from(agents)
            .where(eq(agents.userId, creatorId))
            .limit(1);

          await tx.insert(balanceLogs).values({
            userId: creatorId,
            amount: `+${refundAmount.toFixed(6)}`,
            balanceAfter: updated?.settledCommission ?? "0",
            type: "redemption_refund",
            refType: "redemption_batch",
            refId: batch.id,
            description: `批次 #${batch.id} 过期，退还未使用兑换码锁定金额 ${refundAmount.toFixed(6)} 元`,
          });

          console.log(
            `[Cron] Refunded ${refundAmount.toFixed(6)} to agent (userId=${creatorId}) for expired batch #${batch.id}`
          );
        }
      }

      // 更新批次状态
      await tx
        .update(redemptionBatches)
        .set({ status: "expired", updatedAt: now })
        .where(inArray(redemptionBatches.id, batchIds));

      // 更新该批次下未使用的代码
      await tx
        .update(redemptionCodes)
        .set({ status: "expired" })
        .where(
          and(
            inArray(redemptionCodes.batchId, batchIds),
            eq(redemptionCodes.status, "unused")
          )
        );
    });

    console.log(
      `[Cron] Code expiry check completed: ${expiredBatches.length} batches expired, refunded ${batchRefundMap.size} agent batches`
    );
  } catch (err) {
    console.error("[Cron] Code expiry check error:", err);
  }
}
