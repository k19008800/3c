// ============================================================
//  3cloud (3C) — 通知订阅管理路由
//  GET    /api/v1/me/notifications/subscriptions         — 获取订阅设置
//  PUT    /api/v1/me/notifications/subscriptions         — 更新订阅设置
//  GET    /api/v1/me/notifications/settings              — 获取通知设置
//  PUT    /api/v1/me/notifications/settings              — 更新通知设置
//  GET    /api/v1/me/notifications/preferences           — 获取通知偏好
//  PUT    /api/v1/me/notifications/preferences           — 更新通知偏好
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../middleware/auth.js";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { userNotificationPreferences, userNotificationSubscriptions } from "../db/schema.js";

// 默认订阅类型
const DEFAULT_SUBSCRIPTIONS = [
  'failure_rate_spike',
  'quota_exhaustion',
  'suspicious_login',
  'abnormal_call_pattern'
];

// 默认通知设置
const DEFAULT_SETTINGS = {
  browserNotifications: true,
  mobilePush: true,
  emailNotifications: false,
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00'
  },
  criticalAlertsAlways: true,
  soundEnabled: true,
  vibrationEnabled: true
};

// 默认告警级别过滤
const DEFAULT_ALERT_FILTERS = {
  enabledLevels: ['critical', 'error', 'warning', 'info'],
  minimumLevel: 'info'
};

