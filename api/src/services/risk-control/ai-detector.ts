// ============================================================
//  3cloud (3C) — AI 风控模型检测器
//  规则引擎风控检测（非 AI API 调用）
//  基于 operation_logs 查询近期数据做多维度风险评估
// ============================================================

import { and, gte, eq, ne, sql, inArray, count } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { operationLogs } from "../../db/schema.js";
import { getRedis } from "../../redis.js";

// ── 类型定义 ──

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskResult {
  riskLevel: RiskLevel;
  score: number;           // 0-100 风险分
  reasons: string[];       // 触发原因说明
}

export interface RiskContext {
  userId: number;
  action: string;
  ip: string;
}

// ── 预定义敏感词列表（按风险等级分组） ──

const SENSITIVE_WORDS: Record<RiskLevel, string[]> = {
  critical: [
    "delete_all", "drop", "truncate", "shutdown", "reset_password_all",
    "批量删除", "删除全部", "清空数据", "提权", "越权",
    "grant all", "超级管理员", "sudo", "bypass", "绕过审核",
  ],
  high: [
    "退款", "refund", "提现", "withdraw", "transfer",
    "修改余额", "改余额", "余额修改",
    "删除用户", "注销账号", "封禁", "ban",
    "导出数据", "数据导出", "export",
    "敏感信息", "身份证", "银行卡", "密码明文",
  ],
  medium: [
    "重置密码", "修改密码", "change_password",
    "修改邮箱", "修改手机", "修改信息",
    "解绑", "unbind", "解除绑定",
    "批量操作", "mass_", "batch_",
    "api_key_create", "api_key_delete", "API密钥",
  ],
  low: [],
};

// ── 常用 IP 缓存键 ──

const FAMILIAR_IP_CACHE_KEY = "risk:detect:familiar_ips";
const FAMILIAR_IP_CACHE_TTL = 300; // 5 分钟

// ── 检测窗口常量 ──

const REPEAT_WINDOW_MINUTES = 5;     // 重复操作检测窗口
const BATCH_WINDOW_MINUTES = 10;     // 批量操作检测窗口
const BATCH_THRESHOLD = 10;           // 批量操作阈值

// ── 主入口：风控检测 ──

/**
 * AI 风控检测入口
 * 对用户操作进行多维度风险评估
 * @param text  操作内容/摘要文本
 * @param context  操作上下文（用户 ID、操作类型、IP）
 * @returns  RiskResult 风险评估结果
 */
export async function detectRisk(
  text: string,
  context: RiskContext
): Promise<RiskResult> {
  const checks: Array<{ score: number; reason: string }> = [];

  // 1. 敏感词检查
  const sensitiveResult = checkSensitiveWords(text);
  if (sensitiveResult) {
    checks.push(sensitiveResult);
  }

  // 2. 可疑操作模式 — 短时间内相同操作重复提交
  const repeatResult = await checkRepeatOperation(context);
  if (repeatResult) {
    checks.push(repeatResult);
  }

  // 3. 异常 IP 检测
  const ipResult = await checkAbnormalIp(context);
  if (ipResult) {
    checks.push(ipResult);
  }

  // 4. 批量操作检测
  const batchResult = await checkBatchOperation(context);
  if (batchResult) {
    checks.push(batchResult);
  }

  // ── 综合评分 ──

  const totalScore = Math.min(100, checks.reduce((sum, c) => sum + c.score, 0));
  const reasons = checks.map((c) => c.reason);

  const riskLevel = getRiskLevel(totalScore);

  return {
    riskLevel,
    score: totalScore,
    reasons,
  };
}

// ── 1. 敏感词检查 ──

function checkSensitiveWords(text: string): { score: number; reason: string } | null {
  if (!text) return null;

  const normalized = text.toLowerCase();
  const matched: Array<{ word: string; level: RiskLevel }> = [];

  // 按风险等级从高到低匹配
  for (const level of ["critical", "high", "medium"] as RiskLevel[]) {
    const words = SENSITIVE_WORDS[level];
    for (const word of words) {
      if (normalized.includes(word.toLowerCase())) {
        matched.push({ word, level });
      }
    }
  }

  if (matched.length === 0) return null;

  // 最高等级决定基础分
  const maxLevel = matched.reduce(
    (max, m) => (["critical", "high", "medium"].indexOf(m.level) < ["critical", "high", "medium"].indexOf(max) ? m.level : max),
    "low" as RiskLevel
  );

  const baseScores: Record<RiskLevel, number> = {
    critical: 40,
    high: 25,
    medium: 15,
    low: 0,
  };

  // 命中多个敏感词加分
  const bonus = Math.min(15, matched.length * 5);
  const score = Math.min(60, baseScores[maxLevel] + bonus);

  const wordList = matched.map((m) => m.word).join(", ");

  return {
    score,
    reason: `检测到敏感词: ${wordList}（最高风险等级: ${maxLevel}）`,
  };
}

