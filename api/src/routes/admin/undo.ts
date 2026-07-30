// ============================================================
//  3cloud (3C) — 操作撤销机制（增强版）
//  POST   /api/v1/admin/undo/:token       — 撤销操作
//  GET    /api/v1/admin/undo/history      — 撤销历史记录
//  GET    /api/v1/admin/undo/:token       — 查询撤销令牌状态
//  使用 Redis 存储 undo token，有效期 30 秒
//  使用 undo_logs 表持久化记录
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, count } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { apiKeys, vendors, vendorModels, users, undoLogs } from "../../db/schema.js";
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

  // 持久化记录
  const db = getDb();
  try {
    await db.insert(undoLogs).values({
      token: tokenId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      operatorId: params.operatorId,
      beforeData: params.before,
      status: "pending",
    });
  } catch (_) {
    // 日志写入失败不影响主流程
  }

  return tokenId;
}

// ── 撤销端点 ──

export async function adminUndoRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/undo/:token — 执行撤销
  // ──────────────────────────────────────────────
  app.post("/api/v1/admin/undo/:token", async (request, reply) => {
    const { token } = request.params as any;
    const redis = getRedis();
    const raw = await redis.get(`undo:${token}`);

    if (!raw) {
      return reply.status(410).send({ code: 410, data: null, message: "撤销令牌已过期或无效（30秒有效）" });
    }

    const undoToken: UndoToken = JSON.parse(raw);

    // 仅创建者可以撤销
    if (undoToken.operatorId !== request.user!.userId) {
      return reply.status(403).send({ code: 403, data: null, message: "只有操作者可以撤销" });
    }

    const db = getDb();

    try {
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
        case "disable_user":
          await db.update(users)
            .set({ status: undoToken.before.status || "active" })
            .where(eq(users.id, undoToken.resourceId));
          break;
        case "delete_api_key_permanent":
          await db.update(apiKeys)
            .set({ deletedAt: null })
            .where(eq(apiKeys.id, undoToken.resourceId));
          break;
        default:
          return reply.status(400).send({ code: 400, data: null, message: `不支持撤销操作: ${undoToken.action}` });
      }

      // 更新持久化状态
      await db.update(undoLogs)
        .set({ status: "undone", undoneAt: new Date() })
        .where(eq(undoLogs.token, token));

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
    } catch (err: any) {
      return reply.status(500).send({ code: 500, data: null, message: `撤销失败: ${err.message}` });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/undo/history — 撤销历史
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/undo/history", async (request, reply) => {
    const query = request.query as { page?: string; pageSize?: string; status?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const db = getDb();

    const where = query.status ? eq(undoLogs.status, query.status) : undefined;
    const totalResult = await db.select({ total: count(undoLogs.id) })
      .from(undoLogs)
      .where(where);

    const total = Number(totalResult[0]?.total || 0);
    const list = await db.select()
      .from(undoLogs)
      .where(where)
      .orderBy(desc(undoLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      code: 0,
      data: { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      message: "ok",
    };
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/undo/:token — 查询令牌状态
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/undo/:token", async (request, reply) => {
    const { token } = request.params as any;
    const redis = getRedis();

    const raw = await redis.get(`undo:${token}`);
    const used = await redis.get(`undo:${token}:used`);

    if (!raw && !used) {
      return reply.send({
        code: 0,
        data: { status: "expired", token },
        message: "ok",
      });
    }

    if (used) {
      return reply.send({
        code: 0,
        data: { status: "used", token },
        message: "ok",
      });
    }

    const undoToken: UndoToken = JSON.parse(raw!);
    return reply.send({
      code: 0,
      data: {
        status: "active",
        token,
        action: undoToken.action,
        resourceType: undoToken.resourceType,
        resourceId: undoToken.resourceId,
        expiresIn: Math.max(0, Math.floor((undoToken.createdAt + UNDO_TTL * 1000 - Date.now()) / 1000)),
      },
      message: "ok",
    });
  });
}