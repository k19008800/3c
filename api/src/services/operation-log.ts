// ============================================================
//  3cloud (3C) — 操作日志工具函数
//  用于在用户端/代理商路由中异步写入操作记录
// ============================================================

import { getDb } from "../db/index.js";
import { operationLogs } from "../db/schema.js";

export interface LogOperationInput {
  userId: number;
  userRole: string;
  category: "auth" | "api_key" | "finance" | "profile" | "agent" | "system";
  action: string;
  targetType?: string;
  targetId?: number;
  resourceName?: string;
  summary?: string;
  metadata?: Record<string, any>;
  status?: "success" | "failure" | "pending";
  errorReason?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * 异步写入操作日志 — 不阻塞请求
 * 调用方传 await/then 均可，推荐不 await（fire-and-forget）
 */
export async function logOperation(input: LogOperationInput): Promise<void> {
  try {
    const db = getDb();
    await db.insert(operationLogs).values({
      userId: input.userId,
      userRole: input.userRole,
      category: input.category,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      resourceName: input.resourceName ?? null,
      summary: input.summary ?? null,
      metadata: input.metadata ?? null,
      status: input.status ?? "success",
      errorReason: input.errorReason ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (err) {
    // 操作日志写入失败不影响主流程
    console.error("[operation_log] write failed:", err);
  }
}
