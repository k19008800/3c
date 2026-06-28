// ============================================================
//  3cloud (3C) — 代理商测试数据种子
//
//  创建：
//    1. 3 个代理商（agent1~agent3），分佣比例 5%~15%
//    2. 每个代理商名下 5 个客户（共 15 个客户）
//    3. 每个客户模拟消费 ≥100 元
//    4. 计提分佣记录
//
//  运行：npx tsx src/db/seed-test-agents.ts
// ============================================================

import "dotenv/config";
import bcryptjs from "bcryptjs";
import { createDb, closeDb } from "./index.js";
import {
  users,
  agents,
  agentClients,
  callLogs,
  commissionLogs,
  balanceLogs,
  apiKeys,
  models,
  vendors,
  vendorModels,
} from "./schema.js";
import { sql, eq, and } from "drizzle-orm";

// ── 配置 ──
const AGENT_CONFIGS = [
  { email: "agent1@3c.local",   nickname: "天启科技",        rate: "0.0500" },  // 5%
  { email: "agent2@3c.local",   nickname: "云帆网络",        rate: "0.1000" },  // 10%
  { email: "agent3@3c.local",   nickname: "极速智能",        rate: "0.1500" },  // 15%
];

const CLIENTS_PER_AGENT = 5;
const MIN_CONSUMPTION_PER_CLIENT = 100; // 元

const PASSWORD_HASH = bcryptjs.hashSync("test123456", 10);

// 模拟的模型/厂商数据（如果数据库中还没有）
async function ensureModelAndVendor(db: ReturnType<typeof createDb>) {
  // 查找已有的模型和厂商
  const existingModels = await db.select().from(models).limit(1);
  const existingVendors = await db.select().from(vendors).limit(1);

  if (existingModels.length > 0 && existingVendors.length > 0) {
    console.log("  ℹ️  模型和厂商已存在，复用现有数据");
    return { modelId: existingModels[0].id, vendorId: existingVendors[0].id, vendorName: existingVendors[0].name, modelName: existingModels[0].name };
  }

  console.log("  📦 创建测试用模型和厂商...");

  const [vendor] = await db.insert(vendors).values({
    name: "TestVendor",
    baseUrl: "https://api.test.com",
    description: "测试厂商",
  }).returning();

  const [model] = await db.insert(models).values({
    name: "test-model",
    displayName: "测试模型",
    type: "chat",
  }).returning();

  const [vm] = await db.insert(vendorModels).values({
    vendorId: vendor.id,
    modelId: model.id,
    upstreamModelName: "test-upstream",
    apiEndpoint: "/v1/chat/completions",
    apiKeyEncrypted: "test-encrypted-key",
    costPriceInput: "0.000001",
    costPriceOutput: "0.000002",
    sellPriceInput: "0.000010",
    sellPriceOutput: "0.000020",
    weight: 100,
  }).returning();

  return { modelId: model.id, vendorId: vendor.id, vendorName: vendor.name, modelName: model.name };
}

// 确保当前月的 call_logs 分区存在
async function ensurePartition(db: ReturnType<typeof createDb>) {
  // 分区已在 setup-call-logs-partitions.ts 中预创建到 2026-12，跳过
  console.log("  ℹ️  call_logs 分区已预创建，跳过");
}

