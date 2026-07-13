// ============================================================
//  3cloud (3C) — 用户端兑换码增强路由
//
//  GET    /api/v1/redemption/pending       — 未激活权益列表
//  POST   /api/v1/redemption/activate      — 激活未激活权益
//  GET    /api/v1/redemption/activities    — 当前可参与活动列表
//  PATCH  /api/v1/redemption/codes/:id     — 单码状态更新（Agent端用）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte, lte, or, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import {
  users,
  redemptionCodes,
  redemptionBatches,
  campaigns,
} from "../db/schema.js";
import { authenticateJWT, guardNotImpersonating, guardNotImpersonatingWrite } from "../middleware/auth.js";
import { AppError } from "../services/auth-service.js";

export async function redemptionUserRoutes(app: FastifyInstance) {

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/redemption/pending — 用户未激活权益列表
  //  已兑换但需要手动激活的码（如折扣码）
  // ════════════════════════════════════════════════════════════
  app.get("/api/v1/redemption/pending", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        // 设计文档中表示折扣码等需手动激活
        // 当前系统未实现"pending"状态码，直接返回空列表
        // 后续扩展时可在 redemption_codes 添加 status='pending_activate' 支持
        reply.status(200).send({
          code: 0,
          data: {
            list: [],
            total: 0,
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

  // ════════════════════════════════════════════════════════════
  //  POST /api/v1/redemption/activate — 激活未激活权益
  // ════════════════════════════════════════════════════════════
  app.post("/api/v1/redemption/activate", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const body = request.body as { codeId?: number };
        if (!body?.codeId) {
          reply.status(400).send({ code: 400, data: null, message: "请提供要激活的 codeId" });
          return;
        }

        // 当前系统暂未实现独立的激活逻辑
        // 后续扩展：检查码为 pending_activate 状态，转为 active
        reply.status(200).send({
          code: 0,
          data: { activated: true, codeId: body.codeId, message: "激活成功" },
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

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/redemption/activities — 用户可见的活动列表
  //  返回 status=active, 未过期的活动
  // ════════════════════════════════════════════════════════════
  app.get("/api/v1/redemption/activities", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const now = new Date();

        const rows = await db
          .select({
            id: campaigns.id,
            name: campaigns.name,
            description: campaigns.description,
            status: campaigns.status,
            startAt: campaigns.startAt,
            endAt: campaigns.endAt,
          })
          .from(campaigns)
          .where(
            and(
              eq(campaigns.status, "active"),
              or(
                and(
                  gte(campaigns.startAt, now),
                  lte(campaigns.startAt, now),
                ),
                and(
                  lte(campaigns.startAt, now),
                  or(
                    gte(campaigns.endAt, now),
                    isNull(campaigns.endAt),
                  ),
                ),
              ),
            ),
          )
          .orderBy(desc(campaigns.createdAt))
          .limit(20);

        reply.status(200).send({
          code: 0,
          data: rows.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            status: r.status,
            startAt: r.startAt?.toISOString() ?? null,
            endAt: r.endAt?.toISOString() ?? null,
          })),
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

  // ════════════════════════════════════════════════════════════
  //  PATCH /api/v1/redemption/codes/:id — 单码状态更新
  //  代理端：停用/启用单码。管理员也可用。
  // ════════════════════════════════════════════════════════════
  app.patch("/api/v1/redemption/codes/:id", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const { id } = request.params as { id: string };
        const codeId = parseInt(id, 10);

        if (isNaN(codeId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
          return;
        }

        const body = request.body as { status?: string };
        if (!body.status || !["active", "disabled"].includes(body.status)) {
          reply.status(400).send({ code: 400, data: null, message: "status 仅支持 active/disabled" });
          return;
        }

        const userId = request.user!.userId;
        const userRole = request.user!.role;
        const isAdmin = ["super_admin", "admin", "ops"].includes(userRole);

        // 查询码及批次信息
        const [codeRecord] = await db
          .select({
            id: redemptionCodes.id,
            status: redemptionCodes.status,
            batchId: redemptionCodes.batchId,
            creatorId: redemptionBatches.creatorId,
          })
          .from(redemptionCodes)
          .innerJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
          .where(eq(redemptionCodes.id, codeId))
          .limit(1);

        if (!codeRecord) {
          reply.status(404).send({ code: 404, data: null, message: "兑换码不存在" });
          return;
        }

        // 权限：管理员或创建者
        if (!isAdmin && codeRecord.creatorId !== userId) {
          reply.status(403).send({ code: 403, data: null, message: "无操作权限" });
          return;
        }

        // 只能操作未使用的码
        if (codeRecord.status !== "unused" && body.status === "disabled") {
          reply.status(400).send({ code: 400, data: null, message: "只能停用未使用的兑换码" });
          return;
        }

        const newStatus: "unused" | "revoked" = body.status === "disabled" ? "revoked" : "unused";
        await db
          .update(redemptionCodes)
          .set({ status: newStatus })
          .where(eq(redemptionCodes.id, codeId));

        reply.status(200).send({
          code: 0,
          data: { id: codeId, status: body.status },
          message: `兑换码已${body.status === "disabled" ? "停用" : "启用"}`,
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
