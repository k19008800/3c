// ============================================================
//  3cloud (3C) — 代理商路由 (增强版)
//  GET    /api/v1/agent/dashboard         — 代理商面板
//  GET    /api/v1/agent/clients           — 客户列表（含消费汇总）
//  GET    /api/v1/agent/referral-link     — 获取静默邀请链接
//  GET    /api/v1/agent/commissions       — 佣金历史
//  POST   /api/v1/agent/withdraw           — 提现申请（增强：银行卡）
//  GET    /api/v1/agent/withdraws          — 提现记录
//  GET    /api/v1/agent/clients/consumption  — 客户消费排行
//  GET    /api/v1/agent/clients/:customerUserId/orders  — 客户订单详情
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, guardNotImpersonating } from "../middleware/auth.js";
import { AppError } from "../services/auth-service.js";
import {
  getAgentDashboard,
  getAgentClients,
  getAgentCommissions,
  getAgentCommissionSummary,
  getAgentCommissionDetail,
  exportAgentCommissionsCsv,
  createWithdraw,
  getAgentWithdraws,
  getAgentReferralCode,
  getCustomerConsumption,
  getCustomerOrderDetail,
  getAgentIncomeTrend,
  getAgentIncomeStructure,
} from "../services/agent-service.js";
import { agentWithdrawSchema, customerConsumptionQuerySchema, agentCommissionQuerySchema } from "../schemas.js";
import type { AgentWithdrawInput, CustomerConsumptionQuery, AgentCommissionQuery } from "../schemas.js";

export async function agentRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/agent/dashboard — 代理商面板
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/dashboard", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const result = await getAgentDashboard(request.user!.userId);

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
  //  GET /api/v1/agent/dashboard/income-trend?days=30 — 收入趋势
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/dashboard/income-trend", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const query = request.query as { days?: string };
        const days = Math.min(365, Math.max(1, parseInt(query.days ?? "30", 10) || 30));

        const result = await getAgentIncomeTrend(request.user!.userId, days);

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
  //  GET /api/v1/agent/dashboard/income-structure — 收入结构
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/dashboard/income-structure", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const result = await getAgentIncomeStructure(request.user!.userId);

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
  //  GET /api/v1/agent/clients — 客户列表
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
  //  GET /api/v1/agent/commissions — 佣金历史（增强筛选）
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/commissions", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const query = request.query as Record<string, string | undefined>;
        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

        const result = await getAgentCommissions(
          request.user!.userId,
          page,
          pageSize,
          {
            status: query.status,
            commissionType: query.commissionType,
            startDate: query.startDate,
            endDate: query.endDate,
            customerSearch: query.customerSearch,
          },
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
  //  GET /api/v1/agent/commissions/summary — 佣金汇总统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/commissions/summary", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const result = await getAgentCommissionSummary(request.user!.userId);

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
  //  GET /api/v1/agent/commissions/export — 佣金导出 CSV
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/commissions/export", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const query = request.query as Record<string, string | undefined>;
        const csv = await exportAgentCommissionsCsv(
          request.user!.userId,
          {
            status: query.status,
            commissionType: query.commissionType,
            startDate: query.startDate,
            endDate: query.endDate,
          },
        );

        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="commission_export_${Date.now()}.csv"`);
        reply.status(200).send(csv);
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
  //  GET /api/v1/agent/commissions/:id — 单条佣金详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/commissions/:id", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const commissionId = parseInt(id, 10);
        if (isNaN(commissionId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的佣金 ID" });
          return;
        }

        const result = await getAgentCommissionDetail(request.user!.userId, commissionId);

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
  //  GET /api/v1/agent/referral-link — 获取静默邀请链接
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/referral-link", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const code = await getAgentReferralCode(request.user!.userId);
        const link = `${request.protocol}://${request.hostname}/register?ref=${code}`;

        reply.status(200).send({
          code: 0,
          data: {
            referralCode: code,
            referralLink: link,
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
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/agent/bank-info — 获取上次成功提现的银行信息
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/bank-info", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const { getSavedBankInfo } = await import("../services/agent-service.js");
        const result = await getSavedBankInfo(request.user!.userId);

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
  //  POST /api/v1/agent/withdraw — 提现申请（增强：银行卡参数）
  // ──────────────────────────────────────────────

  app.post("/api/v1/agent/withdraw", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const parsed = agentWithdrawSchema.parse(request.body);
        const result = await createWithdraw(
          request.user!.userId,
          parsed.amount,
          parsed.bankCardNo,
          parsed.bankName,
        );

        reply.status(200).send({
          code: 0,
          data: result,
          message: "提现申请已提交",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        if (err?.name === "ZodError") {
          reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
          return;
        }
        throw err;
      }
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/agent/withdraws — 提现记录
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/withdraws", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const query = request.query as {
          page?: string;
          pageSize?: string;
          status?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

        const result = await getAgentWithdraws(
          request.user!.userId,
          page,
          pageSize,
          query.status,
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
        if (err?.name === "ZodError") {
          reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
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

        const query = request.query as { page?: string; pageSize?: string };
        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

        const result = await getCustomerOrderDetail(
          request.user!.userId,
          customerId,
          page,
          pageSize,
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
}
