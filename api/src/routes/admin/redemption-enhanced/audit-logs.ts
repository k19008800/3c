// ============================================================
//  3cloud (3C) —Admin 兑换码：审计日志
//  GET /api/v1/admin/redemption/audit-logs
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import {
  users,
  auditLogs,
} from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";

export function registerAuditLogsRoute(app: FastifyInstance): void {
  app.get("/api/v1/admin/redemption/audit-logs", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const query = request.query as {
        page?: string;
        pageSize?: string;
        operatorId?: string;
        action?: string;
        startDate?: string;
        endDate?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;

      // 从 audit_logs 表查询关联兑换码的操作
      const conditions: any[] = [
        sql`CAST(${auditLogs.action} AS text) LIKE 'code_%' OR CAST(${auditLogs.action} AS text) LIKE 'fraud_%' OR CAST(${auditLogs.action} AS text) LIKE '%redemption%' OR CAST(${auditLogs.action} AS text) LIKE '%campaign%'`,
      ];

      if (query.operatorId) {
        conditions.push(eq(auditLogs.operatorId, parseInt(query.operatorId, 10)));
      }
      if (query.action) {
        conditions.push(sql`${auditLogs.action}::text = ${query.action}`);
      }
      if (query.startDate) {
        conditions.push(gte(auditLogs.createdAt, new Date(query.startDate)));
      }
      if (query.endDate) {
        conditions.push(lte(auditLogs.createdAt, new Date(query.endDate)));
      }

      const [totalResult] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(and(...conditions));

      const rows = await db
        .select({
          id: auditLogs.id,
          operatorId: auditLogs.operatorId,
          operatorEmail: users.email,
          action: auditLogs.action,
          targetType: auditLogs.targetType,
          targetId: auditLogs.targetId,
          description: auditLogs.description,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.operatorId, users.id))
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(pageSize)
        .offset(offset);

      reply.status(200).send({
        code: 0,
        data: {
          list: rows.map((r) => ({
            id: r.id,
            operatorId: r.operatorId,
            operator: r.operatorEmail ?? `用户 #${r.operatorId}`,
            action: r.action,
            targetType: r.targetType,
            targetId: r.targetId,
            detail: r.description,
            createdAt: r.createdAt.toISOString(),
          })),
          total: totalResult?.total ?? 0,
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
}
