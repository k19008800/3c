// ============================================================
//  3cloud (3C) — 代理商邀请裂变路由（§24.1）
//  GET    /api/v1/agent/referral/links       — 邀请链接列表
//  POST   /api/v1/agent/referral/links       — 生成新邀请链接
//  GET    /api/v1/agent/referral/stats       — 邀请效果统计
//  GET    /api/v1/agent/referral/clients     — 邀请注册的客户列表及消费
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import { getDb } from "../../db/index.js";
import { agentReferralLinks } from "../../db/schema/agent-referral.js";
import { users } from "../../db/schema/users.js";
import { eq, and, desc, sql, like, count } from "drizzle-orm";

export async function agentReferralRoutes(app: FastifyInstance) {
  const db = getDb();

  // ──────────────────────────────────────────────
  //  GET /api/v1/agent/referral/links — 邀请链接列表
  // ──────────────────────────────────────────────
  app.get("/api/v1/agent/referral/links", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const links = await db.select({
          id: agentReferralLinks.id,
          code: agentReferralLinks.code,
          customName: agentReferralLinks.customName,
          clickCount: agentReferralLinks.clickCount,
          registerCount: agentReferralLinks.registerCount,
          source: agentReferralLinks.source,
          createdAt: agentReferralLinks.createdAt,
        })
        .from(agentReferralLinks)
        .where(eq(agentReferralLinks.agentId, userId))
        .orderBy(desc(agentReferralLinks.createdAt));

        reply.status(200).send({ code: 0, data: { links }, message: "ok" });
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
  //  POST /api/v1/agent/referral/links — 生成新邀请链接
  // ──────────────────────────────────────────────
  app.post("/api/v1/agent/referral/links", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const body = request.body as { customName?: string; source?: string };

        // 生成唯一邀请码：AG + 8位随机字符
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let code = "";
        for (let i = 0; i < 8; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // 检查是否已存在（极小概率碰撞）
        const existing = await db.select({ id: agentReferralLinks.id })
          .from(agentReferralLinks)
          .where(eq(agentReferralLinks.code, code))
          .limit(1);

        if (existing.length > 0) {
          // 重试一次
          code = "";
          for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
          }
        }

        const result = await db.insert(agentReferralLinks).values({
          agentId: userId,
          code,
          customName: body.customName || null,
          source: body.source || "direct",
        }).returning();

        reply.status(201).send({ code: 0, data: { link: result[0] }, message: "ok" });
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
  //  GET /api/v1/agent/referral/stats — 邀请效果统计
  // ──────────────────────────────────────────────
  app.get("/api/v1/agent/referral/stats", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const userId = request.user!.userId;

        // 总邀请统计
        const linkStats = await db.select({
          totalClicks: sql<number>`COALESCE(SUM(${agentReferralLinks.clickCount}), 0)`,
          totalRegisters: sql<number>`COALESCE(SUM(${agentReferralLinks.registerCount}), 0)`,
          linkCount: count(agentReferralLinks.id),
        })
        .from(agentReferralLinks)
        .where(eq(agentReferralLinks.agentId, userId));

        // 已邀请注册的客户数
        const clientResult = await db.select({ total: count(users.id) })
          .from(users)
          .where(eq(users.referredByAgent, userId));

        const totalClicks = Number(linkStats[0]?.totalClicks || 0);
        const totalRegisters = Number(linkStats[0]?.totalRegisters || 0);
        const totalClients = Number(clientResult[0]?.total || 0);

        // 近30天每日统计（简化：按天分组注册数）
        const dailyStats = await db.select({
          date: sql<string>`DATE(${users.createdAt})`,
          count: count(users.id),
        })
        .from(users)
        .where(
          and(
            eq(users.referredByAgent, userId),
            sql`${users.createdAt} >= NOW() - INTERVAL '30 days'`
          )
        )
        .groupBy(sql`DATE(${users.createdAt})`)
        .orderBy(sql`DATE(${users.createdAt})`);

        reply.status(200).send({
          code: 0,
          data: {
            summary: {
              totalClicks,
              totalRegisters,
              totalClients,
              totalLinks: Number(linkStats[0]?.linkCount || 0),
              conversionRate: totalClicks > 0 ? ((totalRegisters / totalClicks) * 100).toFixed(1) : "0.0",
            },
            dailyStats: dailyStats.map(d => ({
              date: d.date,
              registers: Number(d.count),
            })),
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
  //  GET /api/v1/agent/referral/clients — 邀请注册的客户列表
  // ──────────────────────────────────────────────
  app.get("/api/v1/agent/referral/clients", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const query = request.query as { page?: string; pageSize?: string };
        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

        const totalResult = await db.select({ total: count(users.id) })
          .from(users)
          .where(eq(users.referredByAgent, userId));

        const total = Number(totalResult[0]?.total || 0);

        const clients = await db.select({
          id: users.id,
          nickname: users.nickname,
          email: users.email,
          balance: users.balance,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.referredByAgent, userId))
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

        reply.status(200).send({
          code: 0,
          data: {
            clients,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
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