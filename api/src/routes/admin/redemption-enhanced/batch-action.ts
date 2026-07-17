// ============================================================
//  3cloud (3C) — Admin 兑换码：批量操作
//  POST /api/v1/admin/redemption/batch-action
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import {
  agents,
  redemptionBatches,
  redemptionCodes,
  auditLogs,
} from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";
import { isAdminRole } from "./_shared.js";

export function registerBatchActionRoute(app: FastifyInstance): void {

  app.post("/api/v1/admin/redemption/batch-action", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const userId = request.user!.userId;
      const userRole = request.user!.role;

      if (!isAdminRole(userRole)) {
        reply.status(403).send({ code: 403, data: null, message: "仅管理员可操作" });
        return;
      }

      const body = request.body as {
        action: "disable" | "enable" | "revoke";
        codeIds?: number[];
        batchId?: number;
        agentId?: number;
        reason?: string;
      };

      if (!body.action) {
        reply.status(400).send({ code: 400, data: null, message: "action 必填" });
        return;
      }

      if (!body.codeIds && !body.batchId && !body.agentId) {
        reply.status(400).send({ code: 400, data: null, message: "请提供 codeIds, batchId 或 agentId" });
        return;
      }

      const conditions: any[] = [];

      if (body.codeIds && body.codeIds.length > 0) {
        conditions.push(inArray(redemptionCodes.id, body.codeIds));
      }
      if (body.batchId) {
        conditions.push(eq(redemptionCodes.batchId, body.batchId));
      }
      if (body.agentId) {
        // 通过 agent 找其 user, 再找 batch
        const [agent] = await db
          .select({ userId: agents.userId })
          .from(agents)
          .where(eq(agents.id, body.agentId))
          .limit(1);
        if (agent) {
          const agentBatches = db
            .select({ id: redemptionBatches.id })
            .from(redemptionBatches)
            .where(eq(redemptionBatches.creatorId, agent.userId));
          conditions.push(eq(redemptionCodes.batchId, sql`ANY(${agentBatches})`));
        }
      }

      let newStatus: string;
      if (body.action === "disable") newStatus = "disabled";
      else if (body.action === "enable") newStatus = "unused";
      else newStatus = "revoked";

      const result = await db
        .update(redemptionCodes)
        .set({ status: newStatus as any })
        .where(and(...conditions))
        .returning({ id: redemptionCodes.id });

      const updatedCount = result.length;

      // 记录审计日志
      try {
        await db.insert(auditLogs).values({
          operatorId: userId,
          action: "config_update",
          targetType: "redemption_code",
          after: { action: body.action, count: updatedCount, reason: body.reason ?? "" },
          ip: request.ip,
          description: `批量 ${body.action} 完成，共 ${updatedCount} 个`,
        });
      } catch {
        request.log.warn({ action: "batch_action" }, "audit log write failed");
      }

      reply.status(200).send({
        code: 0,
        data: { action: body.action, updatedCount },
        message: `批量 ${body.action === "disable" ? "停用" : body.action === "enable" ? "启用" : "作废"}完成，共 ${updatedCount} 个`,
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
