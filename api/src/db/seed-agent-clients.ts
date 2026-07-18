// ============================================================
//  3cloud (3C) — 代理商客户种子 + 全链路业务数据
//
//  为代理商 13819008800@163.com (agentId=1) 增加 10 个客户，
//  每个客户按真实业务场景生成全链路数据：
//    注册 → 实名认证 → 充值 → API Key → API 调用 → 分佣 → 提现
//
//  运行：npx tsx src/db/seed-agent-clients.ts
// ============================================================

import "dotenv/config";
import bcryptjs from "bcryptjs";
import { eq, sql, and } from "drizzle-orm";
import { createDb, closeDb, getDb } from "./index.js";
import { createRedis } from "../redis.js";
import {
  users,
  agents,
  agentClients,
  callLogs,
  commissionLogs,
  balanceLogs,
  rechargeOrders,
  withdrawOrders,
  apiKeys,
  models,
  vendors,
  vendorModels,
  commissionRules,
  systemConfigs,
  userRealNameReviews,
  userRoleHistory,
  auditLogs,
} from "./schema.js";
import { charge, type BillingInput } from "../services/billing/index.js";

// ═══════════════════════════════════════════════
//  配置
// ═══════════════════════════════════════════════

const AGENT_EMAIL = "13819008800@163.com";
const AGENT_ID = 1; // 已知
const AGENT_USER_ID = 6; // 已知

const PASSWORD_HASH = bcryptjs.hashSync("test123456", 10);
const PASSWORD_PLAIN = "test123456";

// 定价倍率（默认 1.33）
const PRICING_MULTIPLIER = 1.33;

// ═══════════════════════════════════════════════
//  10 个客户场景定义
// ═══════════════════════════════════════════════

interface ClientScenario {
  email: string;
  nickname: string;
  industry: string;
  userType: "personal" | "enterprise";
  description: string;
  balance: string;          // 初始充值金额
  discountRate: string;     // 折扣率
  daysBack: number;         // 数据回溯天数
  callsPerDay: { min: number; max: number };
  successRate: number;
  streamRate: number;
  timePattern: "uniform" | "business_hours";
  modelWeights: Record<string, number>;
  realName: string;
  companyName?: string;
  isEnterpriseRealName: boolean;
  // 提现场景
  withdrawScenarios: Array<{
    amount: string;
    status: "approved" | "paid" | "pending_first_review";
    daysAgo: number;
  }>;
}

