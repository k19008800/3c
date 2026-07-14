// ============================================================
//  3cloud (3C) — 模型管理路由（管理员）
//  POST   /api/v1/admin/models           — 创建模型
//  GET    /api/v1/admin/models           — 列表
//  PATCH  /api/v1/admin/models/:id       — 更新
//  DELETE /api/v1/admin/models/:id       — 删除
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, asc, sql, gte, and, desc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { models, vendors, vendorModels, auditLogs, callLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

const MODEL_TYPES = ["chat", "embedding", "image", "audio", "video", "rerank", "moderation", "realtime"] as const;

export async function adminModelRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 创建模型 ──
  app.post("/api/v1/admin/models", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { name, displayName, type, description } = request.body as {
      name: string;
      displayName?: string;
      type?: string;
      description?: string;
    };

    if (!name) {
      reply.status(400).send({ code: 400, data: null, message: "name 必填" });
      return;
    }
    const modelType = type && MODEL_TYPES.includes(type as any) ? type : "chat";

    const operatorId = request.user!.userId;

    try {
      const [model] = await db
        .insert(models)
        .values({ name, displayName, type: modelType as any, description })
        .returning();

      await db.insert(auditLogs).values({
        operatorId,
        action: "model_create",
        targetType: "model",
        targetId: model.id,
        after: { name, displayName, type: modelType, description },
        ip: request.ip,
        description: `创建模型: ${name}`,
      });

      reply.status(200).send({ code: 0, data: model, message: "ok" });
    } catch (err: any) {
      if (err?.code === "23505") {
        reply.status(409).send({ code: 409, data: null, message: "模型名称已存在" });
        return;
      }
      throw err;
    }
  });

  // ── 列表 ──
  app.get("/api/v1/admin/models", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const keyword = query.keyword?.trim();
    const typeFilter = query.type?.trim();
    const statusFilter = query.status?.trim();
    const offset = (page - 1) * pageSize;

    // Build conditions
    const conditions = [];
    if (keyword) {
      conditions.push(sql`${models.name} ILIKE ${`%${keyword}%`}`);
    }
    if (typeFilter && MODEL_TYPES.includes(typeFilter as any)) {
      conditions.push(eq(models.type, typeFilter as any));
    }
    if (statusFilter) {
      conditions.push(eq(models.status, statusFilter === "true"));
    }

    const whereClause = conditions.length > 0 ? sql`${conditions.reduce((a, b) => sql`${a} AND ${b}`)}` : undefined;

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(models)
      .where(whereClause);
    const total = Number(totalResult?.count ?? 0);

    const rows = await db
      .select()
      .from(models)
      .where(whereClause)
      .orderBy(asc(models.id))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: { list: rows, total, page, pageSize },
      message: "ok",
    });
  });

  // ── 更新 ──
  app.patch("/api/v1/admin/models/:id", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id);
    const body = request.body as Record<string, any>;

    const updates: Record<string, any> = {};
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.status !== undefined) updates.status = body.status;
    if (body.type && MODEL_TYPES.includes(body.type)) updates.type = body.type;

    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    const operatorId = request.user!.userId;

    // 获取变更前快照
    const [before] = await db
      .select({ name: models.name, status: models.status, type: models.type, displayName: models.displayName })
      .from(models)
      .where(eq(models.id, id))
      .limit(1);

    const [model] = await db
      .update(models)
      .set(updates)
      .where(eq(models.id, id))
      .returning();
    if (!model) {
      reply.status(404).send({ code: 404, data: null, message: "模型不存在" });
      return;
    }

    await db.insert(auditLogs).values({
      operatorId,
      action: "model_update",
      targetType: "model",
      targetId: id,
      before: before ?? null,
      after: updates,
      ip: request.ip,
      description: `编辑模型: ${before?.name ?? `#${id}`}`,
    });

    reply.status(200).send({ code: 0, data: model, message: "ok" });
  });

  // ── 删除 ──
  app.delete("/api/v1/admin/models/:id", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(vendorModels)
      .where(eq(vendorModels.modelId, id));

    if (Number(countResult?.count || 0) > 0) {
      reply.status(400).send({
        code: 400,
        data: null,
        message: "该模型下有关联的厂商配置，请先删除关联",
      });
      return;
    }

    const operatorId = request.user!.userId;

    // 获取变更前快照
    const [before] = await db
      .select({ name: models.name })
      .from(models)
      .where(eq(models.id, id))
      .limit(1);

    const [model] = await db
      .delete(models)
      .where(eq(models.id, id))
      .returning({ id: models.id });
    if (!model) {
      reply.status(404).send({ code: 404, data: null, message: "模型不存在" });
      return;
    }

    await db.insert(auditLogs).values({
      operatorId,
      action: "model_update",
      targetType: "model",
      targetId: id,
      before: before ?? null,
      ip: request.ip,
      description: `删除模型: ${before?.name ?? `#${id}`}`,
    });

    reply.status(200).send({ code: 0, data: null, message: "ok" });
  });

  // ── 单个模型深度用量分析 ──
  // GET /api/v1/admin/models/:id/usage
  // 返回: 概览(今日/本月/累计) + 按用户分布 + 按Key分布 + 按状态分布 + 趋势

  app.get("/api/v1/admin/models/:id/usage", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const modelId = parseInt((request.params as any).id);

    if (isNaN(modelId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模型 ID" });
      return;
    }

    const [model] = await db.select({ id: models.id, name: models.name, displayName: models.displayName, type: models.type, status: models.status })
      .from(models).where(eq(models.id, modelId)).limit(1);

    if (!model) {
      reply.status(404).send({ code: 404, data: null, message: "模型不存在" });
      return;
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 今日统计
    const [today] = await db.select({
      calls: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
      successCount: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
      failedCount: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
      avgDurationMs: sql<number>`coalesce(avg(${callLogs.durationMs}), 0)::int`,
    }).from(callLogs).where(and(eq(callLogs.modelName, model.name), gte(callLogs.createdAt, todayStart)));

    // 本月
    const [month] = await db.select({
      calls: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
    }).from(callLogs).where(and(eq(callLogs.modelName, model.name), gte(callLogs.createdAt, monthStart)));

    // 累计
    const [allTime] = await db.select({
      calls: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
    }).from(callLogs).where(eq(callLogs.modelName, model.name));

    // 按用户分布 (Top 20)
    const userBreakdown = await db.select({
      userId: callLogs.userId,
      calls: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
      successCount: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
      failedCount: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
      lastUsedAt: sql<Date>`max(${callLogs.createdAt})`,
    }).from(callLogs).where(eq(callLogs.modelName, model.name))
      .groupBy(callLogs.userId).orderBy(desc(sql`coalesce(sum(${callLogs.totalTokens}), 0)`)).limit(20);

    // 按API Key分布 (Top 20)
    const keyBreakdown = await db.select({
      apiKeyId: callLogs.apiKeyId,
      calls: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
    }).from(callLogs).where(eq(callLogs.modelName, model.name))
      .groupBy(callLogs.apiKeyId).orderBy(desc(sql`coalesce(sum(${callLogs.totalTokens}), 0)`)).limit(20);

    // 7天趋势
    const trends = await db.select({
      date: sql<string>`to_char(${callLogs.createdAt}, 'MM-DD')`,
      calls: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
    }).from(callLogs).where(and(eq(callLogs.modelName, model.name), gte(callLogs.createdAt, sevenDaysAgo)))
      .groupBy(sql`to_char(${callLogs.createdAt}, 'MM-DD')`).orderBy(sql`to_char(${callLogs.createdAt}, 'MM-DD')`);

    // 按厂商分布 (from vendor_models where this model is mapped)
    const vendorMappings = await db.select({
      vendorName: vendors.name,
      calls: sql<number>`coalesce(count(${callLogs.id}) filter (where ${callLogs.vendorModelId} = ${vendorModels.id}), 0)::int`,
      tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}) filter (where ${callLogs.vendorModelId} = ${vendorModels.id}), 0)::bigint`,
      cost: sql<string>`coalesce(sum(${callLogs.cost}) filter (where ${callLogs.vendorModelId} = ${vendorModels.id}), '0')`,
    }).from(vendorModels)
      .leftJoin(callLogs, eq(callLogs.vendorModelId, vendorModels.id))
      .leftJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .where(eq(vendorModels.modelId, model.id))
      .groupBy(vendors.name, vendorModels.id)
      .orderBy(desc(sql`coalesce(sum(${callLogs.totalTokens}) filter (where ${callLogs.vendorModelId} = ${vendorModels.id}), 0)`));

    reply.status(200).send({
      code: 0,
      data: {
        model: { id: model.id, name: model.name, displayName: model.displayName, type: model.type, status: model.status },
        today: { calls: today?.calls ?? 0, tokens: Number(today?.tokens ?? 0), cost: today?.cost ?? '0', successCount: today?.successCount ?? 0, failedCount: today?.failedCount ?? 0, avgDurationMs: today?.avgDurationMs ?? 0 },
        month: { calls: month?.calls ?? 0, tokens: Number(month?.tokens ?? 0), cost: month?.cost ?? '0' },
        allTime: { calls: allTime?.calls ?? 0, tokens: Number(allTime?.tokens ?? 0), cost: allTime?.cost ?? '0' },
        userBreakdown: userBreakdown.map(u => ({ ...u, tokens: Number(u.tokens) })),
        keyBreakdown: keyBreakdown.map(k => ({ ...k, tokens: Number(k.tokens) })),
        vendorBreakdown: vendorMappings.map(v => ({ ...v, tokens: Number(v.tokens) })),
        trends,
      },
      message: "ok",
    });
  });
}
