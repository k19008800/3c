// ============================================================
//  3cloud (3C) — API Key 管理路由
//  POST   /api/v1/api-keys          — 创建
//  GET    /api/v1/api-keys          — 列表
//  PATCH  /api/v1/api-keys/:id      — 更新
//  DELETE /api/v1/api-keys/:id      — 删除
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, sql, gte, desc } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../db/index.js";
import { apiKeys, callLogs } from "../db/schema.js";
import { authenticateJWT, guardNotImpersonating } from "../middleware/auth.js";
import { logOperation } from "../services/operation-log.js";
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

        logOperation({
          userId: request.user!.userId,
          userRole: request.user!.role,
          category: "api_key",
          action: "api_key_create",
          targetType: "api_key",
          targetId: key.id,
          resourceName: key.name,
          summary: `创建 API Key: ${key.name}`,
          ip: request.ip,
          userAgent: request.headers["user-agent"] as string | undefined,
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
          quotaBalance: apiKeys.quotaBalance,
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

      logOperation({
        userId: request.user!.userId,
        userRole: request.user!.role,
        category: "api_key",
        action: "api_key_delete",
        targetType: "api_key",
        targetId: id,
        summary: `删除 API Key #${id}`,
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string | undefined,
      });

      reply.status(200).send({ code: 0, data: null, message: "ok" });
    },
  });

  // ── 单个 Key 深度用量统计 ──
  // GET /api/v1/api-keys/:id/usage — 今日/本月/累计 + 7天趋势 + 按模型分布 + 成功率 + 24h趋势 + 全部Key对比

  app.get("/api/v1/api-keys/:id/usage", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const keyId = parseInt((request.params as any).id);
      const userId = request.user!.userId;

      if (isNaN(keyId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的 Key ID" });
        return;
      }

      const [key] = await db
        .select({ id: apiKeys.id, name: apiKeys.name })
        .from(apiKeys)
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
        .limit(1);

      if (!key) {
        reply.status(404).send({ code: 404, data: null, message: "API Key 不存在" });
        return;
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // ── 全部 Key 汇总（用于对比）──
      const allKeysSummary = await db
        .select({
          keyId: apiKeys.id,
          keyName: apiKeys.name,
          calls: sql<number>`coalesce(count(${callLogs.id}) filter (where ${callLogs.createdAt} >= ${todayStart}), 0)::int`,
          tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}) filter (where ${callLogs.createdAt} >= ${todayStart}), 0)::bigint`,
          cost: sql<string>`coalesce(sum(${callLogs.cost}) filter (where ${callLogs.createdAt} >= ${todayStart}), '0')`,
        })
        .from(apiKeys)
        .leftJoin(callLogs, and(eq(callLogs.apiKeyId, apiKeys.id), gte(callLogs.createdAt, todayStart)))
        .where(eq(apiKeys.userId, userId))
        .groupBy(apiKeys.id, apiKeys.name);

      // ── 按模型分布 ──
      const modelBreakdown = await db
        .select({
          modelName: callLogs.modelName,
          calls: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
          cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
          successCount: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
          failedCount: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        })
        .from(callLogs)
        .where(and(eq(callLogs.apiKeyId, keyId), gte(callLogs.createdAt, monthStart)))
        .groupBy(callLogs.modelName)
        .orderBy(sql`coalesce(sum(${callLogs.totalTokens}), 0) desc`);

      // ── 今日统计 ──
      const [today] = await db
        .select({
          calls: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
          cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
          successCount: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
          failedCount: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
          avgDurationMs: sql<number>`coalesce(avg(${callLogs.durationMs}), 0)::int`,
        })
        .from(callLogs)
        .where(and(eq(callLogs.apiKeyId, keyId), gte(callLogs.createdAt, todayStart)));

      // ── 本月统计 ──
      const [month] = await db
        .select({
          calls: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
          cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
          successCount: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
          failedCount: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        })
        .from(callLogs)
        .where(and(eq(callLogs.apiKeyId, keyId), gte(callLogs.createdAt, monthStart)));

      // ── 累计统计 ──
      const [allTime] = await db
        .select({
          calls: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
          cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
        })
        .from(callLogs)
        .where(eq(callLogs.apiKeyId, keyId));

      // ── 最近 7 天趋势（按天）──
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const trends = await db
        .select({
          date: sql<string>`to_char(${callLogs.createdAt}, 'MM-DD')`,
          calls: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
          cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
        })
        .from(callLogs)
        .where(and(eq(callLogs.apiKeyId, keyId), gte(callLogs.createdAt, sevenDaysAgo)))
        .groupBy(sql`to_char(${callLogs.createdAt}, 'MM-DD')`)
        .orderBy(sql`to_char(${callLogs.createdAt}, 'MM-DD')`);

      // ── 最近 24 小时趋势（按小时）──
      const hourlyTrends = await db
        .select({
          hour: sql<number>`extract(hour from ${callLogs.createdAt})::int`,
          calls: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        })
        .from(callLogs)
        .where(and(eq(callLogs.apiKeyId, keyId), gte(callLogs.createdAt, hours24Ago)))
        .groupBy(sql`extract(hour from ${callLogs.createdAt})`)
        .orderBy(sql`extract(hour from ${callLogs.createdAt})`);

      reply.status(200).send({
        code: 0,
        data: {
          keyName: key.name,
          today: {
            calls: today?.calls ?? 0,
            tokens: Number(today?.tokens ?? 0),
            cost: today?.cost ?? '0',
            successCount: today?.successCount ?? 0,
            failedCount: today?.failedCount ?? 0,
            avgDurationMs: today?.avgDurationMs ?? 0,
          },
          month: {
            calls: month?.calls ?? 0,
            tokens: Number(month?.tokens ?? 0),
            cost: month?.cost ?? '0',
            successCount: month?.successCount ?? 0,
            failedCount: month?.failedCount ?? 0,
          },
          allTime: { calls: allTime?.calls ?? 0, tokens: Number(allTime?.tokens ?? 0), cost: allTime?.cost ?? '0' },
          trends,
          hourlyTrends,
          modelBreakdown: modelBreakdown.map(m => ({
            ...m,
            tokens: Number(m.tokens),
          })),
          allKeysSummary: allKeysSummary.map(k => ({
            keyId: k.keyId,
            keyName: k.keyName,
            calls: k.calls,
            tokens: Number(k.tokens),
            cost: k.cost,
          })),
        },
        message: "ok",
      });
    },
  });

  // ── 单个 Key 用量导出 CSV ──
  // GET /api/v1/api-keys/:id/usage/export?period=today|month|all

  app.get("/api/v1/api-keys/:id/usage/export", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const keyId = parseInt((request.params as any).id);
      const userId = request.user!.userId;
      const period = ((request.query as any).period) || 'month';

      if (isNaN(keyId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的 Key ID" });
        return;
      }

      const [key] = await db
        .select({ id: apiKeys.id, name: apiKeys.name })
        .from(apiKeys)
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
        .limit(1);

      if (!key) {
        reply.status(404).send({ code: 404, data: null, message: "API Key 不存在" });
        return;
      }

      const now = new Date();
      let startDate: Date;
      if (period === 'today') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      else startDate = new Date(0);

      const rows = await db
        .select({
          time: callLogs.createdAt,
          model: callLogs.modelName,
          promptTokens: callLogs.promptTokens,
          completionTokens: callLogs.completionTokens,
          totalTokens: callLogs.totalTokens,
          cost: callLogs.cost,
          status: callLogs.status,
          durationMs: callLogs.durationMs,
        })
        .from(callLogs)
        .where(and(eq(callLogs.apiKeyId, keyId), gte(callLogs.createdAt, startDate)))
        .orderBy(desc(callLogs.createdAt))
        .limit(10000);

      const header = '时间,模型,Prompt Tokens,Completion Tokens,总Tokens,费用,状态,耗时ms';
      const csv = rows.map(r =>
        `"${r.time?.toISOString() ?? ''}","${r.model ?? ''}",${r.promptTokens ?? 0},${r.completionTokens ?? 0},${r.totalTokens ?? 0},${r.cost ?? '0'},"${r.status ?? ''}",${r.durationMs ?? ''}`
      ).join('\n');

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="key_${key.name}_usage_${period}.csv"`);
      reply.send('﻿' + header + '\n' + csv);
    },
  });
}
