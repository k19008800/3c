// ============================================================
//  3cloud (3C) — 场景化测试数据工厂
//
//  在 simulate-calls.ts 的全链路能力之上，增加"业务场景模板"，
//  让测试数据有真实的业务含义，而非随机散点。
//
//  场景模板：
//    normalUser      → 稳定调用，97% 成功率
//    powerUser       → 高频企业用户，集中在工作时间
//    problematicUser → 高失败率，诊断用
//    trialUser       → 新用户，低量体验
//
//  运行：npx tsx src/scripts/data-factory.ts [scenario]
//  示例：npx tsx src/scripts/data-factory.ts normal
//        npx tsx src/scripts/data-factory.ts all   （默认）
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

// ═════════════════════════════════════════
//  场景模板定义
// ═════════════════════════════════════════

interface ScenarioConfig {
  emailPrefix: string;
  nickname: string;
  userType: "personal" | "enterprise";
  daysBack: number;
  callsPerDay: { min: number; max: number };
  successRate: number;           // 0–1
  streamRate: number;            // 0–1，流式调用比例
  timePattern: "uniform" | "business_hours";
  balance: string;
  discountRate: string;
  modelWeights: Record<string, number>; // 模型名 → 权重
  failureModes: Array<{ error: string; weight: number }>;
}

const SCENARIOS: Record<string, ScenarioConfig> = {

  // ── 场景1: 正常企业用户 ──
  normal: {
    emailPrefix: "normal",
    nickname: "正常用户",
    userType: "enterprise",
    daysBack: 30,
    callsPerDay: { min: 30, max: 120 },
    successRate: 0.97,
    streamRate: 0.75,
    timePattern: "uniform",
    balance: "500.000000",
    discountRate: "0.9500",
    modelWeights: { "gpt-4o": 40, "gpt-4o-mini": 30, "claude-3.5-sonnet": 20, "deepseek-chat": 10 },
    failureModes: [
      { error: "rate_limit_exceeded", weight: 50 },
      { error: "upstream_timeout", weight: 30 },
      { error: "context_length_exceeded", weight: 20 },
    ],
  },

  // ── 场景2: 高频企业用户 ──
  power: {
    emailPrefix: "power",
    nickname: "高频用户",
    userType: "enterprise",
    daysBack: 14,
    callsPerDay: { min: 200, max: 800 },
    successRate: 0.99,
    streamRate: 0.85,
    timePattern: "business_hours",
    balance: "5000.000000",
    discountRate: "0.9000",
    modelWeights: { "gpt-4o": 60, "claude-3.5-sonnet": 25, "deepseek-chat": 15 },
    failureModes: [
      { error: "rate_limit_exceeded", weight: 60 },
      { error: "upstream_timeout", weight: 40 },
    ],
  },

  // ── 场景3: 问题用户（高失败率） ──
  problematic: {
    emailPrefix: "problem",
    nickname: "问题用户",
    userType: "personal",
    daysBack: 14,
    callsPerDay: { min: 5, max: 40 },
    successRate: 0.35,
    streamRate: 0.40,
    timePattern: "uniform",
    balance: "20.000000",
    discountRate: "1.0000",
    modelWeights: { "gpt-4o-mini": 50, "deepseek-chat": 50 },
    failureModes: [
      { error: "timeout", weight: 40 },
      { error: "rate_limit_exceeded", weight: 30 },
      { error: "context_length_exceeded", weight: 20 },
      { error: "authentication_failed", weight: 10 },
    ],
  },

  // ── 场景4: 新用户体验期 ──
  trial: {
    emailPrefix: "trial",
    nickname: "体验用户",
    userType: "personal",
    daysBack: 5,
    callsPerDay: { min: 1, max: 8 },
    successRate: 0.92,
    streamRate: 0.50,
    timePattern: "uniform",
    balance: "10.000000",
    discountRate: "1.0000",
    modelWeights: { "gpt-4o-mini": 60, "deepseek-chat": 30, "text-embedding-3-small": 10 },
    failureModes: [
      { error: "rate_limit_exceeded", weight: 100 },
    ],
  },
};

