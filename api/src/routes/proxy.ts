// ============================================================
//  3cloud (3C) — Token 代理路由
//  兼容 OpenAI API 格式：
//   POST /api/v1/chat/completions  — 非流式 + 流式 (SSE)
//   POST /api/v1/embeddings        — 非流式
//  鉴权方式：API Key (Bearer)
//  流程：鉴权 → 限流 → 路由 → 转发 → 计费 → 更新限流
// ============================================================

import { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { models, users } from "../db/schema.js";
import { authenticateApiKey } from "../middleware/auth.js";
import {
  checkRateLimit,
  recordRequestForLimit,
  recordTokensForLimit,
} from "../middleware/rate-limit.js";
import { AppError } from "../services/auth-service.js";
import { enrichCallGeo } from "../services/geo-check.js";
import { selectRoute, forwardRequest, forwardStreamRequest } from "../services/router.js";
import { charge, calculateCost } from "../services/billing.js";
import { updateHealthAfterCall } from "../services/health-check.js";
import {
  chatCompletionSchema,
  embeddingsSchema,
} from "../schemas.js";

// ── 用户限流配置缓存（60 秒） ──
const userLimitCache = new Map<number, {
  userType: "personal" | "enterprise";
  rpmOverride: number | null;
  tpmOverride: number | null;
  expiresAt: number;
}>();

async function getUserLimitInfo(userId: number): Promise<{
  userType: "personal" | "enterprise";
  rpmOverride: number | null;
  tpmOverride: number | null;
}> {
  const cached = userLimitCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return { userType: cached.userType, rpmOverride: cached.rpmOverride, tpmOverride: cached.tpmOverride };
  }

  const db = getDb();
  const [user] = await db
    .select({
      userType: users.userType,
      rpmOverride: users.rpmOverride,
      tpmOverride: users.tpmOverride,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { userType: "personal", rpmOverride: null, tpmOverride: null };
  }

  const info = {
    userType: user.userType as "personal" | "enterprise",
    rpmOverride: user.rpmOverride,
    tpmOverride: user.tpmOverride,
  };
  userLimitCache.set(userId, { ...info, expiresAt: Date.now() + 60_000 });
  return info;
}

export function clearUserLimitCache() {
  userLimitCache.clear();
}

// ── 工具：OpenAI 兼容错误响应 ──
function openaiError(status: number, message: string, type: string, code: string) {
  return {
    error: { message, type, code },
  };
}

export async function proxyRoutes(app: FastifyInstance) {
  // ── 所有代理路由需要 API Key 鉴权 ──
  app.addHook("preHandler", authenticateApiKey);

  // ── 限流预检查 hook ──
  app.addHook("preHandler", async (request, reply) => {
    if (!request.user) return; // 鉴权失败会被前置 hook 拦截

    const userId = request.user.userId;
    const apiKeyId = request.apiKey?.id ?? null;
    const { userType, rpmOverride, tpmOverride } = await getUserLimitInfo(userId);

    const rejected = await checkRateLimit(userId, apiKeyId, userType, rpmOverride, tpmOverride);
    if (rejected) {
      reply.status(429);
      return openaiError(
        429,
        `请求频率超限（${rejected.dimension.toUpperCase()} ${rejected.level}: ${rejected.current}/${rejected.limit}）`,
        "rate_limit_error",
        "rate_limit_exceeded",
      );
    }
  });

  // ── 模型名称 → 解析 unified modelId + modelName ──
  async function resolveModel(name: string) {
    const db = getDb();
    const [model] = await db
      .select({ id: models.id, name: models.name })
      .from(models)
      .where(and(eq(models.name, name), eq(models.status, true)))
      .limit(1);

    if (!model) {
      throw new AppError(
        "MODEL_NOT_FOUND",
        `模型 "${name}" 不存在或已下架。可用模型请调用 GET /api/v1/models`,
        404,
      );
    }

    return model;
  }

  // ── Fallback: 主厂商 5xx 时尝试次优厂商 ──
  async function tryFallback(
    model: { id: number; name: string },
    request: any,
    failedRoute: any,
    userId: number,
    apiKeyId: number | null,
    originalStartTime: number,
  ): Promise<any> {
    try {
      const { eq, asc, and, sql } = await import("drizzle-orm");
      const { getDb } = await import("../db/index.js");
      const { vendorModels: vmTable, vendors: vTable, models: mTable } = await import("../db/schema.js");
      const { decryptApiKey } = await import("../services/encryption.js");
      const db = getDb();

      const rows = await db
        .select({
          vendorModelId: vmTable.id, vendorId: vmTable.vendorId,
          vendorName: vTable.name, modelId: vmTable.modelId,
          upstreamModelName: vmTable.upstreamModelName,
          apiEndpoint: vmTable.apiEndpoint,
          apiKeyEncrypted: vmTable.apiKeyEncrypted,
          sellPriceInput: vmTable.sellPriceInput,
          sellPriceOutput: vmTable.sellPriceOutput,
          weight: vmTable.weight,
          rpmLimit: vmTable.rpmLimit, tpmLimit: vmTable.tpmLimit,
          healthScore: vmTable.healthScore, isDown: vmTable.isDown,
        })
        .from(vmTable)
        .innerJoin(vTable, eq(vmTable.vendorId, vTable.id))
        .where(
          and(
            eq(vmTable.modelId, model.id),
            eq(vmTable.status, true),
            eq(vTable.status, "active"),
            sql`${vmTable.id} != ${failedRoute.vendorModelId}`,
          ),
        )
        .orderBy(asc(vmTable.sellPriceInput))
        .limit(1);

      if (rows.length === 0) return null;
      const r = rows[0];

      const fallbackRoute = {
        vendorModelId: r.vendorModelId,
        vendorId: r.vendorId,
        vendorName: r.vendorName,
        modelId: r.modelId,
        upstreamModelName: r.upstreamModelName,
        apiEndpoint: r.apiEndpoint,
        apiKeyPlain: decryptApiKey(r.apiKeyEncrypted),
        sellPriceInput: Number(r.sellPriceInput),
        sellPriceOutput: Number(r.sellPriceOutput),
        weight: r.weight,
        rpmLimit: r.rpmLimit,
        tpmLimit: r.tpmLimit,
        healthScore: Number(r.healthScore ?? 1),
        isDown: r.isDown,
      };

      request.log.info({
        from: failedRoute.vendorModelId,
        to: fallbackRoute.vendorModelId,
        vendor: fallbackRoute.vendorName,
      }, "代理 fallback");

      const fallbackResult = await forwardRequest(fallbackRoute, request);
      const durationMs = Date.now() - originalStartTime;

      await updateHealthAfterCall(fallbackRoute.vendorModelId, fallbackResult.status < 400, durationMs);

      if (fallbackResult.status >= 400) return null;

      if (fallbackResult.usage) {
        await charge({
          userId, apiKeyId, modelId: model.id,
          vendorModelId: fallbackRoute.vendorModelId,
          vendorName: fallbackRoute.vendorName,
          modelName: model.name,
          promptTokens: fallbackResult.usage.promptTokens,
          completionTokens: fallbackResult.usage.completionTokens,
          totalTokens: fallbackResult.usage.totalTokens,
          durationMs, isStreaming: false,
          status: "success",
          ip: request.ip,
          userAgent: request.headers["user-agent"] as string,
        }).catch(() => {});
        await recordTokensForLimit(userId, fallbackResult.usage.totalTokens);
      }

      return fallbackResult.body;
    } catch (err) {
      console.warn("[Fallback] fallback 失败:", err);
      return null;
    }
  }

  // ── 通用非流式转发 + 计费 ──
  async function handleNonStreaming(
    request: any,
    reply: any,
    body: any,
    modelName: string,
  ) {
    const model = await resolveModel(modelName);
    const userId = request.user!.userId;
    const apiKeyId = request.apiKey?.id ?? null;

    // 记录请求到限流窗口
    await recordRequestForLimit(userId, apiKeyId);

    // 路由选择
    const route = await selectRoute({
      modelName: model.name,
      userId,
    });

    // 转发（含网络错误保护，网络不可达时也记录失败调用日志）
    const startTime = Date.now();
    let result: Awaited<ReturnType<typeof forwardRequest>>;
    try {
      result = await forwardRequest(route, request);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await updateHealthAfterCall(route.vendorModelId, false, durationMs);

      // 触发熔断计数
      try {
        const { recordVendorModelFailure } = await import("../services/circuit-breaker.js");
        await recordVendorModelFailure(route.vendorModelId, `网络错误: ${err.message}`);
      } catch {}

      // 网络异常也记录失败调用日志
      await charge({
        userId, apiKeyId, modelId: model.id,
        vendorModelId: route.vendorModelId, vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        durationMs, isStreaming: false,
        status: "failed",
        errorMessage: `网络错误: ${err.message}`,
        ip: request.ip, userAgent: request.headers["user-agent"] as string,
      }).catch((e) => request.log.error({ err: e }, "计费记录失败"));

      reply.status(502);
      return openaiError(502, `上游厂商连接失败: ${err.message}`, "upstream_error", "upstream_unreachable");
    }
    const durationMs = Date.now() - startTime;

    // 健康检测（被动）
    await updateHealthAfterCall(
      route.vendorModelId,
      result.status >= 200 && result.status < 500,
      durationMs,
    );

    // 如果上游返回错误，触发熔断并尝试 fallback
    if (result.status >= 400) {
      // 触发熔断计数
      try {
        const { recordVendorModelFailure } = await import("../services/circuit-breaker.js");
        await recordVendorModelFailure(route.vendorModelId, result.body?.error?.message ?? `HTTP ${result.status}`);
      } catch {}

      // 5xx 错误尝试 fallback 厂商
      if (result.status >= 500) {
        const fallbackResult = await tryFallback(model, request, route, userId, apiKeyId, startTime);
        if (fallbackResult) {
          return fallbackResult;
        }
      }

      await charge({
        userId, apiKeyId, modelId: model.id,
        vendorModelId: route.vendorModelId, vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        durationMs, isStreaming: false,
        status: "failed",
        errorMessage: result.body?.error?.message ?? `上游返回 ${result.status}`,
        ip: request.ip, userAgent: request.headers["user-agent"] as string,
      }).catch((err) => request.log.error({ err }, "计费记录失败"));

      reply.status(result.status);
      return openaiError(
        result.status,
        result.body?.error?.message ?? "上游厂商错误",
        result.body?.error?.type ?? "upstream_error",
        result.body?.error?.code ?? String(result.status),
      );
    }

    // 扣费
    if (result.usage) {
      await charge({
        userId, apiKeyId, modelId: model.id,
        vendorModelId: route.vendorModelId, vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        durationMs, isStreaming: false,
        status: "success",
        ip: request.ip, userAgent: request.headers["user-agent"] as string,
      }).catch((err) => request.log.error({ err }, "计费失败"));

      // 更新 TPM 限流窗口
      await recordTokensForLimit(userId, result.usage.totalTokens);
    }

    // 原始响应返回
    return result.body;
  }

  // ──────────────────────────────────────────────
  //  POST /api/v1/chat/completions
  // ──────────────────────────────────────────────

  // ── 同时注册 /v1/*（兼容 OpenAI SDK 默认地址）和 /api/v1/* 路径 ──
  for (const prefix of ["/v1", "/api/v1"]) {

  //  POST <prefix>/chat/completions
  app.post(prefix + "/chat/completions", async (request, reply) => {
    try {
      const body = chatCompletionSchema.parse((request as any).body) as any;
      const modelName = body.model;

      // 非阻塞 Geo 富化（背景执行，不阻塞代理响应）
      enrichCallGeo(request.ip, request.user!.userId).catch(() => {});

      if (body.stream) {
        return await handleStreamingChat(request, reply, modelName);
      }

      return await handleNonStreaming(request, reply, body, modelName);
    } catch (err: any) {
      return handleProxyError(reply, err);
    }
  });

  //  POST <prefix>/embeddings
  app.post(prefix + "/embeddings", async (request, reply) => {
    try {
      const body = embeddingsSchema.parse((request as any).body) as any;

      // 非阻塞 Geo 富化
      enrichCallGeo(request.ip, request.user!.userId).catch(() => {});

      return await handleNonStreaming(request, reply, body, body.model);
    } catch (err: any) {
      return handleProxyError(reply, err);
    }
  });

  } // end for prefix loop

  // ── 流式处理核心 ──

  async function handleStreamingChat(
    request: any,
    reply: any,
    modelName: string,
  ) {
    const model = await resolveModel(modelName);
    const userId = request.user!.userId;
    const apiKeyId = request.apiKey?.id ?? null;

    // 记录请求到限流窗口
    await recordRequestForLimit(userId, apiKeyId);

    // 路由选择
    const route = await selectRoute({ modelName: model.name, userId });

    // 发起流式转发
    const startTime = Date.now();
    let streamResult;
    try {
      streamResult = await forwardStreamRequest(route, request);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await updateHealthAfterCall(route.vendorModelId, false, durationMs);
      await charge({
        userId, apiKeyId, modelId: model.id,
        vendorModelId: route.vendorModelId, vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        durationMs, isStreaming: true, status: "failed",
        errorMessage: err.message, ip: request.ip,
        userAgent: request.headers["user-agent"] as string,
      }).catch(() => {});
      throw err;
    }

    const durationMs = Date.now() - startTime;

    // 设置 SSE 响应头
    reply.raw.writeHead(streamResult.status, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...streamResult.headers,
    });

    // 将 ReadableStream 转为 Node.js Readable 并 pipe 到 reply.raw
    const nodeStream = Readable.fromWeb(streamResult.stream as any);

    // 处理客户端断连
    let disconnected = false;
    request.raw.on("close", () => {
      disconnected = true;
      nodeStream.destroy();
    });

    nodeStream.pipe(reply.raw);

    // 等待流结束
    await new Promise<void>((resolve, reject) => {
      nodeStream.on("end", resolve);
      nodeStream.on("error", (err) => {
        disconnected ? resolve() : reject(err);
      });
    });

    // ── 流结束后执行计费 ──

    const usage = await streamResult.usagePromise;
    const success = !disconnected;

    await updateHealthAfterCall(route.vendorModelId, success, durationMs).catch(() => {});

    // 上游 HTTP 错误（如 4xx/5xx）也要记录失败调用
    if (streamResult.status >= 400) {
      await charge({
        userId, apiKeyId, modelId: model.id,
        vendorModelId: route.vendorModelId, vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: usage?.promptTokens ?? 0,
        completionTokens: usage?.completionTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
        durationMs, isStreaming: true, status: "failed",
        errorMessage: `上游返回 HTTP ${streamResult.status}`,
        ip: request.ip, userAgent: request.headers["user-agent"] as string,
      }).catch((err) => request.log.error({ err }, "流式计费失败"));

      if (usage?.totalTokens) {
        await recordTokensForLimit(userId, usage.totalTokens).catch(() => {});
      }

      reply.hijacked = true;
      return; // reply.raw 已写 head，不再额外响应
    }

    if (usage && success) {
      await charge({
        userId, apiKeyId, modelId: model.id,
        vendorModelId: route.vendorModelId, vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        durationMs, isStreaming: true, status: "success",
        ip: request.ip, userAgent: request.headers["user-agent"] as string,
      }).catch((err) => request.log.error({ err }, "流式计费失败"));

      // 更新 TPM 限流窗口
      await recordTokensForLimit(userId, usage.totalTokens);
    } else if (disconnected) {
      await charge({
        userId, apiKeyId, modelId: model.id,
        vendorModelId: route.vendorModelId, vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: usage?.promptTokens ?? 0,
        completionTokens: usage?.completionTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
        durationMs, isStreaming: true, status: "cancelled",
        errorMessage: "客户端断连",
        ip: request.ip, userAgent: request.headers["user-agent"] as string,
      }).catch(() => {});
    }

    reply.hijacked = true;
  }

  // ── 统一错误处理 ──
  function handleProxyError(reply: any, err: any) {
    if (err instanceof AppError) {
      reply.status(err.statusCode);
      return openaiError(err.statusCode, err.message, "invalid_request_error", err.code);
    }
    if (err?.name === "ZodError") {
      reply.status(400);
      return openaiError(400, err.errors?.[0]?.message || "请求参数校验失败", "invalid_request_error", "invalid_params");
    }
    // Fastify 会处理其他未捕获异常
    throw err;
  }
}

// ── 扩展 FastifyReply 类型 ──
declare module "fastify" {
  interface FastifyReply {
    hijacked?: boolean;
  }
}
