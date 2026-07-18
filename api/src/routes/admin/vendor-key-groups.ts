// ============================================================
//  3cloud (3C) — 上游 Key 分组管理路由
//  CRUD: vendor_key_groups + vendor_key_group_items
//  增强版含：软删除、完整 Key 查看、分组状态概览、备注
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, asc, sql, isNull, count } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { vendorKeyGroups, vendorKeyGroupItems } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { encryptApiKey, decryptApiKey } from "../../services/encryption.js";

export async function adminKeyGroupRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 获取厂商的 Key 分组列表（含各组状态统计）──
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

    // 查询每个分组的 Key 数量 + 状态统计（简化版本：计算所有 Key 的状态分布）
    const groupsWithCount = await Promise.all(
      groups.map(async (g) => {
        const [keyCountResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(vendorKeyGroupItems)
          .where(eq(vendorKeyGroupItems.groupId, g.id));

        // 统计各项状态
        const allItems = await db
          .select({
            status: vendorKeyGroupItems.status,
            isDown: vendorKeyGroupItems.isDown,
            deletedAt: vendorKeyGroupItems.deletedAt,
          })
          .from(vendorKeyGroupItems)
          .where(eq(vendorKeyGroupItems.groupId, g.id));

        const activeCount = allItems.filter(i => i.status && !i.isDown && !i.deletedAt).length;
        const downCount = allItems.filter(i => i.isDown && !i.deletedAt).length;
        const disabledCount = allItems.filter(i => !i.status && !i.deletedAt).length;

        return {
          ...g,
          keyCount: keyCountResult?.count ?? 0,
          activeCount,
          downCount,
          disabledCount,
        };
      })
    );

    return { code: 0, data: groupsWithCount, message: "ok" };
  });

  // ── 获取全部分组的 Key 概览（按供应商聚合）──
  app.get("/api/v1/admin/vendors/key-group-summary", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { vendors } = await import("../../db/schema.js");

    const rows = await db
      .select({
        vendorId: vendorKeyGroups.vendorId,
        vendorName: vendors.name,
        groupCount: sql<number>`count(distinct ${vendorKeyGroups.id})::int`,
        keyCount: sql<number>`count(${vendorKeyGroupItems.id})::int`,
      })
      .from(vendorKeyGroups)
      .leftJoin(vendorKeyGroupItems, eq(vendorKeyGroupItems.groupId, vendorKeyGroups.id))
      .innerJoin(vendors, eq(vendors.id, vendorKeyGroups.vendorId))
      .groupBy(vendorKeyGroups.vendorId, vendors.name)
      .orderBy(asc(vendors.name));

    return { code: 0, data: rows, message: "ok" };
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

  // ── 删除分组（级联硬删除 items）──
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

    // 硬删除分组（级联删除 items）
    await db.delete(vendorKeyGroups).where(eq(vendorKeyGroups.id, Number(groupId)));
    return { code: 0, data: null, message: "ok" };
  });

  // ── 获取分组内的 Key 列表（支持分页 + 显示已删除）──
  app.get("/api/v1/admin/key-groups/:groupId/items", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { groupId } = request.params as any;
    const query = request.query as any;
    const db = getDb();

    const showDeleted = query.showDeleted === "true";

    // 分页参数
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(query.pageSize, 10) || 50));

    const conditions: any[] = [eq(vendorKeyGroupItems.groupId, Number(groupId))];
    if (!showDeleted) {
      conditions.push(isNull(vendorKeyGroupItems.deletedAt));
    }

    // 先 count 总数
    const [totalResult] = await db
      .select({ total: count() })
      .from(vendorKeyGroupItems)
      .where(and(...conditions));
    const total = totalResult?.total ?? 0;

    // 再分页查询
    const items = await db
      .select()
      .from(vendorKeyGroupItems)
      .where(and(...conditions))
      .orderBy(asc(vendorKeyGroupItems.priority), asc(vendorKeyGroupItems.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      code: 0,
      data: { items, total, page, pageSize },
      message: "ok",
    };
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
    const prefix = body.apiKey.length > 8
      ? body.apiKey.slice(0, 8)
      : body.apiKey.slice(0, 4) + "...";

    const [item] = await db
      .insert(vendorKeyGroupItems)
      .values({
        groupId: Number(groupId),
        apiKeyEncrypted: encrypted,
        apiKeyPrefix: prefix,
        weight: body.weight ?? 1,
        priority: body.priority ?? 0,
        notes: body.notes ?? null,
        costPriceInput: body.costPriceInput ?? null,
        costPriceOutput: body.costPriceOutput ?? null,
        sellPriceInput: body.sellPriceInput ?? null,
        sellPriceOutput: body.sellPriceOutput ?? null,
      })
      .returning();

    return { code: 0, data: item, message: "ok" };
  });

  // ── 更新 Key（含备注）──
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
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.costPriceInput !== undefined) updateData.costPriceInput = body.costPriceInput;
    if (body.costPriceOutput !== undefined) updateData.costPriceOutput = body.costPriceOutput;
    if (body.sellPriceInput !== undefined) updateData.sellPriceInput = body.sellPriceInput;
    if (body.sellPriceOutput !== undefined) updateData.sellPriceOutput = body.sellPriceOutput;

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

  // ── 删除 Key（改为软删除）──
  app.delete("/api/v1/admin/key-group-items/:itemId", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { itemId } = request.params as any;
    const db = getDb();

    await db
      .update(vendorKeyGroupItems)
      .set({ deletedAt: new Date() })
      .where(eq(vendorKeyGroupItems.id, Number(itemId)));

    return { code: 0, data: null, message: "ok" };
  });

  // ── 查看完整 Key（解密返回，操作记入日志）──
  app.post("/api/v1/admin/key-group-items/:itemId/reveal", {
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

    // 解密
    const plainKey = decryptApiKey(item.apiKeyEncrypted);

    // 审计日志
    const user = (request as any).user;
    request.log.info({
      action: "key_reveal",
      itemId: Number(itemId),
      groupId: item.groupId,
      userId: user?.id,
      userEmail: user?.email,
    }, "管理员查看了完整 Key");

    return {
      code: 0,
      data: {
        itemId: item.id,
        groupId: item.groupId,
        fullKey: plainKey,
        prefix: item.apiKeyPrefix,
      },
      message: "ok",
    };
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
      .where(and(
        eq(vendorKeyGroupItems.id, Number(itemId)),
        isNull(vendorKeyGroupItems.deletedAt),
      ));

    if (!item) {
      return reply.status(404).send({ code: 404, data: null, message: "Key 不存在或已删除" });
    }

    const startTime = Date.now();
    try {
      const plainKey = decryptApiKey(item.apiKeyEncrypted);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: "Bearer " + plainKey },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;
      return {
        code: 0,
        data: {
          success: response.ok,
          statusCode: response.status,
          durationMs,
        },
        message: response.ok ? "连接成功" : "上游返回 " + response.status,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      return reply.status(200).send({
        code: 0,
        data: { success: false, statusCode: 0, durationMs, error: err.message },
        message: "连接失败: " + err.message,
      });
    }
  });

  // ════════════════════════════════════════════════════
  //  P0 新增路由
  // ════════════════════════════════════════════════════

  // ── 批量测试分组内所有 Key 连通性 ──
  app.post("/api/v1/admin/key-groups/:groupId/test-all", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { groupId } = request.params as any;
    const db = getDb();

    const items = await db
      .select({ id: vendorKeyGroupItems.id, apiKeyEncrypted: vendorKeyGroupItems.apiKeyEncrypted })
      .from(vendorKeyGroupItems)
      .where(and(
        eq(vendorKeyGroupItems.groupId, Number(groupId)),
        isNull(vendorKeyGroupItems.deletedAt),
      ));

    if (items.length === 0) {
      return reply.status(200).send({ code: 0, data: [], message: "该分组无可用 Key" });
    }

    const results = await Promise.allSettled(
      items.map(async (item) => {
        const plainKey = decryptApiKey(item.apiKeyEncrypted);
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: "Bearer " + plainKey },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          return {
            itemId: item.id,
            success: res.ok,
            durationMs: Date.now() - startTime,
            statusCode: res.status,
          };
        } catch (err: any) {
          clearTimeout(timeoutId);
          return {
            itemId: item.id,
            success: false,
            durationMs: Date.now() - startTime,
            error: err.message,
          };
        }
      })
    );

    const testResults = results.map((r) =>
      r.status === "fulfilled" ? r.value : { itemId: -1, success: false, error: r.reason?.message }
    );

    return { code: 0, data: testResults, message: "测试完成 (" + testResults.filter((r) => r.success).length + "/" + testResults.length + " 通过)" };
  });

  // ── 查询分组关联的通道（vendor_models）──
  app.get("/api/v1/admin/key-groups/:groupId/associated-channels", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { groupId } = request.params as any;
    const db = getDb();

    const { vendorModels, models, vendors } = await import("../../db/schema.js");

    const channels = await db
      .select({
        id: vendorModels.id,
        vendorId: vendorModels.vendorId,
        vendorName: vendors.name,
        modelId: vendorModels.modelId,
        modelName: models.name,
        upstreamModelName: vendorModels.upstreamModelName,
        status: vendorModels.status,
        isDown: vendorModels.isDown,
      })
      .from(vendorModels)
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .where(eq(vendorModels.keyGroupId, Number(groupId)))
      .orderBy(asc(vendorModels.id));

    return { code: 0, data: { total: channels.length, list: channels }, message: "ok" };
  });

  // ── 批量启用/禁用分组内 Key ──
  app.patch("/api/v1/admin/key-groups/:groupId/items/batch-status", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { groupId } = request.params as any;
    const db = getDb();
    const body = request.body as any;

    if (body.status === undefined) {
      return reply.status(400).send({ code: 400, data: null, message: "status 必填" });
    }

    const condition = body.itemIds?.length
      ? and(eq(vendorKeyGroupItems.groupId, Number(groupId)), sql`${vendorKeyGroupItems.id} = ANY(${body.itemIds}::int[])`)
      : eq(vendorKeyGroupItems.groupId, Number(groupId));

    const updated = await db
      .update(vendorKeyGroupItems)
      .set({ status: Boolean(body.status) })
      .where(condition)
      .returning({ id: vendorKeyGroupItems.id, status: vendorKeyGroupItems.status });

    return { code: 0, data: { affected: updated.length }, message: "已 " + (body.status ? "启用" : "禁用") + " " + updated.length + " 个 Key" };
  });

}
