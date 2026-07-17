// ============================================================
//  3cloud (3C) — Admin 兑换码：导出
//  GET /api/v1/admin/redemption/export
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import {
  redemptionBatches,
  redemptionCodes,
} from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";

export function registerExportRoute(app: FastifyInstance): void {

  app.get("/api/v1/admin/redemption/export", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const query = request.query as {
        format?: string; // csv | json
        status?: string;
        startDate?: string;
        endDate?: string;
        batchId?: string;
      };

      const conditions: any[] = [];
      if (query.status) conditions.push(eq(redemptionCodes.status, query.status as any));
      if (query.batchId) conditions.push(eq(redemptionCodes.batchId, parseInt(query.batchId, 10)));

      const codes = await db
        .select({
          id: redemptionCodes.id,
          code: redemptionCodes.code,
          amount: redemptionCodes.amount,
          status: redemptionCodes.status,
          usesLeft: redemptionCodes.usesLeft,
          usedAt: redemptionCodes.usedAt,
          createdAt: redemptionCodes.createdAt,
          batchId: redemptionCodes.batchId,
          batchName: redemptionBatches.name,
          creatorId: redemptionBatches.creatorId,
        })
        .from(redemptionCodes)
        .leftJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(redemptionCodes.createdAt))
        .limit(10000);

      const format = query.format ?? "csv";

      if (format === "json") {
        reply.status(200).send({
          code: 0,
          data: codes,
          message: "ok",
        });
        return;
      }

      // CSV
      const header = "ID,兑换码,面额,状态,剩余次数,使用时间,创建时间,批次ID,批次名";
      const rows = codes.map((c) =>
        [
          c.id,
          c.code,
          c.amount,
          c.status,
          c.usesLeft,
          c.usedAt?.toISOString() ?? "",
          c.createdAt.toISOString(),
          c.batchId,
          c.batchName ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", "attachment; filename=admin-redemption-codes.csv");
      reply.status(200).send({
        code: 0,
        data: { csv: [header, ...rows].join("\n") },
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
