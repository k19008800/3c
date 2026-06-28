// ============================================================
//  3cloud (3C) — API Key 管理路由
//  POST   /api/v1/api-keys          — 创建
//  GET    /api/v1/api-keys          — 列表
//  PATCH  /api/v1/api-keys/:id      — 更新
//  DELETE /api/v1/api-keys/:id      — 删除
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { authenticateJWT, guardNotImpersonating } from "../middleware/auth.js";
import {
  createApiKeySchema,
  updateApiKeySchema,
} from "../schemas.js";

export async function apiKeyRoutes(app: FastifyInstance) {
  // 创建 API Key
  app.post("/api/v1/api-keys", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const parsed = createApiKeySchema.parse(request.body);
        const db = getDb();

        // 生成 API Key: sk-3c- + 48 字节随机 hex
        const rawKey = `sk-3c-${randomBytes(48).toString("hex")}`;
        const keyHash = createHash("sha256").update(rawKey).digest("hex");
        const keyPrefix = rawKey.slice(0, 8);

        const [key] = await db
          .insert(apiKeys)
          .values({
            userId: request.user!.userId,
            name: parsed.name,
            keyHash,
            keyPrefix,
            expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
          })
          .returning({
            id: apiKeys.id,
            name: apiKeys.name,
            keyPrefix: apiKeys.keyPrefix,
            expiresAt: apiKeys.expiresAt,
          });

        reply.status(200).send({
          code: 0,
          data: {
            id: key.id,
            name: key.name,
            key: rawKey, // 仅展示一次
            keyPrefix: key.keyPrefix,
            expiresAt: key.expiresAt?.toISOString() ?? null,
          },
          message: "ok",
        });
      } catch (err: any) {
        if (err?.name === "ZodError") {
          reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
          return;
        }
        throw err;
      }
    },
  });

  // 列表 API Key
  app.get("/api/v1/api-keys", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const page = parseInt((request.query as any).page || "1");
      const pageSize = parseInt((request.query as any).pageSize || "20");

      const keys = await db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          status: apiKeys.status,
          expiresAt: apiKeys.expiresAt,
          lastUsedAt: apiKeys.lastUsedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.userId, request.user!.userId))
        .orderBy(apiKeys.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(apiKeys)
        .where(eq(apiKeys.userId, request.user!.userId));

      reply.status(200).send({
        code: 0,
        data: {
          list: keys.map((k) => ({
            ...k,
            expiresAt: k.expiresAt?.toISOString() ?? null,
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            createdAt: k.createdAt?.toISOString() ?? null,
          })),
          total: Number(countResult?.count || 0),
          page,
          pageSize,
        },
        message: "ok",
      });
    },
  });

  // 更新 API Key
  app.patch("/api/v1/api-keys/:id", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const parsed = updateApiKeySchema.parse(request.body);
        const db = getDb();
        const id = parseInt((request.params as any).id);

        const [existing] = await db
          .select({ id: apiKeys.id })
          .from(apiKeys)
          .where(
            and(eq(apiKeys.id, id), eq(apiKeys.userId, request.user!.userId))
          )
          .limit(1);

        if (!existing) {
          reply.status(404).send({ code: 404, data: null, message: "API Key 不存在" });
          return;
        }

        const setValues: Record<string, any> = {};
        if (parsed.name !== undefined) setValues.name = parsed.name;
        if (parsed.status !== undefined) setValues.status = parsed.status;

        if (Object.keys(setValues).length > 0) {
          await db.update(apiKeys).set(setValues).where(eq(apiKeys.id, id));
        }

        reply.status(200).send({ code: 0, data: null, message: "ok" });
      } catch (err: any) {
        if (err?.name === "ZodError") {
          reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
          return;
        }
        throw err;
      }
    },
  });

  // 删除 API Key
  app.delete("/api/v1/api-keys/:id", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      const db = getDb();
      const id = parseInt((request.params as any).id);

      const [existing] = await db
        .select({ id: apiKeys.id })
        .from(apiKeys)
        .where(
          and(eq(apiKeys.id, id), eq(apiKeys.userId, request.user!.userId))
        )
        .limit(1);

      if (!existing) {
        reply.status(404).send({ code: 404, data: null, message: "API Key 不存在" });
        return;
      }

      await db.delete(apiKeys).where(eq(apiKeys.id, id));
      reply.status(200).send({ code: 0, data: null, message: "ok" });
    },
  });
}
