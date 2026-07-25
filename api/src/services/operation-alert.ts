// ============================================================
//  3cloud (3C) — 异常操作告警服务
//  核心检测逻辑：从 operation_logs 表检测异常操作模式
// ============================================================

import { getDb } from "../db/index.js";
import { operationLogs } from "../db/schema.js";
import { gte, eq, and, desc, sql } from "drizzle-orm";

// ── 类型定义 ──

export type AlertType =
  | "frequent_failure"
  | "remote_login"
  | "batch_delete"
  | "sensitive_operation";

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertEvent {
  type: AlertType;
  severity: AlertSeverity;
  userId: number;
  title: string;
  description: string;
}

// ── 检测函数 ──

export async function detectOperationAnomalies(
  userId?: number
): Promise<AlertEvent[]> {
  const now = new Date();
  const results = await Promise.all([
    detectFrequentFailure(now, userId),
    detectRemoteLogin(now, userId),
    detectBatchDelete(now, userId),
    detectSensitiveOperation(now, userId),
  ]);

  return results.flat();
}

// ── 规则 1: 频繁失败 ──
// 10 分钟内失败 >= 10 次 → severity: warning

async function detectFrequentFailure(
  now: Date,
  userId?: number
): Promise<AlertEvent[]> {
  const db = getDb();
  const windowStart = new Date(now.getTime() - 10 * 60 * 1000);

  const conditions = and(
    eq(operationLogs.status, "failure"),
    gte(operationLogs.createdAt, windowStart),
    userId ? eq(operationLogs.userId, userId) : undefined
  );

  const failures = await db
    .select({
      userId: operationLogs.userId,
      count: sql<number>`count(*)::int`,
    })
    .from(operationLogs)
    .where(conditions)
    .groupBy(operationLogs.userId)
    .having(sql`count(*) >= 10`);

  return failures.map((f) => ({
    type: "frequent_failure" as AlertType,
    severity: "warning" as AlertSeverity,
    userId: f.userId,
    title: "频繁操作失败",
    description: `用户在 10 分钟内操作失败 ${f.count} 次，已达到告警阈值`,
  }));
}

// ── 规则 2: 异地登录 ──
// 1 小时内不同 IP 登录 >= 3 次 → severity: critical

async function detectRemoteLogin(
  now: Date,
  userId?: number
): Promise<AlertEvent[]> {
  const db = getDb();
  const windowStart = new Date(now.getTime() - 1 * 60 * 60 * 1000);

  const conditions = and(
    eq(operationLogs.action, "login"),
    eq(operationLogs.status, "success"),
    gte(operationLogs.createdAt, windowStart),
    userId ? eq(operationLogs.userId, userId) : undefined
  );

  const logins = await db
    .select({
      userId: operationLogs.userId,
      ip: operationLogs.ip,
      count: sql<number>`count(DISTINCT ${operationLogs.ip})::int`,
    })
    .from(operationLogs)
    .where(conditions)
    .groupBy(operationLogs.userId)
    .having(sql`count(DISTINCT ${operationLogs.ip}) >= 3`);

  return logins.map((l) => ({
    type: "remote_login" as AlertType,
    severity: "critical" as AlertSeverity,
    userId: l.userId,
    title: "异地登录告警",
    description: `用户在 1 小时内从 ${l.count} 个不同 IP 地址登录`,
  }));
}

// ── 规则 3: 批量删除 ──
// 一次删除 >= 10 条 → severity: warning

async function detectBatchDelete(
  now: Date,
  userId?: number
): Promise<AlertEvent[]> {
  const db = getDb();
  // 使用 5 分钟滑动窗口检测批量删除操作
  const windowStart = new Date(now.getTime() - 5 * 60 * 1000);

  const conditions = and(
    sql`${operationLogs.action} LIKE '%delete%'`,
    gte(operationLogs.createdAt, windowStart),
    userId ? eq(operationLogs.userId, userId) : undefined
  );

  const deletes = await db
    .select({
      userId: operationLogs.userId,
      count: sql<number>`count(*)::int`,
    })
    .from(operationLogs)
    .where(conditions)
    .groupBy(operationLogs.userId)
    .having(sql`count(*) >= 10`);

  return deletes.map((d) => ({
    type: "batch_delete" as AlertType,
    severity: "warning" as AlertSeverity,
    userId: d.userId,
    title: "批量删除操作",
    description: `用户在短期内执行了 ${d.count} 次删除操作`,
  }));
}

// ── 规则 4: 敏感操作 ──
// password_change / user_delete / key_delete → severity: critical

const SENSITIVE_ACTIONS = ["change_password", "user_delete", "key_delete"];

async function detectSensitiveOperation(
  now: Date,
  userId?: number
): Promise<AlertEvent[]> {
  const db = getDb();
  const windowStart = new Date(now.getTime() - 5 * 60 * 1000);

  const conditions = and(
    sql`${operationLogs.action} IN (${sql.join(
      SENSITIVE_ACTIONS.map((a) => sql`${a}`),
      sql`, `
    )})`,
    gte(operationLogs.createdAt, windowStart),
    userId ? eq(operationLogs.userId, userId) : undefined
  );

  const ops = await db
    .select({
      userId: operationLogs.userId,
      action: operationLogs.action,
    })
    .from(operationLogs)
    .where(conditions)
    .orderBy(desc(operationLogs.createdAt));

  // 按用户分组
  const userMap = new Map<number, string[]>();
  for (const op of ops) {
    const arr = userMap.get(op.userId) || [];
    arr.push(op.action);
    userMap.set(op.userId, arr);
  }

  return Array.from(userMap.entries()).map(([uid, actions]) => ({
    type: "sensitive_operation" as AlertType,
    severity: "critical" as AlertSeverity,
    userId: uid,
    title: "敏感操作告警",
    description: `用户执行了敏感操作：${[...new Set(actions)].join("、")}`,
  }));
}
