// ============================================================
//  3cloud (3C) — 系统配置管理路由（管理员）
//  GET    /api/v1/admin/configs              — 配置列表
//  PATCH  /api/v1/admin/configs/:key         — 更新配置
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, like, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { systemConfigs, auditLogs, users, rechargeOrders, emailTemplates } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import crypto from "node:crypto";

export async function adminSystemRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/configs — 系统配置列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/configs", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
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

  app.patch("/api/v1/admin/configs/:key", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
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
  //  POST /api/v1/admin/configs/rotate-key/:keyName — 轮换密钥
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/configs/rotate-key/:keyName", {
    preHandler: [authenticateJWT, requirePerm(Perm.CONFIG_EDIT)],
    handler: async (request, reply) => {
      const db = getDb();
      const { keyName } = request.params as { keyName: string };
      const operatorId = request.user!.userId;

      if (!keyName) {
        reply.status(400).send({ code: 400, data: null, message: "缺少 keyName" });
        return;
      }

      // 生成新密钥（32 字节 hex 字符串）
      const newValue = crypto.randomBytes(32).toString("hex");

      const [existing] = await db
        .select()
        .from(systemConfigs)
        .where(eq(systemConfigs.key, keyName))
        .limit(1);

      if (!existing) {
        reply.status(404).send({ code: 404, data: null, message: `配置 "${keyName}" 不存在` });
        return;
      }

      const oldValue = existing.value;

      await db.transaction(async (tx) => {
        await tx
          .update(systemConfigs)
          .set({ value: newValue })
          .where(eq(systemConfigs.key, keyName));

        await tx.insert(auditLogs).values({
          operatorId,
          action: "config_update",
          targetType: "config",
          targetId: existing.id,
          before: { key: keyName, rotated: true },
          after: { key: keyName, updatedAt: new Date().toISOString() },
          ip: request.ip,
          description: `轮换密钥 ${keyName}`,
        });
      });

      reply.status(200).send({
        code: 0,
        data: { key: keyName, updatedAt: new Date().toISOString() },
        message: `密钥 ${keyName} 已轮换`,
      });
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/configs/security-audit — 安全审计
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/configs/security-audit", {
    preHandler: [authenticateJWT, requirePerm(Perm.CONFIG_EDIT)],
    handler: async (request, reply) => {
      const db = getDb();

      const sensitiveKeys = [
        "pay_sign_key",
        "smtp_host",
        "smtp_user",
        "smtp_pass",
        "aliyun_id_verify_app_code",
        "payment_mode",
        "jwt_access_secret",
        "jwt_refresh_secret",
      ];

      const rows = await db
        .select({
          key: systemConfigs.key,
          value: systemConfigs.value,
          description: systemConfigs.description,
          updatedAt: systemConfigs.updatedAt,
        })
        .from(systemConfigs)
        .where(inArray(systemConfigs.key, sensitiveKeys));

      const auditResult = sensitiveKeys.map((key) => {
        const row = rows.find((r) => r.key === key);
        return {
          key,
          configured: !!row,
          lastUpdated: row?.updatedAt?.toISOString() ?? null,
          isDefault: !row || row.value === "" || row.value === "default",
        };
      });

      reply.send({ code: 0, data: { list: auditResult }, message: "ok" });
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/stats — 管理员仪表盘统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/stats", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
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

  // ════════════════════════════════════════════════════════════
  //  邮件模板管理
  // ════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/email-templates — 邮件模板列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/email-templates", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();
    const rows = await db
      .select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        subjectZh: emailTemplates.subjectZh,
        subjectEn: emailTemplates.subjectEn,
        updatedAt: emailTemplates.updatedAt,
      })
      .from(emailTemplates)
      .orderBy(emailTemplates.name);

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
  //  GET /api/v1/admin/email-templates/:name — 单个模板详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/email-templates/:name", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { name } = request.params as { name: string };

    const [row] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.name, name))
      .limit(1);

    if (!row) {
      reply.status(404).send({ code: 404, data: null, message: `邮件模板 "${name}" 不存在` });
      return;
    }

    reply.status(200).send({
      code: 0,
      data: {
        ...row,
        updatedAt: row.updatedAt?.toISOString() ?? null,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  PUT /api/v1/admin/email-templates/:name — 更新模板
  // ──────────────────────────────────────────────

  app.put("/api/v1/admin/email-templates/:name", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { name } = request.params as { name: string };
    const operatorId = request.user!.userId;
    const body = request.body as Partial<{
      subjectZh: string;
      subjectEn: string;
      bodyHtmlZh: string;
      bodyHtmlEn: string;
    }>;

    const [existing] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.name, name))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: `邮件模板 "${name}" 不存在` });
      return;
    }

    const updates: Record<string, any> = {};
    if (body.subjectZh !== undefined) updates.subjectZh = body.subjectZh;
    if (body.subjectEn !== undefined) updates.subjectEn = body.subjectEn;
    if (body.bodyHtmlZh !== undefined) updates.bodyHtmlZh = body.bodyHtmlZh;
    if (body.bodyHtmlEn !== undefined) updates.bodyHtmlEn = body.bodyHtmlEn;

    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "未提供需要更新的字段" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(emailTemplates)
        .set(updates)
        .where(eq(emailTemplates.name, name));

      // 审计日志
      await tx.insert(auditLogs).values({
        operatorId,
        action: "config_update",
        targetType: "email_template",
        targetId: existing.id,
        before: {
          subjectZh: existing.subjectZh,
          subjectEn: existing.subjectEn,
        },
        after: {
          subjectZh: body.subjectZh ?? existing.subjectZh,
          subjectEn: body.subjectEn ?? existing.subjectEn,
        },
        ip: request.ip,
        description: `更新邮件模板 ${name}`,
      });
    });

    // 返回更新后的数据
    const [updated] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.name, name))
      .limit(1);

    reply.status(200).send({
      code: 0,
      data: {
        ...updated,
        updatedAt: updated.updatedAt?.toISOString() ?? null,
      },
      message: "ok",
    });
  });
}
