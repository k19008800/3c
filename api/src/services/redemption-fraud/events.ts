// ============================================================
//  3cloud (3C) — 兑换码风控 事件记录
// ============================================================

import { getDb } from "../../db/index.js";
import { redemptionFraudEvents } from "../../db/schema.js";
import { notifyFraudAlert } from "../redemption-notify.js";

export async function insertFraudEvent(params: {
  eventType: string;
  ip?: string;
  userId?: number;
  codeId?: number;
  code?: string;
  riskScore: number;
  detail?: Record<string, any>;
  severity: "warning" | "high" | "critical";
  acknowledged?: boolean;
  acknowledgedBy?: number;
  acknowledgedAt?: Date;
}): Promise<void> {
  const db = getDb();
  await db.insert(redemptionFraudEvents).values({
    eventType: params.eventType,
    ip: params.ip ?? null,
    userId: params.userId ?? null,
    codeId: params.codeId ?? null,
    code: params.code ?? null,
    riskScore: params.riskScore,
    detail: params.detail ? JSON.stringify(params.detail) : null,
    severity: params.severity,
    acknowledged: params.acknowledged ?? false,
    acknowledgedBy: params.acknowledgedBy ?? null,
    acknowledgedAt: params.acknowledgedAt ?? null,
  });

  // critical 级别事件通知管理员
  if (params.severity === "critical") {
    notifyFraudAlert({
      eventType: params.eventType,
      ip: params.ip ?? "",
      severity: params.severity,
      detail: params.detail ? JSON.stringify(params.detail) : "无详情",
    }).catch((err) => {
      console.error("[Fraud] 风控告警通知发送失败:", err);
    });
  }
}
