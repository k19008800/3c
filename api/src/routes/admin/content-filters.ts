// ============================================================
//  3cloud (3C) — 内容过滤管理路由
//  CRUD: content_filters + filter_logs + rule testing
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, like } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { contentFilters, filterLogs, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminContentFilterRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 规则列表 ──
  app.get("/api/v1/admin/content-filters", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as any;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(contentFilters.status, true)];
    if (query.keyword) {
      conditions.push(like(contentFilters.name, `%${query.keyword}%`));
    }
    if (query.stage) {
      conditions.push(eq(contentFilters.stage, query.stage));
    }

    const [list, countResult] = await Promise.all([
      db.select().from(contentFilters)
        .where(and(...conditions))
        .orderBy(desc(contentFilters.priority), desc(contentFilters.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(contentFilters).where(and(...conditions)),
    ]);

    return { code: 0, data: { list, total: countResult[0]?.count ?? 0 }, message: "ok" };
  });

  // ── 创建规则 ──
  app.post("/api/v1/admin/content-filters", {
    preHandler: [requirePerm(Perm.SECURITY_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as any;
    if (!body.name || !body.pattern) {
      return reply.status(400).send({ code: 400, data: null, message: "name 和 pattern 必填" });
    }

    const [rule] = await db.insert(contentFilters).values({
      name: body.name,
      description: body.description || null,
      stage: body.stage || "pre_request",
      scope: body.scope || "request_body",
      matchType: body.matchType || "keyword",
      pattern: body.pattern,
      action: body.action || "block",
      replacement: body.replacement || null,
      applyTo: body.applyTo || ["all"],
      priority: body.priority ?? 100,
      createdBy: request.user!.userId,
    }).returning();

    // ── 审计日志 ──
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "content_filter_create",
      targetType: "content_filter",
      targetId: rule.id,
      after: {
        name: rule.name,
        pattern: rule.pattern,
        matchType: rule.matchType,
        action: rule.action,
        stage: rule.stage,
        scope: rule.scope,
        priority: rule.priority,
      },
      ip: request.ip,
      description: `创建内容过滤规则: ${rule.name}`,
    });

    return { code: 0, data: rule, message: "ok" };
  });

  // ── 更新规则 ──
  app.patch("/api/v1/admin/content-filters/:id", {
    preHandler: [requirePerm(Perm.SECURITY_EDIT)],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const db = getDb();
    const body = request.body as any;

    // ── 读取变更前快照 ──
    const [before] = await db
      .select({ name: contentFilters.name, pattern: contentFilters.pattern, matchType: contentFilters.matchType,
               action: contentFilters.action, stage: contentFilters.stage, scope: contentFilters.scope,
               priority: contentFilters.priority, status: contentFilters.status })
      .from(contentFilters)
      .where(eq(contentFilters.id, Number(id)))
      .limit(1);
    if (!before) {
      return reply.status(404).send({ code: 404, data: null, message: "规则不存在" });
    }

    const updateData: any = {};
    for (const key of ["name", "description", "stage", "scope", "matchType", "pattern",
                        "action", "replacement", "applyTo", "priority", "status"]) {
      if (body[key] !== undefined) updateData[key] = body[key];
    }
    if (Object.keys(updateData).length === 0) {
      return reply.status(400).send({ code: 400, data: null, message: "无变更内容" });
    }

    const [updated] = await db.update(contentFilters)
      .set(updateData)
      .where(eq(contentFilters.id, Number(id)))
      .returning();

    // ── 审计日志 ──
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "content_filter_update",
      targetType: "content_filter",
      targetId: Number(id),
      before,
      after: {
        name: updated.name,
        pattern: updated.pattern,
        matchType: updated.matchType,
        action: updated.action,
        stage: updated.stage,
        scope: updated.scope,
        priority: updated.priority,
        status: updated.status,
      },
      ip: request.ip,
      description: `更新内容过滤规则: ${updated.name}`,
    });

    return { code: 0, data: updated, message: "ok" };
  });

  // ── 删除规则 ──
  app.delete("/api/v1/admin/content-filters/:id", {
    preHandler: [requirePerm(Perm.SECURITY_EDIT)],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const db = getDb();

    // ── 读取变更前快照 ──
    const [before] = await db
      .select({ name: contentFilters.name, pattern: contentFilters.pattern, matchType: contentFilters.matchType,
               action: contentFilters.action, stage: contentFilters.stage, scope: contentFilters.scope,
               priority: contentFilters.priority, status: contentFilters.status })
      .from(contentFilters)
      .where(eq(contentFilters.id, Number(id)))
      .limit(1);

    await db.delete(contentFilters).where(eq(contentFilters.id, Number(id)));

    // ── 审计日志 ──
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "content_filter_delete",
      targetType: "content_filter",
      targetId: Number(id),
      before: before ? { name: before.name, pattern: before.pattern, matchType: before.matchType,
                         action: before.action, stage: before.stage, scope: before.scope,
                         priority: before.priority, status: before.status } : null,
      ip: request.ip,
      description: `删除内容过滤规则: ${before?.name ?? id}`,
    });

    return { code: 0, data: null, message: "ok" };
  });

  // ── 测试规则 ──
  app.post("/api/v1/admin/content-filters/:id/test", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const db = getDb();
    const body = request.body as any;

    const [rule] = await db.select().from(contentFilters).where(eq(contentFilters.id, Number(id)));
    if (!rule) return reply.status(404).send({ code: 404, data: null, message: "规则不存在" });

    const testContent = body.content || "";
    const results: any[] = [];

    if (rule.matchType === "keyword") {
      const keywords = rule.pattern.split("\n").map(s => s.trim()).filter(Boolean);
      for (const kw of keywords) {
        let pos = testContent.indexOf(kw);
        while (pos !== -1) {
          results.push({ keyword: kw, start: pos, end: pos + kw.length });
          pos = testContent.indexOf(kw, pos + 1);
        }
      }
    } else if (rule.matchType === "regex") {
      try {
        const regex = new RegExp(rule.pattern, "gi");
        let match;
        while ((match = regex.exec(testContent)) !== null) {
          results.push({ match: match[0], index: match.index });
        }
      } catch (err: any) {
        return reply.status(400).send({ code: 400, data: null, message: `正则错误: ${err.message}` });
      }
    } else if (rule.matchType === "exact") {
      if (testContent === rule.pattern) {
        results.push({ match: rule.pattern, index: 0 });
      }
    }

    return { code: 0, data: { matched: results.length > 0, count: results.length, matches: results }, message: "ok" };
  });

  // ── 过滤日志 ──
  app.get("/api/v1/admin/content-filters/logs", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as any;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, parseInt(query.pageSize ?? "20", 10) || 20);
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    if (query.action) conditions.push(eq(filterLogs.action, query.action));
    if (query.filterId) conditions.push(eq(filterLogs.filterId, Number(query.filterId)));

    const [list, countResult] = await Promise.all([
      db.select().from(filterLogs)
        .where(and(...conditions))
        .orderBy(desc(filterLogs.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(filterLogs).where(and(...conditions)),
    ]);

    return { code: 0, data: { list, total: countResult[0]?.count ?? 0 }, message: "ok" };
  });

  // ── 命中统计 ──
  app.get("/api/v1/admin/content-filters/stats", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const stats = await db
      .select({
        id: contentFilters.id,
        name: contentFilters.name,
        hitCount: contentFilters.hitCount,
        lastHitAt: contentFilters.lastHitAt,
        action: contentFilters.action,
        status: contentFilters.status,
      })
      .from(contentFilters)
      .orderBy(desc(contentFilters.hitCount))
      .limit(50);

    return { code: 0, data: stats, message: "ok" };
  });
}
