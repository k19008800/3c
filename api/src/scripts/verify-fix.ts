// ============================================================
//  3cloud — 验证修复结果
//  运行: npx tsx src/scripts/verify-fix.ts
// ============================================================

import "dotenv/config";
import { eq, and, sql, inArray } from "drizzle-orm";
import { createDb, closeDb } from "../db/index.js";
import { agents, agentClients, agentCustomerConsumption, users } from "../db/schema.js";

async function main() {
  const db = createDb();
  console.log("\n════════════════════════════════════");
  console.log("  验证修复结果");
  console.log("════════════════════════════════════\n");

  // 1. 检查 agent_customer_consumption 数据
  console.log("📊 agent_customer_consumption 表：");
  const aggRows = await db
    .select({
      agentId: agentCustomerConsumption.agentId,
      customerUserId: agentCustomerConsumption.customerUserId,
      customerName: agentCustomerConsumption.customerName,
      totalAmount: agentCustomerConsumption.totalAmount,
      commissionAmount: agentCustomerConsumption.commissionAmount,
      orderCount: agentCustomerConsumption.orderCount,
    })
    .from(agentCustomerConsumption)
    .orderBy(agentCustomerConsumption.agentId, agentCustomerConsumption.customerUserId);

  if (aggRows.length === 0) {
    console.log("  ⚠️  空表 — 无数据\n");
  } else {
    for (const r of aggRows) {
      console.log(`  ✅ 代理商#${r.agentId} 客户#${r.customerUserId} (${r.customerName || '-'}): 消费¥${parseFloat(r.totalAmount || "0").toFixed(2)} 佣金¥${parseFloat(r.commissionAmount || "0").toFixed(4)} (${r.orderCount}笔)`);
    }
  }

  // 2. 检查 API 返回字段正确性（模拟 getAgentClients 查询）
  console.log("\n📊 API 返回字段验证（模拟 agent /api/v1/agent/clients）：");
  const allAgents = await db.select().from(agents);
  for (const agent of allAgents) {
    const [agentUser] = await db
      .select({ email: users.email, nickname: users.nickname })
      .from(users)
      .where(eq(users.id, agent.userId))
      .limit(1);

    console.log(`\n🏢 代理商 #${agent.id} (${agentUser?.email || '?'}) ${agentUser?.nickname || ''}`);

    const page = 1;
    const pageSize = 20;

    const rows = await db
      .select({
        clientUserId: agentClients.clientUserId,
        email: users.email,
        nickname: users.nickname,
      })
      .from(agentClients)
      .innerJoin(users, eq(agentClients.clientUserId, users.id))
      .where(eq(agentClients.agentId, agent.id))
      .orderBy(sql`${agentClients.createdAt} desc`)
      .limit(pageSize)
      .offset(0);

    const clientUserIds = rows.map((r) => r.clientUserId);

    if (clientUserIds.length === 0) {
      console.log("  ⏭  无客户\n");
      continue;
    }

    // 新查询逻辑 1: 从 commission_logs 聚合（getAgentClients 修复后）
    const commissionAgg = await db
      .select({
        userId: sql<number>`call_logs.user_id`,
        totalCallCost: sql<string>`coalesce(sum(commission_logs.call_cost), '0.000000')`,
        totalCommission: sql<string>`coalesce(sum(commission_logs.commission_amount), '0.000000')`,
        orderCount: sql<number>`count(*)`,
      })
      .from(sql`commission_logs`)
      .innerJoin(sql`call_logs`, sql`commission_logs.client_call_log_id = call_logs.id`)
      .where(
        and(
          eq(sql`commission_logs.agent_id`, agent.id),
          inArray(sql`call_logs.user_id`, clientUserIds),
        )
      )
      .groupBy(sql`call_logs.user_id`);

    for (const row of commissionAgg) {
      const client = rows.find(r => r.clientUserId === row.userId);
      console.log(`  ✅ [LIVE] 客户 #${row.userId} (${client?.email || '?'}): totalCallCost=${row.totalCallCost} | totalCommission=${row.totalCommission} | ${row.orderCount}笔`);
    }

    // 新查询逻辑 2: 从 agent_customer_consumption 表（billing 引擎写后）
    const aggData = await db
      .select()
      .from(agentCustomerConsumption)
      .where(
        and(
          eq(agentCustomerConsumption.agentId, agent.id),
          inArray(agentCustomerConsumption.customerUserId, clientUserIds),
        )
      );

    for (const row of aggData) {
      const client = rows.find(r => r.clientUserId === row.customerUserId);
      console.log(`  ✅ [TBL]  客户 #${row.customerUserId} (${client?.email || '?'}): totalAmount=${row.totalAmount} | commissionAmount=${row.commissionAmount} | ${row.orderCount}笔`);
    }
  }

  // 3. Agent 统计
  console.log("\n📊 代理商统计：");
  const agentStats = await db
    .select({
      id: agents.id,
      userId: agents.userId,
      totalCommission: agents.totalCommission,
      pendingWithdraw: agents.pendingWithdraw,
    })
    .from(agents);

  for (const a of agentStats) {
    console.log(`  🏢 代理商 #${a.id}: totalCommission=${a.totalCommission} | pendingWithdraw=${a.pendingWithdraw}`);
  }

  console.log("\n════════════════════════════════════");
  console.log("  验证完成");
  console.log("════════════════════════════════════\n");

  await closeDb();
}

main().catch((err) => {
  console.error("\n❌ 验证失败:", err);
  process.exit(1);
});
