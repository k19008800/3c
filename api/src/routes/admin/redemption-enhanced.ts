// ============================================================
//  3cloud (3C) — Admin 兑换码增强路由
//
//  POST  /api/v1/admin/redemption/batch-action    — 批量操作
//  GET   /api/v1/admin/redemption/export           — 导出
//  POST  /api/v1/admin/redemption/risk-action      — 风控批量处置
//  GET   /api/v1/admin/redemption/audit-logs       — 审计日志
//  GET   /api/v1/admin/finance/codes/reports/:type — 报表导出
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, inArray, gte, lte, or } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  agents,
  redemptionBatches,
  redemptionCodes,
  redemptionLogs,
  redemptionFraudEvents,
  auditLogs,
  financeCostRecords,
} from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service.js";
import { banIp } from "../../services/redemption-fraud.js";
import { getRedis } from "../../redis.js";

function isAdminRole(role: string): boolean {
  return ["super_admin", "admin", "finance_ops", "ops"].includes(role);
}

export async function adminRedemptionEnhancedRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ════════════════════════════════════════════════════════════
  //  POST /api/v1/admin/redemption/batch-action — 批量操作
  //  actions: disable, enable, revoke
  // ════════════════════════════════════════════════════════════
  app.post("/api/v1/admin/redemption/batch-action", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const userId = request.user!.userId;
      const userRole = request.user!.role;

      if (!isAdminRole(userRole)) {
        reply.status(403).send({ code: 403, data: null, message: "仅管理员可操作" });
        return;
      }

      const body = request.body as {
        action: "disable" | "enable" | "revoke";
        codeIds?: number[];
        batchId?: number;
        agentId?: number;
        reason?: string;
      };

      if (!body.action) {
        reply.status(400).send({ code: 400, data: null, message: "action 必填" });
        return;
      }

      if (!body.codeIds && !body.batchId && !body.agentId) {
        reply.status(400).send({ code: 400, data: null, message: "请提供 codeIds, batchId 或 agentId" });
        return;
      }

      const conditions: any[] = [];

      if (body.codeIds && body.codeIds.length > 0) {
        conditions.push(inArray(redemptionCodes.id, body.codeIds));
      }
      if (body.batchId) {
        conditions.push(eq(redemptionCodes.batchId, body.batchId));
      }
      if (body.agentId) {
        // 通过 agent 找其 user, 再找 batch
        const [agent] = await db
          .select({ userId: agents.userId })
          .from(agents)
          .where(eq(agents.id, body.agentId))
          .limit(1);
        if (agent) {
          const agentBatches = db
            .select({ id: redemptionBatches.id })
            .from(redemptionBatches)
            .where(eq(redemptionBatches.creatorId, agent.userId));
          conditions.push(eq(redemptionCodes.batchId, sql`ANY(${agentBatches})`));
        }
      }

      let newStatus: string;
      if (body.action === "disable") newStatus = "disabled";
      else if (body.action === "enable") newStatus = "unused";
      else newStatus = "revoked";

      const result = await db
        .update(redemptionCodes)
        .set({ status: newStatus as any })
        .where(and(...conditions))
        .returning({ id: redemptionCodes.id });

      const updatedCount = result.length;

      // 记录审计日志
      try {
        await db.insert(auditLogs).values({
          operatorId: userId,
          action: "config_update",
          targetType: "redemption_code",
          after: { action: body.action, count: updatedCount, reason: body.reason ?? "" },
          ip: request.ip,
          description: `批量 ${body.action} ${updatedCount} 个兑换码`,
        });
      } catch {
        request.log.warn({ action: "batch_action" }, "audit log write failed");
      }

      reply.status(200).send({
        code: 0,
        data: { action: body.action, updatedCount },
        message: `批量 ${body.action === "disable" ? "停用" : body.action === "enable" ? "启用" : "作废"}完成，共 ${updatedCount} 个`,
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/redemption/export — 导出
  // ════════════════════════════════════════════════════════════
  app.get("/api/v1/admin/redemption/export", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const query = request.query as {
        format?: string; // csv | json
        status?: string;
        startDate?: string;
        endDate?: string;
        batchId?: string;
      };

      const conditions: any[] = [];
      if (query.status) conditions.push(eq(redemptionCodes.status, query.status as any));
      if (query.batchId) conditions.push(eq(redemptionCodes.batchId, parseInt(query.batchId, 10)));

      const codes = await db
        .select({
          id: redemptionCodes.id,
          code: redemptionCodes.code,
          amount: redemptionCodes.amount,
          status: redemptionCodes.status,
          usesLeft: redemptionCodes.usesLeft,
          usedAt: redemptionCodes.usedAt,
          createdAt: redemptionCodes.createdAt,
          batchId: redemptionCodes.batchId,
          batchName: redemptionBatches.name,
          creatorId: redemptionBatches.creatorId,
        })
        .from(redemptionCodes)
        .leftJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(redemptionCodes.createdAt))
        .limit(10000);

      const format = query.format ?? "csv";

      if (format === "json") {
        reply.status(200).send({
          code: 0,
          data: codes,
          message: "ok",
        });
        return;
      }

      // CSV
      const header = "ID,兑换码,面额,状态,剩余次数,使用时间,创建时间,批次ID,批次名";
      const rows = codes.map((c) =>
        [
          c.id,
          c.code,
          c.amount,
          c.status,
          c.usesLeft,
          c.usedAt?.toISOString() ?? "",
          c.createdAt.toISOString(),
          c.batchId,
          c.batchName ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", "attachment; filename=admin-redemption-codes.csv");
      reply.status(200).send({
        code: 0,
        data: { csv: [header, ...rows].join("\n") },
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  //  POST /api/v1/admin/redemption/risk-action — 风控批量处置
  //  基于风控事件 ID 批量作废码或封禁 IP
  // ════════════════════════════════════════════════════════════
  app.post("/api/v1/admin/redemption/risk-action", {
    preHandler: [requirePerm(Perm.SECURITY_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const adminUserId = request.user!.userId;

      const body = request.body as {
        action: "revoke_codes" | "ban_ip" | "acknowledge";
        eventIds: number[];
        reason?: string;
      };

      if (!body.action || !body.eventIds?.length) {
        reply.status(400).send({ code: 400, data: null, message: "action 和 eventIds 必填" });
        return;
      }

      // 获取风控事件
      const events = await db
        .select()
        .from(redemptionFraudEvents)
        .where(inArray(redemptionFraudEvents.id, body.eventIds));

      if (events.length === 0) {
        reply.status(404).send({ code: 404, data: null, message: "未找到风控事件" });
        return;
      }

      let codeIds: number[] = [];
      let ips: string[] = [];

      for (const ev of events) {
        if (ev.codeId) codeIds.push(ev.codeId);
        if (ev.ip) ips.push(ev.ip);
      }

      if (body.action === "revoke_codes" && codeIds.length > 0) {
        await db
          .update(redemptionCodes)
          .set({ status: "revoked" })
          .where(inArray(redemptionCodes.id, codeIds));
      }

      if (body.action === "ban_ip") {
        const redis = getRedis();
        for (const ip of [...new Set(ips)]) {
          if (ip) {
            await banIp(ip, body.reason ?? "风控批量封禁", adminUserId);
          }
        }
      }

      if (body.action === "acknowledge") {
        await db
          .update(redemptionFraudEvents)
          .set({ acknowledged: true, acknowledgedBy: adminUserId, acknowledgedAt: new Date() })
          .where(inArray(redemptionFraudEvents.id, body.eventIds));
      }

      // 审计日志
      await db.insert(auditLogs).values({
        operatorId: adminUserId,
        action: "config_update",
        targetType: "redemption_fraud",
        after: { action: body.action, eventIdCount: body.eventIds.length, reason: body.reason ?? "" },
        ip: request.ip,
        description: `风控处置: ${body.action}, ${body.eventIds.length} 个事件`,
      });

      reply.status(200).send({
        code: 0,
        data: {
          action: body.action,
          processedEvents: body.eventIds.length,
          revokedCodes: body.action === "revoke_codes" ? codeIds.length : 0,
          bannedIps: body.action === "ban_ip" ? [...new Set(ips)].length : 0,
        },
        message: "风控处置完成",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/redemption/audit-logs — 审计日志
  // ════════════════════════════════════════════════════════════
  app.get("/api/v1/admin/redemption/audit-logs", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const query = request.query as {
        page?: string;
        pageSize?: string;
        operatorId?: string;
        action?: string;
        startDate?: string;
        endDate?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;

      // 从 audit_logs 表查询关联兑换码的操作
      const conditions: any[] = [
        sql`CAST(${auditLogs.action} AS text) LIKE 'code_%' OR CAST(${auditLogs.action} AS text) LIKE 'fraud_%' OR CAST(${auditLogs.action} AS text) LIKE '%redemption%' OR CAST(${auditLogs.action} AS text) LIKE '%campaign%'`,
      ];

      if (query.operatorId) {
        conditions.push(eq(auditLogs.operatorId, parseInt(query.operatorId, 10)));
      }
      if (query.action) {
        conditions.push(sql`${auditLogs.action}::text = ${query.action}`);
      }
      if (query.startDate) {
        conditions.push(gte(auditLogs.createdAt, new Date(query.startDate)));
      }
      if (query.endDate) {
        conditions.push(lte(auditLogs.createdAt, new Date(query.endDate)));
      }

      const [totalResult] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(and(...conditions));

      const rows = await db
        .select({
          id: auditLogs.id,
          operatorId: auditLogs.operatorId,
          operatorEmail: users.email,
          action: auditLogs.action,
          targetType: auditLogs.targetType,
          targetId: auditLogs.targetId,
          description: auditLogs.description,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.operatorId, users.id))
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(pageSize)
        .offset(offset);

      reply.status(200).send({
        code: 0,
        data: {
          list: rows.map((r) => ({
            id: r.id,
            operatorId: r.operatorId,
            operator: r.operatorEmail ?? `用户 #${r.operatorId}`,
            action: r.action,
            targetType: r.targetType,
            targetId: r.targetId,
            detail: r.description,
            createdAt: r.createdAt.toISOString(),
          })),
          total: totalResult?.total ?? 0,
          page,
          pageSize,
        },
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/finance/codes/reports/:type — 报表导出
  //  type: monthly | agent | campaign
  // ════════════════════════════════════════════════════════════
  app.get("/api/v1/admin/finance/codes/reports/:type", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { type } = request.params as { type: string };
      const query = request.query as { period?: string };

      const periodStr = query.period ?? (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      })();

      const [yearStr, monthStr] = periodStr.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      if (isNaN(year) || isNaN(month)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的月份" });
        return;
      }

      const periodStart = new Date(Date.UTC(year, month - 1, 1));
      const periodEnd = new Date(Date.UTC(year, month, 1));

      let csv = "";

      if (type === "monthly") {
        // 月度成本报表
        const records = await db
          .select()
          .from(financeCostRecords)
          .where(
            and(
              sql`${financeCostRecords.period} >= ${periodStart}::timestamptz`,
              sql`${financeCostRecords.period} < ${periodEnd}::timestamptz`,
            ),
          )
          .orderBy(financeCostRecords.costType);

        csv = "类型,面值,已使用,成本,补贴,归因收入,ROI\n";
        for (const r of records) {
          csv += `${r.costType},${r.totalFace},${r.totalUsed},${r.costAmount},${r.subsidyAmount},${r.revenueAttributed},${r.roi ?? ""}\n`;
        }
      } else if (type === "agent") {
        // 代理成本报表
        const records = await db
          .select({
            agentId: financeCostRecords.agentId,
            totalFace: sql<number>`coalesce(sum(${financeCostRecords.totalFace}), 0)`,
            totalUsed: sql<number>`coalesce(sum(${financeCostRecords.totalUsed}), 0)`,
            costAmount: sql<number>`coalesce(sum(${financeCostRecords.costAmount}), 0)`,
            subsidyAmount: sql<number>`coalesce(sum(${financeCostRecords.subsidyAmount}), 0)`,
          })
          .from(financeCostRecords)
          .where(
            and(
              eq(financeCostRecords.costType, "agent_cost"),
              sql`${financeCostRecords.period} >= ${periodStart}::timestamptz`,
              sql`${financeCostRecords.period} < ${periodEnd}::timestamptz`,
            ),
          )
          .groupBy(financeCostRecords.agentId);

        csv = "代理ID,面值,已使用,成本,补贴\n";
        for (const r of records) {
          csv += `${r.agentId},${r.totalFace},${r.totalUsed},${r.costAmount},${r.subsidyAmount}\n`;
        }
        if (records.length === 0) {
          csv += "暂无数据\n";
        }
      } else if (type === "campaign") {
        // 活动维度报表
        csv = "活动ID,活动名,面值,已使用,成本,补贴\n暂无数据\n";
      } else {
        reply.status(400).send({ code: 400, data: null, message: "type 必须为 monthly, agent 或 campaign" });
        return;
      }

      reply.status(200).send({
        code: 0,
        data: { csv, type, period: periodStr },
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
