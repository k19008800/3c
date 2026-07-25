// ============================================================
//  3cloud (3C) — Admin 异常操作告警管理
//  GET    /api/v1/admin/operation-alerts          — 告警列表
//  GET    /api/v1/admin/operation-alerts/:id      — 告警详情
//  PATCH  /api/v1/admin/operation-alerts/:id      — 处理告警
//  GET    /api/v1/admin/operation-alerts/rules    — 规则列表
//  PATCH  /api/v1/admin/operation-alerts/rules/:id — 更新规则
//  POST   /api/v1/admin/operation-alerts/scan     — 手动触发扫描
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  operationAlerts,
  operationAlertRules,
  operationLogs,
  users,
} from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import {
  manualScan,
  startOperationAlertScheduler,
} from "../../schedulers/operation-alert-scheduler.js";

// ── 告警类型标签 ──

const ALERT_TYPE_LABELS: Record<string, string> = {
  frequent_failure: "频繁失败",
  remote_login: "异地登录",
  batch_delete: "批量删除",
  sensitive_operation: "敏感操作",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "严重",
  warning: "警告",
  info: "信息",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  acknowledged: "已确认",
  resolved: "已解决",
  ignored: "已忽略",
};

export async function adminOperationAlertRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/operation-alerts — 列表
  // ──────────────────────────────────────────────

  app.get(
    "/api/v1/admin/operation-alerts",
    {
      preHandler: [requirePerm(Perm.AUDIT_VIEW)],
    },
    async (request, reply) => {
      const db = getDb();
      const query = request.query as {
        page?: string;
        pageSize?: string;
        alertType?: string;
        severity?: string;
        status?: string;
        userId?: string;
        startDate?: string;
        endDate?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;

      const conditions: any[] = [sql`1=1`];

      if (query.alertType) {
        conditions.push(eq(operationAlerts.alertType, query.alertType));
      }

      if (query.severity) {
        conditions.push(eq(operationAlerts.severity, query.severity));
      }

      if (query.status) {
        conditions.push(eq(operationAlerts.status, query.status));
      }

      if (query.userId) {
        const uid = parseInt(query.userId, 10);
        if (!isNaN(uid)) {
          conditions.push(eq(operationAlerts.userId, uid));
        }
      }

      if (query.startDate) {
        conditions.push(gte(operationAlerts.createdAt, new Date(query.startDate)));
      }

      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setDate(end.getDate() + 1);
        conditions.push(gte(operationAlerts.createdAt, end));
      }

      // 总条数
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(operationAlerts)
        .where(and(...conditions));

      // 主数据
      const rows = await db
        .select({
          id: operationAlerts.id,
          alertType: operationAlerts.alertType,
          severity: operationAlerts.severity,
          userId: operationAlerts.userId,
          userEmail: users.email,
          userNickname: users.nickname,
          title: operationAlerts.title,
          description: operationAlerts.description,
          status: operationAlerts.status,
          handledBy: operationAlerts.handledBy,
          handledAt: operationAlerts.handledAt,
          handleNote: operationAlerts.handleNote,
          notificationSent: operationAlerts.notificationSent,
          createdAt: operationAlerts.createdAt,
        })
        .from(operationAlerts)
        .leftJoin(users, eq(operationAlerts.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(operationAlerts.createdAt))
        .limit(pageSize)
        .offset(offset);

      const list = rows.map((r: any) => ({
        id: r.id,
        alertType: r.alertType,
        alertTypeLabel: ALERT_TYPE_LABELS[r.alertType] || r.alertType,
        severity: r.severity,
        severityLabel: SEVERITY_LABELS[r.severity] || r.severity,
        userId: r.userId,
        userEmail: r.userEmail,
        userNickname: r.userNickname,
        title: r.title,
        description: r.description,
        status: r.status,
        statusLabel: STATUS_LABELS[r.status] || r.status,
        handledBy: r.handledBy,
        handledAt: r.handledAt?.toISOString?.() ?? null,
        handleNote: r.handleNote,
        notificationSent: r.notificationSent,
        createdAt: r.createdAt.toISOString(),
      }));

      reply.send({
        code: 0,
        data: {
          list,
          total: countResult.count,
          page,
          pageSize,
        },
        message: "ok",
      });
    }
  );

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/operation-alerts/:id — 详情
  // ──────────────────────────────────────────────

  app.get(
    "/api/v1/admin/operation-alerts/:id",
    {
      preHandler: [requirePerm(Perm.AUDIT_VIEW)],
    },
    async (request, reply) => {
      const db = getDb();
      const params = request.params as { id: string };
      const alertId = parseInt(params.id, 10);

      if (isNaN(alertId)) {
        return reply.status(400).send({ code: 400, message: "无效的告警 ID" });
      }

      const [alert] = await db
        .select()
        .from(operationAlerts)
        .where(eq(operationAlerts.id, alertId))
        .limit(1);

      if (!alert) {
        return reply.status(404).send({ code: 404, message: "告警不存在" });
      }

      // 获取关联的操作日志
      let relatedOperations: any[] = [];
      if (alert.relatedOperationIds && alert.relatedOperationIds.length > 0) {
        relatedOperations = await db
          .select({
            id: operationLogs.id,
            action: operationLogs.action,
            category: operationLogs.category,
            summary: operationLogs.summary,
            status: operationLogs.status,
            errorReason: operationLogs.errorReason,
            ip: operationLogs.ip,
            createdAt: operationLogs.createdAt,
          })
          .from(operationLogs)
          .where(inArray(operationLogs.id, alert.relatedOperationIds as number[]))
          .orderBy(desc(operationLogs.createdAt));
      }

      // 获取用户信息
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          nickname: users.nickname,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, alert.userId))
        .limit(1);

      reply.send({
        code: 0,
        data: {
          alert: {
            id: alert.id,
            alertType: alert.alertType,
            alertTypeLabel: ALERT_TYPE_LABELS[alert.alertType] || alert.alertType,
            severity: alert.severity,
            severityLabel: SEVERITY_LABELS[alert.severity] || alert.severity,
            userId: alert.userId,
            title: alert.title,
            description: alert.description,
            metadata: alert.metadata,
            status: alert.status,
            statusLabel: STATUS_LABELS[alert.status] || alert.status,
            handledBy: alert.handledBy,
            handledAt: alert.handledAt?.toISOString?.() ?? null,
            handleNote: alert.handleNote,
            notificationSent: alert.notificationSent,
            createdAt: alert.createdAt.toISOString(),
          },
          user,
          relatedOperations: relatedOperations.map((op) => ({
            ...op,
            createdAt: op.createdAt.toISOString(),
          })),
        },
        message: "ok",
      });
    }
  );

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/operation-alerts/:id — 处理告警
  // ──────────────────────────────────────────────

  app.patch(
    "/api/v1/admin/operation-alerts/:id",
    {
      preHandler: [requirePerm(Perm.AUDIT_MANAGE)],
    },
    async (request, reply) => {
      const db = getDb();
      const params = request.params as { id: string };
      const body = request.body as {
        status?: "acknowledged" | "resolved" | "ignored";
        handleNote?: string;
      };
      const alertId = parseInt(params.id, 10);

      if (isNaN(alertId)) {
        return reply.status(400).send({ code: 400, message: "无效的告警 ID" });
      }

      if (!body.status) {
        return reply.status(400).send({ code: 400, message: "缺少 status 参数" });
      }

      const user = (request as any).user;

      const [updated] = await db
        .update(operationAlerts)
        .set({
          status: body.status,
          handledBy: user.id,
          handledAt: new Date(),
          handleNote: body.handleNote ?? null,
          updatedAt: new Date(),
        })
        .where(eq(operationAlerts.id, alertId))
        .returning({ id: operationAlerts.id });

      if (!updated) {
        return reply.status(404).send({ code: 404, message: "告警不存在" });
      }

      reply.send({
        code: 0,
        data: { id: updated.id },
        message: "告警已处理",
      });
    }
  );

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/operation-alerts/rules — 规则列表
  // ──────────────────────────────────────────────

  app.get(
    "/api/v1/admin/operation-alerts/rules",
    {
      preHandler: [requirePerm(Perm.SYSTEM_CONFIG)],
    },
    async (request, reply) => {
      const db = getDb();

      const rules = await db
        .select()
        .from(operationAlertRules)
        .orderBy(desc(operationAlertRules.id));

      reply.send({
        code: 0,
        data: rules.map((r) => ({
          id: r.id,
          ruleType: r.ruleType,
          name: r.name,
          description: r.description,
          enabled: r.enabled,
          severity: r.severity,
          params: r.params,
          notifyInApp: r.notifyInApp,
          notifyEmail: r.notifyEmail,
          emailRecipients: r.emailRecipients,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
        message: "ok",
      });
    }
  );

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/operation-alerts/rules/:id — 更新规则
  // ──────────────────────────────────────────────

  app.patch(
    "/api/v1/admin/operation-alerts/rules/:id",
    {
      preHandler: [requirePerm(Perm.SYSTEM_CONFIG)],
    },
    async (request, reply) => {
      const db = getDb();
      const params = request.params as { id: string };
      const body = request.body as {
        enabled?: boolean;
        severity?: string;
        params?: any;
        notifyInApp?: boolean;
        notifyEmail?: boolean;
        emailRecipients?: string[];
      };
      const ruleId = parseInt(params.id, 10);

      if (isNaN(ruleId)) {
        return reply.status(400).send({ code: 400, message: "无效的规则 ID" });
      }

      const user = (request as any).user;

      const updateData: any = {
        updatedBy: user.id,
        updatedAt: new Date(),
      };

      if (body.enabled !== undefined) updateData.enabled = body.enabled;
      if (body.severity) updateData.severity = body.severity;
      if (body.params) updateData.params = body.params;
      if (body.notifyInApp !== undefined) updateData.notifyInApp = body.notifyInApp;
      if (body.notifyEmail !== undefined) updateData.notifyEmail = body.notifyEmail;
      if (body.emailRecipients) updateData.emailRecipients = body.emailRecipients;

      const [updated] = await db
        .update(operationAlertRules)
        .set(updateData)
        .where(eq(operationAlertRules.id, ruleId))
        .returning({ id: operationAlertRules.id });

      if (!updated) {
        return reply.status(404).send({ code: 404, message: "规则不存在" });
      }

      reply.send({
        code: 0,
        data: { id: updated.id },
        message: "规则已更新",
      });
    }
  );

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/operation-alerts/scan — 手动扫描
  // ──────────────────────────────────────────────

  app.post(
    "/api/v1/admin/operation-alerts/scan",
    {
      preHandler: [requirePerm(Perm.SYSTEM_CONFIG)],
    },
    async (request, reply) => {
      const result = await manualScan();

      reply.send({
        code: result.success ? 0 : 500,
        data: {
          alertsCreated: result.alertsCreated,
          errors: result.errors,
        },
        message: result.success ? "扫描完成" : "扫描失败",
      });
    }
  );

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/operation-alerts/stats — 统计
  // ──────────────────────────────────────────────

  app.get(
    "/api/v1/admin/operation-alerts/stats",
    {
      preHandler: [requirePerm(Perm.AUDIT_VIEW)],
    },
    async (request, reply) => {
      const db = getDb();

      // 按状态统计
      const statusStats = await db
        .select({
          status: operationAlerts.status,
          count: sql<number>`count(*)::int`,
        })
        .from(operationAlerts)
        .groupBy(operationAlerts.status);

      // 按类型统计
      const typeStats = await db
        .select({
          alertType: operationAlerts.alertType,
          count: sql<number>`count(*)::int`,
        })
        .from(operationAlerts)
        .groupBy(operationAlerts.alertType);

      // 按严重程度统计
      const severityStats = await db
        .select({
          severity: operationAlerts.severity,
          count: sql<number>`count(*)::int`,
        })
        .from(operationAlerts)
        .groupBy(operationAlerts.severity);

      // 最近 24 小时告警数
      const [recentCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(operationAlerts)
        .where(
          gte(operationAlerts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
        );

      reply.send({
        code: 0,
        data: {
          statusStats: statusStats.map((s) => ({
            status: s.status,
            label: STATUS_LABELS[s.status] || s.status,
            count: s.count,
          })),
          typeStats: typeStats.map((t) => ({
            alertType: t.alertType,
            label: ALERT_TYPE_LABELS[t.alertType] || t.alertType,
            count: t.count,
          })),
          severityStats: severityStats.map((s) => ({
            severity: s.severity,
            label: SEVERITY_LABELS[s.severity] || s.severity,
            count: s.count,
          })),
          recent24h: recentCount.count,
        },
        message: "ok",
      });
    }
  );
}
