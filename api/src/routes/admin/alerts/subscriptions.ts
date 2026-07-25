// ============================================================
//  3cloud (3C) — 管理后台告警订阅管理 API
//  GET/POST /api/v1/admin/alerts/subscriptions — 订阅配置
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../../middleware/auth.js";
import { getRedis } from "../../../redis.js";

// ── Redis Key ──

const SUBSCRIPTION_KEY = (userId: number) => `3cloud:alert:subscriptions:${userId}`;

// ── 类型定义 ──

interface AlertSubscription {
  alertTypes: string[];
  enableBrowserNotification: boolean;
  enableEmailNotification: boolean;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string;   // "08:00"
}

// ── 获取订阅配置 ──

async function getSubscription(userId: number): Promise<AlertSubscription> {
  const redis = getRedis();
  const key = SUBSCRIPTION_KEY(userId);
  const data = await redis.get(key);

  if (data) {
    return JSON.parse(data);
  }

  // 默认配置
  return {
    alertTypes: [
      "failure_rate_spike",
      "quota_exhaustion",
      "suspicious_login",
      "abnormal_call_pattern",
    ],
    enableBrowserNotification: true,
    enableEmailNotification: false,
  };
}

// ── 保存订阅配置 ──

async function saveSubscription(userId: number, config: AlertSubscription): Promise<void> {
  const redis = getRedis();
  const key = SUBSCRIPTION_KEY(userId);
  await redis.set(key, JSON.stringify(config));
}

// ── 路由 ──

export async function adminAlertSubscriptionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── GET /api/v1/admin/alerts/subscriptions — 获取订阅配置 ──
  app.get("/api/v1/admin/alerts/subscriptions", async (request, reply) => {
    const userId = request.user!.userId;

    try {
      const subscription = await getSubscription(userId);
      reply.send({
        code: 0,
        data: subscription,
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `获取订阅配置失败: ${err.message}`,
      });
    }
  });

  // ── POST /api/v1/admin/alerts/subscriptions — 保存订阅配置 ──
  app.post("/api/v1/admin/alerts/subscriptions", async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as Partial<AlertSubscription>;

    try {
      const current = await getSubscription(userId);
      const updated: AlertSubscription = {
        alertTypes: body.alertTypes ?? current.alertTypes,
        enableBrowserNotification: body.enableBrowserNotification ?? current.enableBrowserNotification,
        enableEmailNotification: body.enableEmailNotification ?? current.enableEmailNotification,
        quietHoursStart: body.quietHoursStart ?? current.quietHoursStart,
        quietHoursEnd: body.quietHoursEnd ?? current.quietHoursEnd,
      };

      await saveSubscription(userId, updated);

      reply.send({
        code: 0,
        data: updated,
        message: "订阅配置已保存",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `保存订阅配置失败: ${err.message}`,
      });
    }
  });
}
