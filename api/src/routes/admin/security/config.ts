// ============================================================
//  3cloud (3C) — 安全配置路由
//  GET    /api/v1/admin/security/config              — 安全配置列表
//  GET    /api/v1/admin/security/config/:key         — 单条配置
//  GET    /api/v1/admin/security/config/history      — 配置变更历史
//  PATCH  /api/v1/admin/security/config/:key         — 更新单条配置
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { loginSecurityConfigs, auditLogs } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { clearSecurityConfigCache } from "../../../services/login-security.js";

export async function securityConfigRoutes(app: FastifyInstance) {
  // ── 配置列表 ──
  // GET /api/v1/admin/security/config
  app.get("/api/v1/admin/security/config", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(loginSecurityConfigs)
      .orderBy(loginSecurityConfigs.key);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          key: r.key,
          value: r.value,
          description: r.description,
          updatedAt: r.updatedAt?.toISOString() ?? null,
        })),
      },
      message: "ok",
    });
  });

  // ── 单条配置 ──
  // GET /api/v1/admin/security/config/:key
  app.get("/api/v1/admin/security/config/:key", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { key } = request.params as { key: string };
    const [row] = await db
      .select()
      .from(loginSecurityConfigs)
      .where(eq(loginSecurityConfigs.key, key))
      .limit(1);

    if (!row) {
      reply.status(404).send({ code: 404, data: null, message: "配置不存在" });
      return;
    }

    reply.status(200).send({
      code: 0,
      data: {
        key: row.key,
        value: row.value,
        description: row.description,
        updatedAt: row.updatedAt?.toISOString() ?? null,
      },
      message: "ok",
    });
  });

  // ── 配置变更历史 ──
  // GET /api/v1/admin/security/config/history
  app.get("/api/v1/admin/security/config/history", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10)));
    const offset = (page - 1) * pageSize;

    const [totalRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(eq(auditLogs.targetType, "security_config"));

    const total = Number(totalRes?.count ?? 0);

    const rows = await db
      .select({
        id: auditLogs.id,
        operatorId: auditLogs.operatorId,
        description: auditLogs.description,
        before: auditLogs.before,
        after: auditLogs.after,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(eq(auditLogs.targetType, "security_config"))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          id: r.id,
          operatorId: r.operatorId,
          description: r.description,
          before: r.before,
          after: r.after,
          ip: r.ip,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ── 更新配置 ──
  // PATCH /api/v1/admin/security/config/:key
  app.patch("/api/v1/admin/security/config/:key", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const { key } = request.params as { key: string };
    const operatorId = request.user!.userId;
    const { value } = request.body as { value: any };

    if (value === undefined || value === null) {
      reply.status(400).send({ code: 400, data: null, message: "缺少 value" });
      return;
    }

    const [existing] = await db
      .select()
      .from(loginSecurityConfigs)
      .where(eq(loginSecurityConfigs.key, key))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: `配置 "${key}" 不存在` });
      return;
    }

    const valueJson = JSON.stringify(value);

    await db.transaction(async (tx) => {
      await tx
        .update(loginSecurityConfigs)
        .set({ value: JSON.parse(JSON.stringify(value)), updatedAt: new Date() })
        .where(eq(loginSecurityConfigs.key, key));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "config_update" as any,
        targetType: "security_config",
        targetId: existing.id,
        before: { value: existing.value },
        after: { value: valueJson },
        ip: request.ip,
        description: `更新安全配置 ${key}`,
      });
    });

    clearSecurityConfigCache();

    reply.status(200).send({
      code: 0,
      data: null,
      message: "安全配置已更新",
    });
  });
}
