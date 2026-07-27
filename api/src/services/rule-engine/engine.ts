// ============================================================
//  3cloud (3C) — 安全自动规则引擎 — 核心引擎
// ============================================================

import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { logger } from "../../logger.js";
import { and, eq, gte, sql, inArray } from "drizzle-orm";
import { securityAutoRules, securityEvents, auditLogs, users, userNotifications } from "../../db/schema.js";

export interface RuleExecutionDetail {
  ruleId: number;
  ruleName: string;
  action: string;
  eventType: string;
  triggered: boolean;
  eventCount: number;
  threshold: number;
  executedAction?: string;
  details?: string;
  error?: string;
}

export interface EngineResult {
  executed: number;
  details: RuleExecutionDetail[];
}

async function evaluateAndExecuteRule(
  rule: typeof securityAutoRules.$inferSelect,
  db: ReturnType<typeof getDb>,
  redis: ReturnType<typeof getRedis>,
): Promise<RuleExecutionDetail> {
  const { id: ruleId, name: ruleName, eventType, countThreshold, timeWindowSeconds, action, actionParams } = rule;

  const since = new Date(Date.now() - timeWindowSeconds * 1000);
  const events = await db.select({ id: securityEvents.id, userId: securityEvents.userId, ip: securityEvents.ip, eventType: securityEvents.eventType })
    .from(securityEvents).where(and(eq(securityEvents.eventType, eventType as any), gte(securityEvents.createdAt, since)));
  const eventCount = events.length;

  if (eventCount < countThreshold) {
    return { ruleId, ruleName, action, eventType, triggered: false, eventCount, threshold: countThreshold };
  }

  logger.info({ ruleId, ruleName, eventType, eventCount, threshold: countThreshold, action }, "[AutoRule] 规则触发");

  const uniqueIps = [...new Set(events.filter(e => e.ip).map(e => e.ip!))];
  const uniqueUserIds = [...new Set(events.filter(e => e.userId).map(e => e.userId!))];

  let executedAction = action;
  let actionDetails = "";

  switch (action) {
    case "ban_ip": {
      const durationSeconds = (actionParams as any)?.durationSeconds ?? 3600;
      let bannedCount = 0;
      for (const ip of uniqueIps) {
        const key = `risk:ban:ip:${ip}`;
        if (!(await redis.exists(key))) { await redis.setex(key, durationSeconds, String(Date.now())); bannedCount++; }
      }
      actionDetails = `封禁 ${bannedCount}/${uniqueIps.length} 个 IP，时长 ${durationSeconds}s`;
      break;
    }
    case "ban_user": {
      const durationSeconds = (actionParams as any)?.durationSeconds ?? 86400;
      const banDurationMs = durationSeconds * 1000;
      let bannedCount = 0;
      for (const userId of uniqueUserIds) {
        const key = `risk:ban:user:${userId}`;
        if (!(await redis.exists(key))) { await redis.setex(key, durationSeconds, `${Date.now()}:${banDurationMs}`); bannedCount++; }
      }
      actionDetails = `封禁 ${bannedCount}/${uniqueUserIds.length} 个用户，时长 ${durationSeconds}s`;
      break;
    }
    case "notify_admin": {
      actionDetails = "需要通知管理员";
      break;
    }
    case "limit_login": {
      const lockMinutes = (actionParams as any)?.lockMinutes ?? 30;
      let limitedCount = 0;
      for (const userId of uniqueUserIds) {
        const key = `risk:limit:login:${userId}`;
        if (!(await redis.exists(key))) { await redis.setex(key, lockMinutes * 60, String(Date.now())); limitedCount++; }
      }
      actionDetails = `限制 ${limitedCount}/${uniqueUserIds.length} 个用户的登录，时长 ${lockMinutes} 分钟`;
      break;
    }
    default:
      actionDetails = `未知动作: ${action}`;
      executedAction = "unknown";
  }

  // 通知管理员
  const adminRoles = ["super_admin", "admin", "ops", "support"];
  const adminUsers = await db.select({ id: users.id }).from(users).where(inArray(users.role, adminRoles as any));
  if (adminUsers.length > 0) {
    const notifTitle = `安全自动规则触发：${ruleName}`;
    const notifContent = `规则「${ruleName}」已触发。事件类型：${eventType}，触发次数：${eventCount}（阈值：${countThreshold}），执行动作：${action}，执行详情：${actionDetails}。`;
    for (const a of adminUsers) {
      await db.insert(userNotifications).values({ userId: a.id, type: "system" as any, title: notifTitle, content: notifContent, refType: "security_auto_rule", refId: ruleId }).catch(err => logger.error({ err, adminId: a.id }, "[AutoRule] 管理员通知失败"));
    }
    actionDetails += ` | 已通知 ${adminUsers.length} 名管理员`;
  }

  // 审计日志
  await db.insert(auditLogs).values({ operatorId: 0, action: "config_update" as any, targetType: "security_auto_rule", targetId: ruleId, description: `自动规则触发: ${ruleName} (${eventType} ${eventCount}≥${countThreshold}) → ${action}: ${actionDetails}`, before: null, after: { ruleId, ruleName, eventType, eventCount, threshold: countThreshold, action, actionDetails } }).catch(err => logger.error({ err, ruleId }, "[AutoRule] 审计日志写入失败"));

  return { ruleId, ruleName, action, eventType, triggered: true, eventCount, threshold: countThreshold, executedAction, details: actionDetails };
}

export async function checkAndExecuteRules(): Promise<EngineResult> {
  const db = getDb();
  const redis = getRedis();
  const details: RuleExecutionDetail[] = [];

  const rules = await db.select().from(securityAutoRules).where(eq(securityAutoRules.enabled, true)).orderBy(securityAutoRules.id);
  if (rules.length === 0) return { executed: 0, details: [] };

  let totalExecuted = 0;
  for (const rule of rules) {
    try {
      const result = await evaluateAndExecuteRule(rule, db, redis);
      details.push(result);
      if (result.triggered) totalExecuted++;
    } catch (err: any) {
      logger.error({ err, ruleId: rule.id, ruleName: rule.name }, "[AutoRule] 规则执行异常");
      details.push({ ruleId: rule.id, ruleName: rule.name, action: rule.action, eventType: rule.eventType, triggered: false, eventCount: 0, threshold: rule.countThreshold, error: err?.message ?? String(err) });
    }
  }
  return { executed: totalExecuted, details };
}