// ── 2. 可疑操作模式 — 短时间内相同操作重复提交 ──

async function checkRepeatOperation(
  context: RiskContext
): Promise<{ score: number; reason: string } | null> {
  const db = getDb();
  const windowStart = new Date(Date.now() - REPEAT_WINDOW_MINUTES * 60 * 1000);

  // 查询该用户在窗口期内相同操作的次数
  const [result] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(operationLogs)
    .where(
      and(
        eq(operationLogs.userId, context.userId),
        eq(operationLogs.action, context.action),
        gte(operationLogs.createdAt, windowStart)
      )
    );

  if (!result || result.count < 3) return null;

  // 3-5 次 → 中等，6+ 次 → 高
  const score = Math.min(35, 10 + (result.count - 2) * 5);

  return {
    score,
    reason: `短时间内重复提交相同操作（${context.action}）${result.count} 次（${REPEAT_WINDOW_MINUTES} 分钟内）`,
  };
}

// ── 3. 异常 IP 检测 — 不在常用 IP 列表中的访问 ──

async function checkAbnormalIp(
  context: RiskContext
): Promise<{ score: number; reason: string } | null> {
  const db = getDb();

  // 获取该用户的常用 IP 列表（优先从缓存读取）
  let familiarIps: string[] = [];
  try {
    const redis = getRedis();
    const cached = await redis.get(`${FAMILIAR_IP_CACHE_KEY}:${context.userId}`);
    if (cached) {
      familiarIps = JSON.parse(cached);
    }
  } catch {
    // Redis 不可用时降级到数据库查询
  }

  if (familiarIps.length === 0) {
    // 从 operation_logs 查询该用户近 7 天的 IP 分布
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const ipRows = await db
      .select({
        ip: operationLogs.ip,
        cnt: sql<number>`count(*)::int`,
      })
      .from(operationLogs)
      .where(
        and(
          eq(operationLogs.userId, context.userId),
          gte(operationLogs.createdAt, sevenDaysAgo),
          ne(operationLogs.ip, ""),
          sql`${operationLogs.ip} IS NOT NULL`
        )
      )
      .groupBy(operationLogs.ip)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // 定义常用 IP：出现次数 >= 3 的 IP
    familiarIps = ipRows.filter((r) => r.cnt >= 3).map((r) => r.ip);

    // 写缓存
    if (familiarIps.length > 0) {
      try {
        const redis = getRedis();
        await redis.setex(
          `${FAMILIAR_IP_CACHE_KEY}:${context.userId}`,
          FAMILIAR_IP_CACHE_TTL,
          JSON.stringify(familiarIps)
        );
      } catch {
        // 缓存写入失败不影响主逻辑
      }
    }
  }

  // 无历史数据 → 无法判断（新用户），给低分
  if (familiarIps.length === 0) {
    return { score: 5, reason: "新用户/无历史操作记录，暂时标记为低风险" };
  }

  // 当前 IP 在常用列表中 → 安全
  if (familiarIps.includes(context.ip)) return null;

  // 当前 IP 不在常用列表中 → 异常
  return {
    score: 20,
    reason: `当前 IP（${context.ip}）不在用户常用 IP 列表中（近 7 天常用 IP: ${familiarIps.join(", ")}）`,
  };
}

// ── 4. 批量操作检测 — 短期内大量操作 ──

async function checkBatchOperation(
  context: RiskContext
): Promise<{ score: number; reason: string } | null> {
  const db = getDb();
  const windowStart = new Date(Date.now() - BATCH_WINDOW_MINUTES * 60 * 1000);

  // 查询该用户在窗口期内所有操作的总数
  const [result] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(operationLogs)
    .where(
      and(
        eq(operationLogs.userId, context.userId),
        gte(operationLogs.createdAt, windowStart)
      )
    );

  if (!result || result.count < BATCH_THRESHOLD) return null;

  // 10-20 次 → 中等，20-50 次 → 高，50+ → 严重
  let score: number;
  if (result.count >= 50) {
    score = 40;
  } else if (result.count >= 20) {
    score = 30;
  } else {
    score = 20;
  }

  // 如果操作中包含大量失败记录，额外加重
  const [failResult] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(operationLogs)
    .where(
      and(
        eq(operationLogs.userId, context.userId),
        eq(operationLogs.status, "failure"),
        gte(operationLogs.createdAt, windowStart)
      )
    );

  const failRatio = failResult && result.count > 0
    ? failResult.count / result.count
    : 0;

  if (failRatio > 0.5) {
    score = Math.min(60, score + 15);
  }

  return {
    score,
    reason: `短期内大量操作（${BATCH_WINDOW_MINUTES} 分钟内 ${result.count} 次${
      failRatio > 0.5 ? `，其中失败 ${failResult!.count} 次（占比 ${(failRatio * 100).toFixed(0)}%）` : ""
    }）`,
  };
}

// ── 辅助：风险等级判定 ──

function getRiskLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}
