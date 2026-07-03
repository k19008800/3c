// ============================================================
//  3cloud (3C) — 请求日志中间件
//  记录审计操作到 audit_logs 表
// ============================================================

import { getDb } from "../db/index.js";
import { auditLogs } from "../db/schema.js";

/**
 * 记录审计日志
 * action 必须是 auditActionEnum 中定义的值：
 *   user_create, user_disable, user_enable, user_password_reset,
 *   balance_adjust, role_change, real_name_approve, real_name_reject,
 *   withdraw_approve, withdraw_reject, withdraw_first_approve, withdraw_second_approve, withdraw_paid,
 *   agent_create, agent_update, config_update, vendor_create, vendor_update,
 *   model_create, model_update, model_delete, team_create, team_update,
 *   team_delete, member_join, member_leave, api_key_create, api_key_delete
 */
export async function recordAuditLog(
  operatorId: number,
  action: string,
  targetType: string,
  targetId: number | null,
  before: any,
  after: any,
  ip: string,
) {
  const db = getDb();
  try {
    await db.insert(auditLogs).values({
      operatorId,
      action: action as any,
      targetType,
      targetId,
      before: before ?? null,
      after: after ?? null,
      ip,
      description: `${action} ${targetType}#${targetId}`,
    });
  } catch (err) {
    console.error("[Audit] recordAuditLog 写入失败:", (err as Error).message);
  }
}
