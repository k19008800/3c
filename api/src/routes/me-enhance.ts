import type { FastifyInstance } from "fastify";
import { and, eq, sql, gte, lt, desc, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { users } from "../db/schema/users";
import { callLogs } from "../db/schema/call-logs";
import { apiKeys } from "../db/schema/api-keys";
import { keyPermissionChanges } from "../db/schema/key-permission-changes";
import { billingLogs } from "../db/schema/billing";

/**
 * §22 用户端体验增强 - 补充 API（§22.7~§22.12）
 * 对应 docs/SPEC-§22-用户端体验增强.md
 */

export function meEnhanceRoutes(app: FastifyInstance) {
  // §22.7 API Key 操作日志
  app.get("/me/keys/:keyId/changelog", async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const keyId = parseInt((req.params as any).keyId);

    // 验证 Key 归属
    const [key] = await db.select({ id: apiKeys.id }).from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
      .limit(1);
    if (!key) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "Key 不存在或无权限" });

    const logs = await db.select()
      .from(keyPermissionChanges)
      .where(eq(keyPermissionChanges.keyId, keyId))
      .orderBy(desc(keyPermissionChanges.changedAt))
      .limit(50);

    return { code: 0, data: logs, message: "ok" };
  });

  // §22.7 API Key 操作日志 - 全部 Key 合并
  app.get("/me/keys/changelog", async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const query = req.query as { limit?: string };
    const limit = Math.min(parseInt(query.limit ?? "50"), 100);

    // 获取用户所有 Key
    const userKeys = await db.select({ id: apiKeys.id }).from(apiKeys)
      .where(eq(apiKeys.userId, userId));

    if (userKeys.length === 0) return { code: 0, data: [], message: "ok" };

    const keyIds = userKeys.map((k: { id: number }) => k.id);
    const logs = await db.select()
      .from(keyPermissionChanges)
      .where(inArray(keyPermissionChanges.keyId, keyIds))
      .orderBy(desc(keyPermissionChanges.changedAt))
      .limit(limit);

    return { code: 0, data: logs, message: "ok" };
  });

  // §22.9 用量对比分析（本月 vs 上月）
  app.get("/me/stats/usage-compare", async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    try {
      const [monthRes] = await db
        .select({
          calls: sql`COUNT(*)`.mapWith(Number),
          tokens: sql`COALESCE(SUM(${callLogs.totalTokens}), 0)`.mapWith(Number),
          fails: sql`SUM(CASE WHEN ${callLogs.status} != 'success' THEN 1 ELSE 0 END)`.mapWith(Number),
          cost: sql`COALESCE(SUM(${billingLogs.actualCost}), 0)`.mapWith(Number),
        })
        .from(callLogs)
        .leftJoin(billingLogs, eq(callLogs.id, billingLogs.callLogId))
        .where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, startOfMonth)));

      const [prevRes] = await db
        .select({
          calls: sql`COUNT(*)`.mapWith(Number),
          tokens: sql`COALESCE(SUM(${callLogs.totalTokens}), 0)`.mapWith(Number),
          fails: sql`SUM(CASE WHEN ${callLogs.status} != 'success' THEN 1 ELSE 0 END)`.mapWith(Number),
          cost: sql`COALESCE(SUM(${billingLogs.actualCost}), 0)`.mapWith(Number),
        })
        .from(callLogs)
        .leftJoin(billingLogs, eq(callLogs.id, billingLogs.callLogId))
        .where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, startOfPrevMonth), lt(callLogs.createdAt, endOfPrevMonth)));

      return {
        code: 0,
        data: {
          current: {
            calls: Number(monthRes?.calls ?? 0),
            tokens: Number(monthRes?.tokens ?? 0),
            fails: Number(monthRes?.fails ?? 0),
            cost: Number(monthRes?.cost ?? 0),
          },
          previous: {
            calls: Number(prevRes?.calls ?? 0),
            tokens: Number(prevRes?.tokens ?? 0),
            fails: Number(prevRes?.fails ?? 0),
            cost: Number(prevRes?.cost ?? 0),
          },
        },
        message: "ok",
      };
    } catch (err) {
      return reply.code(500).send({ code: 500, error: "COMPARE_ERROR", message: "用量对比查询失败" });
    }
  });

  // §22.10 错误码自助排查 - 获取错误码说明
  app.get("/me/error-codes", async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const errorCodes: Record<string, { title: string; description: string; solution: string }> = {
      RATE_LIMITED: {
        title: "请求频率超限",
        description: "API 调用超过每分钟/每秒限额",
        solution: "降低请求频率，或升级套餐提升限额",
      },
      INSUFFICIENT_BALANCE: {
        title: "余额不足",
        description: "账户余额不足以支付本次请求费用",
        solution: "请前往充值中心充值",
      },
      MODEL_UNAVAILABLE: {
        title: "模型不可用",
        description: "请求的模型当前处于不可用状态",
        solution: "请尝试其他模型，或稍后重试",
      },
      INVALID_API_KEY: {
        title: "API Key 无效",
        description: "提供的 API Key 不存在或已禁用",
        solution: "请检查 API Key 是否正确，或重新创建",
      },
      INSUFFICIENT_PERMISSION: {
        title: "权限不足",
        description: "API Key 没有访问请求模型的权限",
        solution: "请在 API Key 管理页面开启对应模型权限",
      },
      CONTEXT_TOO_LONG: {
        title: "上下文超出限制",
        description: "输入 Token 超出模型最大上下文长度",
        solution: "减少输入内容长度，或选择支持更长上下文的模型",
      },
      PROVIDER_ERROR: {
        title: "供应商错误",
        description: "上游 AI 供应商返回错误",
        solution: "系统会自动切换备用供应商，请稍后重试",
      },
      BUDGET_EXCEEDED: {
        title: "预算超限",
        description: "本月消费已超出设置的预算上限",
        solution: "请调整预算限额，或等待下个账单周期",
      },
    };

    return { code: 0, data: errorCodes, message: "ok" };
  });

  // §22.12 统一数据导出
  app.post("/me/export", async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const body = req.body as {
      type: "call_logs" | "billing" | "api_keys";
      dateFrom?: string;
      dateTo?: string;
      format?: "csv" | "json";
    };

    const format = body.format ?? "csv";
    const dateFrom = body.dateFrom ? new Date(body.dateFrom) : new Date(Date.now() - 30 * 86400000);
    const dateTo = body.dateTo ? new Date(body.dateTo) : new Date();

    try {
      let rows: any[] = [];
      let headers: string[] = [];

      if (body.type === "call_logs") {
        const data = await db.select()
          .from(callLogs)
          .where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, dateFrom), lt(callLogs.createdAt, dateTo)))
          .orderBy(desc(callLogs.id))
          .limit(10000);

        rows = data;
        headers = ["id", "modelId", "vendorId", "requestTokens", "responseTokens", "totalTokens", "costCents", "status", "latencyMs", "createdAt"];
      } else if (body.type === "billing") {
        const data = await db.select()
          .from(billingLogs)
          .where(and(eq(billingLogs.userId, userId), gte(billingLogs.createdAt, dateFrom), lt(billingLogs.createdAt, dateTo)))
          .orderBy(desc(billingLogs.id))
          .limit(10000);

        rows = data;
        headers = ["id", "callLogId", "estimatedCost", "actualCost", "status", "createdAt"];
      } else if (body.type === "api_keys") {
        const data = await db.select({
          id: apiKeys.id,
          name: apiKeys.name,
          prefix: apiKeys.keyPrefix,
          status: apiKeys.status,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.userId, userId))
        .orderBy(desc(apiKeys.id));

        rows = data;
        headers = ["id", "name", "prefix", "status", "createdAt"];
      }

      if (format === "csv") {
        const csv = [
          headers.join(","),
          ...rows.map((r: any) => headers.map((h: string) => {
            const v = r[h as keyof typeof r];
            return v !== null && v !== undefined ? String(v).replace(/,/g, " ") : "";
          }).join(",")),
        ].join("\n");

        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="${body.type}-${dateFrom.toISOString().slice(0,10)}.csv"`);
        return csv;
      }

      return { code: 0, data: rows, message: "ok" };
    } catch (err) {
      return reply.code(500).send({ code: 500, error: "EXPORT_ERROR", message: "导出失败" });
    }
  });
}
