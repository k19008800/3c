// ============================================================
//  3cloud (3C) — 代理商提现 & 邀请路由
//  GET    /api/v1/agent/referral-link     — 获取静默邀请链接
//  GET    /api/v1/agent/bank-info         — 上次提现银行信息
//  POST   /api/v1/agent/withdraw          — 提现申请
//  GET    /api/v1/agent/withdraws         — 提现记录
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, guardNotImpersonating } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import { getAgentReferralCode } from "../../services/agent-core.js";
import {
  createWithdraw,
  getAgentWithdraws,
} from "../../services/agent-withdraw.js";
import { agentWithdrawSchema } from "../../schemas.js";
import type { AgentWithdrawInput } from "../../schemas.js";

export async function agentWithdrawRoutes(app: FastifyInstance) {
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
        const { getSavedBankInfo } = await import("../../services/agent-withdraw.js");
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
}
