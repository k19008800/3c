// ============================================================
//  3cloud (3C) — 调用数据模拟脚本
//
//  设计原则：不直接 INSERT call_logs，而是通过业务全链路生成。
//  执行链条：
//    创建用户 → 创建 API Key → 建立厂商/模型/售价
//    → 调用 charge() 计费引擎（= proxy 路由调用的同一个函数）
//    → 计费引擎执行：定价计算 → 折扣应用 → 余额检查 → INSERT call_logs
//      → UPDATE users.balance → INSERT balance_logs → 分佣处理
//
//  运行：npx tsx src/scripts/simulate-calls.ts
//  前置条件：数据库已创建（docker-compose up）、超管已注册
// ============================================================

import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { createDb, closeDb, getDb } from "../db/index.js";
import { createRedis } from "../redis.js";
import {
  users,
  apiKeys,
  models,
  vendors,
  vendorModels,
  callLogs,
  systemConfigs,
} from "../db/schema.js";
import { charge, type BillingInput } from "../services/billing.js";
import bcrypt from "bcryptjs";

// ── 配置 ──

const CONFIG = {
  superAdminEmail: "admin@3cloud.ai",
  testUserCount: 3,        // 创建 3 个测试用户
  daysBack: 14,            // 数据分布在过去 14 天
  callsPerDayMin: 8,
  callsPerDayMax: 35,
  demoBalance: "200.000000",
} as const;

// ── 厂商/模型种子 ──

const MODELS = [
  { name: "gpt-4o", type: "chat" as const, display: "GPT-4o" },
  { name: "gpt-4o-mini", type: "chat" as const, display: "GPT-4o Mini" },
  { name: "claude-3.5-sonnet", type: "chat" as const, display: "Claude 3.5 Sonnet" },
  { name: "deepseek-chat", type: "chat" as const, display: "DeepSeek Chat" },
  { name: "text-embedding-3-small", type: "embedding" as const, display: "Text Embedding 3" },
] as const;

const VENDORS = [
  { name: "openai", url: "https://api.openai.com/v1" },
  { name: "anthropic", url: "https://api.anthropic.com/v1" },
  { name: "deepseek", url: "https://api.deepseek.com/v1" },
] as const;

// 售价 = ¥/1K tokens（input/output）
const PRICING: { v: string; m: string; upstream: string; inPrice: number; outPrice: number }[] = [
  { v: "openai", m: "gpt-4o", upstream: "gpt-4o", inPrice: 0.03, outPrice: 0.12 },
  { v: "openai", m: "gpt-4o-mini", upstream: "gpt-4o-mini", inPrice: 0.01, outPrice: 0.04 },
  { v: "anthropic", m: "claude-3.5-sonnet", upstream: "claude-3.5-sonnet-20241022", inPrice: 0.02, outPrice: 0.08 },
  { v: "deepseek", m: "deepseek-chat", upstream: "deepseek-chat", inPrice: 0.005, outPrice: 0.02 },
  { v: "openai", m: "text-embedding-3-small", upstream: "text-embedding-3-small-0613", inPrice: 0.001, outPrice: 0.001 },
];

// ── 随机工具 ──

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 生成范围内随机日期 */
function randDate(daysBack: number): Date {
  return new Date(Date.now() - Math.random() * daysBack * 86400000);
}

/** 日限随机值 */
function dailyCallCount(): number {
  return randInt(CONFIG.callsPerDayMin, CONFIG.callsPerDayMax);
}

// ═══════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════

