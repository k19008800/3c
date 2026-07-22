// ============================================================
//  3cloud (3C) —Admin 兑换码：风控批量处置
//  POST /api/v1/admin/redemption/risk-action
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { getRedis } from "../../../redis.js";
import {
  redemptionCodes,
  redemptionFraudEvents,
  auditLogs,
} from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";
import { banIp } from "../../../services/redemption-fraud.js";

export function registerRiskActionRoute(app: FastifyInstance): void {
  app.post("/api/v1/admin/redemption/risk-action", {
    preHandler: [requirePerm(Perm.SECURITY_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const adminUserId = request.user!.userId;

      const body = request.body as {
        action: "revoke_codes" | "ban_ip" | "acknowledge";
        eventIds: number[];
        reason?: string;
      };

      if (!body.action || !body.eventIds?.length) {
        reply.status(400).send({ code: 400, data: null, message: "action 和 eventIds 必填" });
        return;
      }

      // 获取风控事件
      const events = await db
        .select()
        .from(redemptionFraudEvents)
        .where(inArray(redemptionFraudEvents.id, body.eventIds));

      if (events.length === 0) {
        reply.status(404).send({ code: 404, data: null, message: "未找到风控事件" });
        return;
      }

      let codeIds: number[] = [];
      let ips: string[] = [];

      for (const ev of events) {
        if (ev.codeId) codeIds.push(ev.codeId);
        if (ev.ip) ips.push(ev.ip);
      }

      if (body.action === "revoke_codes" && codeIds.length > 0) {
        await db
          .update(redemptionCodes)
          .set({ status: "revoked" })
          .where(inArray(redemptionCodes.id, codeIds));
      }

      if (body.action === "ban_ip") {
        const redis = getRedis();
        for (const ip of [...new Set(ips)]) {
          if (ip) {
            await banIp(ip, body.reason ?? "风控批量封禁", adminUserId);
          }
        }
      }

      if (body.action === "acknowledge") {
        await db
          .update(redemptionFraudEvents)
          .set({ acknowledged: true, acknowledgedBy: adminUserId, acknowledgedAt: new Date() })
        conditions.push(eq(redemptionCodes.batchId, body.batchId));
      }

      // 审计日志
      await db.insert(auditLogs).values({
        operatorId: adminUserId,
        action: "config_update",
        targetType: "redemption_fraud",
        after: { action: body.action, eventIdCount: body.eventIds.length, reason: body.reason ?? "" },
        ip: request.ip,
        description: `风控处置: ${body.action}, ${body.eventIds.length} 个事件`,
      });

      reply.status(200).send({
        code: 0,
        data: {
          action: body.action,
          processedEvents: body.eventIds.length,
          revokedCodes: body.action === "revoke_codes" ? codeIds.length : 0,
          bannedIps: body.action === "ban_ip" ? [...new Set(ips)].length : 0,
        },
        message: "风控处置完成",
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
