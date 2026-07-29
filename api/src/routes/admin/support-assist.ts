// ============================================================
//  3cloud (3C) — 客服AI辅助（§28）
//  意图识别 + 自动诊断 + 余额预警
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, sql, and, lt, gte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { systemConfigs, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getRedis } from "../../redis.js";

// ── 意图识别规则 ──

interface IntentRule {
  intent: string
  keywords: string[]
  label: string
  suggestedActions: {
    type: 'knowledge_article' | 'quick_reply' | 'api_query'
    label: string
    action: string
    params?: Record<string, any>
  }[]
}

const DEFAULT_INTENT_RULES: IntentRule[] = [
  {
    intent: "recharge_not_received",
    keywords: ["充值", "没到账", "没到", "余额没变", "付款后"],
    label: "充值未到账",
    suggestedActions: [
      { type: "knowledge_article", label: "充值未到账排查步骤", action: "show_article" },
      { type: "quick_reply", label: "充值确认流程", action: "fill_reply" },
      { type: "api_query", label: "查看充值记录", action: "jump_to_page", params: { page: "recharge_history" } },
    ],
  },
  {
    intent: "api_auth_failed",
    keywords: ["401", "403", "鉴权", "认证失败", "无权", "token无效"],
    label: "API 鉴权失败",
    suggestedActions: [
      { type: "knowledge_article", label: "API Key 配置指南", action: "show_article" },
      { type: "api_query", label: "查看 Key 状态", action: "jump_to_page", params: { page: "api_keys" } },
    ],
  },
  {
    intent: "balance_low",
    keywords: ["余额不足", "不够用", "没钱", "余额少", "扣费"],
    label: "余额查看",
    suggestedActions: [
      { type: "api_query", label: "显示当前余额", action: "jump_to_page", params: { page: "balance" } },
      { type: "quick_reply", label: "充值入口引导", action: "fill_reply" },
    ],
  },
  {
    intent: "invoice",
    keywords: ["发票", "开票", "发票申请"],
    label: "发票问题",
    suggestedActions: [
      { type: "knowledge_article", label: "发票申请流程", action: "show_article" },
      { type: "api_query", label: "查看历史发票", action: "jump_to_page", params: { page: "invoice_history" } },
    ],
  },
  {
    intent: "key_disabled",
    keywords: ["Key被禁", "不能用", "key失效", "Key冻结", "api key"],
    label: "Key 状态异常",
    suggestedActions: [
      { type: "api_query", label: "查看 Key 状态与日志", action: "jump_to_page", params: { page: "api_keys" } },
    ],
  },
  {
    intent: "performance",
    keywords: ["速度慢", "延迟高", "响应慢", "卡顿", "超时"],
    label: "性能问题",
    suggestedActions: [
      { type: "api_query", label: "查看调用延迟统计", action: "jump_to_page", params: { page: "monitoring" } },
    ],
  },
  {
    intent: "refund",
    keywords: ["退款", "退钱", "退费", "取消订单"],
    label: "退款申请",
    suggestedActions: [
      { type: "knowledge_article", label: "退款政策", action: "show_article" },
      { type: "api_query", label: "创建退款工单", action: "jump_to_page", params: { page: "refund_create" } },
    ],
  },
];

const INTENT_CONFIG_KEY = "scm_support_intent_rules";

// ── 路由 ──

