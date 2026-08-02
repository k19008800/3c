import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import {
  userNotificationPreferences,
  DEFAULT_IN_APP_PREFERENCES,
  DEFAULT_EMAIL_PREFERENCES,
  FORCED_EVENTS,
} from "../db/schema/notification-preferences";

/**
 * §22.6 用户端通知偏好增强
 * 对应 docs/SPEC-§22-用户端体验增强.md §22.6
 */

export function meNotificationPreferencesRoutes(app: FastifyInstance) {
  // 获取通知偏好
  app.get("/me/preferences/notifications", async (req) => {
    const userId = Number((req as any).user.sub);

    let prefs = await db
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, userId))
      .limit(1);

    // 无记录时返回默认值
    if (!prefs[0]) {
      return {
        code: 0,
        data: {
          emailEnabled: true,
          emailFrequency: "daily",
          emailDigestTime: "09:00",
          inAppPreferences: DEFAULT_IN_APP_PREFERENCES,
          emailPreferences: DEFAULT_EMAIL_PREFERENCES,
          balanceLowThreshold: 10,
        },
        message: "ok",
      };
    }

    return {
      code: 0,
      data: {
        emailEnabled: prefs[0].emailEnabled ?? true,
        emailFrequency: prefs[0].emailFrequency ?? "daily",
        emailDigestTime: prefs[0].emailDigestTime ?? "09:00",
        inAppPreferences: { ...DEFAULT_IN_APP_PREFERENCES, ...(prefs[0].inAppPreferences as Record<string, boolean> ?? {}) },
        emailPreferences: { ...DEFAULT_EMAIL_PREFERENCES, ...(prefs[0].emailPreferences as Record<string, boolean> ?? {}) },
        balanceLowThreshold: prefs[0].balanceLowThreshold ?? 10,
      },
      message: "ok",
    };
  });

  // 更新通知偏好
  app.put("/me/preferences/notifications", async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const body = req.body as {
      emailEnabled?: boolean;
      emailFrequency?: string;
      emailDigestTime?: string;
      inAppPreferences?: Record<string, boolean>;
      emailPreferences?: Record<string, boolean>;
      balanceLowThreshold?: number;
    };

    // 验证强制开启事件不可关闭
    if (body.inAppPreferences) {
      for (const evt of FORCED_EVENTS) {
        if (body.inAppPreferences[evt] === false) {
          return reply.code(400).send({
            code: 400,
            error: "FORCED_EVENT",
            message: `"${evt}" 为安全强制开启事件，不可关闭`,
          });
        }
      }
    }
    if (body.emailPreferences) {
      for (const evt of FORCED_EVENTS) {
        if (body.emailPreferences[evt] === false) {
          return reply.code(400).send({
            code: 400,
            error: "FORCED_EVENT",
            message: `"${evt}" 为安全强制开启事件，不可关闭`,
          });
        }
      }
    }

    // 验证 emailFrequency
    if (body.emailFrequency && !["realtime", "daily", "off"].includes(body.emailFrequency)) {
      return reply.code(400).send({
        code: 400,
        error: "INVALID_FREQUENCY",
        message: "emailFrequency 必须是 realtime/daily/off",
      });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (body.emailEnabled !== undefined) updateData.emailEnabled = body.emailEnabled;
    if (body.emailFrequency !== undefined) updateData.emailFrequency = body.emailFrequency;
    if (body.emailDigestTime !== undefined) updateData.emailDigestTime = body.emailDigestTime;
    if (body.inAppPreferences !== undefined) updateData.inAppPreferences = body.inAppPreferences;
    if (body.emailPreferences !== undefined) updateData.emailPreferences = body.emailPreferences;
    if (body.balanceLowThreshold !== undefined) updateData.balanceLowThreshold = body.balanceLowThreshold;

    const exist = await db
      .select({ id: userNotificationPreferences.id })
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, userId))
      .limit(1);

    if (exist[0]) {
      await db
        .update(userNotificationPreferences)
        .set(updateData)
        .where(eq(userNotificationPreferences.id, exist[0].id));
    } else {
      await db
        .insert(userNotificationPreferences)
        .values({ userId, ...updateData });
    }

    return { code: 0, data: { success: true }, message: "通知偏好已保存" };
  });

  // 恢复默认
  app.post("/me/preferences/notifications/reset", async (req) => {
    const userId = Number((req as any).user.sub);

    const exist = await db
      .select({ id: userNotificationPreferences.id })
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, userId))
      .limit(1);

    if (exist[0]) {
      await db
        .update(userNotificationPreferences)
        .set({
          emailEnabled: true,
          emailFrequency: "daily",
          emailDigestTime: "09:00",
          inAppPreferences: DEFAULT_IN_APP_PREFERENCES,
          emailPreferences: DEFAULT_EMAIL_PREFERENCES,
          balanceLowThreshold: 10,
          updatedAt: new Date(),
        })
        .where(eq(userNotificationPreferences.id, exist[0].id));
    }

    return { code: 0, data: { success: true }, message: "通知偏好已恢复默认" };
  });
}
