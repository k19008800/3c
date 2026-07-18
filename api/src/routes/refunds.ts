// ============================================================
//  3cloud (3C) — 退款路由（用户端）
//  POST   /api/v1/refunds       — 提交退款申请
//  GET    /api/v1/refunds       — 我的退款记录
//  GET    /api/v1/refunds/:id   — 退款详情
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, guardNotImpersonating, guardNotImpersonatingWrite } from "../middleware/auth.js";
import { AppError } from "../services/auth-service/index.js";
import {
  createRefundRequest,
  getUserRefunds,
} from "../services/refund-service.js";
import { getDb } from "../db/index.js";
import { refundRequests } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

export async function refundRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  POST /api/v1/refunds — 提交退款申请
  // ──────────────────────────────────────────────

  app.post("/api/v1/refunds", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const body = request.body as {
          amount: string;
          refundType: "overcharge" | "service_issue" | "system_error" | "other";
          reason: string;
          refCallLogId?: number;
          refOrderId?: number;
        };

        if (!body.amount || !body.reason) {
          reply.status(400).send({ code: 400, data: null, message: "金额和退款原因为必填项" });
          return;
        }

        const result = await createRefundRequest(
          request.user!.userId,
          body.amount,
          body.refundType || "other",
          body.reason,
          body.refCallLogId,
          body.refOrderId,
        );

        reply.status(200).send({
          code: 0,
          data: result,
          message: "退款申请提交成功",
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
  //  GET /api/v1/refunds — 我的退款记录
  // ──────────────────────────────────────────────

  app.get("/api/v1/refunds", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const query = request.query as {
          page?: string;
          pageSize?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

        const result = await getUserRefunds(request.user!.userId, page, pageSize);

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
  //  GET /api/v1/refunds/:id — 退款详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/refunds/:id", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
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
          .where(
            and(
              eq(refundRequests.id, refundId),
              eq(refundRequests.userId, request.user!.userId),
            ),
          )
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
    },
  });
}