export async function adminSupportAssistRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  const db = getDb();
  const redis = getRedis();

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/support/assist/intent-rules — 获取意图规则列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/support/assist/intent-rules", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const row = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, INTENT_CONFIG_KEY))
      .limit(1);

    if (row.length > 0) {
      reply.status(200).send({ code: 0, data: JSON.parse(row[0].value), message: "ok" });
    } else {
      reply.status(200).send({ code: 0, data: DEFAULT_INTENT_RULES, message: "ok" });
    }
  });

  // ──────────────────────────────────────────────
  //  PUT /api/v1/admin/support/assist/intent-rules — 更新意图规则
  // ──────────────────────────────────────────────

  app.put("/api/v1/admin/support/assist/intent-rules", {
    preHandler: [requirePerm(Perm.CONFIG_ACTION)],
  }, async (request, reply) => {
    const body = request.body as { rules: IntentRule[] };
    if (!Array.isArray(body.rules) || body.rules.length === 0) {
      return reply.status(400).send({ code: 400, message: "rules 必须是非空数组" });
    }

    const value = JSON.stringify(body.rules);

    const existing = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, INTENT_CONFIG_KEY))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(systemConfigs).values({
        key: INTENT_CONFIG_KEY,
        value,
        description: "客服AI辅助 — 意图识别规则",
      });
    } else {
      await db
        .update(systemConfigs)
        .set({ value, updatedAt: new Date() })
        .where(eq(systemConfigs.key, INTENT_CONFIG_KEY));
    }

    reply.status(200).send({ code: 0, data: body.rules, message: "意图规则已更新" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/support/assist/intent — 意图识别
  //  ─ 基于关键词规则匹配
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/support/assist/intent", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    const { text, userId } = request.body as { text: string; userId?: number };

    if (!text || typeof text !== "string") {
      return reply.status(400).send({ code: 400, message: "需要 text 字段" });
    }

    // 读取规则
    const row = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, INTENT_CONFIG_KEY))
      .limit(1);

    const rules: IntentRule[] = row.length > 0
      ? JSON.parse(row[0].value)
      : DEFAULT_INTENT_RULES;

    // 关键词匹配
    const matchedResults: Array<{ rule: IntentRule; matchedKeywords: string[] }> = [];

    for (const rule of rules) {
      const matchedKeywords = rule.keywords.filter(kw => text.includes(kw));
      if (matchedKeywords.length > 0) {
        matchedResults.push({ rule, matchedKeywords });
      }
    }

    // 按匹配关键词数排序
    matchedResults.sort((a, b) => b.matchedKeywords.length - a.matchedKeywords.length);

    const results = matchedResults.map(m => ({
      intent: m.rule.intent,
      label: m.rule.label,
      confidence: Math.min(Math.round((m.matchedKeywords.length / m.rule.keywords.length) * 100), 100),
      matchedKeywords: m.matchedKeywords,
      suggestedActions: m.rule.suggestedActions,
    }));

    // 用户余额信息（可选）
    let balanceInfo = null;
    if (userId) {
      try {
        const chargeLogRow = await db.execute(sql`
          SELECT SUM(amount) as total_charge FROM charge_logs WHERE user_id = ${userId}
        `);
        const usageRow = await db.execute(sql`
          SELECT SUM(amount) as total_usage FROM billing_logs WHERE user_id = ${userId}
        `);

        const totalCharge = Number(chargeLogRow.rows?.[0]?.total_charge || 0);
        const totalUsage = Number(usageRow.rows?.[0]?.total_usage || 0);
        const balance = totalCharge - totalUsage;

        balanceInfo = {
          userId,
          balance: Math.max(balance, 0),
          isLowBalance: balance < 10,
        };
      } catch { }
    }

    reply.status(200).send({
      code: 0,
      data: {
        text,
        results,
        balanceInfo,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/support/assist/diagnose/:userId — 自动诊断
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/support/assist/diagnose/:userId", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const uid = Number(userId);

    if (!uid) {
      return reply.status(400).send({ code: 400, message: "无效用户 ID" });
    }

    // 模拟诊断数据（实际应从各表查询）
    // 最近调用记录
    const recentCalls = [
      { time: new Date(Date.now() - 60000).toISOString(), model: "deepseek-chat", status: "failed", code: 429, reason: "限流" },
      { time: new Date(Date.now() - 120000).toISOString(), model: "deepseek-chat", status: "failed", code: 429, reason: "限流" },
      { time: new Date(Date.now() - 180000).toISOString(), model: "deepseek-chat", status: "success", code: 200, reason: "" },
      { time: new Date(Date.now() - 240000).toISOString(), model: "gpt-4", status: "success", code: 200, reason: "" },
      { time: new Date(Date.now() - 300000).toISOString(), model: "deepseek-chat", status: "failed", code: 429, reason: "限流" },
    ];

    // 余额
    let balance = 0;
    try {
      const chargeRow = await db.execute(sql`
        SELECT COALESCE(SUM(amount), 0) as total FROM charge_logs WHERE user_id = ${uid}
      `);
      const usageRow = await db.execute(sql`
        SELECT COALESCE(SUM(amount), 0) as total FROM billing_logs WHERE user_id = ${uid}
      `);
      balance = Math.max(Number(chargeRow.rows?.[0]?.total || 0) - Number(usageRow.rows?.[0]?.total || 0), 0);
    } catch { }

    // 分析
    const failedCount = recentCalls.filter(c => c.status === "failed").length;
    const lastFailed = recentCalls.filter(c => c.status === "failed")[0];
    let analysis = "";

    if (failedCount > 3) {
      analysis = "用户触发限流（RPM 超限），建议升配或等待限流窗口重置";
    } else if (failedCount > 0) {
      analysis = `用户有 ${failedCount}/${recentCalls.length} 次调用失败，最后失败原因: ${lastFailed?.reason || "未知"}`;
    } else {
      analysis = "用户近期调用正常";
    }

    if (balance < 10) {
      analysis += "。余额不足（¥" + balance.toFixed(2) + "），建议引导用户充值。";
    }

    reply.status(200).send({
      code: 0,
      data: {
        userId: uid,
        recentCalls,
        balance: { amount: balance, isLow: balance < 10 },
        analysis,
        diagnoseAt: new Date().toISOString(),
      },
      message: "ok",
    });
  });
}
