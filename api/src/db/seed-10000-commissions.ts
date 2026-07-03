// ============================================================
//  3cloud (3C) — 生成 10,000 笔待结算佣金记录
//
//  为 13819008800@163.com (agentId=1) 的 10 个客户，
//  生成 10,000 条真实 call_logs + commission_logs
//  所有佣金状态 = pending（待结算）
//
//  执行: npx tsx src/db/seed-10000-commissions.ts
//  预计: ~8~15 秒
// ============================================================
import "dotenv/config";
import { createDb, closeDb } from "./index.js";
import { eq, sql } from "drizzle-orm";
import {
  users,
  agents,
  agentClients,
  callLogs,
  commissionLogs,
  agentCustomerConsumption,
  models,
  vendors,
  vendorModels,
} from "./schema.js";

const AGENT_ID = 1;
const AGENT_RATE = 0.10;      // 10% 分佣
const FEE_RATE = 0.01;        // 1% 手续费

const COMM_TYPES = ["sale", "sale", "sale", "sale", "sale", "sale", "sale", "renewal", "activity", "team"] as const;
const VENDOR_NAMES = ["openai", "anthropic", "deepseek"];
const MODEL_NAMES = ["gpt-4o", "gpt-4o-mini", "claude-3.5-sonnet", "deepseek-chat", "text-embedding-3-small"];
const USER_AGENTS = [
  "OpenAI-Python/v1.30.0",
  "OpenAI-Python/v1.28.0",
  "axios/1.7.2",
  "curl/8.4.0",
  "python-requests/2.31.0",
  "okhttp/4.12.0",
  "PostmanRuntime/7.36.0",
  "httpx/0.27.0",
];
const STATUSES = ["success", "success", "success", "success", "success", "success", "success", "success", "success", "failed"] as const;
const ERRORS = ["upstream_timeout", "rate_limit_exceeded", "context_length_exceeded", "upstream_503"];

