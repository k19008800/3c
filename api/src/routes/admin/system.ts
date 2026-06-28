// ============================================================
//  3cloud (3C) — 系统配置管理路由（管理员）
//  GET    /api/v1/admin/configs              — 配置列表
//  PATCH  /api/v1/admin/configs/:key         — 更新配置
//  GET    /api/v1/admin/audit-logs           — 审计日志
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, like, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { systemConfigs, auditLogs, users, rechargeOrders } from "../../db/schema.js";
import { authenticateJWT, requireRole } from "../../middleware/auth.js";

export async function adminSystemRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requireRole("super_admin", "admin"));

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/configs — 系统配置列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/configs", async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      group?: string;
    };

    const conditions: any[] = [sql`1=1`];
    if (query.group) {
      conditions.push(like(systemConfigs.key, `${query.group}%`));
    }

    const rows = await db
      .select({
        key: systemConfigs.key,
        value: systemConfigs.value,
        description: systemConfigs.description,
        updatedAt: systemConfigs.updatedAt,
      })
      .from(systemConfigs)
      .where(and(...conditions))
      .orderBy(systemConfigs.key);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          ...r,
          updatedAt: r.updatedAt?.toISOString() ?? null,
        })),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/configs/:key — 更新配置
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/configs/:key", async (request, reply) => {
    const db = getDb();
    const { key } = request.params as { key: string };
    const operatorId = request.user!.userId;

    if (!key) {
      reply.status(400).send({ code: 400, data: null, message: "缺少配置 key" });
      return;
    }

    const { value } = request.body as { value: string };

    if (value === undefined || value === null) {
      reply.status(400).send({ code: 400, data: null, message: "缺少配置 value" });
      return;
    }

    // 检查配置是否存在
    const [existing] = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, key))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: `配置 "${key}" 不存在` });
      return;
    }

    const valueStr = String(value);

    await db.transaction(async (tx) => {
      await tx
        .update(systemConfigs)
        .set({ value: valueStr })
        .where(eq(systemConfigs.key, key));

      // 审计日志
      await tx.insert(auditLogs).values({
        operatorId,
        action: "user_update",
        targetType: "config",
        targetId: existing.id,
        before: { value: existing.value },
        after: { value: valueStr },
        ip: request.ip,
        description: `更新系统配置 ${key}: ${existing.value} → ${valueStr}`,
      });
    });

    // 清除相关缓存（如果有）
    try {
      const { clearPricingMultiplierCache } = await import("../../services/billing.js");
      if (key.startsWith("pricing_") || key === "enterprise_discount_rate") {
        clearPricingMultiplierCache();
      }
    } catch { /* 非必需 */ }

    reply.status(200).send({
      code: 0,
      data: null,
      message: "配置已更新",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/audit-logs — 审计日志
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/audit-logs", async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      action?: string;
      targetType?: string;
      targetId?: string;
      operatorId?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [sql`1=1`];

    if (query.action) {
      conditions.push(eq(auditLogs.action, query.action as any));
    }
    if (query.targetType) {
      conditions.push(eq(auditLogs.targetType, query.targetType));
    }
    if (query.targetId) {
      conditions.push(eq(auditLogs.targetId, parseInt(query.targetId, 10)));
    }
    if (query.operatorId) {
      conditions.push(eq(auditLogs.operatorId, parseInt(query.operatorId, 10)));
    }

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(and(...conditions));

    const total = Number(totalResult?.count ?? 0);

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          id: r.id,
          operatorId: r.operatorId,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          before: r.before,
          after: r.after,
          ip: r.ip,
          description: r.description,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/stats — 管理员仪表盘统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/stats", async (request, reply) => {
    const db = getDb();

    // 用户统计
    const [userStats] = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${users.status} = 'active')`,
        disabled: sql<number>`count(*) filter (where ${users.status} = 'disabled')`,
        pendingReview: sql<number>`count(*) filter (where ${users.realNameStatus} = 'pending_review')`,
      })
      .from(users);

    // 今天充值
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayRecharge] = await db
      .select({
        total: sql<string>`coalesce(sum(${rechargeOrders.amount})::text, '0.000000')`,
        count: sql<number>`count(*)`,
      })
      .from(rechargeOrders)
      .where(
        and(
          sql`${rechargeOrders.status} IN ('paid', 'confirmed')`,
          sql`${rechargeOrders.createdAt} >= ${todayStart.toISOString()}`,
        ),
      );

    // 系统配置数
    const [configCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(systemConfigs);

    reply.status(200).send({
      code: 0,
      data: {
        users: {
          total: Number(userStats?.total ?? 0),
          active: Number(userStats?.active ?? 0),
          disabled: Number(userStats?.disabled ?? 0),
          pendingReview: Number(userStats?.pendingReview ?? 0),
        },
        todayRecharge: {
          total: todayRecharge?.total ?? "0.000000",
          count: Number(todayRecharge?.count ?? 0),
        },
        configs: Number(configCount?.count ?? 0),
      },
      message: "ok",
    });
  });
}
