// ============================================================
//  3cloud (3C) — 操作类型管理路由 (p2 简版)
//  CRUD for operation_types table
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, like, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { operationTypes } from "../../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";

export async function adminOperationTypeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requirePerm(Perm.USER_EDIT));

  // ── GET /api/v1/admin/operation-types — 列表 ──
  app.get("/api/v1/admin/operation-types", async (request, reply) => {
    const query = request.query as {
      keyword?: string;
      category?: string;
      enabled?: string;
      page?: string;
      pageSize?: string;
    };

    const page = parseInt(query.page || "1", 10);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || "50", 10)));
    const offset = (page - 1) * pageSize;

    const db = getDb();

    const conditions = [];
    if (query.keyword) {
      conditions.push(like(operationTypes.name, `%${query.keyword}%`));
    }
    if (query.category) {
      conditions.push(eq(operationTypes.category, query.category as any));
    }
    if (query.enabled !== undefined) {
      conditions.push(eq(operationTypes.enabled, query.enabled === "true"));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(operationTypes)
      .where(where);

    const total = Number(countResult?.count ?? 0);

    const rows = await db
      .select()
      .from(operationTypes)
      .where(where)
      .orderBy(operationTypes.id)
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: { list: rows, total, page, pageSize },
      message: "ok",
    });
  });

  // ── POST /api/v1/admin/operation-types — 创建 ──
  app.post("/api/v1/admin/operation-types", async (request, reply) => {
    const body = request.body as {
      name: string;
      category: string;
      description?: string;
      enabled?: boolean;
    };

    if (!body.name || !body.category) {
      reply.status(400).send({ code: 400, data: null, message: "名称和分类为必填项" });
      return;
    }

    const db = getDb();

    // 检查重名
    const [existing] = await db
      .select()
      .from(operationTypes)
      .where(eq(operationTypes.name, body.name))
      .limit(1);

    if (existing) {
      reply.status(409).send({ code: 409, data: null, message: "操作类型名称已存在" });
      return;
    }

    const [created] = await db
      .insert(operationTypes)
      .values({
        name: body.name,
        category: body.category,
        description: body.description || null,
        enabled: body.enabled ?? true,
      })
      .returning();

    reply.status(201).send({
      code: 0,
      data: created,
      message: "创建成功",
    });
  });

  // ── PATCH /api/v1/admin/operation-types/:id — 更新 ──
  app.patch("/api/v1/admin/operation-types/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      category?: string;
      description?: string;
      enabled?: boolean;
    };

    const typeId = parseInt(id, 10);
    if (isNaN(typeId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
      return;
    }

    const db = getDb();

    const [existing] = await db
      .select()
      .from(operationTypes)
      .where(eq(operationTypes.id, typeId))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "操作类型不存在" });
      return;
    }

    // 检查名称冲突
    if (body.name && body.name !== existing.name) {
      const [dup] = await db
        .select()
        .from(operationTypes)
        .where(eq(operationTypes.name, body.name))
        .limit(1);

      if (dup) {
        reply.status(409).send({ code: 409, data: null, message: "操作类型名称已存在" });
        return;
      }
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.category !== undefined) updates.category = body.category;
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    const [updated] = await db
      .update(operationTypes)
      .set(updates)
      .where(eq(operationTypes.id, typeId))
      .returning();

    reply.status(200).send({
      code: 0,
      data: updated,
      message: "更新成功",
    });
  });

  // ── DELETE /api/v1/admin/operation-types/:id — 删除 ──
  app.delete("/api/v1/admin/operation-types/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const typeId = parseInt(id, 10);

    if (isNaN(typeId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
      return;
    }

    const db = getDb();

    const [existing] = await db
      .select()
      .from(operationTypes)
      .where(eq(operationTypes.id, typeId))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "操作类型不存在" });
      return;
    }

    await db.delete(operationTypes).where(eq(operationTypes.id, typeId));

    reply.status(200).send({
      code: 0,
      data: null,
      message: "删除成功",
    });
  });
}
