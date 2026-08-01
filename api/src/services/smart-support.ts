import { db, pool } from "../db/index";
import { staffTestKeys } from "../db/schema/staff-test-keys";

/**
 * 智能客服辅助 + 测试工具 对齐 SPEC-§28
 * 28.1 意图识别(关键词规则) / 自动诊断 / 余额预警
 * 28.2 临时测试 Key / 模拟调用
 */

// ===== 28.1.1 意图识别（关键词规则映射）=====
const INTENT_RULES: Array<{
  intent: string; keywords: string[]; confidence: number;
  actions: Array<{ type: string; label: string; action: string; params?: Record<string, any> }>;
  reply?: string;
}> = [
  {
    intent: "充值未到账", keywords: ["充值", "到账", "没充", "付款", "支付", "打了钱", "没到", "余额没变", "钱没到"],
    confidence: 0.92,
    actions: [{ type: "api_query", label: "查看该用户充值记录", action: "jump_to_recharge" }],
    reply: "您好，请提供充值订单号，我来为您核实到账情况。",
  },
  {
    intent: "API鉴权失败", keywords: ["401", "403", "鉴权", "认证失败", "unauthorized", "invalid key", "key无效"],
    confidence: 0.9,
    actions: [{ type: "api_query", label: "查看该用户 Key 状态", action: "jump_to_keys" }],
    reply: "请您确认 API Key 是否正确，或查看 Key 是否已过期/被禁用。",
  },
  {
    intent: "余额不足", keywords: ["余额不足", "不够用", "没余额", "insufficient", "余额为0", "欠费"],
    confidence: 0.9,
    actions: [{ type: "api_query", label: "显示当前余额+充值入口", action: "jump_to_balance" }],
    reply: "您的余额不足，请前往充值中心充值后继续使用。",
  },
  {
    intent: "发票问题", keywords: ["发票", "开票", "税票", "invoic", "专票", "普票"],
    confidence: 0.9,
    actions: [{ type: "api_query", label: "推荐发票申请流程+查看历史", action: "jump_to_invoices" }],
    reply: "发票申请请前往「发票开具」页面提交，我们会在 3-5 个工作日内处理。",
  },
  {
    intent: "Key状态异常", keywords: ["key被禁", "key不能", "key失效", "被禁用", "不能用", "key不可用"],
    confidence: 0.88,
    actions: [{ type: "api_query", label: "查看 Key 状态和操作日志", action: "jump_to_keys" }],
  },
  {
    intent: "性能问题", keywords: ["速度慢", "延迟高", "很慢", "卡", "超时", "timeout", "慢"],
    confidence: 0.85,
    actions: [{ type: "api_query", label: "查看最近调用延迟统计", action: "jump_to_logs" }],
  },
  {
    intent: "退款申请", keywords: ["退款", "退钱", "返还", "refund"],
    confidence: 0.9,
    actions: [{ type: "create_ticket", label: "创建退款工单", action: "create_refund_ticket" }],
    reply: "退款申请请提交工单，我们会核实消费记录后按政策处理。",
  },
  {
    intent: "如何创建Key", keywords: ["怎么创建", "如何创建", "创建api", "怎么用", "如何使用"],
    confidence: 0.9,
    actions: [{ type: "knowledge", label: "引用知识库·如何创建API Key", action: "fill_reply" }, { type: "api_query", label: "前往 API Keys 页面", action: "jump_to_keys" }],
    reply: '创建 API Key 的步骤：1.登录控制台 2.点击"API Keys" 3.点击"创建 Key" 4.输入名称确认即可。',
  },
];

export function detectIntent(text: string): { intent: string | null; confidence: number; suggested_actions: Array<{ type: string; label: string; action: string }>; matched_keywords: string[]; reply?: string } {
  const lower = text.toLowerCase();
  let best: any = null;
  for (const rule of INTENT_RULES) {
    const hits = rule.keywords.filter((k) => lower.includes(k.toLowerCase()));
    if (hits.length > 0) {
      const conf = Math.min(0.95, rule.confidence + hits.length * 0.02);
      if (!best || conf > best.confidence) best = { ...rule, confidence: conf, matched_keywords: hits };
    }
  }
  if (!best) return { intent: null, confidence: 0, suggested_actions: [], matched_keywords: [] };
  return { intent: best.intent, confidence: best.confidence, suggested_actions: best.actions, matched_keywords: best.matched_keywords, reply: best.reply };
}

