// ============================================================
//  3cloud (3C) — 代理商额度管理路由
//  POST  /api/v1/agent/quotas  — 为下级用户设置额度
//  GET   /api/v1/agent/quotas  — 查看下级额度列表
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service.js";

export async function agentQuotaRoutes(app: FastifyInstance) {
  // ── POST /api/v1/agent/quotas — 代理商为下级用户设置额度 ──

  app.post("/api/v1/agent/quotas", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const { eq, and } = await import("drizzle-orm");
        const { agents, userQuotas } = await import("../../db/schema.js");
        const db = (request.server as any).db;
        const agentUserId = request.user!.userId;

        // 验证当前用户是代理商
        const [agentRecord] = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.userId, agentUserId))
          .limit(1);

        if (!agentRecord) {
          reply.status(403).send({ code: 403, data: null, message: "仅代理商可设置下级额度" });
          return;
        }

        const body = request.body as {
          userId: number;
          quotaAmount: string;
          alertPercent?: number;
          reason?: string;
          rpmLimit?: number;
          tpmLimit?: number;
        };

        if (!body.userId || !body.quotaAmount) {
          reply.status(400).send({ code: 400, data: null, message: "缺少必填字段: userId, quotaAmount" });
          return;
        }

        // 验证目标用户是当前代理商的客户（下级代理商）
        const [client] = await db
          .select({ userId: agents.userId })
          .from(agents)
          .where(and(eq(agents.parentAgentId, agentRecord.id), eq(agents.userId, body.userId)))
          .limit(1);

        if (!client) {
          reply.status(400).send({ code: 400, data: null, message: "只能为下级代理商设置额度" });
          return;
        }

        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        const [quota] = await db
          .insert(userQuotas)
          .values({
            userId: body.userId,
            quotaType: "monthly",
            quotaAmount: String(body.quotaAmount),
            alertPercent: String(body.alertPercent ?? 80),
            periodStart: now,
            periodEnd,
            setBy: agentUserId,
            setByRole: "agent",
            reason: body.reason ?? null,
            rpmLimit: body.rpmLimit ?? null,
            tpmLimit: body.tpmLimit ?? null,
          })
          .returning();

        reply.status(201).send({
          code: 0,
          data: quota,
          message: "下级额度设置成功",
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

  // ── GET /api/v1/agent/quotas — 代理商查看下级额度列表 ──

  app.get("/api/v1/agent/quotas", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const { eq, and, inArray, desc, sql } = await import("drizzle-orm");
        const { agents, userQuotas, users } = await import("../../db/schema.js");
        const db = (request.server as any).db;
        const agentUserId = request.user!.userId;

        const [agentRecord] = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.userId, agentUserId))
          .limit(1);

        if (!agentRecord) {
          reply.status(403).send({ code: 403, data: null, message: "仅代理商可查看" });
          return;
        }

        const children = await db
          .select({ userId: agents.userId })
          .from(agents)
          .where(eq(agents.parentAgentId, agentRecord.id));

        const childUserIds = children.map((c: { userId: number }) => c.userId);

        if (childUserIds.length === 0) {
          reply.send({
            code: 0,
            data: { items: [], total: 0, limit: 20, offset: 0 },
            message: "ok",
          });
          return;
        }

        const query = request.query as { limit?: string; offset?: string };
        const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10) || 20));
        const offset = Math.max(0, parseInt(query.offset ?? "0", 10) || 0);

        const rows = await db
          .select({
            id: userQuotas.id,
            userId: userQuotas.userId,
            userEmail: users.email,
            userNickname: users.nickname,
            quotaType: userQuotas.quotaType,
            quotaAmount: userQuotas.quotaAmount,
            usedAmount: userQuotas.usedAmount,
            alertPercent: userQuotas.alertPercent,
            periodStart: userQuotas.periodStart,
            periodEnd: userQuotas.periodEnd,
            setBy: userQuotas.setBy,
            setByRole: userQuotas.setByRole,
            reason: userQuotas.reason,
            rpmLimit: userQuotas.rpmLimit,
            tpmLimit: userQuotas.tpmLimit,
            createdAt: userQuotas.createdAt,
            updatedAt: userQuotas.updatedAt,
          })
          .from(userQuotas)
          .leftJoin(users, eq(userQuotas.userId, users.id))
          .where(
            and(
              inArray(userQuotas.userId, childUserIds),
              eq(userQuotas.setByRole, "agent"),
            )
          )
          .orderBy(desc(userQuotas.createdAt))
          .limit(limit)
          .offset(offset);

        const [totalResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(userQuotas)
          .where(
            and(
              inArray(userQuotas.userId, childUserIds),
              eq(userQuotas.setByRole, "agent"),
            )
          );

        reply.send({
          code: 0,
          data: {
            items: rows,
            total: totalResult?.count ?? 0,
            limit,
            offset,
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
