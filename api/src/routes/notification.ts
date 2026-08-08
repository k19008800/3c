import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, pool } from "../db/index";
import { notificationSubscriptions, ALERT_TYPES } from "../db/schema/notification-subscriptions";
import { userNotifications, NOTIFICATION_CATEGORY_LABELS } from "../db/schema/user-notifications";

/**
 * 用户通知系统
 * - 订阅偏好（原有）
 * - 通知消息 CRUD（新增 §32.4）
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

  // ============================================================
  // 订阅偏好（原有）
  // ============================================================

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

  // ============================================================
  // 通知消息（新增 §32.4）
  // ============================================================

  // 3. 通知列表（分页 + 已读/未读筛选）
  app.get("/notifications", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 50);
    const offset = (page - 1) * pageSize;

    let where = "WHERE user_id=$1";
    const params: any[] = [userId];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.is_read !== undefined) where += ` AND is_read=${pp(q.is_read === "true" || q.is_read === true)}`;
    if (q.category) where += ` AND category=${pp(q.category)}`;

    const rows = await pool.query(
      `SELECT id, user_id, title, content, category, is_read, read_at, created_at
       FROM user_notifications ${where} ORDER BY created_at DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`,
      params,
    );
    const total = await pool.query(
      `SELECT COUNT(*)::int AS c FROM user_notifications ${where}`,
      params.slice(0, params.length - 2),
    );

    const unreadCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM user_notifications WHERE user_id=$1 AND is_read=false`,
      [userId],
    );

    return {
      code: 0,
      data: {
        list: rows.rows.map((r: any) => ({
          ...r,
          category_label: NOTIFICATION_CATEGORY_LABELS[r.category] ?? r.category,
        })),
        pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) },
        unread_count: Number(unreadCount.rows[0]?.c ?? 0),
      },
      message: "ok",
    };
  });

  // 4. 标记已读
  app.put("/notifications/:id/read", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const id = Number((req.params as any).id);
    const r = await db
      .update(userNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(userNotifications.id, id), eq(userNotifications.userId, userId)));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "通知不存在" });
    return { code: 0, data: { success: true }, message: "已标记为已读" };
  });

  // 5. 全部已读
  app.put("/notifications/read-all", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    await db
      .update(userNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
    return { code: 0, data: { success: true }, message: "全部已标记为已读" };
  });
}