// ===== 28.1.3 自动诊断 =====
export async function diagnoseUser(userId: number) {
  // 最近 20 条调用
  const calls = await pool.query(
    `SELECT cl.id, cl.upstream_model, cl.status, cl.error_code, cl.latency_ms, cl.cost,
            cl.created_at, COALESCE(m.name, cl.upstream_model) AS model_name
     FROM call_logs cl LEFT JOIN models m ON m.id=cl.model_id
     WHERE cl.user_id=$1 ORDER BY cl.created_at DESC LIMIT 20`,
    [userId],
  );
  // 用户余额/状态
  const u = await pool.query(`SELECT id, email, username, balance, status, role FROM users WHERE id=$1`, [userId]);
  // Key 状态
  const keys = await pool.query(
    `SELECT id, name, key_prefix, status, expires_at, last_used_at FROM api_keys WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [userId],
  );
  // 错误分布分析
  const errorAnalysis = analyzeFailures(calls.rows);
  const balance = Number(u.rows[0]?.balance ?? 0) / 100; // 分→元
  return {
    user: u.rows[0] ? { id: u.rows[0].id, email: u.rows[0].email, username: u.rows[0].username, balance, status: u.rows[0].status, role: u.rows[0].role } : null,
    recent_calls: calls.rows.map((r: any) => ({ ...r, cost: Number(r.cost), created_at: r.created_at, latency_ms: r.latency_ms })),
    api_keys: keys.rows,
    analysis: errorAnalysis,
    // 余额预警
    balance_warning: balance < 10 ? { low_balance: true, balance, note: "余额低于 ¥10 预警阈值" } : null,
  };
}

function analyzeFailures(calls: any[]) {
  const failed = calls.filter((c) => c.status === "failed");
  const success = calls.filter((c) => c.status === "success");
  const errorCounts: Record<string, number> = {};
  for (const c of failed) {
    const code = c.error_code ?? "UNKNOWN";
    errorCounts[code] = (errorCounts[code] ?? 0) + 1;
  }
  const totalLatency = success.reduce((s, c) => s + (c.latency_ms ?? 0), 0);
  const avgLatency = success.length > 0 ? Math.round(totalLatency / success.length) : 0;
  const dominantError = Object.entries(errorCounts).sort((a, b) => b[1] - a[1])[0];
  let suggestion = "";
  if (dominantError) {
    const code = dominantError[0];
    if (code.startsWith("429") || code.startsWith("RATE")) suggestion = "用户触发了频率限制（RPM/TPM 超限），建议升配或等待限流窗口重置";
    else if (code.startsWith("401") || code.startsWith("AUTH") || code === "UNAUTHORIZED") suggestion = "API Key 鉴权失败，建议检查 Key 状态/是否过期/是否被禁用";
    else if (code.startsWith("50") || code.startsWith("5")) suggestion = "上游供应商服务异常，建议切换模型或稍后重试";
    else suggestion = `检测到错误码 ${code}，建议结合调用日志进一步排查`;
  } else if (calls.length > 0) {
    suggestion = "近期调用正常，无明显异常";
  }
  return {
    total_calls: calls.length,
    success_count: success.length,
    failed_count: failed.length,
    success_rate: calls.length > 0 ? Math.round((success.length / calls.length) * 10000) / 100 : 100,
    avg_latency_ms: avgLatency,
    error_distribution: Object.entries(errorCounts).map(([code, count]) => ({ code, count })),
    dominant_error: dominantError ? dominantError[0] : null,
    suggestion,
  };
}

// ===== 28.2.3 临时测试 Key =====
export async function createTestKey(staffId: number, associatedUserId: number | null, name?: string) {
  const key = `sk-test-${staffId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const crypto = await import("node:crypto");
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  const created = await db.insert(staffTestKeys).values({
    staffId, keyHash, keyPrefix: key.slice(0, 10), name: name ?? `临时测试-客服${staffId}`,
    associatedUserId, expiresAt, status: "active",
  }).returning();
  return { id: created[0]!.id, key, key_prefix: key.slice(0, 10), expires_at: expiresAt, token_limit: 1000000, cost_limit: 5 };
}

// ===== 模拟调用（客服以用户身份测试，不计费）=====
export async function simulateCall(userId: number, model: string, messages: any[]) {
  // 读取用户配置（余额/Key），实际转发由 proxy 处理，此处返回模拟诊断信息
  const u = await pool.query(`SELECT id, email, username, balance FROM users WHERE id=$1`, [userId]);
  const keys = await pool.query(`SELECT id, name, key_prefix, status FROM api_keys WHERE user_id=$1 AND status='active' AND deleted_at IS NULL LIMIT 5`, [userId]);
  return {
    user: u.rows[0] ? { id: u.rows[0].id, email: u.rows[0].email, username: u.rows[0].username, balance: Number(u.rows[0].balance) / 100 } : null,
    model,
    message_count: messages?.length ?? 0,
    active_keys: keys.rows.map((r: any) => ({ id: r.id, name: r.name, status: r.status })),
    note: "模拟调用已就绪，可在发送前确认用户环境配置",
  };
}