async function main() {
  const db = createDb();
  console.log("🧪 开始填充代理商测试数据...\n");

  // ── 1. 确保基础设施 ──
  console.log("📦 基础数据检查...");
  const { modelId, vendorId, vendorName, modelName } = await ensureModelAndVendor(db);
  await ensurePartition(db);
  console.log("  ✅ 基础设施就绪\n");

  // ── 2. 检查是否已有数据（幂等） ──
  const existingAgents = await db.select().from(agents);
  if (existingAgents.length >= 3) {
    console.log("  ⚠️  已存在 3 个或以上的代理商，跳过创建。如需重建，请先清空数据。\n");

    // 即使跳过创建，也展示当前概览
    await showSummary(db);
    await closeDb();
    return;
  }

  // ── 3. 创建 18 个用户（3 agents + 15 clients） ──
  console.log("👤 创建用户...");
  const adminUserId = 25; // 已知的 super_admin
  const allUserIds: number[] = [];
  const agentUserIds: number[] = [];
  const clientUserIds: number[] = [];

  for (let a = 0; a < AGENT_CONFIGS.length; a++) {
    const cfg = AGENT_CONFIGS[a];

    // 检查是否已存在
    const [existing] = await db.select().from(users).where(eq(users.email, cfg.email)).limit(1);
    if (existing) {
      console.log(`  ℹ️  ${cfg.email} 已存在 (id=${existing.id})`);
      agentUserIds.push(existing.id);
      allUserIds.push(existing.id);
      continue;
    }

    // 创建代理商用户（初始余额高一些，方便后面模拟代理充值给客户）
    const [user] = await db.insert(users).values({
      email: cfg.email,
      passwordHash: PASSWORD_HASH,
      nickname: cfg.nickname,
      userType: "enterprise",
      role: "user", // 创建代理商后会升级为 agent
      status: "active",
      balance: "10000.000000",
      emailVerifiedAt: new Date(),
    }).returning();

    console.log(`  ✅  创建代理商用户: ${cfg.email} (id=${user.id})`);
    agentUserIds.push(user.id);
    allUserIds.push(user.id);

    // 创建客户（每个代理商 5 个）
    for (let c = 1; c <= CLIENTS_PER_AGENT; c++) {
      const clientEmail = `client${a * CLIENTS_PER_AGENT + c}@3c.local`;
      const [existingClient] = await db.select().from(users).where(eq(users.email, clientEmail)).limit(1);
      if (existingClient) {
        console.log(`  ℹ️  ${clientEmail} 已存在 (id=${existingClient.id})`);
        clientUserIds.push(existingClient.id);
        continue;
      }

      const [client] = await db.insert(users).values({
        email: clientEmail,
        passwordHash: PASSWORD_HASH,
        nickname: `客户${a * CLIENTS_PER_AGENT + c}`,
        userType: "personal",
        role: "user",
        status: "active",
        balance: "200.000000", // 每个客户初始 200 元余额用于消费
        emailVerifiedAt: new Date(),
      }).returning();

      console.log(`  ✅  创建客户: ${clientEmail} (id=${client.id})`);
      clientUserIds.push(client.id);
      allUserIds.push(client.id);
    }
  }

  // ── 4. 创建代理商记录 ──
  console.log("\n🏢 创建代理商记录...");
  const agentIds: number[] = [];

  for (let a = 0; a < AGENT_CONFIGS.length; a++) {
    const cfg = AGENT_CONFIGS[a];
    const userId = agentUserIds[a];

    // 检查是否已有代理人记录
    const [existingAgent] = await db.select().from(agents).where(eq(agents.userId, userId)).limit(1);
    if (existingAgent) {
      console.log(`  ℹ️  ${cfg.nickname} (userId=${userId}) 已是代理商 (agentId=${existingAgent.id})`);
      agentIds.push(existingAgent.id);
      continue;
    }

    // 创建代理商
    const [agent] = await db.insert(agents).values({
      userId: userId,
      commissionRate: cfg.rate,
      status: true,
    }).returning();

    // 升级用户角色
    await db.update(users).set({ role: "agent" }).where(eq(users.id, userId));

    console.log(`  ✅  创建代理商: ${cfg.nickname} (userId=${userId}, agentId=${agent.id}, 分佣=${cfg.rate})`);
    agentIds.push(agent.id);
  }

  // ── 5. 绑定客户到代理商 ──
  console.log("\n🔗 绑定客户到代理商...");
  const clientAgentMap: { clientUserId: number; agentId: number }[] = [];

  for (let a = 0; a < AGENT_CONFIGS.length; a++) {
    const agentId = agentIds[a];
    for (let c = 0; c < CLIENTS_PER_AGENT; c++) {
      const clientUserId = clientUserIds[a * CLIENTS_PER_AGENT + c];

      // 检查是否已绑定
      const [existing] = await db.select().from(agentClients)
        .where(and(
          eq(agentClients.agentId, agentId),
          eq(agentClients.clientUserId, clientUserId),
        ))
        .limit(1);

      if (existing) {
        console.log(`  ℹ️  客户 ${clientUserId} → 代理商 ${agentId} 已绑定`);
        continue;
      }

      await db.insert(agentClients).values({
        agentId: agentId,
        clientUserId: clientUserId,
      });

      console.log(`  ✅  客户 ${clientUserId} → 代理商 ${agentId}`);
      clientAgentMap.push({ clientUserId, agentId });
    }
  }

  // ── 6. 模拟消费调用记录 + 佣金计提 ──
  console.log("\n💰 模拟消费和分佣...");

  // 检查是否已有调用记录
  const [existingCalls] = await db.select({ count: sql<number>`count(*)` }).from(callLogs);
  if (Number(existingCalls.count) > 0) {
    console.log(`  ℹ️  已有 ${existingCalls.count} 条调用记录，跳过模拟消费。`);
  } else {
    // 每个客户生成 5~10 次调用，总消费 ≥ 100 元
    for (let c = 0; c < clientUserIds.length; c++) {
      const clientUserId = clientUserIds[c];
      const numCalls = 5 + Math.floor(Math.random() * 6); // 5~10 次
      const totalConsumption = 100 + Math.random() * 50; // 100~150 元
      const avgCostPerCall = totalConsumption / numCalls;

      let totalCost = 0;

      for (let i = 0; i < numCalls; i++) {
        const cost = i === numCalls - 1
          ? totalConsumption - totalCost  // 最后一次补齐
          : avgCostPerCall * (0.5 + Math.random()); // 每次略有波动

        const costStr = cost.toFixed(6);
        totalCost += cost;

        const promptTokens = Math.floor(Math.random() * 500 + 100);
        const completionTokens = Math.floor(Math.random() * 1000 + 200);

        const callDate = new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)); // 最近 7 天

        await db.insert(callLogs).values({
          userId: clientUserId,
          apiKeyId: null,
          modelId: modelId,
          vendorModelId: null,
          vendorName: vendorName,
          modelName: modelName,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          cost: costStr,
          durationMs: Math.floor(Math.random() * 5000 + 200),
          status: Math.random() > 0.1 ? "success" : "failed",
          isStreaming: Math.random() > 0.5,
          createdAt: callDate,
        });
      }

      // 扣减余额
      const totalCostDisplay = totalConsumption.toFixed(2);
      await db.update(users)
        .set({
          balance: sql`${users.balance} - ${totalCostDisplay}`,
        })
        .where(eq(users.id, clientUserId));

      // 写余额流水
      await db.insert(balanceLogs).values({
        userId: clientUserId,
        type: "consumption",
        amount: `-${totalCostDisplay}`,
        balanceAfter: sql`(SELECT balance FROM users WHERE id = ${clientUserId})`,
        description: "测试消费",
      });

      console.log(`  💳  客户 #${clientUserId}: ${numCalls} 次调用, 消费 ¥${totalCostDisplay}`);

      // ── 计提分佣 ──
      const agentId = clientAgentMap[c]?.agentId;
      if (agentId) {
        const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
        if (agent) {
          const rate = parseFloat(agent.commissionRate);
          const commission = totalConsumption * rate;
          const commissionStr = commission.toFixed(6);

          await db.insert(commissionLogs).values({
            agentId: agentId,
            clientCallLogId: null,
            callCost: totalCostDisplay,
            commissionAmount: commissionStr,
            status: "pending",
          });

          // 累加分佣和可提现余额
          await db.update(agents)
            .set({
              totalCommission: sql`${agents.totalCommission} + ${commissionStr}`,
              pendingWithdraw: sql`${agents.pendingWithdraw} + ${commissionStr}`,
            })
            .where(eq(agents.id, agentId));

          console.log(`  💰  代理商 #${agentId}: +¥${commission.toFixed(2)} 分佣 (${(rate * 100).toFixed(1)}%)`);
        }
      }
    }
  }

  console.log("\n📊 ====== 测试数据概览 ======");
  await showSummary(db);

  await closeDb();
}

