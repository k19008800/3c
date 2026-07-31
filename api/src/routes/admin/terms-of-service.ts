// ============================================================
//  3cloud (3C) — 服务条款版本管理路由（管理员）
//  GET    /api/v1/admin/settings/terms-of-service/versions         — 版本列表（分页）
//  POST   /api/v1/admin/settings/terms-of-service/versions         — 创建版本（草稿）
//  PUT    /api/v1/admin/settings/terms-of-service/versions/:id     — 编辑版本
//  POST   /api/v1/admin/settings/terms-of-service/versions/:id/publish — 发布版本
//  GET    /api/v1/admin/settings/terms-of-service/stats            — 统计信息
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, sql, and } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { termsOfServiceVersions, userTosConsents, users, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminTermsOfServiceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 版本列表（分页）──
  app.get("/api/v1/admin/settings/terms-of-service/versions", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;
    const status = query.status?.trim(); // "draft" | "published" | undefined

    const conditions = [];
    if (status) {
      conditions.push(eq(termsOfServiceVersions.status, status));
    }

    const whereClause = conditions.length > 0
      ? and(...conditions)
      : undefined;

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(termsOfServiceVersions)
      .where(whereClause);
    const total = Number(totalResult?.count ?? 0);

    const rows = await db
      .select({
        id: termsOfServiceVersions.id,
        version: termsOfServiceVersions.version,
        title: termsOfServiceVersions.title,
        summary: termsOfServiceVersions.summary,
        status: termsOfServiceVersions.status,
        publishedAt: termsOfServiceVersions.publishedAt,
        createdBy: users.nickname,
        createdAt: termsOfServiceVersions.createdAt,
        updatedAt: termsOfServiceVersions.updatedAt,
      })
      .from(termsOfServiceVersions)
      .leftJoin(users, eq(termsOfServiceVersions.createdBy, users.id))
      .where(whereClause)
      .orderBy(desc(termsOfServiceVersions.createdAt))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: { list: rows, total, page, pageSize },
      message: "ok",
    });
  });

  // ── 创建版本（草稿）──
  app.post("/api/v1/admin/settings/terms-of-service/versions", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { title, content, summary } = request.body as {
      title?: string;
      content: string;
      summary?: string;
    };

    if (!content?.trim()) {
      reply.status(400).send({ code: 400, data: null, message: "内容不能为空" });
      return;
    }

    const operatorId = request.user!.userId;

    // 自动生成版本号：获取已发布的最大版本号，递增
    const [maxVersionResult] = await db
      .select({ maxVersion: sql<string | null>`max(${termsOfServiceVersions.version})` })
      .from(termsOfServiceVersions)
      .where(eq(termsOfServiceVersions.status, "published"));

    let nextVersion = "1.0.0";
    if (maxVersionResult?.maxVersion) {
      const parts = maxVersionResult.maxVersion.split(".").map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        nextVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
      }
    }

    const [created] = await db
      .insert(termsOfServiceVersions)
      .values({
        version: nextVersion,
        title: title?.trim() ?? null,
        content: content.trim(),
        summary: summary?.trim() ?? null,
        status: "draft",
        createdBy: operatorId,
      })
      .returning();

    await db.insert(auditLogs).values({
      operatorId,
      action: "config_update" as any,
      targetType: "terms_of_service",
      targetId: created.id,
      after: { version: created.version, title: created.title, status: created.status },
      ip: request.ip,
      description: `创建服务条款版本: v${created.version}${created.title ? ` (${created.title})` : ""}`,
    });

    reply.status(200).send({ code: 0, data: created, message: "ok" });
  });

  // ── 编辑版本 ──
  app.put("/api/v1/admin/settings/terms-of-service/versions/:id", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
      return;
    }

    const [before] = await db
      .select({
        version: termsOfServiceVersions.version,
        title: termsOfServiceVersions.title,
        content: termsOfServiceVersions.content,
        summary: termsOfServiceVersions.summary,
        status: termsOfServiceVersions.status,
      })
      .from(termsOfServiceVersions)
      .where(eq(termsOfServiceVersions.id, id))
      .limit(1);

    if (!before) {
      reply.status(404).send({ code: 404, data: null, message: "版本不存在" });
      return;
    }

    if (before.status === "published") {
      reply.status(400).send({ code: 400, data: null, message: "已发布的版本不能编辑，请创建新版本" });
      return;
    }

    const body = request.body as Record<string, any>;
    const allowedFields = ["title", "content", "summary"] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field]?.trim() ?? null;
    }
    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    const operatorId = request.user!.userId;

    const [updated] = await db
      .update(termsOfServiceVersions)
      .set({ ...updates, updatedAt: sql`NOW()` })
      .where(eq(termsOfServiceVersions.id, id))
      .returning();

    await db.insert(auditLogs).values({
      operatorId,
      action: "config_update" as any,
      targetType: "terms_of_service",
      targetId: id,
      before,
      after: updates,
      ip: request.ip,
      description: `更新服务条款版本 v${before.version}: ${Object.keys(updates).join(", ")}`,
    });

    reply.status(200).send({ code: 0, data: updated, message: "ok" });
  });

  // ── 发布版本 ──
  app.post("/api/v1/admin/settings/terms-of-service/versions/:id/publish", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
      return;
    }

    const [before] = await db
      .select({
        version: termsOfServiceVersions.version,
        title: termsOfServiceVersions.title,
        status: termsOfServiceVersions.status,
      })
      .from(termsOfServiceVersions)
      .where(eq(termsOfServiceVersions.id, id))
      .limit(1);

    if (!before) {
      reply.status(404).send({ code: 404, data: null, message: "版本不存在" });
      return;
    }

    if (before.status === "published") {
      reply.status(400).send({ code: 400, data: null, message: "该版本已发布" });
      return;
    }

    const operatorId = request.user!.userId;
    const now = new Date();

    const [updated] = await db
      .update(termsOfServiceVersions)
      .set({
        status: "published",
        publishedAt: now,
        updatedAt: sql`NOW()`,
      })
      .where(eq(termsOfServiceVersions.id, id))
      .returning();

    await db.insert(auditLogs).values({
      operatorId,
      action: "config_update" as any,
      targetType: "terms_of_service",
      targetId: id,
      before,
      after: { status: "published", publishedAt: now.toISOString() },
      ip: request.ip,
      description: `发布服务条款版本 v${before.version}${before.title ? ` (${before.title})` : ""}`,
    });

    reply.status(200).send({ code: 0, data: updated, message: "ok" });
  });

  // ── 统计信息 ──
  app.get("/api/v1/admin/settings/terms-of-service/stats", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();

    // 当前已发布的版本
    const [currentVersion] = await db
      .select({
        id: termsOfServiceVersions.id,
        version: termsOfServiceVersions.version,
        title: termsOfServiceVersions.title,
        publishedAt: termsOfServiceVersions.publishedAt,
      })
      .from(termsOfServiceVersions)
      .where(eq(termsOfServiceVersions.status, "published"))
      .orderBy(desc(termsOfServiceVersions.publishedAt))
      .limit(1);

    // 总同意数
    const [consentedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userTosConsents);
    const totalConsented = Number(consentedResult?.count ?? 0);

    // 活跃用户总数
    const [totalUsersResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.status, "active"));
    const totalUsers = Number(totalUsersResult?.count ?? 0);

    // 如果当前版本存在，查询已同意该版本的用户数
    let consentedCurrentVersion = 0;
    if (currentVersion) {
      const [currentConsentedResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userTosConsents)
        .where(eq(userTosConsents.versionId, currentVersion.id));
      consentedCurrentVersion = Number(currentConsentedResult?.count ?? 0);
    }

    const pendingConsent = totalUsers - consentedCurrentVersion;

    reply.status(200).send({
      code: 0,
      data: {
        currentVersion: currentVersion ?? null,
        totalConsented,
        consentedCurrentVersion,
        pendingConsent: Math.max(0, pendingConsent),
        totalUsers,
      },
      message: "ok",
    });
  });
}