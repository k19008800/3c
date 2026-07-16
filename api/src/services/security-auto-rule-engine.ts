// ============================================================
//  3cloud (3C) — 安全自动规则执行引擎
//  定期检查 security_events，根据 auto-rules 自动执行处置
// ============================================================

import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import { logger } from "../logger.js";
import { and, eq, gte, sql, inArray } from "drizzle-orm";
import {
  securityAutoRules,
  securityEvents,
  auditLogs,
  users,
  userNotifications,
} from "../db/schema.js";

// ── 执行结果类型 ──

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

// ── 核心执行函数：读取所有启用规则并逐一检查 ──

export async function checkAndExecuteRules(): Promise<EngineResult> {
  const db = getDb();
  const redis = getRedis();
  const details: RuleExecutionDetail[] = [];

  // 1. 读取所有启用规则
  const rules = await db
    .select()
    .from(securityAutoRules)
    .where(eq(securityAutoRules.enabled, true))
    .orderBy(securityAutoRules.id);

  if (rules.length === 0) {
    return { executed: 0, details: [] };
  }

  let totalExecuted = 0;

  for (const rule of rules) {
    try {
      const result = await evaluateAndExecuteRule(rule, db, redis);
      details.push(result);
      if (result.triggered) totalExecuted++;
    } catch (err: any) {
      logger.error({ err, ruleId: rule.id, ruleName: rule.name }, "[AutoRule] 规则执行异常");
      details.push({
        ruleId: rule.id,
        ruleName: rule.name,
        action: rule.action,
        eventType: rule.eventType,
        triggered: false,
        eventCount: 0,
        threshold: rule.countThreshold,
        error: err?.message ?? String(err),
      });
    }
  }

  return { executed: totalExecuted, details };
}

// ── 评估单条规则并执行 ──