// ═════════════════════════════════════════
//  共享基础数据（与 simulate-calls.ts 一致）
// ═════════════════════════════════════════

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

const PRICING: { v: string; m: string; upstream: string; inPrice: number; outPrice: number }[] = [
  { v: "openai", m: "gpt-4o", upstream: "gpt-4o", inPrice: 0.03, outPrice: 0.12 },
  { v: "openai", m: "gpt-4o-mini", upstream: "gpt-4o-mini", inPrice: 0.01, outPrice: 0.04 },
  { v: "anthropic", m: "claude-3.5-sonnet", upstream: "claude-3.5-sonnet-20241022", inPrice: 0.02, outPrice: 0.08 },
  { v: "deepseek", m: "deepseek-chat", upstream: "deepseek-chat", inPrice: 0.005, outPrice: 0.02 },
  { v: "openai", m: "text-embedding-3-small", upstream: "text-embedding-3-small-0613", inPrice: 0.001, outPrice: 0.001 },
];

// ═════════════════════════════════════════
//  工具函数
// ═════════════════════════════════════════

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedPick<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function weightedError(failureModes: Array<{ error: string; weight: number }>): string {
  const total = failureModes.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * total;
  for (const f of failureModes) {
    r -= f.weight;
    if (r <= 0) return f.error;
  }
  return failureModes[failureModes.length - 1].error;
}

/** 生成符合时间模式的时间戳（给定日期的偏移） */
function randTimeOfDay(pattern: "uniform" | "business_hours"): number {
  if (pattern === "uniform") {
    return Math.random() * 86400000;
  }
  // business_hours: 9:00~12:00, 14:00~18:00, 小概率加班 20:00~23:00
  const slot = Math.random();
  if (slot < 0.45) return (9 * 3600 + Math.random() * 3 * 3600) * 1000;      // 9:00–12:00
  if (slot < 0.85) return (14 * 3600 + Math.random() * 4 * 3600) * 1000;     // 14:00–18:00
  if (slot < 0.95) return (20 * 3600 + Math.random() * 3 * 3600) * 1000;     // 20:00–23:00
  return Math.random() * 86400000; // 其他零星
}

// ═════════════════════════════════════════
//  基础数据 Upsert（复用 simulate-calls）
// ═════════════════════════════════════════

async function upsertModels2(): Promise<Record<string, number>> {
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

async function upsertVendors2(): Promise<Record<string, number>> {
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

async function upsertVendorModels2(
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
        vendorId, modelId,
        upstreamModelName: p.upstream,
        apiEndpoint: "/v1/chat/completions",
        apiKeyEncrypted: "seed_placeholder_encrypted_key",
        costPriceInput: costIn,
        costPriceOutput: costOut,
        sellPriceInput: p.inPrice.toFixed(6),
        sellPriceOutput: p.outPrice.toFixed(6),
        weight: 100, rpmLimit: 500, tpmLimit: 500000, status: true,
      })
      .returning({ id: vendorModels.id });
    result.push({ vmId: r.id, v: p.v, m: p.m });
  }
  return result;
}

async function ensureConfigs2() {
  const db = getDb();
  const defaults = [
    { key: "pricing_multiplier", value: "1.33" },
    { key: "alert_low_balance", value: "50" },
    { key: "alert_stop_balance", value: "10" },
    { key: "enterprise_discount_rate", value: "0.95" },
  ];
  for (const c of defaults) {
    const existing = await db.select().from(systemConfigs).where(eq(systemConfigs.key, c.key)).limit(1);
    if (!existing[0]) {
      await db.insert(systemConfigs). values({ key: c.key, value: c.value, description: "" });
    }
  }
}

