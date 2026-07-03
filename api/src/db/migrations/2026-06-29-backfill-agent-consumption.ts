// ============================================================
//  3cloud (3C) — Backfill: agent_customer_consumption
//
//  一次性历史数据修复：将 commission_logs 中已有的数据
//  补齐到 agent_customer_consumption 表。
//
//  修复 Bug: accumulate_commission_stats 和 field_name_mapping
//  导致的"我的客户"页面积累消费/贡献佣金显示为 0 的问题。
//
//  运行: npx tsx src/db/migrations/2026-06-29-backfill-agent-consumption.ts
// ============================================================

import "dotenv/config";
import { eq, and, sql, inArray } from "drizzle-orm";
import { createDb, closeDb } from "../index.js";
import {
  agents,
  agentClients,
  agentCustomerConsumption,
  commissionLogs,
  callLogs,
} from "../schema.js";

async function main() {
  const db = createDb();
  console.log("\n═══════════════════════════════════════════════");
  console.log("  3cloud — Backfill agent_customer_consumption");
  console.log("═══════════════════════════════════════════════\n");

  // 获取所有代理商
  const allAgents = await db.select({ id: agents.id, userId: agents.userId }).from(agents);
  console.log(`📊 共 ${allAgents.length} 个代理商\n`);

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const agent of allAgents) {
    console.log(`🏢 代理商 #${agent.id} (userId=${agent.userId})`);

    // 汇聚每个客户的累计消费与佣金
    // 注意：commissionLogs 通过 clientCallLogId 关联 callLogs 获取 userId
    const consumptionList = await db
      .select({
        customerUserId: callLogs.userId,
        totalCallCost: sql<string>`coalesce(sum(${commissionLogs.callCost}), '0.000000')`,
        totalCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
        orderCount: sql<number>`count(*)`,
        lastOrderAt: sql<string>`max(${commissionLogs.createdAt})`,
      })
      .from(commissionLogs)
      .innerJoin(callLogs, eq(commissionLogs.clientCallLogId, callLogs.id))
      .where(eq(commissionLogs.agentId, agent.id))
      .groupBy(callLogs.userId);

    if (consumptionList.length === 0) {
      console.log(`  ⏭  无佣金记录，跳过\n`);
      totalSkipped++;
      continue;
    }

    let agentUpdated = 0;

    for (const row of consumptionList) {
      const customerUserId = row.customerUserId;
      const totalAmount = row.totalCallCost;
      const commissionAmount = row.totalCommission;
      const orderCount = row.orderCount;
      const lastOrderAt = row.lastOrderAt;

      // 获取客户名称
      const { getDb } = await import("../index.js");
      const [customer] = await db
        .select({ nickname: sql<string>`nickname` })
        .from(sql`users`)
        .where(eq(sql`users.id`, customerUserId))
        .limit(1)
        .then((r: any[]) => r.map((x: any) => ({ nickname: x.nickname })));

      try {
        // upsert
        await db.execute(sql`
          INSERT INTO agent_customer_consumption
            (agent_id, customer_user_id, customer_name, total_amount, commission_amount, order_count, last_order_at, updated_at)
          VALUES (
            ${agent.id},
            ${customerUserId},
            ${(customer as any)?.nickname ?? null},
            ${totalAmount},
            ${commissionAmount},
            ${orderCount},
            ${lastOrderAt ? sql`${new Date(lastOrderAt)}` : null}::timestamptz,
            NOW()
          )
          ON CONFLICT (agent_id, customer_user_id)
          DO UPDATE SET
            total_amount = EXCLUDED.total_amount,
            commission_amount = EXCLUDED.commission_amount,
            order_count = EXCLUDED.order_count,
            last_order_at = EXCLUDED.last_order_at,
            updated_at = NOW()
        `);

        const commNum = parseFloat(commissionAmount);
        console.log(`  ✅ 客户 #${customerUserId}: 累计消费 ¥${parseFloat(totalAmount).toFixed(2)}, 贡献佣金 ¥${commNum.toFixed(4)}, ${orderCount} 笔`);
        agentUpdated++;
      } catch (err: any) {
        console.error(`  ❌ 客户 #${customerUserId} 更新失败: ${err.message}`);
        totalErrors++;
      }
    }

    totalUpdated += agentUpdated;
    console.log(`  → 代理商 #${agent.id}: 更新 ${agentUpdated} 个客户\n`);
  }

  // 检查孤儿记录：agent_clients 绑定了但 agent_customer_consumption 不存在的
  console.log("🔍 检查遗漏绑定记录...");
  const orphanBindings = await db
    .select({
      agentId: agentClients.agentId,
      clientUserId: agentClients.clientUserId,
    })
    .from(agentClients)
    .leftJoin(
      agentCustomerConsumption,
      and(
        eq(agentClients.agentId, agentCustomerConsumption.agentId),
        eq(agentClients.clientUserId, agentCustomerConsumption.customerUserId),
      )
    )
    .where(sql`${agentCustomerConsumption.id} IS NULL`);

  if (orphanBindings.length > 0) {
    console.log(`  ⚠️  发现 ${orphanBindings.length} 条绑定无消费记录，创建占位行...`);
    for (const b of orphanBindings) {
      await db.execute(sql`
        INSERT INTO agent_customer_consumption (agent_id, customer_user_id)
        VALUES (${b.agentId}, ${b.clientUserId})
        ON CONFLICT (agent_id, customer_user_id) DO NOTHING
      `);
    }
  } else {
    console.log("  ✅ 无遗漏绑定记录");
  }

  // 统计
  const [aggCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentCustomerConsumption);

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  修复完成`);
  console.log(`  ✅ 更新代理商: ${allAgents.length}`);
  console.log(`  ✅ 更新客户数: ${totalUpdated}`);
  console.log(`  ⏭  跳过(无数据): ${totalSkipped}`);
  console.log(`  ❌ 错误: ${totalErrors}`);
  console.log(`  📊 agent_customer_consumption 总行数: ${Number(aggCount.count)}`);
  console.log(`═══════════════════════════════════════════════\n`);

  await closeDb();
}

main().catch((err) => {
  console.error("\n❌ Backfill 失败:", err);
  process.exit(1);
});
