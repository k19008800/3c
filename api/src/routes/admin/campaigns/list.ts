// ============================================================
//  3cloud (3C) �?活动列表 & 汇总统�?//  GET /api/v1/admin/campaigns
//  GET /api/v1/admin/campaigns/stats
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { campaigns } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";

export async function listCampaignRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/campaigns �?活动列表（分�?status筛选）
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/campaigns", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        status?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;

      const db = getDb();
      const conditions: any[] = [];

      if (query.status) {
        conditions.push(eq(campaigns.status, query.status as any));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalResult] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(campaigns)
        .where(whereClause);

      const total = totalResult?.total ?? 0;

      const rows = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          description: campaigns.description,
          status: campaigns.status,
          startAt: campaigns.startAt,
          endAt: campaigns.endAt,
          budgetAmount: campaigns.budgetAmount,
          createdBy: campaigns.createdBy,
          createdAt: campaigns.createdAt,
          updatedAt: campaigns.updatedAt,
        })
        .from(campaigns)
        .where(whereClause)
        .orderBy(desc(campaigns.createdAt))
        .limit(pageSize)
        .offset(offset);

      reply.status(200).send({
        code: 0,
        data: {
          list: rows.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            status: r.status,
            startAt: r.startAt?.toISOString() ?? null,
            endAt: r.endAt?.toISOString() ?? null,
            budgetAmount: r.budgetAmount,
            createdBy: r.createdBy,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          })),
          total,
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

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/campaigns/stats �?活动汇总统�?  //  必须�?:id 路由之前注册，否�?/stats 会被 :id 捕获
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/campaigns/stats", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();

      const [overview] = await db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${campaigns.status} = 'active')::int`,
          ended: sql<number>`count(*) filter (where ${campaigns.status} = 'ended')::int`,
          totalBudget: sql<string>`coalesce(sum(${campaigns.budgetAmount}), 0)::text`,
        })
        .from(campaigns);

      reply.status(200).send({
        code: 0,
        data: {
          total: Number(overview?.total ?? 0),
          active: Number(overview?.active ?? 0),
          ended: Number(overview?.ended ?? 0),
          totalBudget: overview?.totalBudget ?? "0",
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
}