// ═════════════════════════════════════════
//  根据场景生成数据
// ═════════════════════════════════════════

async function generateScenario(
  name: string,
  cfg: ScenarioConfig,
  vmList: { vmId: number; v: string; m: string }[],
  modelMap: Record<string, number>,
) {
  const db = getDb();
  const email = `factory-${cfg.emailPrefix}@3cloud.ai`;

  console.log(`\n──── 场景: ${name} — ${cfg.nickname} ────`);

  // ── 查找或创建用户 ──
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
    // 补足余额
    if (parseFloat(balance) < 5) {
      await db.update(users).set({ balance: cfg.balance }).where(eq(users.id, uid));
      balance = cfg.balance;
    }
    console.log(`  用户 ${email} (ID:${uid}) 已存在，余额 ¥${balance}`);
  } else {
    const hash = await bcrypt.hash("factory123", 12);
    const createdAt = new Date(Date.now() - cfg.daysBack * 86400000);
    const [n] = await db
      .insert(users)
      .values({
        email, passwordHash: hash,
        nickname: `${cfg.nickname} (#${name})`,
        userType: cfg.userType,
        role: "user", status: "active",
        balance: cfg.balance,
        discountRate: cfg.discountRate,
        emailVerifiedAt: createdAt,
        createdAt,
      })
      .returning({ id: users.id, balance: users.balance });
    uid = n.id;
    balance = n.balance;
    console.log(`  ✅ 创建用户 ${email} (ID:${uid}) 余额 ¥${balance}`);
  }

  // ── 查找或创建 API Key ──
  const keyName = `Factory Key [${name}]`;
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
        userId: uid, name: keyName,
        keyPrefix: `sk-${cfg.emailPrefix.substring(0, 6)}`,
        keyHash: `$2a$12$factory.${name}.hash`,
        status: true,
        expiresAt: new Date(Date.now() + 365 * 86400000),
        createdAt: new Date(Date.now() - cfg.daysBack * 86400000),
      })
      .returning({ id: apiKeys.id });
    keyId = k.id;
    console.log(`  → API Key ID:${keyId}`);
  }

  // ── 去重: 删除该场景之前生成的 call_logs ──
  await db.delete(callLogs).where(sql`${callLogs.userId} = ${uid} AND ${callLogs.apiKeyId} = ${keyId}`);

  // ── 按场景生成调用 ──
  let calls = 0;
  let cost = 0;

  for (let d = 0; d < cfg.daysBack; d++) {
    const count = randInt(cfg.callsPerDay.min, cfg.callsPerDay.max);

    for (let c = 0; c < count; c++) {
      const dayStart = new Date(Date.now() - d * 86400000);
      const dateOffset = randTimeOfDay(cfg.timePattern);
      const callDate = new Date(dayStart.getTime() - Math.random() * 86400000 + dateOffset);

      // 选模型（按权重）
      const modelName = weightedPick(cfg.modelWeights);
      const link = vmList.find(l => l.m === modelName)!;
      if (!link) continue;

      const modelId = modelMap[modelName];
      const promptLen = randInt(80, 6000);
      const completionLen = randInt(30, 3000);
      const durationMs = randInt(150, 35000);
      const stream = Math.random() < cfg.streamRate;
      const ok = Math.random() < cfg.successRate;
      const status = ok ? "success" as const : "failed" as const;
      const errorMsg = ok ? undefined : weightedError(cfg.failureModes);

      // 问题场景：部分 timeout 改为 "timeout" 状态
      const finalStatus = (!ok && errorMsg === "timeout") ? "timeout" as const : status;
      const finalError = finalStatus === "timeout" ? "upstream_request_timeout" : errorMsg;

      try {
        const result = await charge({
          userId: uid,
          apiKeyId: keyId,
          modelId,
          vendorModelId: link.vmId,
          vendorName: link.v,
          modelName,
          promptTokens: promptLen,
          completionTokens: completionLen,
          totalTokens: promptLen + completionLen,
          durationMs,
          isStreaming: stream,
          status: finalStatus,
          errorMessage: finalError,
          ip: `10.0.${randInt(1, 5)}.${randInt(1, 254)}`,
          userAgent: pick([
            "FactorySim/1.0 (compatible; data-factory)",
            "curl/8.4.0",
            "python-requests/2.31.0",
            "OpenAI-Python/v1.30.0",
            "axios/1.7.2 (node.js)",
          ]),
        } as BillingInput);

        // 回填 created_at
        await db
          .update(callLogs)
          .set({ createdAt: callDate } as any)
          .where(eq(callLogs.id, result.callLogId));

        calls++;
        cost += parseFloat(result.cost);
      } catch (err: any) {
        if (err?.message?.includes("余额") || err?.code === "BALANCE_EXHAUSTED") {
          // 余额耗尽补血
          const topUp = (30 + Math.random() * 70).toFixed(6);
          await db.update(users).set({ balance: topUp }).where(eq(users.id, uid));
        }
      }
    }
  }

  console.log(`  生成 ${calls} 条调用, 总费用 ¥${cost.toFixed(4)}`);

  return { email, uid, keyId, calls, cost };
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ═════════════════════════════════════════
//  入口
// ═════════════════════════════════════════

