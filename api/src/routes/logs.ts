// ============================================================
//  3cloud (3C) — 调用日志路由
//  GET /api/v1/logs — 用户查看自己的调用记录
//  GET /api/v1/logs/:id — 查看单条调用详情
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { callLogs } from "../db/schema.js";
import { authenticateJWT } from "../middleware/auth.js";
import { logFilterSchema } from "../schemas.js";
import { AppError } from "../services/auth-service.js";

interface CallLogItem {
  id: number;
  modelName: string | null;
  vendorName: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: string;
  durationMs: number | null;
  status: string;
  isStreaming: boolean;
  errorMessage: string | null;
  requestIp: string | null;
  createdAt: string;
}

interface CallLogDetail extends CallLogItem {
  apiKeyId: number | null;
  modelId: number | null;
  vendorModelId: number | null;
  userAgent: string | null;
}

export async function logRoutes(app: FastifyInstance) {
  // ── 所有日志路由需要 JWT 鉴权 ──
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/logs — 用户调用记录列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/logs", async (request, reply) => {
    try {
      const query = request.query as Record<string, string>;
      const parsed = logFilterSchema.parse(query);
      const userId = request.user!.userId;

      const db = getDb();
      const offset = (parsed.page - 1) * parsed.pageSize;

      // 构建过滤条件
      const conditions = [eq(callLogs.userId, userId)];

      if (parsed.modelId) {
        conditions.push(eq(callLogs.modelId, parsed.modelId));
      }
      if (parsed.vendorName) {
        conditions.push(eq(callLogs.vendorName, parsed.vendorName));
      }
      if (parsed.status) {
        conditions.push(eq(callLogs.status, parsed.status as any));
      }
      if (parsed.startDate) {
        conditions.push(gte(callLogs.createdAt, new Date(parsed.startDate)));
      }
      if (parsed.endDate) {
        conditions.push(lte(callLogs.createdAt, new Date(parsed.endDate)));
      }

      // 查总数
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(callLogs)
        .where(and(...conditions));

      const total = Number(totalResult?.count ?? 0);

      // 查分页数据
      const rows = await db
        .select({
          id: callLogs.id,
          modelName: callLogs.modelName,
          vendorName: callLogs.vendorName,
          promptTokens: callLogs.promptTokens,
          completionTokens: callLogs.completionTokens,
          totalTokens: callLogs.totalTokens,
          cost: callLogs.cost,
          durationMs: callLogs.durationMs,
          status: callLogs.status,
          isStreaming: callLogs.isStreaming,
          errorMessage: callLogs.errorMessage,
          requestIp: callLogs.ip,
          createdAt: callLogs.createdAt,
        })
        .from(callLogs)
        .where(and(...conditions))
        .orderBy(desc(callLogs.createdAt))
        .limit(parsed.pageSize)
        .offset(offset);

      const list: CallLogItem[] = rows.map((r) => ({
        id: r.id,
        modelName: r.modelName,
        vendorName: r.vendorName,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        totalTokens: r.totalTokens,
        cost: r.cost,
        durationMs: r.durationMs,
        status: r.status,
        isStreaming: r.isStreaming,
        errorMessage: r.errorMessage,
        requestIp: r.requestIp,
        createdAt: r.createdAt.toISOString(),
      }));

      reply.status(200).send({
        code: 0,
        data: { list, total, page: parsed.page, pageSize: parsed.pageSize },
        message: "ok",
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
        return;
      }
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/logs/:id — 单条调用详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/logs/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = request.user!.userId;
      const logId = parseInt(id, 10);

      if (isNaN(logId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的日志 ID" });
        return;
      }

      const db = getDb();

      const [log] = await db
        .select()
        .from(callLogs)
        .where(and(
          eq(callLogs.id, logId),
          eq(callLogs.userId, userId),
        ))
        .limit(1);

      if (!log) {
        reply.status(404).send({ code: 404, data: null, message: "日志不存在" });
        return;
      }

      const detail: CallLogDetail = {
        id: log.id,
        modelName: log.modelName,
        vendorName: log.vendorName,
        promptTokens: log.promptTokens,
        completionTokens: log.completionTokens,
        totalTokens: log.totalTokens,
        cost: log.cost,
        durationMs: log.durationMs,
        status: log.status,
        isStreaming: log.isStreaming,
        errorMessage: log.errorMessage,
        requestIp: log.ip,
        createdAt: log.createdAt.toISOString(),
        apiKeyId: log.apiKeyId,
        modelId: log.modelId,
        vendorModelId: log.vendorModelId,
        userAgent: log.userAgent,
      };

      reply.status(200).send({
        code: 0,
        data: detail,
        message: "ok",
      });
    } catch (err) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/logs/summary — 汇总统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/logs/summary", async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const db = getDb();

      const query = request.query as {
        startDate?: string;
        endDate?: string;
      };

      const conditions = [eq(callLogs.userId, userId)];

      if (query.startDate) {
        conditions.push(gte(callLogs.createdAt, new Date(query.startDate)));
      }
      if (query.endDate) {
        conditions.push(lte(callLogs.createdAt, new Date(query.endDate)));
      }

      const [summary] = await db
        .select({
          totalCalls: sql<number>`count(*)`,
          totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)`,
          totalCost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
          successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')`,
          failedCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')`,
        })
        .from(callLogs)
        .where(and(...conditions));

      reply.status(200).send({
        code: 0,
        data: {
          totalCalls: Number(summary?.totalCalls ?? 0),
          totalTokens: Number(summary?.totalTokens ?? 0),
          totalCost: summary?.totalCost ?? "0.000000",
          successCalls: Number(summary?.successCalls ?? 0),
          failedCalls: Number(summary?.failedCalls ?? 0),
        },
        message: "ok",
      });
    } catch (err) {
      throw err;
    }
  });
}
