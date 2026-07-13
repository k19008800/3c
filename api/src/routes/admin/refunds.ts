// ============================================================
//  3cloud (3C) — 退款管理路由（管理员）
//  GET    /api/v1/admin/finance/refunds            — 所有退款申请
//  GET    /api/v1/admin/finance/refunds/:id        — 详情
//  POST   /api/v1/admin/finance/refunds/:id/approve — 审核通过
//  POST   /api/v1/admin/finance/refunds/:id/reject  — 拒绝
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service.js";
import {
  listAllRefundRequests,
  approveRefund,
  rejectRefund,
} from "../../services/refund-service.js";
import { getDb } from "../../db/index.js";
import { refundRequests } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export async function adminRefundRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/refunds — 所有退款申请
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/refunds", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        status?: string;
        userId?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const result = await listAllRefundRequests(
        page,
        pageSize,
        query.status,
        query.userId ? parseInt(query.userId, 10) : undefined,
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
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/refunds/:id — 详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/refunds/:id", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const refundId = parseInt(id, 10);

      if (isNaN(refundId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的退款 ID" });
        return;
      }

      const db = getDb();
      const [row] = await db
        .select()
        .from(refundRequests)
        .where(eq(refundRequests.id, refundId))
        .limit(1);

      if (!row) {
        reply.status(404).send({ code: 404, data: null, message: "退款申请不存在" });
        return;
      }

      reply.status(200).send({
        code: 0,
        data: {
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          reviewedAt: row.reviewedAt?.toISOString() ?? null,
          completedAt: row.completedAt?.toISOString() ?? null,
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
  //  POST /api/v1/admin/finance/refunds/:id/approve — 审核通过
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/refunds/:id/approve", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const refundId = parseInt(id, 10);

      if (isNaN(refundId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的退款 ID" });
        return;
      }

      const result = await approveRefund(refundId, request.user!.userId);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "退款已审核通过，已执行退款",
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
  //  POST /api/v1/admin/finance/refunds/:id/reject — 拒绝
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/refunds/:id/reject", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const refundId = parseInt(id, 10);

      if (isNaN(refundId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的退款 ID" });
        return;
      }

      const body = request.body as { reason: string };
      if (!body.reason) {
        reply.status(400).send({ code: 400, data: null, message: "拒绝原因不能为空" });
        return;
      }

      const result = await rejectRefund(refundId, request.user!.userId, body.reason);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "退款申请已拒绝",
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