async function main() {
  const targetScenario = process.argv[2]?.toLowerCase() || "all";

  console.log("\n═══════════════════════════════════════════════");
  console.log("  3cloud 场景化数据工厂");
  console.log("  目标场景: " + (targetScenario === "all" ? "全部 (4 场景)" : targetScenario));
  console.log("═══════════════════════════════════════════════\n");

  // ── 连接 ──
  await createDb();
  try {
    await createRedis();
  } catch {
    // Redis 不可用时跳过告警
  }
  const db = getDb();

  // ── 准备基础数据 ──
  console.log("── 基础数据 ──");
  const modelMap  = await upsertModels2();
  const vendorMap = await upsertVendors2();
  const vmList    = await upsertVendorModels2(modelMap, vendorMap);
  await ensureConfigs2();
  console.log(`  ${Object.keys(modelMap).length} models, ${Object.keys(vendorMap).length} vendors, ${vmList.length} associations\n`);

  // ── 运行场景 ──
  const scenarioKeys = targetScenario === "all"
    ? Object.keys(SCENARIOS)
    : Object.keys(SCENARIOS).filter(k => k === targetScenario);

  if (scenarioKeys.length === 0) {
    console.error(`❌ 未知场景: "${targetScenario}"`);
    console.error(`   可用场景: ${Object.keys(SCENARIOS).join(", ")}`);
    process.exit(1);
  }

  const results: { name: string; email: string; calls: number; cost: number }[] = [];

  for (const key of scenarioKeys) {
    const r = await generateScenario(key, SCENARIOS[key], vmList, modelMap);
    results.push({ name: key, ...r });
  }

  // ── 汇总 ──
  const totalCalls = results.reduce((s, r) => s + r.calls, 0);
  const totalCost  = results.reduce((s, r) => s + r.cost, 0);

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  🎉 数据工厂完成`);
  console.log(`  场景数:    ${results.length}`);
  console.log(`  总调用数:  ${totalCalls}`);
  console.log(`  总费用:    ¥${totalCost.toFixed(4)}`);
  console.log(``);
  console.log(`  用户清单:`);
  for (const r of results) {
    console.log(`    ${r.name.padEnd(15)}  ${r.email.padEnd(35)}  ${r.calls.toString().padStart(6)} calls  ¥${r.cost.toFixed(4)}`);
  }
  console.log(`\n  登录密码: factory123`);
  console.log(`  管理面板路径: http://localhost:3000/admin/users`);
  console.log(`═══════════════════════════════════════════════\n`);

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ 数据工厂失败:", err);
  process.exit(1);
});