function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function pick<T>(arr: readonly T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

// 按权重的模型价格表 (sellPrice per token in ¥)
const MODEL_PRICING: Record<string, { inputPrice: number; outputPrice: number }> = {
  "gpt-4o":               { inputPrice: 0.03,    outputPrice: 0.12 },
  "gpt-4o-mini":          { inputPrice: 0.01,    outputPrice: 0.04 },
  "claude-3.5-sonnet":    { inputPrice: 0.02,    outputPrice: 0.08 },
  "deepseek-chat":        { inputPrice: 0.005,   outputPrice: 0.02 },
  "text-embedding-3-small": { inputPrice: 0.001, outputPrice: 0.001 },
};

async function main() {
  const db = createDb();
  console.log("═══════════════════════════════════════════════");
  console.log("  3cloud — 生成 10,000 笔待结算佣金");
  console.log("  代理商: 13819008800@163.com (agentId=1)");
  console.log("═══════════════════════════════════════════════\n");

  // ── 1. 检查代理商 ──
  const [agent] = await db.select().from(agents).where(eq(agents.id, AGENT_ID));
  if (!agent) { console.error("❌ 代理商不存在"); process.exit(1); }
  console.log(`📋 代理商: 分佣比例 ${(AGENT_RATE * 100).toFixed(1)}% (来自 commission_rules)`);

  // ── 2. 获取 10 个客户 ──
  const clientList = await db.select({
    uid: agentClients.clientUserId,
    nickname: users.nickname,
  }).from(agentClients)
    .innerJoin(users, eq(agentClients.clientUserId, users.id))
    .where(eq(agentClients.agentId, AGENT_ID));

  if (clientList.length === 0) { console.error("❌ 无客户数据"); process.exit(1); }
  console.log(`👥 客户: ${clientList.length} 个\n`);
  for (const c of clientList) console.log(`   ID=${c.uid} ${c.nickname}`);

  // ── 3. 获取模型/厂商映射 ──
  const modelRows = await db.select().from(models);
  const modelMap: Record<string, number> = {};
  for (const m of modelRows) modelMap[m.name] = m.id;

  const vmRows = await db.select({
    id: vendorModels.id,
    modelId: vendorModels.modelId,
    vendorName: vendors.name,
  }).from(vendorModels)
    .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id));

  // Build modelId → vmId/vendor mapping
  const vmMap: Record<number, { vmId: number; vendorName: string }> = {};
  for (const vm of vmRows) {
    vmMap[vm.modelId] = { vmId: vm.id, vendorName: vm.vendorName };
  }

  // ── 4. 批量生成数据 ──
  const TOTAL = 10000;
  const DAYS_BACK = 30;
  const BATCH_SIZE = 500;
  const NOW = Date.now();
  const DAY_MS = 86400000;
  const START_TS = NOW - DAYS_BACK * DAY_MS;

  console.log(`\n📞 生成 ${TOTAL} 条 call_logs + commission_logs...`);

  let inserted = 0;
  let batchNum = 0;
  let totalCallCost = 0;
  let totalCommission = 0;

  for (let offset = 0; offset < TOTAL; offset += BATCH_SIZE) {
    batchNum++;
    const batchSize = Math.min(BATCH_SIZE, TOTAL - offset);
    const callValues: any[] = [];
    const commValues: any[] = [];
    const consUpdates = new Map<number, { totalAmt: number; commAmt: number; count: number; lastDate: Date }>();

    for (let i = 0; i < batchSize; i++) {
      const client = clientList[randInt(0, clientList.length - 1)];
      const modelName = pick(MODEL_NAMES);
      const modelId = modelMap[modelName];
      const vmInfo = vmMap[modelId];
      const pricing = MODEL_PRICING[modelName] || MODEL_PRICING["gpt-4o-mini"];

      // 时间分布: 30 天内均匀分布
      const ts = START_TS + Math.random() * DAYS_BACK * DAY_MS;
      const callDate = new Date(ts);

      // Token 量
      const promptTokens = randInt(200, 8000);
      const completionTokens = randInt(20, 3000);
      const totalTokens = promptTokens + completionTokens;

      // 成本 = promptTokens × inputPrice + completionTokens × outputPrice
      const rawCost = promptTokens * pricing.inputPrice + completionTokens * pricing.outputPrice;
      const callCost = parseFloat(rawCost.toFixed(6));

      // 分佣 = callCost × 分佣比例
      const commissionAmount = parseFloat((callCost * AGENT_RATE).toFixed(6));
      const feeAmount = parseFloat((commissionAmount * FEE_RATE).toFixed(6));
      const netAmount = parseFloat((commissionAmount - feeAmount).toFixed(6));

      const durationMs = randInt(200, 35000);
      const isStreaming = Math.random() < 0.7;
      const status = pick(STATUSES);
      const errorMsg = status === "success" ? null : pick(ERRORS);
      const commType = pick(COMM_TYPES);

      // call_logs insert value
      callValues.push({
        userId: client.uid,
        apiKeyId: null,
        modelId,
        vendorModelId: vmInfo?.vmId || null,
        vendorName: vmInfo?.vendorName || "openai",
        modelName,
        promptTokens,
        completionTokens,
        totalTokens,
        cost: callCost.toFixed(6),
        durationMs,
        status,
        errorMessage: errorMsg,
        isStreaming,
        ip: `10.0.${randInt(1, 20)}.${randInt(1, 254)}`,
        userAgent: pick(USER_AGENTS),
        createdAt: callDate,
      });

      // commission_logs insert value
      commValues.push({
        agentId: AGENT_ID,
        clientCallLogId: offset + i + 1,  // 占位，insert 后回填
        callCost: callCost.toFixed(6),
        commissionAmount: commissionAmount.toFixed(6),
        status: "pending",
        commissionType: commType,
        feeRate: FEE_RATE.toFixed(4),
        feeAmount: feeAmount.toFixed(6),
        netAmount: netAmount.toFixed(6),
        calcDetail: JSON.stringify({
          agentRate: AGENT_RATE,
          feeRate: FEE_RATE,
          model: modelName,
          promptTokens,
          completionTokens,
          inputPrice: pricing.inputPrice,
          outputPrice: pricing.outputPrice,
        }),
        createdAt: callDate,
      });

      // 累计客户消费
      const existing = consUpdates.get(client.uid) || { totalAmt: 0, commAmt: 0, count: 0, lastDate: callDate };
      existing.totalAmt += callCost;
      existing.commAmt += commissionAmount;
      existing.count++;
      if (callDate > existing.lastDate) existing.lastDate = callDate;
      consUpdates.set(client.uid, existing);

      totalCallCost += callCost;
      totalCommission += commissionAmount;
    }

    // ── Insert call_logs ──
    const insertedCalls = await db.insert(callLogs).values(callValues).returning({ id: callLogs.id, createdAt: callLogs.createdAt });
    if (insertedCalls.length !== callValues.length) {
      console.error(`❌ Batch ${batchNum}: call_logs 插入数量不匹配`);
      continue;
    }

    // ── 回填 clientCallLogId 并插入 commission_logs ──
    const finalCommValues = commValues.map((cv, idx) => ({
      ...cv,
      clientCallLogId: insertedCalls[idx].id,
    }));
    await db.insert(commissionLogs).values(finalCommValues);

    // ── 更新 agent_customer_consumption ──
    for (const [uid, data] of consUpdates) {
      // 检查是否存在记录
      const [existingCons] = await db.select()
        .from(agentCustomerConsumption)
        .where(sql`agent_id = ${AGENT_ID} AND customer_user_id = ${uid}`)
        .limit(1);

      if (existingCons) {
        await db.update(agentCustomerConsumption)
          .set({
            totalAmount: sql`COALESCE(total_amount, 0) + ${data.totalAmt.toFixed(6)}`,
            commissionAmount: sql`COALESCE(commission_amount, 0) + ${data.commAmt.toFixed(6)}`,
            orderCount: sql`COALESCE(order_count, 0) + ${data.count}`,
            lastOrderAt: data.lastDate,
            updatedAt: new Date(),
          })
          .where(eq(agentCustomerConsumption.id, existingCons.id));
      } else {
        const [u] = await db.select({ nickname: users.nickname }).from(users).where(eq(users.id, uid)).limit(1);
        await db.insert(agentCustomerConsumption).values({
          agentId: AGENT_ID,
          customerUserId: uid,
          customerName: u?.nickname || "",
          bindAt: data.lastDate,
          totalAmount: data.totalAmt.toFixed(6),
          monthAmount: data.totalAmt.toFixed(6),
          commissionAmount: data.commAmt.toFixed(6),
          orderCount: data.count,
          lastOrderAt: data.lastDate,
          updatedAt: new Date(),
          createdAt: data.lastDate,
        });
      }
    }

    inserted += batchSize;
    console.log(`  批次 ${batchNum}: ${batchSize} 条 (累计 ${inserted}/${TOTAL})`);
  }

  // ── 5. 更新代理商余额 ──
  const [agentAfter] = await db.select().from(agents).where(eq(agents.id, AGENT_ID));
  const newTotalComm = parseFloat(agentAfter.totalCommission) + totalCommission;
  const newPendingWithdraw = parseFloat(agentAfter.pendingWithdraw) + totalCommission;

  await db.update(agents)
    .set({
      totalCommission: newTotalComm.toFixed(6),
      pendingWithdraw: newPendingWithdraw.toFixed(6),
      updatedAt: new Date(),
    })
    .where(eq(agents.id, AGENT_ID));

  // ── 6. 最终统计 ──
  const [commCheck] = await db.select({
    total: sql<number>`count(*)::int`,
    pending: sql<number>`count(*)::int filter (where status='pending')`,
    settled: sql<number>`count(*)::int filter (where status='settled')`,
  }).from(commissionLogs).where(eq(commissionLogs.agentId, AGENT_ID));

  const [callCheck] = await db.select({ c: sql<number>`count(*)::int` }).from(callLogs)
    .where(sql`user_id IN (SELECT client_user_id FROM agent_clients WHERE agent_id = ${AGENT_ID})`);

  const [finalAgent] = await db.select().from(agents).where(eq(agents.id, AGENT_ID));

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  ✅ 10,000 笔待结算佣金生成完成`);
  console.log(`═══════════════════════════════════════════════\n`);

  console.log(`📊 最终统计:\n`);
  console.log(`  ├─ 调用记录:           ${Number(callCheck.c).toLocaleString()} 条`);
  console.log(`  ├─ 佣金记录:           ${Number(commCheck.total).toLocaleString()} 条`);
  console.log(`  │   ├─ 待结算(pending): ${Number(commCheck.pending).toLocaleString()} 条`);
  console.log(`  │   └─ 已结算(settled): ${Number(commCheck.settled).toLocaleString()} 条`);
  console.log(`  ├─ 本次新增佣金总额:   ¥${totalCommission.toFixed(4)}`);
  console.log(`  ├─ 本次新增调用费用:   ¥${totalCallCost.toFixed(4)}`);
  console.log(`\n💰 代理商余额:\n`);
  console.log(`  ├─ 累计佣金:           ¥${parseFloat(finalAgent.totalCommission).toFixed(4)}`);
  console.log(`  ├─ 已结算佣金:         ¥${parseFloat(finalAgent.settledCommission).toFixed(4)}`);
  console.log(`  ├─ 可提现金额:         ¥${parseFloat(finalAgent.pendingWithdraw).toFixed(4)}`);
  console.log(`  └─ 冻结金额:           ¥${parseFloat(finalAgent.frozenAmount).toFixed(4)}`);

  console.log(`\n🔹 测试方法:\n`);
  console.log(`  # 全部结算:`);
  console.log(`  curl -X POST http://localhost:3000/api/v1/admin/agents/settle-commissions \\`);
  console.log(`    -H "Authorization: Bearer <token>"`);
  console.log(``);
  console.log(`  # 按日期结算:`);
  console.log(`  curl -X POST http://localhost:3000/api/v1/admin/agents/settle-commissions \\`);
  console.log(`    -H "Authorization: Bearer <token>" \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"startDate":"2026-06-01","endDate":"2026-06-15"}'`);
  console.log(``);
  console.log(`  # 批量作废:`);
  console.log(`  curl -X POST http://localhost:3000/api/v1/admin/agents/cancel-commissions \\`);
  console.log(`    -H "Authorization: Bearer <token>" \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"ids": [1,2,3,4,5]}'`);

  console.log(`\n═══════════════════════════════════════════════\n`);

  await closeDb();
}

main().catch((err) => {
  console.error("\n❌ 失败:", err);
  process.exit(1);
});