async function showSummary(db: ReturnType<typeof createDb>) {
  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [agentCount] = await db.select({ count: sql<number>`count(*)` }).from(agents);
  const [clientCount] = await db.select({ count: sql<number>`count(*)` }).from(agentClients);
  const [callCount] = await db.select({ count: sql<number>`count(*)` }).from(callLogs);
  const [commCount] = await db.select({ count: sql<number>`count(*)` }).from(commissionLogs);

  console.log(`  总用户数: ${Number(userCount.count)}`);
  console.log(`  代理商数: ${Number(agentCount.count)}`);
  console.log(`  客户绑定: ${Number(clientCount.count)}`);
  console.log(`  调用记录: ${Number(callCount.count)}`);
  console.log(`  佣金记录: ${Number(commCount.count)}`);

  // 显示代理商详情
  const allAgents = await db.select({
    agentId: agents.id,
    userId: agents.userId,
    email: users.email,
    nickname: users.nickname,
    rate: agents.commissionRate,
    totalComm: agents.totalCommission,
    pending: agents.pendingWithdraw,
    clientCount: sql<number>`(SELECT count(*) FROM agent_clients WHERE agent_id = agents.id)`,
  }).from(agents)
    .innerJoin(users, eq(agents.userId, users.id));

  console.log("");
  for (const a of allAgents) {
    console.log(`  🏢 ${a.nickname} (${a.email}) | 分佣 ${(parseFloat(a.rate) * 100).toFixed(1)}% | 客户 ${a.clientCount} | 累计分佣 ¥${parseFloat(a.totalComm).toFixed(2)} | 可提现 ¥${parseFloat(a.pending).toFixed(2)}`);
  }

  // 显示所有客户的消费情况
  const allClients = await db.select({
    id: users.id,
    email: users.email,
    nickname: users.nickname,
    balance: users.balance,
  }).from(users)
    .where(sql`users.role = 'user' AND users.email LIKE '%@3c.local'`)
    .orderBy(users.id);

  console.log("\n  客户消费情况：");
  for (const c of allClients) {
    // 查该客户的总消费
    const [costResult] = await db.select({
      totalCost: sql<string>`COALESCE(SUM(cost), 0)`,
    }).from(callLogs)
      .where(eq(callLogs.userId, c.id));

    const totalCost = parseFloat(costResult?.totalCost || "0");
    console.log(`  👤 ${c.nickname || c.email} | 余额 ¥${parseFloat(c.balance).toFixed(2)} | 已消费 ¥${totalCost.toFixed(2)}`);
  }
}

main().catch((err) => {
  console.error("\n❌ 测试数据填充失败:", err);
  process.exit(1);
});
