// ============================================================
//  3cloud (3C) —兑换码系统：查询/统计/列表路由
//  GET  /api/v1/redemption/codes
//  GET  /api/v1/redemption/codes/:id
//  GET  /api/v1/redemption/logs
//  GET  /api/v1/redemption/stats
//  GET  /api/v1/redemption/admin-logs
//  GET  /api/v1/redemption/batches/:id
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte, lte, ilike } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  redemptionBatches,
  redemptionCodes,
  redemptionLogs,
} from "../../db/schema.js";
import { authenticateJWT, guardNotImpersonatingWrite } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import { isAdminRole } from "./types.js";

export function registerQueryRoutes(app: FastifyInstance): void {
  // ════════════════════════════════════════════════
  //  GET /api/v1/redemption/codes �i查询兑换码列�j  //  管理员看全量，代理商看自己创建的
  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/codes", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;
        const isAdmin = isAdminRole(userRole);

        const query = request.query as {
          page?: string;
          pageSize?: string;
          batchId?: string;
          status?: string;
          code?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
        const offset = (page - 1) * pageSize;

        const conditions: any[] = [];

        if (!isAdmin) {
          // 通过 batch 关联查询
          const userBatches = db
            .select({ id: redemptionBatches.id })
            .from(redemptionBatches)
            .where(eq(redemptionBatches.creatorId, userId));
          conditions.push(eq(redemptionCodes.batchId, sql`ANY(${userBatches})`));
        }

        if (query.batchId) {
          conditions.push(eq(redemptionCodes.batchId, parseInt(query.batchId, 10)));
        }
        if (query.status) {
          conditions.push(eq(redemptionCodes.status, query.status as any));
        }
        if (query.code) {
          conditions.push(eq(redemptionCodes.code, query.code.toUpperCase()));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [totalResult] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(redemptionCodes)
          .where(whereClause);

        const total = totalResult?.total ?? 0;

        const rows = await db
          .select({
            id: redemptionCodes.id,
            code: redemptionCodes.code,
            amount: redemptionCodes.amount,
            usesLeft: redemptionCodes.usesLeft,
            status: redemptionCodes.status,
            usedAt: redemptionCodes.usedAt,
            createdAt: redemptionCodes.createdAt,
            batchId: redemptionCodes.batchId,
            batchName: redemptionBatches.name,
            creatorId: redemptionBatches.creatorId,
          })
          .from(redemptionCodes)
          .leftJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
          .where(whereClause)
          .orderBy(desc(redemptionCodes.createdAt))
          .limit(pageSize)
          .offset(offset);

        reply.status(200).send({
          code: 0,
          data: {
            list: rows.map((r) => ({
              ...r,
              usedAt: r.usedAt?.toISOString() ?? null,
              createdAt: r.createdAt.toISOString(),
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
    },
  });

  // ════════════════════════════════════════════════
  //  GET /api/v1/redemption/codes/:id �e查看单个兑换�?  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/codes/:id", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const { id } = request.params as { id: string };
        const codeId = parseInt(id, 10);

        if (isNaN(codeId)) {
          reply.status(400).send({ code: 400, data: null, message: "参数不完整：name, amount, count 必填" });
          return;
        }

        const [code] = await db
          .select({
            id: redemptionCodes.id,
            code: redemptionCodes.code,
            amount: redemptionCodes.amount,
            usesLeft: redemptionCodes.usesLeft,
            status: redemptionCodes.status,
            usedAt: redemptionCodes.usedAt,
            createdAt: redemptionCodes.createdAt,
            batchId: redemptionCodes.batchId,
            batchName: redemptionBatches.name,
            batchStatus: redemptionBatches.status,
            creatorId: redemptionBatches.creatorId,
          })
          .from(redemptionCodes)
          .leftJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
          .where(eq(redemptionCodes.id, codeId))
          .limit(1);

        if (!code) {
          reply.status(404).send({ code: 404, data: null, message: "兑换码不存在" });
          return;
        }

        reply.status(200).send({
          code: 0,
          data: {
            ...code,
            usedAt: code.usedAt?.toISOString() ?? null,
            createdAt: code.createdAt.toISOString(),
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

  // ════════════════════════════════════════════════
  //  GET /api/v1/redemption/logs �?用户兑换记录
  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/logs", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;

        const query = request.query as {
          page?: string;
          pageSize?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
        const offset = (page - 1) * pageSize;

        const [totalResult] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(redemptionLogs)
          .where(eq(redemptionLogs.userId, userId));

        const total = totalResult?.total ?? 0;

        const rows = await db
          .select({
            id: redemptionLogs.id,
            amount: redemptionLogs.amount,
            createdAt: redemptionLogs.createdAt,
            codeId: redemptionLogs.codeId,
            code: redemptionCodes.code,
            batchId: redemptionLogs.batchId,
            batchName: redemptionBatches.name,
          })
          .from(redemptionLogs)
          .leftJoin(redemptionCodes, eq(redemptionLogs.codeId, redemptionCodes.id))
          .leftJoin(redemptionBatches, eq(redemptionLogs.batchId, redemptionBatches.id))
          .where(eq(redemptionLogs.userId, userId))
          .orderBy(desc(redemptionLogs.createdAt))
          .limit(pageSize)
          .offset(offset);

        reply.status(200).send({
          code: 0,
          data: {
            list: rows.map((r) => ({
              ...r,
              createdAt: r.createdAt.toISOString(),
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
    },
  });

  // ════════════════════════════════════════════════
  //  GET /api/v1/redemption/stats �?兑换统计
  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/stats", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;
        const isAdmin = isAdminRole(userRole);

        let stats;

        if (isAdmin) {
          // 管理员：全量统计
          const [batchStats] = await db
            .select({
              totalBatches: sql<number>`count(*)::int`,
              activeBatches: sql<number>`count(*) filter (where ${redemptionBatches.status} = 'active')::int`,
              totalCodes: sql<number>`coalesce(sum(${redemptionBatches.totalCount}), 0)::int`,
              usedCodes: sql<number>`coalesce(sum(${redemptionBatches.usedCount}), 0)::int`,
            })
            .from(redemptionBatches);

          const [redeemStats] = await db
            .select({
              totalRedeemed: sql<number>`count(*)::int`,
              totalAmount: sql<string>`coalesce(sum(${redemptionLogs.amount}), '0')`,
              totalUsers: sql<number>`count(distinct ${redemptionLogs.userId})::int`,
            })
            .from(redemptionLogs);

          stats = {
            ...batchStats,
            ...redeemStats,
          };
        } else if (userRole === "agent") {
          const [batchStats] = await db
            .select({
              totalBatches: sql<number>`count(*)::int`,
              activeBatches: sql<number>`count(*) filter (where ${redemptionBatches.status} = 'active')::int`,
              totalCodes: sql<number>`coalesce(sum(${redemptionBatches.totalCount}), 0)::int`,
              usedCodes: sql<number>`coalesce(sum(${redemptionBatches.usedCount}), 0)::int`,
            })
            .from(redemptionBatches)
            .where(eq(redemptionBatches.creatorId, userId));

          // 代理商发起的兑换统计
          const agentBatches = db
            .select({ id: redemptionBatches.id })
            .from(redemptionBatches)
            .where(eq(redemptionBatches.creatorId, userId));

          const [redeemStats] = await db
            .select({
              totalRedeemed: sql<number>`count(*)::int`,
              totalAmount: sql<string>`coalesce(sum(${redemptionLogs.amount}), '0')`,
              totalUsers: sql<number>`count(distinct ${redemptionLogs.userId})::int`,
            })
            .from(redemptionLogs)
            .where(eq(redemptionLogs.batchId, sql`ANY(${agentBatches})`));

          stats = {
            ...batchStats,
            ...redeemStats,
          };
        } else {
          const [redeemStats] = await db
            .select({
              totalRedeemed: sql<number>`count(*)::int`,
              totalAmount: sql<string>`coalesce(sum(${redemptionLogs.amount}), '0')`,
            })
            .from(redemptionLogs)
            .where(eq(redemptionLogs.userId, userId));

          stats = {
            totalRedeemed: redeemStats?.totalRedeemed ?? 0,
            totalAmount: redeemStats?.totalAmount ?? "0",
          };
        }

        reply.status(200).send({
          code: 0,
          data: stats,
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

  // ════════════════════════════════════════════════
  //  GET /api/v1/redemption/admin-logs �I管理员全量兑换流�?  //  仅管理员可访�?  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/admin-logs", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userRole = request.user!.role;

        if (!isAdminRole(userRole)) {
          reply.status(403).send({ code: 403, data: null, message: "仅管理员和代理商可生成兑换码" });
          return;
        }

        const query = request.query as {
          page?: string;
          pageSize?: string;
          email?: string;
          batchId?: string;
          startDate?: string;
          endDate?: string;
          code?: string;
          amountMin?: string;
          amountMax?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
        const offset = (page - 1) * pageSize;

        const conditions: any[] = [];

        if (query.email) {
          conditions.push(eq(users.email, query.email));
        }
        if (query.batchId) {
          conditions.push(eq(redemptionLogs.batchId, parseInt(query.batchId, 10)));
        }
        if (query.startDate) {
          conditions.push(gte(redemptionLogs.createdAt, new Date(query.startDate)));
        }
        if (query.endDate) {
          conditions.push(lte(redemptionLogs.createdAt, new Date(query.endDate)));
        }
        if (query.code) {
          conditions.push(ilike(redemptionCodes.code, `%${query.code.toUpperCase()}%`));
        }
        if (query.amountMin) {
          conditions.push(gte(redemptionLogs.amount, query.amountMin));
        }
        if (query.amountMax) {
          conditions.push(lte(redemptionLogs.amount, query.amountMax));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [totalResult] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(redemptionLogs)
          .leftJoin(redemptionCodes, eq(redemptionLogs.codeId, redemptionCodes.id))
          .leftJoin(users, eq(redemptionLogs.userId, users.id))
          .leftJoin(redemptionBatches, eq(redemptionLogs.batchId, redemptionBatches.id))
          .where(whereClause);

        const total = totalResult?.total ?? 0;

        const rows = await db
          .select({
            id: redemptionLogs.id,
            code: redemptionCodes.code,
            amount: redemptionLogs.amount,
            userId: redemptionLogs.userId,
            email: users.email,
            nickname: users.nickname,
            ip: redemptionLogs.ip,
            batchId: redemptionLogs.batchId,
            batchName: redemptionBatches.name,
            createdAt: redemptionLogs.createdAt,
          })
          .from(redemptionLogs)
          .leftJoin(redemptionCodes, eq(redemptionLogs.codeId, redemptionCodes.id))
          .leftJoin(users, eq(redemptionLogs.userId, users.id))
          .leftJoin(redemptionBatches, eq(redemptionLogs.batchId, redemptionBatches.id))
          .where(whereClause)
          .orderBy(desc(redemptionLogs.createdAt))
          .limit(pageSize)
          .offset(offset);

        reply.status(200).send({
          code: 0,
          data: {
            list: rows.map((r) => ({
              id: r.id,
              code: r.code ?? null,
              amount: r.amount,
              userId: r.userId,
              email: r.email ?? null,
              nickname: r.nickname ?? null,
              ip: r.ip ?? null,
              batchId: r.batchId ?? null,
              batchName: r.batchName ?? null,
              createdAt: r.createdAt.toISOString(),
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
    },
  });

  // ════════════════════════════════════════════════
  //  GET /api/v1/redemption/batches/:id �?批次详情（含统计�?  //  管理员或创建者可查看
  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/batches/:id", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const { id } = request.params as { id: string };
        const batchId = parseInt(id, 10);

        if (isNaN(batchId)) {
          reply.status(400).send({ code: 400, data: null, message: "参数不完整：name, amount, count 必填" });
          return;
        }

        const userId = request.user!.userId;
        const userRole = request.user!.role;
        const isAdmin = isAdminRole(userRole);

        // 查询批次
        const [batch] = await db
          .select()
          .from(redemptionBatches)
          .where(eq(redemptionBatches.id, batchId))
          .limit(1);

        if (!batch) {
          reply.status(404).send({ code: 404, data: null, message: "兑换码不存在" });
          return;
        }

        // 权限检查：管理员或创建者可查看
        if (!isAdmin && batch.creatorId !== userId) {
          reply.status(403).send({ code: 403, data: null, message: "仅管理员和创建者可查看批次详情" });
          return;
        }

        const [codeStats] = await db
          .select({
            unused: sql<number>`count(*) filter (where ${redemptionCodes.status} = 'unused')::int`,
            used: sql<number>`count(*) filter (where ${redemptionCodes.status} = 'used')::int`,
            expired: sql<number>`count(*) filter (where ${redemptionCodes.status} = 'expired')::int`,
            revoked: sql<number>`count(*) filter (where ${redemptionCodes.status} = 'revoked')::int`,
          })
          .from(redemptionCodes)
          .where(eq(redemptionCodes.batchId, batchId));

        reply.status(200).send({
          code: 0,
          data: {
            id: batch.id,
            name: batch.name,
            amount: batch.amount,
            totalCount: batch.totalCount,
            usedCount: batch.usedCount,
            maxUses: batch.maxUses,
            status: batch.status,
            expiresAt: batch.expiresAt?.toISOString() ?? null,
            note: batch.note,
            creatorId: batch.creatorId,
            createdAt: batch.createdAt.toISOString(),
            codeStats: {
              unused: codeStats?.unused ?? 0,
              used: codeStats?.used ?? 0,
              expired: codeStats?.expired ?? 0,
              revoked: codeStats?.revoked ?? 0,
            },
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
