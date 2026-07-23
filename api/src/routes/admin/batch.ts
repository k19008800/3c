// ============================================================
//  3cloud (3C) — 批量操作路由
//  批量启停、批量删除通用端点
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  vendors, vendorModels, models, apiKeys, users,
} from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminBatchRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 供应商：批量启停 ──
  app.post("/api/v1/admin/vendors/batch-toggle", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
    // 分级限流：批量操作容易造成负载，每分钟最多 10 次
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {
    const { ids, action } = request.body as any;
    if (!ids?.length || !['enable', 'disable'].includes(action)) {
      return reply.status(400).send({ code: 400, data: null, message: "参数错误" });
    }
    const db = getDb();
    const [result] = await db.update(vendors)
      .set({ status: action === 'enable' ? 'active' : 'disabled' })
      .where(inArray(vendors.id, ids))
      .returning({ count: sql`count(*)` });
    return { code: 0, data: { count: ids.length }, message: `已${action === 'enable' ? '启用' : '禁用'} ${ids.length} 项` };
  });

  // ── 供应商：批量删除 ──
  app.post("/api/v1/admin/vendors/batch-delete", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
    // 分级限流：批量删除操作敏感，每分钟最多 5 次
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {
    const { ids } = request.body as any;
    if (!ids?.length) return reply.status(400).send({ code: 400, data: null, message: "参数错误" });
    const db = getDb();
    await db.delete(vendors).where(inArray(vendors.id, ids));
    return { code: 0, data: { count: ids.length }, message: `已删除 ${ids.length} 项` };
  });

  // ── 通道（vendor_models）：批量启停 ──
  app.post("/api/v1/admin/vendor-models/batch-toggle", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { ids, action } = request.body as any;
    if (!ids?.length || !['enable', 'disable'].includes(action)) {
      return reply.status(400).send({ code: 400, data: null, message: "参数错误" });
    }
    const db = getDb();
    await db.update(vendorModels)
      .set({ status: action === 'enable' })
      .where(inArray(vendorModels.id, ids));
    return { code: 0, data: { count: ids.length }, message: `已${action === 'enable' ? '启用' : '禁用'} ${ids.length} 个通道` };
  });

  // ── 通道：批量删除 ──
  app.post("/api/v1/admin/vendor-models/batch-delete", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { ids } = request.body as any;
    if (!ids?.length) return reply.status(400).send({ code: 400, data: null, message: "参数错误" });
    const db = getDb();
    await db.delete(vendorModels).where(inArray(vendorModels.id, ids));
    return { code: 0, data: { count: ids.length }, message: `已删除 ${ids.length} 个通道` };
  });

  // ── 模型：批量启停 ──
  app.post("/api/v1/admin/models/batch-toggle", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { ids, action } = request.body as any;
    if (!ids?.length || !['enable', 'disable'].includes(action)) {
      return reply.status(400).send({ code: 400, data: null, message: "参数错误" });
    }
    const db = getDb();
    await db.update(models)
      .set({ status: action === 'enable' })
      .where(inArray(models.id, ids));
    return { code: 0, data: { count: ids.length }, message: `已${action === 'enable' ? '启用' : '禁用'} ${ids.length} 个模型` };
  });

  // ── API Key：批量启停 ──
  app.post("/api/v1/admin/api-keys/batch-toggle", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { ids, action } = request.body as any;
    if (!ids?.length || !['enable', 'disable'].includes(action)) {
      return reply.status(400).send({ code: 400, data: null, message: "参数错误" });
    }
    const db = getDb();
    await db.update(apiKeys)
      .set({ status: action === 'enable' })
      .where(inArray(apiKeys.id, ids));
    return { code: 0, data: { count: ids.length }, message: `已${action === 'enable' ? '启用' : '禁用'} ${ids.length} 个 Key` };
  });

  // ── API Key：批量删除 ──
  app.post("/api/v1/admin/api-keys/batch-delete", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const { ids } = request.body as any;
    if (!ids?.length) return reply.status(400).send({ code: 400, data: null, message: "参数错误" });
    const db = getDb();
    await db.delete(apiKeys).where(inArray(apiKeys.id, ids));
    return { code: 0, data: { count: ids.length }, message: `已删除 ${ids.length} 个 Key` };
  });

  // ── 用户：批量启停 ──
  app.post("/api/v1/admin/users/batch-toggle", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const { ids, action } = request.body as any;
    if (!ids?.length || !['enable', 'disable'].includes(action)) {
      return reply.status(400).send({ code: 400, data: null, message: "参数错误" });
    }
    const db = getDb();
    await db.update(users)
      .set({ status: action === 'enable' ? 'active' : 'disabled' })
      .where(inArray(users.id, ids));
    return { code: 0, data: { count: ids.length }, message: `已${action === 'enable' ? '启用' : '禁用'} ${ids.length} 个用户` };
  });
}