const CLIENTS: ClientScenario[] = [
  {
    email: "client-ai-service@3c.local",
    nickname: "智联客服",
    industry: "AI 客服 SaaS",
    userType: "enterprise",
    description: "电商平台智能客服，7×24 自动回复，高频调用 GPT-4o-mini",
    balance: "500.000000",
    discountRate: "0.9200",
    daysBack: 30,
    callsPerDay: { min: 60, max: 150 },
    successRate: 0.97,
    streamRate: 0.85,
    timePattern: "uniform",
    modelWeights: { "gpt-4o-mini": 70, "gpt-4o": 20, "deepseek-chat": 10 },
    realName: "李明",
    companyName: "智联客服科技有限公司",
    isEnterpriseRealName: true,
    withdrawScenarios: [
      { amount: "35.00", status: "paid", daysAgo: 20 },
    ],
  },
  {
    email: "client-edu-tech@3c.local",
    nickname: "学思教育",
    industry: "教育科技",
    userType: "enterprise",
    description: "在线教育平台，课件自动生成 + 知识库检索",
    balance: "300.000000",
    discountRate: "0.9500",
    daysBack: 25,
    callsPerDay: { min: 30, max: 80 },
    successRate: 0.96,
    streamRate: 0.70,
    timePattern: "business_hours",
    modelWeights: { "gpt-4o": 40, "claude-3.5-sonnet": 25, "text-embedding-3-small": 20, "gpt-4o-mini": 15 },
    realName: "王芳",
    companyName: "学思教育科技公司",
    isEnterpriseRealName: true,
    withdrawScenarios: [
      { amount: "20.00", status: "approved", daysAgo: 10 },
    ],
  },
  {
    email: "client-med-consult@3c.local",
    nickname: "康健医疗",
    industry: "医疗咨询",
    userType: "enterprise",
    description: "在线医疗咨询平台，高合规需求，使用 Claude 系列",
    balance: "200.000000",
    discountRate: "0.9800",
    daysBack: 20,
    callsPerDay: { min: 15, max: 40 },
    successRate: 0.98,
    streamRate: 0.60,
    timePattern: "business_hours",
    modelWeights: { "claude-3.5-sonnet": 80, "gpt-4o": 15, "deepseek-chat": 5 },
    realName: "张医生",
    companyName: "康健医疗咨询有限公司",
    isEnterpriseRealName: true,
    withdrawScenarios: [],
  },
  {
    email: "client-legal-aid@3c.local",
    nickname: "法务通",
    industry: "法律助手",
    userType: "enterprise",
    description: "法律文书生成与合同审查，长上下文高准确性要求",
    balance: "250.000000",
    discountRate: "0.9300",
    daysBack: 22,
    callsPerDay: { min: 20, max: 50 },
    successRate: 0.97,
    streamRate: 0.55,
    timePattern: "business_hours",
    modelWeights: { "deepseek-chat": 45, "claude-3.5-sonnet": 35, "gpt-4o": 20 },
    realName: "陈律师",
    companyName: "法务通信息技术有限公司",
    isEnterpriseRealName: true,
    withdrawScenarios: [
      { amount: "15.00", status: "pending_first_review", daysAgo: 3 },
    ],
  },
  {
    email: "client-content-creator@3c.local",
    nickname: "创意无限",
    industry: "内容创作",
    userType: "enterprise",
    description: "自媒体矩阵内容创作，大量文案生成，流式调用",
    balance: "400.000000",
    discountRate: "0.9000",
    daysBack: 28,
    callsPerDay: { min: 50, max: 120 },
    successRate: 0.95,
    streamRate: 0.90,
    timePattern: "uniform",
    modelWeights: { "gpt-4o": 55, "gpt-4o-mini": 25, "deepseek-chat": 20 },
    realName: "赵小曼",
    companyName: "创意无限文化传媒有限公司",
    isEnterpriseRealName: true,
    withdrawScenarios: [],
  },
  {
    email: "client-cross-border@3c.local",
    nickname: "海购通",
    industry: "跨境电商",
    userType: "enterprise",
    description: "跨境店铺运营，多语言翻译 + 客户回复生成",
    balance: "350.000000",
    discountRate: "0.9400",
    daysBack: 30,
    callsPerDay: { min: 35, max: 90 },
    successRate: 0.96,
    streamRate: 0.75,
    timePattern: "uniform",
    modelWeights: { "gpt-4o-mini": 50, "gpt-4o": 30, "deepseek-chat": 20 },
    realName: "刘强",
    companyName: "海购通跨境电子商务有限公司",
    isEnterpriseRealName: true,
    withdrawScenarios: [
      { amount: "25.00", status: "paid", daysAgo: 15 },
      { amount: "18.00", status: "approved", daysAgo: 5 },
    ],
  },
  {
    email: "client-data-analyst@3c.local",
    nickname: "数智未来",
    industry: "数据分析",
    userType: "enterprise",
    description: "金融数据报表分析，定时任务调度",
    balance: "300.000000",
    discountRate: "0.9600",
    daysBack: 18,
    callsPerDay: { min: 10, max: 30 },
    successRate: 0.99,
    streamRate: 0.40,
    timePattern: "business_hours",
    modelWeights: { "deepseek-chat": 50, "gpt-4o": 30, "text-embedding-3-small": 20 },
    realName: "周明辉",
    companyName: "数智未来科技有限公司",
    isEnterpriseRealName: true,
    withdrawScenarios: [
      { amount: "10.00", status: "pending_first_review", daysAgo: 1 },
    ],
  },
  {
    email: "client-game-npc@3c.local",
    nickname: "游灵互动",
    industry: "游戏 NPC 对话",
    userType: "enterprise",
    description: "开放世界游戏 NPC 实时对话系统，低延迟高并发",
    balance: "600.000000",
    discountRate: "0.9100",
    daysBack: 20,
    callsPerDay: { min: 80, max: 200 },
    successRate: 0.98,
    streamRate: 0.95,
    timePattern: "uniform",
    modelWeights: { "gpt-4o-mini": 60, "deepseek-chat": 30, "gpt-4o": 10 },
    realName: "林峰",
    companyName: "游灵互动网络科技有限公司",
    isEnterpriseRealName: true,
    withdrawScenarios: [
      { amount: "40.00", status: "paid", daysAgo: 12 },
      { amount: "30.00", status: "approved", daysAgo: 7 },
    ],
  },
  {
    email: "client-real-estate@3c.local",
    nickname: "好房营销",
    industry: "地产营销",
    userType: "enterprise",
    description: "房产文案 + 知识库检索，体验期客户",
    balance: "150.000000",
    discountRate: "1.0000",
    daysBack: 14,
    callsPerDay: { min: 8, max: 25 },
    successRate: 0.92,
    streamRate: 0.65,
    timePattern: "business_hours",
    modelWeights: { "gpt-4o-mini": 50, "text-embedding-3-small": 30, "gpt-4o": 20 },
    realName: "黄丽",
    companyName: "好房营销策划有限公司",
    isEnterpriseRealName: true,
    withdrawScenarios: [],
  },
  {
    email: "client-ai-startup@3c.local",
    nickname: "未来智能",
    industry: "AI 创业公司",
    userType: "enterprise",
    description: "AI 应用创业，测试各模型效果，全模型轮询",
    balance: "800.000000",
    discountRate: "0.8800",
    daysBack: 28,
    callsPerDay: { min: 40, max: 100 },
    successRate: 0.95,
    streamRate: 0.80,
    timePattern: "uniform",
    modelWeights: { "gpt-4o": 30, "claude-3.5-sonnet": 25, "deepseek-chat": 25, "gpt-4o-mini": 15, "text-embedding-3-small": 5 },
    realName: "徐睿",
    companyName: "未来智能科技有限公司",
    isEnterpriseRealName: true,
    withdrawScenarios: [
      { amount: "50.00", status: "paid", daysAgo: 18 },
      { amount: "35.00", status: "approved", daysAgo: 8 },
    ],
  },
];

