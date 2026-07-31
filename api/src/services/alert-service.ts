import { eq, and, gt } from "drizzle-orm";
import { db } from "../db/index";
import { monitoringRules, monitoringAlerts } from "../db/schema/monitoring";

/**
 * 告警引擎（§5.4）
 * 7 项告警指标检测 + 告警事件记录 + 静默去重
 */

export type AlertType =
  | "api_failure_rate"
  | "vendor_availability"
  | "response_p95"
  | "platform_balance"
  | "user_failure_rate"
  | "disk_usage"
  | "cpu_usage";

export type Severity = "critical" | "warning" | "info";

/**
 * 告警评估入口：传入某项指标当前值，与规则阈值比对，触发则记录告警
 * 带静默去重（同类型在静默期内不重复触发）
 */
export async function evaluateAlert(params: {
  type: AlertType;
  value: number;
  message?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ triggered: boolean; alertId?: string; severity?: Severity }> {
  const { type, value, message, metadata } = params;

  // 读取规则
  const rules = await db.select().from(monitoringRules).where(and(eq(monitoringRules.type, type), eq(monitoringRules.enabled, true)));
  if (rules.length === 0) return { triggered: false };

  // 对每个启用规则判断
  for (const rule of rules) {
    // 判断是否超过阈值（≥ 或 ≤ 取决于指标语义，简化：统一按"正向超阈"处理，
    // 具体方向由 metadata.direction 或规则类型决定）
    const triggeredValue = value >= rule.threshold;
    if (!triggeredValue) continue;

    // 静默去重：检查最近是否有同类未恢复告警
    const silencePeriodSec = rule.silencePeriod ?? 300;
    const recent = await db
      .select({ id: monitoringAlerts.id })
      .from(monitoringAlerts)
      .where(
        and(
          eq(monitoringAlerts.type, type),
          eq(monitoringAlerts.resolved, false),
          gt(monitoringAlerts.timestamp, new Date(Date.now() - silencePeriodSec * 1000)),
        ),
      )
      .limit(1);

    if (recent.length > 0) {
      // 静默期内已有未恢复告警，不重复
      return { triggered: true, severity: rule.severity as Severity };
    }

    // 创建告警
    const now = new Date();
    const alert = await db
      .insert(monitoringAlerts)
      .values({
        type,
        severity: rule.severity as Severity,
        message: message ?? `${rule.name} 当前值 ${value} 超过阈值 ${rule.threshold}`,
        value,
        threshold: rule.threshold,
        timestamp: now,
        metadata: metadata ?? null,
      })
      .returning({ id: monitoringAlerts.id });

    const alertId = alert[0]?.id;
    if (alertId) {
      // TODO(Phase 1): 触发通知推送（站内/邮件/WebSocket），走 notification 队列
    }
    return { triggered: true, alertId: String(alertId), severity: rule.severity as Severity };
  }

  return { triggered: false };
}

/**
 * 手动确认告警
 */
export async function acknowledgeAlert(alertId: string, acknowledgedBy?: string): Promise<boolean> {
  const res = await db
    .update(monitoringAlerts)
    .set({ acknowledged: true, acknowledgedAt: new Date(), resolvedBy: acknowledgedBy as any })
    .where(eq(monitoringAlerts.id, alertId as any));
  return (res.rowCount ?? 0) > 0;
}

/**
 * 告警恢复（标记 resolved）
 */
export async function resolveAlert(alertId: string): Promise<boolean> {
  const res = await db
    .update(monitoringAlerts)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(eq(monitoringAlerts.id, alertId as any));
  return (res.rowCount ?? 0) > 0;
}
