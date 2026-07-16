// ============================================================
//  3cloud (3C) — 操作撤销机制
//  POST /api/v1/admin/undo/:token — 撤销操作
//  使用 Redis 存储 undo token，有效期 30 秒
// ============================================================

import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { apiKeys, vendors, vendorModels } from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";

const UNDO_TTL = 35; // 秒（比 30 秒略长）

interface UndoToken {
  id: string
  action: string
  resourceType: string
  resourceId: number
  before: Record<string, any>
  operatorId: number
  createdAt: number
}

// ── 创建撤销令牌（被其他路由调用） ──

export async function createUndoToken(params: {
  action: string
  resourceType: string
  resourceId: number
  before: Record<string, any>
  operatorId: number
}): Promise<string> {
  const redis = getRedis();
  const tokenId = randomUUID();
  const undoToken: UndoToken = { id: tokenId, ...params, createdAt: Date.now() };
  await redis.setex(`undo:${tokenId}`, UNDO_TTL, JSON.stringify(undoToken));
  return tokenId;
}

// ── 撤销端点 ──

export async function adminUndoRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  app.post("/api/v1/admin/undo/:token", async (request, reply) => {
    const { token } = request.params as any;
    const redis = getRedis();
    const raw = await redis.get(`undo:${token}`);

    if (!raw) {
      return reply.status(410).send({ code: 410, data: null, message: "撤销令牌已过期或无效" });
    }

    const undoToken: UndoToken = JSON.parse(raw);

    // 仅创建者可以撤销
    if (undoToken.operatorId !== request.user!.userId) {
      return reply.status(403).send({ code: 403, data: null, message: "只有操作者可以撤销" });
    }

    const db = getDb();

    switch (undoToken.action) {
      case "delete_api_key":
        await db.update(apiKeys)
          .set({ status: true })
          .where(eq(apiKeys.id, undoToken.resourceId));
        break;
      case "disable_vendor":
        await db.update(vendors)
          .set({ status: undoToken.before.status || "active" })
          .where(eq(vendors.id, undoToken.resourceId));
        break;
      case "disable_vendor_model":
        await db.update(vendorModels)
          .set({ status: undoToken.before.status !== false })
          .where(eq(vendorModels.id, undoToken.resourceId));
        break;
      default:
        return reply.status(400).send({ code: 400, data: null, message: `不支持撤销操作: ${undoToken.action}` });
    }

    // 标记 token 已使用
    await redis.set(`undo:${token}:used`, "1", "EX", 60);

    return {
      code: 0,
      data: {
        action: undoToken.action,
        resourceType: undoToken.resourceType,
        resourceId: undoToken.resourceId,
        restored: undoToken.before,
      },
      message: "操作已撤销",
    };
  });
}
