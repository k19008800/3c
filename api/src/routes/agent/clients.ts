// ============================================================
//  3cloud (3C) — 代理商客户管理路由
//  GET    /api/v1/agent/clients                          — 客户列表
//  GET    /api/v1/agent/clients/consumption              — 客户消费排行
//  GET    /api/v1/agent/clients/:customerUserId/orders   — 客户订单详情
//  GET    /api/v1/agent/clients/:customerUserId/export   — 客户消费报表 CSV
//  DELETE /api/v1/agent/clients/:clientUserId             — 解绑客户
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, guardNotImpersonating } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import { getAgentClients } from "../../services/agent-core.js";
import {
  getCustomerConsumption,
  getCustomerOrderDetail,
} from "../../services/agent-finance.js";
import { customerConsumptionQuerySchema } from "../../schemas.js";
import type { CustomerConsumptionQuery } from "../../schemas.js";

export async function agentClientRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/agent/clients — 客户列表（含消费汇总）
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/clients", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const query = request.query as {
          page?: string;
          pageSize?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

        const result = await getAgentClients(request.user!.userId, page, pageSize);

        reply.status(200).send({
          code: 0,
          data: result,
          message: "ok",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/agent/clients/consumption — 客户消费排行
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/clients/consumption", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const parsed = customerConsumptionQuerySchema.parse(request.query);

        const result = await getCustomerConsumption(
          request.user!.userId,
          parsed.page,
          parsed.pageSize,
          parsed.sortBy,
          parsed.sortOrder,
        );

        reply.status(200).send({
          code: 0,
          data: result,
          message: "ok",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/agent/clients/:customerUserId/orders — 客户订单详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/clients/:customerUserId/orders", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const { customerUserId } = request.params as { customerUserId: string };
        const customerId = parseInt(customerUserId, 10);
        if (isNaN(customerId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的客户 ID" });
          return;
        }

        const parsed = customerConsumptionQuerySchema.parse(request.query);

        const result = await getCustomerOrderDetail(
          request.user!.userId,
          customerId,
          parsed.page,
          parsed.pageSize,
        );

        reply.status(200).send({
          code: 0,
          data: result,
          message: "ok",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/agent/clients/:customerUserId/export — 客户消费报表 CSV
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/clients/:customerUserId/export", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const { customerUserId } = request.params as { customerUserId: string };
        const customerId = parseInt(customerUserId, 10);
        if (isNaN(customerId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的客户 ID" });
          return;
        }
        const { eq, and, desc, gte, lte } = await import("drizzle-orm");
        const { agents, agentClients, commissionLogs, users } = await import("../../db/schema.js");
        const db = (request.server as any).db;

        const [agent] = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.userId, request.user!.userId))
          .limit(1);
        if (!agent) {
          return reply.status(403).send({ code: 1, data: null, message: "您不是代理商" });
        }

        const [client] = await db
          .select({ id: agentClients.id })
          .from(agentClients)
          .where(and(
            eq(agentClients.agentId, agent.id),
            eq(agentClients.clientUserId, customerId),
          ))
          .limit(1);
        if (!client) {
          reply.status(404).send({ code: 404, data: null, message: "该客户不属于您" });
          return;
        }

        const query = request.query as { startDate?: string; endDate?: string };
        const conditions: any[] = [
          eq(commissionLogs.agentId, agent.id),
          eq(commissionLogs.sourceCustomerId, customerId),
        ];
        if (query.startDate) conditions.push(gte(commissionLogs.createdAt, new Date(query.startDate)));
        if (query.endDate) conditions.push(lte(commissionLogs.createdAt, new Date(query.endDate)));

        const rows = await db
          .select({
            orderNo: commissionLogs.sourceOrderId,
            orderAmount: commissionLogs.sourceOrderAmount,
            commissionAmount: commissionLogs.commissionAmount,
            commissionType: commissionLogs.commissionType,
            callCost: commissionLogs.callCost,
            status: commissionLogs.status,
            createdAt: commissionLogs.createdAt,
          })
          .from(commissionLogs)
          .where(and(...conditions))
          .orderBy(desc(commissionLogs.createdAt));

        const COMMISSION_TYPE_LABEL: Record<string, string> = {
          sale: "销售佣金", team: "团队佣金", activity: "活动奖励", renewal: "续费佣金",
        };
        const STATUS_LABEL: Record<string, string> = {
          pending: "待结算", settled: "已结算", cancelled: "已取消",
        };

        const lines: string[] = [];
        lines.push('"3cloud 客户消费报表"');
        lines.push(`"客户ID","${customerId}"`);
        lines.push(`"导出时间","${new Date().toISOString()}"`);
        lines.push('');
        lines.push('"订单号","订单金额","佣金金额","佣金类型","调用成本","状态","创建时间"');
        for (const r of rows) {
          const esc = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
          lines.push([
            esc(r.orderNo), r.orderAmount,
            r.commissionAmount,
            COMMISSION_TYPE_LABEL[r.commissionType ?? ""] || r.commissionType || "",
            r.callCost,
            STATUS_LABEL[r.status] || r.status,
            r.createdAt.toISOString(),
          ].join(","));
        }

        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="client_export_${customerId}_${Date.now()}.csv"`);
        reply.status(200).send(lines.join("\n"));
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/v1/agent/clients/:clientUserId — 解绑客户
  // ──────────────────────────────────────────────

  app.delete("/api/v1/agent/clients/:clientUserId", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const { clientUserId } = request.params as { clientUserId: string };
        const customerId = parseInt(clientUserId, 10);
        if (isNaN(customerId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的客户 ID" });
          return;
        }
        const { eq, and } = await import("drizzle-orm");
        const { agents, agentClients, agentCustomerConsumption } = await import("../../db/schema.js");
        const db = (request.server as any).db;

        const [agent] = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.userId, request.user!.userId))
          .limit(1);
        if (!agent) {
          return reply.status(403).send({ code: 1, data: null, message: "您不是代理商" });
        }

        const [binding] = await db
          .select({ id: agentClients.id })
          .from(agentClients)
          .where(and(
            eq(agentClients.agentId, agent.id),
            eq(agentClients.clientUserId, customerId),
          ))
          .limit(1);
        if (!binding) {
          reply.status(404).send({ code: 404, data: null, message: "该客户不属于您" });
          return;
        }

        await db.transaction(async (tx: typeof db) => {
          await tx.delete(agentClients).where(eq(agentClients.id, binding.id));
          await tx.delete(agentCustomerConsumption).where(and(
            eq(agentCustomerConsumption.agentId, agent.id),
            eq(agentCustomerConsumption.customerUserId, customerId),
          ));
        });

        reply.status(200).send({ code: 0, data: null, message: "客户已解绑" });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });
}
