// ============================================================
//  3cloud (3C) — 管理后台告警管理 API
//  GET /api/v1/admin/alerts — 获取所有告警
//  POST /api/v1/admin/alerts/:id/acknowledge — 确认告警
//  POST /api/v1/admin/alerts/:id/resolve — 解决告警
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../../middleware/auth.js";
import { getRedis } from "../../../redis.js";

// ── Redis Keys ──

const ALERT_ACK_KEY = (alertId: string) => `3cloud:alert:ack:${alertId}`;
const ALERT_RESOLVE_KEY = (alertId: string) => `3cloud:alert:resolve:${alertId}`;

// ── 类型定义 ──

interface AlertAckInfo {
  acknowledgedBy: number;
  acknowledgedAt: string;
  action: "acknowledge" | "ignore";
}

interface AlertResolveInfo {
  resolvedBy: number;
  resolvedAt: string;
  resolution: string;
}

// ── 确认告警 ──

async function acknowledgeAlertInRedis(
  alertId: string,
  userId: number,
  action: "acknowledge" | "ignore"
): Promise<void> {
  const redis = getRedis();
  const key = ALERT_ACK_KEY(alertId);
  const info: AlertAckInfo = {
    acknowledgedBy: userId,
    acknowledgedAt: new Date().toISOString(),
    action,
  };
  await redis.set(key, JSON.stringify(info), "EX", 86400 * 30); // 30 天过期
}

// ── 解决告警 ──

async function resolveAlertInRedis(
  alertId: string,
  userId: number,
  resolution: string
): Promise<void> {
  const redis = getRedis();
  const key = ALERT_RESOLVE_KEY(alertId);
  const info: AlertResolveInfo = {
    resolvedBy: userId,
    resolvedAt: new Date().toISOString(),
    resolution,
  };
  await redis.set(key, JSON.stringify(info), "EX", 86400 * 30); // 30 天过期
}

// ── 获取告警状态 ──

async function getAlertStatus(alertId: string): Promise<{
  acknowledged?: AlertAckInfo;
  resolved?: AlertResolveInfo;
}> {
  const redis = getRedis();
  const ackKey = ALERT_ACK_KEY(alertId);
  const resolveKey = ALERT_RESOLVE_KEY(alertId);

  const [ackData, resolveData] = await Promise.all([
    redis.get(ackKey),
    redis.get(resolveKey),
  ]);

  return {
    acknowledged: ackData ? JSON.parse(ackData) : undefined,
    resolved: resolveData ? JSON.parse(resolveData) : undefined,
  };
}

// ── 路由 ──

export async function adminAlertRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── POST /api/v1/admin/alerts/:id/acknowledge — 确认告警 ──
  app.post("/api/v1/admin/alerts/:id/acknowledge", async (request, reply) => {
    const userId = request.user!.userId;
    const alertId = (request.params as { id: string }).id;
    const body = request.body as { action: "acknowledge" | "ignore" };

    if (!body.action || !["acknowledge", "ignore"].includes(body.action)) {
      reply.status(400).send({
        code: 1,
        message: "action 必须是 acknowledge 或 ignore",
      });
      return;
    }

    try {
      await acknowledgeAlertInRedis(alertId, userId, body.action);

      reply.send({
        code: 0,
        data: {
          alertId,
          action: body.action,
          acknowledgedAt: new Date().toISOString(),
        },
        message: "告警已确认",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `确认告警失败: ${err.message}`,
      });
    }
  });

  // ── POST /api/v1/admin/alerts/:id/resolve — 解决告警 ──
  app.post("/api/v1/admin/alerts/:id/resolve", async (request, reply) => {
    const userId = request.user!.userId;
    const alertId = (request.params as { id: string }).id;
    const body = request.body as { resolution: string };

    if (!body.resolution) {
      reply.status(400).send({
        code: 1,
        message: "缺少解决方案说明",
      });
      return;
    }

    try {
      await resolveAlertInRedis(alertId, userId, body.resolution);

      reply.send({
        code: 0,
        data: {
          alertId,
          resolvedAt: new Date().toISOString(),
        },
        message: "告警已解决",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `解决告警失败: ${err.message}`,
      });
    }
  });

  // ── GET /api/v1/admin/alerts/:id/status — 获取告警状态 ──
  app.get("/api/v1/admin/alerts/:id/status", async (request, reply) => {
    const alertId = (request.params as { id: string }).id;

    try {
      const status = await getAlertStatus(alertId);

      reply.send({
        code: 0,
        data: status,
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `获取告警状态失败: ${err.message}`,
      });
    }
  });
}
