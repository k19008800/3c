// ============================================================
//  3cloud (3C) — 提现管理路由（板块4）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";
import {
  listAllWithdraws,
  firstReviewWithdraw,
  secondReviewWithdraw,
  markWithdrawAsPaid,
  batchReviewWithdraws,
} from "../../../services/agent-withdraw.js";
import { getDb } from "../../../db/index.js";
import {
  withdrawOrders,
  users,
  agents,
} from "../../../db/schema.js";

export async function adminFinanceWithdrawRoutes(app: FastifyInstance) {
  // 全局 JWT 认证
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/withdraws — 提现列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/withdraws", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        status?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const status = query.status || undefined;

      const result = await listAllWithdraws(page, pageSize, status);

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
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/withdraws/stats — 按状态统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/withdraws/stats", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (_request, reply) => {
    try {
      const db = getDb();
      const rows = await db
        .select({
          status: withdrawOrders.status,
          count: sql<number>`count(*)::int`,
          totalAmount: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
        })
        .from(withdrawOrders)
        .groupBy(withdrawOrders.status)
        .orderBy(withdrawOrders.status);

      reply.status(200).send({
        code: 0,
        data: rows,
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

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/withdraws/export — CSV 导出（流式优化）
  //  Query: ?status=pending_first_review (可选)
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/withdraws/export", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const query = request.query as { status?: string };
      
      // 使用新的流式导出函数
      const { streamExportWithdrawsCsv } = await import("../../../services/agent-withdraw/csv.js");
      
      await streamExportWithdrawsCsv(
        reply,
        query.status || undefined,
        10000, // maxRows
        1000   // batchSize
      );
      
      // 注意：streamExportWithdrawsCsv 会自己处理响应，这里不需要再 send
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/withdraws/:id — 提现详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/withdraws/:id", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const withdrawId = parseInt(id, 10);
      if (!withdrawId) {
        reply.status(400).send({ code: 400, data: null, message: "无效的提现 ID" });
        return;
      }

      const db = getDb();

      const [row] = await db
        .select({
          id: withdrawOrders.id,
          agentId: withdrawOrders.agentId,
          userId: agents.userId,
          email: users.email,
          nickname: users.nickname,
          voucherNo: withdrawOrders.voucherNo,
          amount: withdrawOrders.amount,
          feeAmount: withdrawOrders.feeAmount,
          actualAmount: withdrawOrders.actualAmount,
          bankCardNo: withdrawOrders.bankCardNo,
          bankName: withdrawOrders.bankName,
          bankVoucherUrl: withdrawOrders.bankVoucherUrl,
          wechatPayNo: withdrawOrders.wechatPayNo,
          status: withdrawOrders.status,
          auditLevel: withdrawOrders.auditLevel,
          rejectReason: withdrawOrders.rejectReason,
          riskCheckResult: withdrawOrders.riskCheckResult,
          firstAuditorId: withdrawOrders.firstAuditorId,
          firstAuditedAt: withdrawOrders.firstAuditedAt,
          secondAuditorId: withdrawOrders.secondAuditorId,
          secondAuditedAt: withdrawOrders.secondAuditedAt,
          paidOperatorId: withdrawOrders.paidOperatorId,
          matchedBankTxId: withdrawOrders.matchedBankTxId,
          createdAt: withdrawOrders.createdAt,
          reviewedAt: withdrawOrders.reviewedAt,
          paidAt: withdrawOrders.paidAt,
        })
        .from(withdrawOrders)
        .innerJoin(agents, eq(withdrawOrders.agentId, agents.id))
        .innerJoin(users, eq(agents.userId, users.id))
        .where(eq(withdrawOrders.id, withdrawId))
        .limit(1);

      if (!row) {
        reply.status(404).send({ code: 404, data: null, message: "提现订单不存在" });
        return;
      }

      reply.status(200).send({
        code: 0,
        data: {
          ...row,
          feeAmount: row.feeAmount ?? "0.000000",
          actualAmount: row.actualAmount ?? row.amount,
          createdAt: row.createdAt.toISOString(),
          reviewedAt: row.reviewedAt?.toISOString() ?? null,
          firstAuditedAt: row.firstAuditedAt?.toISOString() ?? null,
          secondAuditedAt: row.secondAuditedAt?.toISOString() ?? null,
          paidAt: row.paidAt?.toISOString() ?? null,
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

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/withdraws/batch-review — 批量审核
  //  Body: { ids: number[], action: "approve" | "reject", rejectReason?: string }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/withdraws/batch-review", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const body = request.body as {
        ids: number[];
        action: "approve" | "reject";
        rejectReason?: string;
      };

      if (!body.ids?.length) {
        reply.status(400).send({ code: 400, data: null, message: "请选择要审核的提现订单" });
        return;
      }
      if (!body.action || !["approve", "reject"].includes(body.action)) {
        reply.status(400).send({ code: 400, data: null, message: "action 必须为 approve 或 reject" });
        return;
      }

      const operatorId = (request as any).user.userId;
      const result = await batchReviewWithdraws(operatorId, body.ids, body.action, body.rejectReason);

      reply.status(200).send({
        code: 0,
        data: result,
        message: `批量操作完成：通过 ${result.approved} 笔，拒绝 ${result.rejected} 笔${result.errors.length ? `，${result.errors.length} 笔失败` : ""}`,
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/withdraws/:id/first-review — 初审
  //  Body: { action: "approve" | "reject", rejectReason?: string }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/withdraws/:id/first-review", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const withdrawId = parseInt(id, 10);
      if (!withdrawId) {
        reply.status(400).send({ code: 400, data: null, message: "无效的提现 ID" });
        return;
      }

      const body = request.body as {
        action: "approve" | "reject";
        rejectReason?: string;
      };

      if (!body.action || !["approve", "reject"].includes(body.action)) {
        reply.status(400).send({ code: 400, data: null, message: "action 必须为 approve 或 reject" });
        return;
      }

      const operatorId = (request as any).user.userId;
      const result = await firstReviewWithdraw(operatorId, withdrawId, body.action, body.rejectReason);

      reply.status(200).send({
        code: 0,
        data: result,
        message: body.action === "approve" ? "初审通过" : "已拒绝",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/withdraws/:id/second-review — 复审
  //  Body: { action: "approve" | "reject", rejectReason?: string, bankVoucherUrl?: string }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/withdraws/:id/second-review", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const withdrawId = parseInt(id, 10);
      if (!withdrawId) {
        reply.status(400).send({ code: 400, data: null, message: "无效的提现 ID" });
        return;
      }

      const body = request.body as {
        action: "approve" | "reject";
        rejectReason?: string;
        bankVoucherUrl?: string;
      };

      if (!body.action || !["approve", "reject"].includes(body.action)) {
        reply.status(400).send({ code: 400, data: null, message: "action 必须为 approve 或 reject" });
        return;
      }

      const operatorId = (request as any).user.userId;
      const result = await secondReviewWithdraw(operatorId, withdrawId, body.action, body.rejectReason, body.bankVoucherUrl);

      reply.status(200).send({
        code: 0,
        data: result,
        message: body.action === "approve" ? "复审通过" : "复审拒绝",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/withdraws/:id/mark-paid — 标记已打款
  //  Body: { bankVoucherUrl?: string }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/withdraws/:id/mark-paid", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const withdrawId = parseInt(id, 10);
      if (!withdrawId) {
        reply.status(400).send({ code: 400, data: null, message: "无效的提现 ID" });
        return;
      }

      const body = (request.body as { bankVoucherUrl?: string }) || {};
      const operatorId = (request as any).user.userId;
      const result = await markWithdrawAsPaid(operatorId, withdrawId, body.bankVoucherUrl);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "已标记为打款",
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
