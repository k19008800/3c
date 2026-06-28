// ============================================================
//  3cloud (3C) — 模型管理路由（管理员）
//  POST   /api/v1/admin/models           — 创建模型
//  GET    /api/v1/admin/models           — 列表
//  PATCH  /api/v1/admin/models/:id       — 更新
//  DELETE /api/v1/admin/models/:id       — 删除
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, asc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { models, vendorModels } from "../../db/schema.js";
import { authenticateJWT, requireRole } from "../../middleware/auth.js";

const MODEL_TYPES = ["chat", "embedding", "image", "audio"] as const;

export async function adminModelRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requireRole("super_admin", "admin"));

  // ── 创建模型 ──
  app.post("/api/v1/admin/models", async (request, reply) => {
    const db = getDb();
    const { name, displayName, type } = request.body as {
      name: string;
      displayName?: string;
      type?: string;
    };

    if (!name) {
      reply.status(400).send({ code: 400, data: null, message: "name 必填" });
      return;
    }
    const modelType = type && MODEL_TYPES.includes(type as any) ? type : "chat";

    try {
      const [model] = await db
        .insert(models)
        .values({ name, displayName, type: modelType as any })
        .returning();
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
  app.get("/api/v1/admin/models", async (request, reply) => {
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
  app.patch("/api/v1/admin/models/:id", async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id);
    const body = request.body as Record<string, any>;

    const updates: Record<string, any> = {};
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.status !== undefined) updates.status = body.status;
    if (body.type && MODEL_TYPES.includes(body.type)) updates.type = body.type;

    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    const [model] = await db
      .update(models)
      .set(updates)
      .where(eq(models.id, id))
      .returning();
    if (!model) {
      reply.status(404).send({ code: 404, data: null, message: "模型不存在" });
      return;
    }
    reply.status(200).send({ code: 0, data: model, message: "ok" });
  });

  // ── 删除 ──
  app.delete("/api/v1/admin/models/:id", async (request, reply) => {
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

    const [model] = await db
      .delete(models)
      .where(eq(models.id, id))
      .returning({ id: models.id });
    if (!model) {
      reply.status(404).send({ code: 404, data: null, message: "模型不存在" });
      return;
    }
    reply.status(200).send({ code: 0, data: null, message: "ok" });
  });
}