// ═══════════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════════

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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

function randTimeOfDay(pattern: "uniform" | "business_hours"): number {
  if (pattern === "uniform") {
    return Math.random() * 86400000;
  }
  // business_hours: 9:00~12:00, 14:00~18:00, 小概率加班
  const slot = Math.random();
  if (slot < 0.45) return (9 * 3600 + Math.random() * 3 * 3600) * 1000;
  if (slot < 0.85) return (14 * 3600 + Math.random() * 4 * 3600) * 1000;
  if (slot < 0.95) return (20 * 3600 + Math.random() * 3 * 3600) * 1000;
  return Math.random() * 86400000;
}

/** 生成失败错误 */
function genFailureMsg(): string {
  return pick([
    "rate_limit_exceeded",
    "upstream_timeout",
    "context_length_exceeded",
    "upstream_503",
  ]);
}

/** 随机 User-Agent */
function genUserAgent(): string {
  return pick([
    "OpenAI-Python/v1.30.0",
    "axios/1.7.2",
    "curl/8.4.0",
    "python-requests/2.31.0",
    "PostmanRuntime/7.36.0",
    "okhttp/4.12.0",
  ]);
}

// ═══════════════════════════════════════════════
//  主流程
// ═══════════════════════════════════════════════

async function main() {
  const db = createDb();
  console.log("\n═══════════════════════════════════════════════");
  console.log("  3cloud — 代理商客户种子 & 全链路业务数据");
  console.log("  代理商: " + AGENT_EMAIL);
  console.log("═══════════════════════════════════════════════\n");

  // ── 连接 Redis ──
  try {
    await createRedis();
  } catch {
    console.log("  ℹ️ Redis 不可用（跳过低余额告警）");
  }

  // ── 获取厂商/模型映射 ──
  console.log("📦 获取现有厂商/模型...");
  const existingVendors = await db.select().from(vendors);
  const existingModels = await db.select().from(models);
  const existingVM = await db.select().from(vendorModels);

  if (existingVendors.length === 0 || existingModels.length === 0 || existingVM.length === 0) {
    console.error("❌ 厂商/模型数据缺失，请先运行 seed-test-agents.ts 或 data-factory.ts");
    await closeDb();
    process.exit(1);
  }

  // 构建映射
  const modelMap: Record<string, number> = {};
  for (const m of existingModels) {
    modelMap[m.name] = m.id;
  }
  const vendorMap: Record<string, number> = {};
  for (const v of existingVendors) {
    vendorMap[v.name] = v.id;
  }
  const vmByModel: Record<string, { vmId: number; vendorName: string }> = {};
  for (const vm of existingVM) {
    const mName = existingModels.find(m => m.id === vm.modelId)?.name;
    const vName = existingVendors.find(v => v.id === vm.vendorId)?.name;
    if (mName && vName) {
      vmByModel[mName] = { vmId: vm.id, vendorName: vName };
    }
  }

  // 补充缺失的模型/厂商关联
  const requiredModels = ["gpt-4o", "gpt-4o-mini", "claude-3.5-sonnet", "deepseek-chat", "text-embedding-3-small"];
  const requiredVendors = ["openai", "anthropic", "deepseek"];
  const pricingMap: Record<string, { v: string; inPrice: number; outPrice: number }> = {
    "gpt-4o": { v: "openai", inPrice: 0.03, outPrice: 0.12 },
    "gpt-4o-mini": { v: "openai", inPrice: 0.01, outPrice: 0.04 },
    "claude-3.5-sonnet": { v: "anthropic", inPrice: 0.02, outPrice: 0.08 },
    "deepseek-chat": { v: "deepseek", inPrice: 0.005, outPrice: 0.02 },
    "text-embedding-3-small": { v: "openai", inPrice: 0.001, outPrice: 0.001 },
  };

  for (const mName of requiredModels) {
    if (!modelMap[mName]) {
      const t = mName.includes("embedding") ? "embedding" : "chat";
      const [r] = await db.insert(models).values({
        name: mName,
        displayName: mName,
        type: t,
        status: true,
      }).returning({ id: models.id });
      modelMap[mName] = r.id;
      console.log(`  ✅ 创建模型: ${mName} (id=${r.id})`);
    }
  }

  for (const vName of requiredVendors) {
    if (!vendorMap[vName]) {
      const urlMap: Record<string, string> = {
        openai: "https://api.openai.com/v1",
        anthropic: "https://api.anthropic.com/v1",
        deepseek: "https://api.deepseek.com/v1",
      };
      const [r] = await db.insert(vendors).values({
        name: vName,
        baseUrl: urlMap[vName],
        status: "active",
      }).returning({ id: vendors.id });
      vendorMap[vName] = r.id;
      console.log(`  ✅ 创建厂商: ${vName} (id=${r.id})`);
    }
  }

  for (const mName of requiredModels) {
    if (!vmByModel[mName]) {
      const p = pricingMap[mName];
      const vmId = modelMap[mName];
      const vId = vendorMap[p.v];
      if (vmId && vId) {
        const costIn = (p.inPrice * 0.6).toFixed(6);
        const costOut = (p.outPrice * 0.6).toFixed(6);
        const [r] = await db.insert(vendorModels).values({
          vendorId: vId,
          modelId: vmId,
          upstreamModelName: mName,
          apiEndpoint: "/v1/chat/completions",
          apiKeyEncrypted: "seed_encrypted_key",
          costPriceInput: costIn,
          costPriceOutput: costOut,
          sellPriceInput: p.inPrice.toFixed(6),
          sellPriceOutput: p.outPrice.toFixed(6),
          weight: 100,
          rpmLimit: 500,
          tpmLimit: 500000,
          status: true,
        }).returning({ id: vendorModels.id });
        vmByModel[mName] = { vmId: r.id, vendorName: p.v };
        console.log(`  ✅ 创建模型关联: ${mName} → ${p.v} (vmId=${r.id})`);
      }
    }
  }

  console.log(`  ✅ 就绪: ${Object.keys(modelMap).length} 模型, ${Object.keys(vendorMap).length} 厂商\n`);

  // ── 确认代理商存在 ──
  const [agentRecord] = await db.select().from(agents).where(eq(agents.id, AGENT_ID)).limit(1);
  if (!agentRecord) {
    console.error(`❌ 代理商 ID=${AGENT_ID} 不存在！`);
    await closeDb();
    process.exit(1);
  }
  const [saleRule] = await db.select({ rate: commissionRules.rate }).from(commissionRules)
    .where(and(eq(commissionRules.agentId, AGENT_ID), eq(commissionRules.ruleType, "sale")))
    .limit(1);
  const ratePct = saleRule ? (parseFloat(saleRule.rate) * 100).toFixed(1) : "0.0";
  console.log(`🏢 代理商: ${AGENT_EMAIL}, 分佣比例: ${ratePct}%\n`);

  // ── 创建 10 个客户 ──
  console.log("👤 创建客户用户...\n");
  const createdClientIds: { uid: number; scenario: ClientScenario; keyId: number }[] = [];

  for (const cfg of CLIENTS) {
    // 检查是否已存在
    const [existing] = await db.select().from(users).where(eq(users.email, cfg.email)).limit(1);
    if (existing) {
      console.log(`  ⏭  ${cfg.nickname} (${cfg.email}) 已存在, ID=${existing.id}`);
      // 确保已绑定到代理商
      const [binding] = await db.select().from(agentClients)
        .where(and(eq(agentClients.agentId, AGENT_ID), eq(agentClients.clientUserId, existing.id)))
        .limit(1);
      if (!binding) {
        await db.insert(agentClients).values({ agentId: AGENT_ID, clientUserId: existing.id });
        console.log(`     → 补绑到代理商 #${AGENT_ID}`);
      }
      // 创建 API Key 如果不存在
      const keyName = `AutoKey-${cfg.nickname}`;
      const [kExisting] = await db.select().from(apiKeys)
        .where(and(eq(apiKeys.userId, existing.id), eq(apiKeys.name, keyName)))
        .limit(1);
      const keyId = kExisting ? kExisting.id : (await db.insert(apiKeys).values({
        userId: existing.id,
        name: keyName,
        keyPrefix: `sk-${cfg.nickname.substring(0, 4)}`,
        keyHash: `sha256$${cfg.email}`,
        status: true,
        expiresAt: new Date(Date.now() + 365 * 86400000),
      }).returning({ id: apiKeys.id }))[0].id;

      createdClientIds.push({ uid: existing.id, scenario: cfg, keyId });
      continue;
    }

    // 创建用户
    const [user] = await db.insert(users).values({
      email: cfg.email,
      passwordHash: PASSWORD_HASH,
      nickname: cfg.nickname,
      userType: cfg.userType,
      role: "user",
      status: "active",
      balance: cfg.balance,
      discountRate: cfg.discountRate,
      emailVerifiedAt: new Date(Date.now() - cfg.daysBack * 86400000),
      createdAt: new Date(Date.now() - cfg.daysBack * 86400000),
    }).returning();
    console.log(`  ✅ ${cfg.nickname} (${cfg.email}) ID=${user.id} | ${cfg.industry} | ¥${cfg.balance}`);

    // 实名认证
    if (cfg.isEnterpriseRealName) {
      // 企业实名
      await db.update(users).set({
        realNameStatus: "approved",
        realName: cfg.realName,
        companyName: cfg.companyName || "",
        updatedAt: new Date(Date.now() - (cfg.daysBack - 1) * 86400000),
      }).where(eq(users.id, user.id));

      await db.insert(userRealNameReviews).values({
        userId: user.id,
        version: 1,
        realName: cfg.realName,
        companyName: cfg.companyName,
        status: "approved",
        reviewerId: 5,
        createdAt: new Date(Date.now() - (cfg.daysBack - 1) * 86400000),
        reviewedAt: new Date(Date.now() - (cfg.daysBack - 1) * 86400000 + 60000),
      });
    } else {
      await db.update(users).set({
        realNameStatus: "approved",
        realName: cfg.realName,
      }).where(eq(users.id, user.id));

      await db.insert(userRealNameReviews).values({
        userId: user.id,
        version: 1,
        realName: cfg.realName,
        status: "approved",
        reviewerId: 5,
        createdAt: new Date(Date.now() - (cfg.daysBack - 1) * 86400000),
        reviewedAt: new Date(Date.now() - (cfg.daysBack - 1) * 86400000 + 60000),
      });
    }
    console.log(`     → 实名已认证 (${cfg.realName})`);

    // 绑定到代理商
    await db.insert(agentClients).values({ agentId: AGENT_ID, clientUserId: user.id });
    console.log(`     → 绑定到代理商 #${AGENT_ID}`);

    // 创建 API Key
    const [key] = await db.insert(apiKeys).values({
      userId: user.id,
      name: `AutoKey-${cfg.nickname}`,
      keyPrefix: `sk-${cfg.nickname.substring(0, 4)}`,
      keyHash: `sha256$${cfg.email}`,
      status: true,
      expiresAt: new Date(Date.now() + 365 * 86400000),
      createdAt: new Date(Date.now() - cfg.daysBack * 86400000),
    }).returning();
    console.log(`     → API Key ID=${key.id}`);

    // 充值记录
    const rechargeAmount = parseFloat(cfg.balance);
    await db.insert(rechargeOrders).values({
      userId: user.id,
      orderNo: `R${Date.now()}${user.id}`,
      amount: cfg.balance,
      channel: "alipay_scan",
      status: "paid",
      channelOrderNo: `alipay_sim_${user.id}_${Date.now()}`,
      paidAt: new Date(Date.now() - cfg.daysBack * 86400000 + 300000),
      createdAt: new Date(Date.now() - cfg.daysBack * 86400000),
    });
    console.log(`     → 充值 ¥${cfg.balance} (起充)`);

    // 余额流水
    await db.insert(balanceLogs).values({
      userId: user.id,
      amount: cfg.balance,
      balanceAfter: cfg.balance,
      type: "recharge",
      refType: "order",
      description: `首次充值 ¥${cfg.balance}`,
      createdAt: new Date(Date.now() - cfg.daysBack * 86400000 + 300000),
    });

    createdClientIds.push({ uid: user.id, scenario: cfg, keyId: key.id });
  }

  console.log(`\n🎯 共 ${createdClientIds.length} 个客户就绪\n`);

  // ── 生成调用记录（通过 charge() 全链路） ──
  console.log("📞 生成 API 调用记录...\n");

  let totalCalls = 0;
  let totalCost = 0;

  for (const { uid, scenario: cfg, keyId } of createdClientIds) {
    let userCalls = 0;
    let userCost = 0;
    process.stdout.write(`  ${cfg.nickname.padEnd(12)} ${cfg.industry.padEnd(16)} `);

    let balanceExhausted = false;

    for (let d = 0; d < cfg.daysBack && !balanceExhausted; d++) {
      const count = randInt(cfg.callsPerDay.min, cfg.callsPerDay.max);

      for (let c = 0; c < count && !balanceExhausted; c++) {
        const dayStart = new Date(Date.now() - d * 86400000);
        const timeOffset = randTimeOfDay(cfg.timePattern);
        const callDate = new Date(dayStart.getTime() - Math.random() * 86400000 + timeOffset);

        // 按权重选模型
        const modelName = weightedPick(cfg.modelWeights);
        const link = vmByModel[modelName];
        if (!link) continue;

        const modelId = modelMap[modelName];
        const promptLen = randInt(100, 5000);
        const completionLen = randInt(30, 2500);
        const durationMs = randInt(200, 30000);
        const streaming = Math.random() < cfg.streamRate;
        const ok = Math.random() < cfg.successRate;
        const status = ok ? "success" as const
          : (Math.random() > 0.5 ? "failed" as const : "timeout" as const);
        const errorMsg = ok ? undefined : genFailureMsg();

        // 余额不足时停止为该客户生成调用（不自动充值）
        const [uCheck] = await db
          .select({ balance: users.balance })
          .from(users)
          .where(eq(users.id, uid))
          .limit(1);
        if (uCheck && parseFloat(uCheck.balance) < 1.0) {
          balanceExhausted = true;
          break;
        }

        try {
          const result = await charge({
            userId: uid,
            apiKeyId: keyId,
            modelId,
            vendorModelId: link.vmId,
            vendorName: link.vendorName,
            modelName,
            promptTokens: promptLen,
            completionTokens: completionLen,
            totalTokens: promptLen + completionLen,
            durationMs,
            isStreaming: streaming,
            status,
            errorMessage: errorMsg,
            ip: `10.0.${randInt(1, 10)}.${randInt(1, 254)}`,
            userAgent: genUserAgent(),
          } as BillingInput);

          // 回填 created_at
          await db
            .update(callLogs)
            .set({ createdAt: callDate } as any)
            .where(eq(callLogs.id, result.callLogId));

          userCalls++;
          userCost += parseFloat(result.cost);
        } catch (err: any) {
          // 余额耗尽，停止调用生成（不自动充值）
          if (err?.message?.includes("余额") || err?.code === "BALANCE_EXHAUSTED") {
            balanceExhausted = true;
          }
        }
      }
    }

    totalCalls += userCalls;
    totalCost += userCost;
    console.log(`${userCalls} 次调用, ¥${userCost.toFixed(2)}`);
  }

  // ── 计算代理商累计分佣 ──
  const [agentStats] = await db.select({
    totalCommission: agents.totalCommission,
    pendingWithdraw: agents.pendingWithdraw,
  }).from(agents).where(eq(agents.id, AGENT_ID));
  const totalComm = parseFloat(agentStats.totalCommission);
  const pendingW = parseFloat(agentStats.pendingWithdraw);

  console.log(`\n💰 分佣统计:`);
  console.log(`  累计佣金: ¥${totalComm.toFixed(4)}`);
  console.log(`  可提现金额: ¥${pendingW.toFixed(4)}`);

  // ── 处理提现记录 ──
  console.log(`\n🏧 处理提现记录...`);
  let withdrawCount = 0;
  
  for (const { uid, scenario: cfg } of createdClientIds) {
    for (const ws of cfg.withdrawScenarios) {
      const amount = parseFloat(ws.amount);
      // 确保代理商有足够的分佣来提现
      if (amount > pendingW) {
        console.log(`  ⚠️  ${cfg.nickname}: 提现 ¥${ws.amount} → 分佣不足，跳过`);
        continue;
      }

      const createDate = new Date(Date.now() - ws.daysAgo * 86400000);
      const [order] = await db.insert(withdrawOrders).values({
        agentId: AGENT_ID,
        amount: ws.amount,
        status: ws.status,
        auditLevel: ws.status === "pending_first_review" ? 1 : 2,
        reviewedBy: ws.status !== "pending_first_review" ? 5 : null,
        reviewedAt: ws.status !== "pending_first_review" ? new Date(createDate.getTime() + 3600000) : null,
        paidAt: ws.status === "paid" ? new Date(createDate.getTime() + 7200000) : null,
        createdAt: createDate,
        updatedAt: ws.status === "paid" ? new Date(createDate.getTime() + 7200000) : createDate,
      }).returning();

      // 已审核通过的提现，从 pending_withdraw 中扣除
      if (ws.status === "approved" || ws.status === "paid") {
        await db.update(agents)
          .set({
            pendingWithdraw: sql`pending_withdraw - ${ws.amount}`,
          })
          .where(eq(agents.id, AGENT_ID));
      }

      console.log(`  ✅ ${cfg.nickname}: 提现 ¥${ws.amount} → ${ws.status}`);

      // 审计日志
      await db.insert(auditLogs).values({
        operatorId: 5,
        action: ws.status === "paid" ? "withdraw_approve" : "withdraw_approve",
        targetType: "withdraw_order",
        targetId: order.id,
        description: `代理商提现 ¥${ws.amount}, 状态: ${ws.status}`,
        ip: "127.0.0.1",
        createdAt: createDate,
      });

      withdrawCount++;
    }
  }

  // ═══════════════════════════════════════════════
  //  最终汇总
  // ═══════════════════════════════════════════════

  console.log(`\n📊 最终统计\n`);

  // 刷新代理商数据
  const [finalAgent] = await db.select({
    totalCommission: agents.totalCommission,
    pendingWithdraw: agents.pendingWithdraw,
  }).from(agents).where(eq(agents.id, AGENT_ID));

  // 各客户消费情况
  console.log(`┌─ 客户消费明细 ──────────────────────────────┐`);
  for (const { uid, scenario: cfg } of createdClientIds) {
    const [u] = await db.select({ nickname: users.nickname, balance: users.balance }).from(users).where(eq(users.id, uid));
    const [c] = await db.select({ total: sql<string>`COALESCE(SUM(cost), 0)` }).from(callLogs).where(eq(callLogs.userId, uid));
    const b = parseFloat(u?.balance || "0");
    const cost = parseFloat(c?.total || "0");
    const initials = parseFloat(cfg.balance);
    console.log(`  ${(cfg.nickname + " ").padEnd(14)} 充值¥${initials.toFixed(0).padStart(4)} 消费¥${cost.toFixed(2).padStart(8)} 余额¥${b.toFixed(2).padStart(7)}`);
  }
  console.log(`└──────────────────────────────────────────────┘\n`);

  const [callCount] = await db.select({ count: sql<number>`count(*)` }).from(callLogs)
    .where(sql`user_id IN (${sql.join(createdClientIds.map(c => c.uid), sql`,`)})`);

  const [commCount] = await db.select({ count: sql<number>`count(*)` }).from(commissionLogs)
    .where(eq(commissionLogs.agentId, AGENT_ID));

  const [wdCount] = await db.select({ count: sql<number>`count(*)` }).from(withdrawOrders)
    .where(eq(withdrawOrders.agentId, AGENT_ID));

  console.log(`═══════════════════════════════════════════════`);
  console.log(`  ✅ 全链路数据生成完成`);
  console.log(``);
  console.log(`  代理商:            ${AGENT_EMAIL} (ID=1)`);
  console.log(`  名下客户数:        ${createdClientIds.length}`);
  console.log(`  调用记录:          ${Number(callCount.count)} 条`);
  console.log(`  佣金记录:          ${Number(commCount.count)} 条`);
  console.log(`  提现记录:          ${Number(wdCount.count)} 条 (${withdrawCount} 新增)`);
  console.log(`  累计佣金:          ¥${parseFloat(finalAgent.totalCommission).toFixed(4)}`);
  console.log(`  可提现金额:        ¥${parseFloat(finalAgent.pendingWithdraw).toFixed(4)}`);
  console.log(``);
  console.log(`  所有客户密码:      ${PASSWORD_PLAIN}`);
  console.log(`  管理后台:          http://localhost:5175/admin`);
  console.log(`═══════════════════════════════════════════════\n`);

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ 种子数据填充失败:", err);
  process.exit(1);
});
