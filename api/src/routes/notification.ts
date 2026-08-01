import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index";
import { notificationSubscriptions, ALERT_TYPES } from "../db/schema/notification-subscriptions";

/**
 * 用户通知订阅偏好
 * 对齐 ref-4.5-marketing.md §6
 * 用户配置各告警类型(8种) × 渠道(site/email) 是否启用
 */

function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };
}

export function notificationRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);

  // 1. 获取订阅偏好（带默认：全部开启）
  app.get("/me/notification-subscriptions", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const rows = await db.select().from(notificationSubscriptions).where(eq(notificationSubscriptions.userId, userId));
    const prefs: Record<string, { site: boolean; email: boolean }> = {};
    for (const t of Object.keys(ALERT_TYPES)) prefs[t] = { site: true, email: true };
    for (const r of rows) {
      const t = r.type ?? "";
      if (!prefs[t]) prefs[t] = { site: true, email: true };
      if (r.channel === "email") prefs[t].email = r.enabled;
      else prefs[t].site = r.enabled;
    }
    return { code: 0, data: { types: ALERT_TYPES, prefs }, message: "ok" };
  });

  // 2. 更新单个偏好
  app.post("/me/notification-subscriptions/:type/:channel", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const { type, channel } = req.params as { type: string; channel: string };
    const { enabled } = req.body as { enabled?: boolean };
    if (!Object.keys(ALERT_TYPES).includes(type)) return reply.code(400).send({ code: 400, error: "BAD_TYPE", message: "未知告警类型" });
    if (!["site", "email"].includes(channel)) return reply.code(400).send({ code: 400, error: "BAD_CHANNEL" });

    const exist = await db.select().from(notificationSubscriptions)
      .where(and(eq(notificationSubscriptions.userId, userId), eq(notificationSubscriptions.type, type), eq(notificationSubscriptions.channel, channel)))
      .limit(1);
    if (exist[0]) {
      await db.update(notificationSubscriptions).set({ enabled: !!enabled, updatedAt: new Date() }).where(eq(notificationSubscriptions.id, exist[0].id));
    } else {
      await db.insert(notificationSubscriptions).values({ userId, type, channel, enabled: !!enabled });
    }
    return { code: 0, data: { ok: true }, message: "偏好已更新" };
  });
}
