// ============================================================
//  3cloud (3C) — 上游 Key 分组管理路由
//  CRUD: vendor_key_groups + vendor_key_group_items
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { vendorKeyGroups, vendorKeyGroupItems } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { encryptApiKey, decryptApiKey } from "../../services/encryption.js";

export async function adminKeyGroupRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 获取厂商的 Key 分组列表 ──
  app.get("/api/v1/admin/vendors/:vendorId/key-groups", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { vendorId } = request.params as any;
    const db = getDb();

    const groups = await db
      .select()
      .from(vendorKeyGroups)
      .where(eq(vendorKeyGroups.vendorId, Number(vendorId)))
      .orderBy(asc(vendorKeyGroups.createdAt));

    // 同时查询每个分组的 Key 数量
    const groupsWithCount = await Promise.all(
      groups.map(async (g) => {
        const [countResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(vendorKeyGroupItems)
          .where(eq(vendorKeyGroupItems.groupId, g.id));
        return { ...g, keyCount: countResult?.count ?? 0 };
      })
    );

    return { code: 0, data: groupsWithCount, message: "ok" };
  });

  // ── 创建 Key 分组 ──
  app.post("/api/v1/admin/vendors/:vendorId/key-groups", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { vendorId } = request.params as any;
    const db = getDb();
    const body = request.body as any;

    if (!body.name) {
      return reply.status(400).send({ code: 400, data: null, message: "name 必填" });
    }

    const [group] = await db
      .insert(vendorKeyGroups)
      .values({
        vendorId: Number(vendorId),
        name: body.name,
        strategy: body.strategy || "round_robin",
        description: body.description || null,
      })
      .returning();

    return { code: 0, data: group, message: "ok" };
  });

  // ── 更新分组 ──
  app.patch("/api/v1/admin/key-groups/:groupId", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { groupId } = request.params as any;
    const db = getDb();
    const body = request.body as any;

    const updateData: any = {};
    if (body.name) updateData.name = body.name;
    if (body.strategy) updateData.strategy = body.strategy;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.status !== undefined) updateData.status = body.status;

    if (Object.keys(updateData).length === 0) {
      return reply.status(400).send({ code: 400, data: null, message: "无变更内容" });
    }

    const [updated] = await db
      .update(vendorKeyGroups)
      .set(updateData)
      .where(eq(vendorKeyGroups.id, Number(groupId)))
      .returning();

    return { code: 0, data: updated, message: "ok" };
  });

  // ── 删除分组 ──
  app.delete("/api/v1/admin/key-groups/:groupId", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { groupId } = request.params as any;
    const db = getDb();

    // 检查分组是否被 vendor_models 引用
    const { vendorModels } = await import("../../db/schema.js");
    const [ref] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vendorModels)
      .where(eq(vendorModels.keyGroupId, Number(groupId)));

    if ((ref?.count ?? 0) > 0) {
      return reply.status(409).send({
        code: 409, data: null,
        message: `该分组被 ${ref.count} 个通道引用，请先移除关联`,
      });
    }

    // 删除分组（级联删除 items）
    await db.delete(vendorKeyGroups).where(eq(vendorKeyGroups.id, Number(groupId)));
    return { code: 0, data: null, message: "ok" };
  });

  // ── 获取分组内的 Key 列表 ──
  app.get("/api/v1/admin/key-groups/:groupId/items", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { groupId } = request.params as any;
    const db = getDb();

    const items = await db
      .select()
      .from(vendorKeyGroupItems)
      .where(eq(vendorKeyGroupItems.groupId, Number(groupId)))
      .orderBy(asc(vendorKeyGroupItems.priority), asc(vendorKeyGroupItems.id));

    return { code: 0, data: items, message: "ok" };
  });

  // ── 新增 Key ──
  app.post("/api/v1/admin/key-groups/:groupId/items", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { groupId } = request.params as any;
    const db = getDb();
    const body = request.body as any;

    if (!body.apiKey) {
      return reply.status(400).send({ code: 400, data: null, message: "apiKey 必填" });
    }

    const encrypted = encryptApiKey(body.apiKey);
    const prefix = body.apiKey.length > 7
      ? `${body.apiKey.slice(0, 7)}...`
      : `${body.apiKey.slice(0, 4)}...`;

    const [item] = await db
      .insert(vendorKeyGroupItems)
      .values({
        groupId: Number(groupId),
        apiKeyEncrypted: encrypted,
        apiKeyPrefix: prefix,
        weight: body.weight ?? 1,
        priority: body.priority ?? 0,
      })
      .returning();

    return { code: 0, data: item, message: "ok" };
  });

  // ── 更新 Key ──
  app.patch("/api/v1/admin/key-group-items/:itemId", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { itemId } = request.params as any;
    const db = getDb();
    const body = request.body as any;

    const updateData: any = {};
    if (body.weight !== undefined) updateData.weight = body.weight;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.status !== undefined) updateData.status = body.status;

    if (Object.keys(updateData).length === 0) {
      return reply.status(400).send({ code: 400, data: null, message: "无变更内容" });
    }

    const [updated] = await db
      .update(vendorKeyGroupItems)
      .set(updateData)
      .where(eq(vendorKeyGroupItems.id, Number(itemId)))
      .returning();

    return { code: 0, data: updated, message: "ok" };
  });

  // ── 删除 Key ──
  app.delete("/api/v1/admin/key-group-items/:itemId", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { itemId } = request.params as any;
    const db = getDb();

    await db.delete(vendorKeyGroupItems).where(eq(vendorKeyGroupItems.id, Number(itemId)));
    return { code: 0, data: null, message: "ok" };
  });

  // ── 测试单个 Key 连通性 ──
  app.post("/api/v1/admin/key-group-items/:itemId/test", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { itemId } = request.params as any;
    const db = getDb();

    const [item] = await db
      .select()
      .from(vendorKeyGroupItems)
      .where(eq(vendorKeyGroupItems.id, Number(itemId)));

    if (!item) {
      return reply.status(404).send({ code: 404, data: null, message: "Key 不存在" });
    }

    const startTime = Date.now();
    try {
      const plainKey = decryptApiKey(item.apiKeyEncrypted);
      // 使用 AbortController 设置超时
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      // 发一个轻量请求测试连通性
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${plainKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const durationMs = Date.now() - startTime;
      return {
        code: 0,
        data: {
          success: response.ok,
          statusCode: response.status,
          durationMs,
        },
        message: response.ok ? "连接成功" : `上游返回 ${response.status}`,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      return reply.status(200).send({
        code: 0,
        data: { success: false, statusCode: 0, durationMs, error: err.message },
        message: `连接失败: ${err.message}`,
      });
    }
  });
}