async function main() {
  console.log("\n═══════════════════════════════════════════");
  console.log("  3cloud 调用模拟 — 通过 charge() 全链路生成");
  console.log("═══════════════════════════════════════════\n");

  // ── 1. 初始化数据连接 + Redis ──
  await createDb();
  try {
    await createRedis();
    console.log("✅ Redis 已连接\n");
  } catch {
    console.log("⚠️  Redis 不可用（低余额告警会跳过）\n");
  }

  const db = getDb();

  // ── 2. 准备基础数据 ──
  console.log("── Step 1: 准备厂商/模型 ──");
  const modelMap   = await upsertModels();
  const vendorMap  = await upsertVendors();
  const vmList     = await upsertVendorModels(modelMap, vendorMap);
  console.log(`    ${Object.keys(modelMap).length} models, ${Object.keys(vendorMap).length} vendors, ${vmList.length} associations\n`);

  // ── 3. 系统配置 ──
  console.log("── Step 2: 检查系统配置 ──");
  await ensureConfigs();
  console.log("    ✅\n");

  // ── 4. 确保超管存在（如果不存在则自动创建） ──
  let superAdminId: number;
  const existingAdmin = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, CONFIG.superAdminEmail))
    .limit(1);

  if (existingAdmin[0]) {
    superAdminId = existingAdmin[0].id;
    console.log(`── Step 3: 超管 ID=${superAdminId} (已存在)\n`);
  } else {
    const hash = await bcrypt.hash("admin123", 12);
    const [newAdmin] = await db
      .insert(users)
      .values({
        email: CONFIG.superAdminEmail,
        passwordHash: hash,
        nickname: "Super Admin",
        userType: "enterprise",
        role: "super_admin",
        status: "active",
        balance: "99999.000000",
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      })
      .returning({ id: users.id });
    superAdminId = newAdmin.id;
    console.log(`── Step 3: ✅ 自动创建超管 ID=${superAdminId}\n`);
  }

  // ── 5. 创建测试用户 + API Key ──
  console.log("── Step 4: 创建测试用户 ──");
  const testSubjects: { uid: number; keyId: number; email: string; balance: string }[] = [];

  for (let i = 1; i <= CONFIG.testUserCount; i++) {
    const email = `test-sim-${i}@3cloud.ai`;
    const nick  = `模拟用户 #${i}`;
    const existing = await db
      .select({ id: users.id, balance: users.balance })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let uid: number;
    let balance: string;

    if (existing[0]) {
      uid = existing[0].id;
      balance = existing[0].balance;
      console.log(`   ⏭  ${email} (ID:${uid}) 已存在`);

      // 确保余额够用
      if (parseFloat(balance) < 5) {
        await db.update(users).set({ balance: CONFIG.demoBalance }).where(eq(users.id, uid));
        balance = CONFIG.demoBalance;
        console.log(`       → 余额已充值到 ¥${balance}`);
      }
    } else {
      const hash = await bcrypt.hash("test123", 12);
      const [n] = await db
        .insert(users)
        .values({
          email,
          passwordHash: hash,
          nickname: nick,
          userType: i === 1 ? "enterprise" : "personal",
          role: "user",
          status: "active",
          balance: CONFIG.demoBalance,
          discountRate: i === 1 ? "0.9500" : "1.0000",
          emailVerifiedAt: new Date(),
          createdAt: new Date(Date.now() - CONFIG.daysBack * 86400000),
        })
        .returning({ id: users.id, balance: users.balance });
      uid = n.id;
      balance = n.balance;
      console.log(`   ✅ ${email} (ID:${uid}) → 余额 ¥${balance}`);
    }

    // API Key
    const keyName = `Seed Key #${i}`;
    const kExisting = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(sql`${apiKeys.userId} = ${uid} AND ${apiKeys.name} = ${keyName}`)
      .limit(1);

    let keyId: number;
    if (kExisting[0]) {
      keyId = kExisting[0].id;
    } else {
      const [k] = await db
        .insert(apiKeys)
        .values({
          userId: uid,
          name: keyName,
          keyPrefix: `sk-s${i}`, // max 10 chars
          keyHash: `$2a$12$dummy.sim.${i}.hash`,
          status: true,
          expiresAt: new Date(Date.now() + 365 * 86400000),
          createdAt: new Date(Date.now() - CONFIG.daysBack * 86400000),
        })
        .returning({ id: apiKeys.id });
      keyId = k.id;
      console.log(`       → API Key ID:${keyId}`);
    }
    testSubjects.push({ uid, keyId, email, balance });
  }

  console.log(`\n   共 ${testSubjects.length} 个测试用户\n`);

  // ── 6. 通过 charge() 生成调用记录 ──
  console.log("── Step 5: 生成调用日志（全链路 charge()）──\n");

  let globalCalls = 0;
  let globalCost  = 0;

  for (const sub of testSubjects) {
    const uid   = sub.uid;
    const keyId = sub.keyId;
    const days  = CONFIG.daysBack;
    let userCalls = 0;
    let userCost  = 0;

    process.stdout.write(`   ${sub.email}: `);

    for (let d = 0; d < days; d++) {
      const callsToday = dailyCallCount();

      for (let c = 0; c < callsToday; c++) {
        // 该调用发生在「daysBack - d」天前的某个随机时间
        const callDate = new Date(
          Date.now() - (days - d) * 86400000 - Math.random() * 86400000
        );

        // 选一个 model → vendorModel
        const link   = pick(vmList);
        const modelId = modelMap[link.m];

        const promptLen     = randInt(80, 6000);
        const completionLen = randInt(30, 3000);
        const durationMs    = randInt(150, 35000);
        const stream        = Math.random() > 0.25; // 75% 流式
        const ok            = Math.random() > 0.07;  // ~93% 成功率
        const status        = ok ? "success" as const : "failed" as const;

        const errorMsg = ok ? undefined : pick([
          "rate_limit_exceeded",
          "upstream_timeout",
          "context_length_exceeded",
        ]);

        try {
          const result = await charge({
            userId: uid,
            apiKeyId: keyId,
            modelId,
            vendorModelId: link.vmId,
            vendorName: link.v,
            modelName: link.m,
            promptTokens: promptLen,
            completionTokens: completionLen,
            totalTokens: promptLen + completionLen,
            durationMs,
            isStreaming: stream,
            status,
            errorMessage: errorMsg,
            ip: `10.0.${randInt(1, 5)}.${randInt(1, 254)}`,
            userAgent: "SimAgent/1.0 (test-simulation)",
          } as BillingInput);

          // charge() 使用 defaultNow() 写入时间。
          // 将 created_at 回填到模拟的 callDate
          await db
            .update(callLogs)
            .set({ createdAt: callDate } as any)
            .where(eq(callLogs.id, result.callLogId));

          userCalls++;
          userCost += parseFloat(result.cost);

        } catch (err: any) {
          if (err?.message?.includes("余额")) {
            // 余额耗尽 — 充值续命
            const topUp = (30 + Math.random() * 70).toFixed(6);
            await db.update(users).set({ balance: topUp }).where(eq(users.id, uid));
          }
          // 其他错误跳过
        }
      }
    }

    globalCalls += userCalls;
    globalCost  += userCost;
    console.log(`${userCalls} calls, ¥${userCost.toFixed(4)}`);
  }

  // ── 7. 汇总 ──
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  🎉 全链路模拟完成`);
  console.log(`  测试用户:  ${CONFIG.testUserCount}`);
  console.log(`  总调用数:  ${globalCalls}`);
  console.log(`  总费用:    ¥${globalCost.toFixed(4)}`);
  console.log(`  时间跨度:  ${CONFIG.daysBack} 天`);
  console.log(`  已对所有 5 个端点提供真实数据：`);
  console.log(`    • GET /admin/users/:id/call-logs`);
  console.log(`    • GET /admin/users/:id/call-trends`);
  console.log(`    • GET /admin/users/:id/call-stats`);
  console.log(`    • GET /admin/users/:id/api-keys/:keyId/call-stats`);
  console.log(`    • GET /admin/users/:id/api-keys/:keyId/call-trends`);
  console.log(`    • GET /admin/users/:id/api-keys/:keyId/call-logs`);
  console.log(`═══════════════════════════════════════════\n`);

  await closeDb();
  process.exit(0);
}

// ═══════════════════════════════════════════════
//  辅助：upsert 基础数据
// ═══════════════════════════════════════════════

async function upsertModels(): Promise<Record<string, number>> {
  const db = getDb();
  const map: Record<string, number> = {};
  for (const m of MODELS) {
    const existing = await db.select({ id: models.id }).from(models).where(eq(models.name, m.name)).limit(1);
    if (existing[0]) { map[m.name] = existing[0].id; continue; }
    const [r] = await db.insert(models).values({ name: m.name, displayName: m.display, type: m.type, status: true }).returning({ id: models.id });
    map[m.name] = r.id;
  }
  return map;
}

async function upsertVendors(): Promise<Record<string, number>> {
  const db = getDb();
  const map: Record<string, number> = {};
  for (const v of VENDORS) {
    const existing = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.name, v.name)).limit(1);
    if (existing[0]) { map[v.name] = existing[0].id; continue; }
    const [r] = await db.insert(vendors).values({ name: v.name, baseUrl: v.url, status: "active" }).returning({ id: vendors.id });
    map[v.name] = r.id;
  }
  return map;
}

async function upsertVendorModels(
  modelMap: Record<string, number>,
  vendorMap: Record<string, number>
): Promise<{ vmId: number; v: string; m: string }[]> {
  const db = getDb();
  const result: { vmId: number; v: string; m: string }[] = [];

  for (const p of PRICING) {
    const modelId  = modelMap[p.m];
    const vendorId = vendorMap[p.v];
    if (!modelId || !vendorId) continue;

    const existing = await db
      .select({ id: vendorModels.id })
      .from(vendorModels)
      .where(sql`${vendorModels.vendorId} = ${vendorId} AND ${vendorModels.modelId} = ${modelId}`)
      .limit(1);

    if (existing[0]) {
      result.push({ vmId: existing[0].id, v: p.v, m: p.m });
      continue;
    }

    const costIn  = (p.inPrice * 0.6).toFixed(6);
    const costOut = (p.outPrice * 0.6).toFixed(6);
    const [r] = await db
      .insert(vendorModels)
      .values({
        vendorId,
        modelId,
        upstreamModelName: p.upstream,
        apiEndpoint: "/v1/chat/completions",
        apiKeyEncrypted: "seed_placeholder_encrypted_key",
        costPriceInput: costIn,
        costPriceOutput: costOut,
        sellPriceInput: p.inPrice.toFixed(6),
        sellPriceOutput: p.outPrice.toFixed(6),
        weight: 100,
        rpmLimit: 500,
        tpmLimit: 500000,
        status: true,
      })
      .returning({ id: vendorModels.id });
    result.push({ vmId: r.id, v: p.v, m: p.m });
  }
  return result;
}

async function ensureConfigs() {
  const db = getDb();
  const defaults = [
    { key: "pricing_multiplier", value: "1.33" },
    { key: "alert_low_balance", value: "50" },
    { key: "alert_stop_balance", value: "10" },
  ];
  for (const c of defaults) {
    const existing = await db.select().from(systemConfigs).where(eq(systemConfigs.key, c.key)).limit(1);
    if (!existing[0]) {
      await db.insert(systemConfigs).values({ key: c.key, value: c.value, description: "" });
    }
  }
}

// ── 启动 ──
main().catch((err) => {
  console.error("\n❌ 模拟失败:", err);
  process.exit(1);
});