export async function notificationSubscriptionRoutes(app: FastifyInstance) {
  // ── 获取订阅设置 ──
  // GET /api/v1/me/notifications/subscriptions
  app.get("/api/v1/me/notifications/subscriptions", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      try {
        // 获取用户订阅
        const subscriptions = await db
          .select()
          .from(userNotificationSubscriptions)
          .where(eq(userNotificationSubscriptions.userId, userId));

        // 如果用户没有订阅记录，返回默认订阅
        if (subscriptions.length === 0) {
          return reply.send({
            success: true,
            subscriptions: DEFAULT_SUBSCRIPTIONS.map(type => ({
              type,
              subscribed: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }))
          });
        }

        return reply.send({
          success: true,
          subscriptions: subscriptions.map(sub => ({
            type: sub.type,
            subscribed: sub.subscribed,
            createdAt: sub.createdAt.toISOString(),
            updatedAt: sub.updatedAt.toISOString()
          }))
        });
      } catch (error) {
        console.error("[NotificationSubscriptions] Get error:", error);
        return reply.status(500).send({
          success: false,
          message: "获取订阅设置失败"
        });
      }
    }
  });

  // ── 更新订阅设置 ──
  // PUT /api/v1/me/notifications/subscriptions
  app.put("/api/v1/me/notifications/subscriptions", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;
      const body = request.body as { subscriptions: Array<{ type: string; subscribed: boolean }> };

      try {
        const now = new Date();
        
        // 删除旧的订阅记录
        await db
          .delete(userNotificationSubscriptions)
          .where(eq(userNotificationSubscriptions.userId, userId));

        // 插入新的订阅记录
        if (body.subscriptions && body.subscriptions.length > 0) {
          const subscriptionData = body.subscriptions.map(sub => ({
            userId,
            type: sub.type,
            subscribed: sub.subscribed,
            createdAt: now,
            updatedAt: now
          }));

          await db
            .insert(userNotificationSubscriptions)
            .values(subscriptionData);
        }

        return reply.send({
          success: true,
          message: "订阅设置已更新",
          updatedAt: now.toISOString()
        });
      } catch (error) {
        console.error("[NotificationSubscriptions] Update error:", error);
        return reply.status(500).send({
          success: false,
          message: "更新订阅设置失败"
        });
      }
    }
  });

  // ── 获取通知设置 ──
  // GET /api/v1/me/notifications/settings
  app.get("/api/v1/me/notifications/settings", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      try {
        const preferences = await db
          .select()
          .from(userNotificationPreferences)
          .where(eq(userNotificationPreferences.userId, userId));

        if (preferences.length ===对外交流0) {
          return reply.send({
            success: true,
            settings: DEFAULT_SETTINGS,
            alertFilters: DEFAULT_ALERT_FILTERS
          });
        }

        const pref = preferences[0];
        return reply.send({
          success: true,
          settings: {
            browserNotifications: pref.browserNotifications ?? DEFAULT_SETTINGS.browserNotifications,
            mobilePush: pref.mobilePush ?? DEFAULT_SETTINGS.mobilePush,
            emailNotifications: pref.emailNotifications ?? DEFAULT_SETTINGS.emailNotifications,
            quietHours: {
              enabled: pref.quietHoursEnabled ?? DEFAULT_SETTINGS.quietHours.enabled,
              start: pref.quietHoursStart ?? DEFAULT_SETTINGS.quietHours.start,
              end: pref.quietHoursEnd ?? DEFAULT_SETTINGS.quietHours.end
            },
            criticalAlertsAlways: pref.criticalAlertsAlways ?? DEFAULT_SETTINGS.criticalAlertsAlways,
            soundEnabled: pref.soundEnabled ?? DEFAULT_SETTINGS.soundEnabled,
            vibrationEnabled: pref.vibrationEnabled ?? DEFAULT_SETTINGS.vibrationEnabled
          },
          alertFilters: {
            enabledLevels: pref.enabledAlertLevels ? JSON.parse(pre.enabledAlertLevels) : DEFAULT_ALERT_FILTERS.enabledLevels,
            minimumLevel: pref.minimumAlertLevel ?? DEFAULT_ALERT_FILTERS.minimumLevel
          }
        });
      } catch (error) {
        console.error("[NotificationSettings] Get error:", error);
        return reply.status(500).send({
          success: false,
          message: "获取通知设置失败"
        });
      }
    }
  });

  // ── 更新通知设置 ──
  // PUT /api/v1/me/notifications/settings
  app.put("/api/v1/me/notifications/settings", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;
      const body = request.body as {
        settings: typeof DEFAULT_SETTINGS;
        alertFilters: typeof DEFAULT_ALERT_FILTERS;
      };

      try {
        const now = new Date();
        const settings = body.settings || DEFAULT_SETTINGS;
        const alertFilters = body.alertFilters || DEFAULT_ALERT_FILTERS;

        // 检查是否存在记录
        const existing = await db
          .select()
          .from(userNotificationPreferences)
          .where(eq(userNotificationPreferences.userId, userId));

        if (existing.length > 0) {
          // 更新现有记录
          await db
            .update(userNotificationPreferences)
            .set({
              browserNotifications: settings.browserNotifications,
              mobilePush: settings.mobilePush,
              emailNotifications: settings.emailNotifications,
              quietHoursEnabled: settings.quietHours.enabled,
              quietHoursStart: settings.quietHours.start,
              quietHoursEnd: settings.quietHours.end,
              criticalAlertsAlways: settings.criticalAlertsAlways,
              soundEnabled: settings.soundEnabled,
              vibrationEnabled: settings.vibrationEnabled,
              enabledAlertLevels: JSON.stringify(alertFilters.enabledLevels),
              minimumAlertLevel: alertFilters.minimumLevel,
              updatedAt: now
            })
            .where(eq(userNotificationPreferences.userId, userId));
        } else {
          // 插入新记录
          await db
            .insert(userNotificationPreferences)
            .values({
              userId,
              browserNotifications: settings.browserNotifications,
              mobilePush: settings.mobilePush,
              emailNotifications: settings.emailNotifications,
              quietHoursEnabled: settings.quietHours.enabled,
              quietHoursStart: settings.quietHours.start,
              quietHoursEnd: settings.quietHours.end,
              criticalAlertsAlways: settings.criticalAlertsAlways,
              soundEnabled: settings.soundEnabled,
              vibrationEnabled: settings.vibrationEnabled,
              enabledAlertLevels: JSON.stringify(alertFilters.enabledLevels),
              minimumAlertLevel: alertFilters.minimumLevel,
              createdAt: now,
              updatedAt: now
            });
        }

        return reply.send({
          success: true,
          message: "通知设置已更新",
          updatedAt: now.toISOString()
        });
      } catch (error) {
        console.error("[NotificationSettings] Update error:", error);
        return reply.status(500).send({
          success: false,
          message: "更新通知设置失败"
        });
      }
    }
  });

  // ── 获取通知偏好（简化接口） ──
  // GET /api/v1/me/notifications/preferences
  app.get("/api/v1/me/notifications/preferences", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      try {
        // 获取订阅
        const subscriptions = await db
          .select()
          .from(userNotificationSubscriptions)
          .where(eq(userNotificationSubscriptions.userId, userId));

        // 获取偏好设置
        const preferences = await db
          .select()
          .from(userNotificationPreferences)
          .where(eq(userNotificationPreferences.userId, userId));

        const subs = subscriptions.length > 0 
          ? subscriptions.map(sub => ({ type: sub.type, subscribed: sub.subscribed }))
          : DEFAULT_SUBSCRIPTIONS.map(type => ({ type, subscribed: true }));

        const pref = preferences.length > 0 ? preferences[0] : null;

        return reply.send({
          success: true,
          subscriptions: subs,
          settings: pref ? {
            browserNotifications: pref.browserNotifications,
            mobilePush: pref.mobilePush,
            emailNotifications: pref.emailNotifications,
            quietHours: {
              enabled: pref.quietHoursEnabled,
              start: pref.quietHoursStart,
              end: pref.quietHoursEnd
            },
            criticalAlertsAlways: pref.criticalAlertsAlways,
            soundEnabled: pref.soundEnabled,
            vibrationEnabled: pref.vibrationEnabled
          } : DEFAULT_SETTINGS,
          alertFilters: pref ? {
            enabledLevels: pref.enabledAlertLevels ? JSON.parse(pref.enabledAlertLevels) : DEFAULT_ALERT_FILTERS.enabledLevels,
            minimumLevel: pref.minimumAlertLevel
          } : DEFAULT_ALERT_FILTERS
        });
      } catch (error) {
        console.error("[NotificationPreferences] Get error:", error);
        return reply.status(500).send({
          success: false,
          message: "获取通知偏好失败"
        });
      }
    }
  });
}