async function evaluateAndExecuteRule(
  rule: typeof securityAutoRules.$inferSelect,
  db: ReturnType<typeof getDb>,
  redis: ReturnType<typeof getRedis>,
): Promise<RuleExecutionDetail> {
  const {
    id: ruleId,
    name: ruleName,
    eventType,
    countThreshold,
    timeWindowSeconds,
    action,
    actionParams,
  } = rule;

  // 2. 查询时间窗口内的事件数量
  const since = new Date(Date.now() - timeWindowSeconds * 1000);
  const events = await db
    .select({
      id: securityEvents.id,
      userId: securityEvents.userId,
      ip: securityEvents.ip,
      eventType: securityEvents.eventType,
    })
    .from(securityEvents)
    .where(
      and(
        eq(securityEvents.eventType, eventType as any),
        gte(securityEvents.createdAt, since),
      ),
    );

  const eventCount = events.length;

  // 3. 判断是否触发阈值
  if (eventCount < countThreshold) {
    return {
      ruleId,
      ruleName,
      action,
      eventType,
      triggered: false,
      eventCount,
      threshold: countThreshold,
    };
  }

  logger.info(
    { ruleId, ruleName, eventType, eventCount, threshold: countThreshold, action },
    "[AutoRule] 规则触发",
  );

  // 4. 提取 IP 和 userId 去重
  const uniqueIps = [...new Set(events.filter((e) => e.ip).map((e) => e.ip!))];
  const uniqueUserIds = [
    ...new Set(events.filter((e) => e.userId).map((e) => e.userId!)),
  ];

  let executedAction = action;
  let actionDetails = "";

  // 5. 执行对应动作
  switch (action) {
    case "ban_ip": {
      const durationSeconds = (actionParams as any)?.durationSeconds ?? 3600; // 默认1小时
      let bannedCount = 0;
      for (const ip of uniqueIps) {
        const key = `risk:ban:ip:${ip}`;
        const exists = await redis.exists(key);
        if (!exists) {
          await redis.setex(key, durationSeconds, String(Date.now()));
          bannedCount++;
        }
      }
      actionDetails = `封禁 ${bannedCount}/${uniqueIps.length} 个 IP，时长 ${durationSeconds}s`;
      break;
    }

    case "ban_user": {
      const durationSeconds = (actionParams as any)?.durationSeconds ?? 86400; // 默认24小时
      const banDurationMs = durationSeconds * 1000;
      let bannedCount = 0;
      for (const userId of uniqueUserIds) {
        const key = `risk:ban:user:${userId}`;
        const exists = await redis.exists(key);
        if (!exists) {
          await redis.setex(
            key,
            durationSeconds,
            `${Date.now()}:${banDurationMs}`,
          );
          bannedCount++;
        }
      }
      actionDetails = `封禁 ${bannedCount}/${uniqueUserIds.length} 个用户，时长 ${durationSeconds}s`;
      break;
    }

    case "notify_admin": {
      // 动作本身即是通知管理员，标记并留给下方统一发送逻辑处理
      actionDetails = "需要通知管理员";
      break;
    }

    case "limit_login": {
      // 对触发事件的用户增加登录限制：修改用户安全配置或创建用户级别特定限制
      const lockMinutes = (actionParams as any)?.lockMinutes ?? 30;
      let limitedCount = 0;
      for (const userId of uniqueUserIds) {
        // 增加一个临时登录限制标记（提高该用户的严格级别）
        const limitKey = `risk:limit:login:${userId}`;
        const exists = await redis.exists(limitKey);
        if (!exists) {
          // 设置期间该用户每次登录失败都将触发更严格的处理
          await redis.setex(limitKey, lockMinutes * 60, String(Date.now()));
          limitedCount++;
        }
      }
      actionDetails = `限制 ${limitedCount}/${uniqueUserIds.length} 个用户的登录，时长 ${lockMinutes} 分钟`;
      break;
    }

    default:
      actionDetails = `未知动作: ${action}`;
      executedAction = "unknown";
  }

  // ── Goal 3: 系统级 admin 通知推送（所有触发执行的规则均通知管理员）──
  {
    const adminRoles = ["super_admin", "admin", "ops", "support"];
    const adminUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, adminRoles as any));

    if (adminUsers.length > 0) {
      const notifTitle = `安全自动规则触发：${ruleName}`;
      const notifContent = `规则「${ruleName}」已触发。事件类型：${eventType}，触发次数：${eventCount}（阈值：${countThreshold}），执行动作：${action}，执行详情：${actionDetails}。`;
      for (const admin of adminUsers) {
        await db
          .insert(userNotifications)
          .values({
            userId: admin.id,
            type: "system" as any,
            title: notifTitle,
            content: notifContent,
            refType: "security_auto_rule",
            refId: ruleId,
          })
          .catch((err) => {
            logger.error({ err, adminId: admin.id }, "[AutoRule] 管理员通知失败");
          });
      }
      actionDetails += ` | 已通知 ${adminUsers.length} 名管理员`;
    }
  }

  // 6. 记录执行历史到 audit_logs
  const operatorId = 0; // 系统自动触发
  await db
    .insert(auditLogs)
    .values({
      operatorId,
      action: "config_update" as any,
      targetType: "security_auto_rule",
      targetId: ruleId,
      description: `自动规则触发: ${ruleName} (${eventType} ${eventCount}≥${countThreshold}) → ${action}: ${actionDetails}`,
      before: null,
      after: {
        ruleId,
        ruleName,
        eventType,
        eventCount,
        threshold: countThreshold,
        action,
        actionDetails,
      },
    })
    .catch((err) => {
      logger.error({ err, ruleId }, "[AutoRule] 审计日志写入失败");
    });

  return {
    ruleId,
    ruleName,
    action,
    eventType,
    triggered: true,
    eventCount,
    threshold: countThreshold,
    executedAction,
    details: actionDetails,
  };
}

// ── 单次检查（便于 cron 调用） ──

export async function runAutoRuleCheck(): Promise<void> {
  try {
    const result = await checkAndExecuteRules();
    if (result.executed > 0) {
      logger.info(
        { executed: result.executed, total: result.details.length },
        "[AutoRule] 自动规则检查完成",
      );
    }
  } catch (err) {
    logger.error({ err }, "[AutoRule] 自动规则检查异常");
  }
}
