// ============================================================
//  3cloud (3C) — Token 代理路由
//  兼容 OpenAI API 格式：
//   POST /api/v1/chat/completions  — 非流式 + 流式 (SSE)
//   POST /api/v1/embeddings        — 非流式
//  鉴权方式：API Key (Bearer)
//  流程：鉴权 → 限流 → 路由 → 转发 → 计费 → 更新限流
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Readable } from "node:stream";
import { eq, and, isNotNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { models, users, callLogs } from "../db/schema.js";
import { authenticateApiKey } from "../middleware/auth.js";
import {
  checkRateLimit,
  recordRequestForLimit,
  recordTokensForLimit,
} from "../middleware/rate-limit.js";
import { AppError } from "../services/auth-service.js";
import { getActiveUserQuota } from "../services/quota-service.js";
import { enrichCallGeo } from "../services/geo-check.js";
import { selectRoute, forwardRequest, forwardStreamRequest } from "../services/router.js";
import type { VendorModelRoute } from "../services/router.js";
import { charge, calculateCost } from "../services/billing.js";
import { updateHealthAfterCall } from "../services/health-check.js";
import {
  chatCompletionSchema,
  embeddingsSchema,
  type ChatCompletionInput,
  type EmbeddingsInput,
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

    // 获取用户额度中的 TPM/RPM 覆盖值（额度级 > 用户级 override > 类型默认值）
    let quotaRpmLimit: number | null | undefined;
    let quotaTpmLimit: number | null | undefined;
    try {
      const activeQuota = await getActiveUserQuota(userId);
      if (activeQuota) {
        quotaRpmLimit = activeQuota.rpmLimit;
        quotaTpmLimit = activeQuota.tpmLimit;
      }
    } catch {
      // 静默失败，继续使用用户级/默认限流
    }

    const rejected = await checkRateLimit(
      userId, apiKeyId, userType, rpmOverride, tpmOverride,
      quotaRpmLimit, quotaTpmLimit,
    );
    if (rejected) {
      // 记录 429 到 call_logs
      try {
        const db = getDb();
        await db.insert(callLogs).values({
          userId,
          apiKeyId,
          status: 'rate_limited',
          errorMessage: `请求频率超限（${rejected.dimension.toUpperCase()} ${rejected.level}: ${rejected.current}/${rejected.limit}）`,
          durationMs: 0,
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });
      } catch { /* 429 记录失败不影响主流程 */ }

      reply.header("Retry-After", String(Math.ceil((rejected.retryAfterMs ?? 60000) / 1000)));
      return reply.status(429).send(openaiError(
        429,
        `请求频率超限（${rejected.dimension.toUpperCase()} ${rejected.level}: ${rejected.current}/${rejected.limit}）`,
        "rate_limit_error",
        "rate_limit_exceeded",
      ));
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
    request: FastifyRequest,
    failedRoute: VendorModelRoute,
    userId: number,
    apiKeyId: number | null,
    originalStartTime: number,
  ): Promise<unknown> {
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

        // 记录调度实时指标
        const { recordSchedulingStats } = await import("../services/scheduling-stats.js");
        recordSchedulingStats(fallbackRoute.vendorName, model.name, fallbackResult.usage.totalTokens, durationMs).catch(() => {});
      }

      return fallbackResult.body;
    } catch (err) {
      console.warn("[Fallback] fallback 失败:", err);
      return null;
    }
  }

  // ── 通用非流式转发 + 计费 ──
  async function handleNonStreaming(
    request: FastifyRequest,
    reply: FastifyReply,
    body: Record<string, unknown>,
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

      // 记录调度实时指标
      const { recordSchedulingStats } = await import("../services/scheduling-stats.js");
      recordSchedulingStats(route.vendorName, model.name, result.usage.totalTokens, durationMs).catch(() => {});
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
      const body: ChatCompletionInput = chatCompletionSchema.parse(request.body);
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
      const body: EmbeddingsInput = embeddingsSchema.parse(request.body);

      // 非阻塞 Geo 富化
      enrichCallGeo(request.ip, request.user!.userId).catch(() => {});

      return await handleNonStreaming(request, reply, body, body.model);
    } catch (err: any) {
      return handleProxyError(reply, err);
    }
  });

  } // end for prefix loop

  // ══════════════════════════════════════════════
  //  扩展模型类型代理路由
  // ══════════════════════════════════════════════

  /**
   * 通用处理函数：非 Token 计费模型（图片、音频、Rerank 等）
   * 计费方式：按次/按张/按秒，使用虚拟 token 数记录
   */
  async function handleNonTokenBilling(
    request: FastifyRequest,
    reply: FastifyReply,
    body: Record<string, unknown>,
    modelName: string,
    billingUnit: "image" | "audio" | "rerank",
  ) {
    const model = await resolveModel(modelName);
    const userId = request.user!.userId;
    const apiKeyId = request.apiKey?.id ?? null;

    await recordRequestForLimit(userId, apiKeyId);

    const route = await selectRoute({ modelName: model.name, userId });

    const startTime = Date.now();
    let result: Awaited<ReturnType<typeof forwardRequest>>;
    try {
      result = await forwardRequest(route, request);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await updateHealthAfterCall(route.vendorModelId, false, durationMs);
      try {
        const { recordVendorModelFailure } = await import("../services/circuit-breaker.js");
        await recordVendorModelFailure(route.vendorModelId, `网络错误: ${err.message}`);
      } catch {}
      await charge({
        userId, apiKeyId, modelId: model.id,
        vendorModelId: route.vendorModelId, vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        durationMs, isStreaming: false, status: "failed",
        errorMessage: `网络错误: ${err.message}`,
        ip: request.ip, userAgent: request.headers["user-agent"] as string,
      }).catch(() => {});
      reply.status(502);
      return openaiError(502, `上游厂商连接失败: ${err.message}`, "upstream_error", "upstream_unreachable");
    }
    const durationMs = Date.now() - startTime;

    await updateHealthAfterCall(route.vendorModelId, result.status >= 200 && result.status < 500, durationMs);

    // Handle upstream errors
    if (result.status >= 400) {
      try {
        const { recordVendorModelFailure } = await import("../services/circuit-breaker.js");
        await recordVendorModelFailure(route.vendorModelId, result.body?.error?.message ?? `HTTP ${result.status}`);
      } catch {}
      await charge({
        userId, apiKeyId, modelId: model.id,
        vendorModelId: route.vendorModelId, vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        durationMs, isStreaming: false, status: "failed",
        errorMessage: result.body?.error?.message ?? `上游返回 ${result.status}`,
        ip: request.ip, userAgent: request.headers["user-agent"] as string,
      }).catch(() => {});
      reply.status(result.status);
      return openaiError(
        result.status,
        result.body?.error?.message ?? "上游厂商错误",
        result.body?.error?.type ?? "upstream_error",
        result.body?.error?.code ?? String(result.status),
      );
    }

    // Calculate virtual tokens for billing
    let virtualTokens = 0;
    if (billingUnit === "image") {
      // 图片：每个请求算 1000 token（基础费用），n 张 = n * 1000
      const n = Number(body?.n ?? 1);
      virtualTokens = n * 1000;
    } else if (billingUnit === "audio") {
      // 音频：按 durationMs 估算，每 10 秒 = 1000 token
      virtualTokens = Math.max(500, Math.round(durationMs / 10));
    } else if (billingUnit === "rerank") {
      // Rerank：按输入文档数估算，每个文档 = 500 token
      const documents = (body?.documents ?? []) as unknown[];
      virtualTokens = Math.max(100, documents.length * 500);
    }

    await charge({
      userId, apiKeyId, modelId: model.id,
      vendorModelId: route.vendorModelId, vendorName: route.vendorName,
      modelName: model.name,
      promptTokens: virtualTokens,
      completionTokens: 0,
      totalTokens: virtualTokens,
      durationMs, isStreaming: false, status: "success",
      ip: request.ip, userAgent: request.headers["user-agent"] as string,
    }).catch((err) => request.log.error({ err }, "计费失败"));

    await recordTokensForLimit(userId, virtualTokens);

    // Return original response body
    return result.body;
  }

  // ── Rerank 代理 ──
  for (const prefix of ["/v1", "/api/v1"]) {
    app.post(prefix + "/rerank", async (request, reply) => {
      try {
        const body = request.body as Record<string, unknown>;
        const modelName = body?.model as string | undefined;
        if (!modelName) {
          reply.status(400);
          return openaiError(400, "model 必填", "invalid_request_error", "missing_model");
        }
        return await handleNonTokenBilling(request, reply, body, modelName, "rerank");
      } catch (err: any) {
        return handleProxyError(reply, err);
      }
    });

    // ── 图片生成代理 ──
    app.post(prefix + "/images/generations", async (request, reply) => {
      try {
        const body = request.body as Record<string, unknown>;
        const modelName = body?.model as string | undefined;
        if (!modelName) {
          reply.status(400);
          return openaiError(400, "model 必填", "invalid_request_error", "missing_model");
        }
        return await handleNonTokenBilling(request, reply, body, modelName, "image");
      } catch (err: any) {
        return handleProxyError(reply, err);
      }
    });

    // ── TTS 代理 ──
    app.post(prefix + "/audio/speech", async (request, reply) => {
      try {
        const body = request.body as Record<string, unknown>;
        const modelName = body?.model as string | undefined;
        if (!modelName) {
          reply.status(400);
          return openaiError(400, "model 必填", "invalid_request_error", "missing_model");
        }
        return await handleNonTokenBilling(request, reply, body, modelName, "audio");
      } catch (err: any) {
        return handleProxyError(reply, err);
      }
    });

    // ── STT 代理 ──
    app.post(prefix + "/audio/transcriptions", async (request, reply) => {
      try {
        const body = request.body as Record<string, unknown>;
        const modelName = body?.model as string | undefined;
        if (!modelName) {
          reply.status(400);
          return openaiError(400, "model 必填", "invalid_request_error", "missing_model");
        }
        return await handleNonTokenBilling(request, reply, body, modelName, "audio");
      } catch (err: any) {
        return handleProxyError(reply, err);
      }
    });

    // ── 视频生成代理（Seedance / 火山引擎）──
    app.post(prefix + "/video/generations", async (request, reply) => {
      try {
        return await handleVideoGeneration(request, reply);
      } catch (err: any) {
        return handleProxyError(reply, err);
      }
    });

    // ── 视频任务状态查询 ──
    app.post(prefix + "/video/generations/:taskId/query", async (request, reply) => {
      try {
        return await handleVideoQuery(request, reply);
      } catch (err: any) {
        return handleProxyError(reply, err);
      }
    });
  }

  // ══════════════════════════════════════════════
  //  视频生成代理 (Seedance / 火山引擎)
  //  使用非标准 dance-create / dance-query 协议
  //  计费方式：虚拟 Token（视频任务创建时计费）
  // ══════════════════════════════════════════════

  async function fetchSeedanceApi(
    apiKey: string,
    endpoint: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json() as any;
    return { status: res.status, data };
  }

  async function handleVideoGeneration(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const body = request.body as Record<string, unknown>;
    const modelName = body?.model as string | undefined;
    if (!modelName) {
      reply.status(400);
      return openaiError(400, "model 必填", "invalid_request_error", "missing_model");
    }

    const model = await resolveModel(modelName);
    const userId = request.user!.userId;
    const apiKeyId = request.apiKey?.id ?? null;

    // 记录请求到限流窗口
    await recordRequestForLimit(userId, apiKeyId);

    // 路由选择 — 找到该 video model 对应的供应商
    const route = await selectRoute({ modelName: model.name, userId });

    const startTime = Date.now();
    try {
      // 构造 Seedance dance-create 请求体
      const seedanceBody: Record<string, unknown> = {
        model_name: route.upstreamModelName,
        content: body.content ?? {},
        user_id: body.user_id ?? String(userId),
      };

      // 如果前端传了 additional 参数（如 prompt_type、duration 等），一并转发
      for (const key of Object.keys(body as Record<string, unknown>)) {
        if (!["model", "content", "user_id"].includes(key)) {
          seedanceBody[key] = (body as Record<string, unknown>)[key];
        }
      }

      // 调用 dance-create（实际 endpoint 从供应商 baseUrl 推导）
      const createEndpoint = route.apiEndpoint; // 已在 vendor_models 中设为 dance-create
      const result = await fetchSeedanceApi(route.apiKeyPlain, createEndpoint, seedanceBody);
      const durationMs = Date.now() - startTime;

      // 更新健康状态
      await updateHealthAfterCall(route.vendorModelId, result.status < 400, durationMs);

      // 上游错误处理
      if (result.status >= 400 || result.data?.code !== 0) {
        await updateHealthAfterCall(route.vendorModelId, false, durationMs);
        try {
          const { recordVendorModelFailure } = await import("../services/circuit-breaker.js");
          await recordVendorModelFailure(route.vendorModelId, result.data?.message ?? `HTTP ${result.status}`);
        } catch {}

        // 仍然计费（失败调用）
        await charge({
          userId, apiKeyId, modelId: model.id,
          vendorModelId: route.vendorModelId, vendorName: route.vendorName,
          modelName: model.name,
          promptTokens: 0, completionTokens: 0, totalTokens: 0,
          durationMs, isStreaming: false, status: "failed",
          errorMessage: result.data?.message ?? `上游返回 ${result.status}`,
          ip: request.ip, userAgent: request.headers["user-agent"] as string,
        }).catch(() => {});

        reply.status(result.status >= 400 ? result.status : 502);
        return {
          error: {
            message: result.data?.message ?? "视频生成任务创建失败",
            type: "upstream_error",
            code: "video_task_create_failed",
          },
          seedance: result.data,
        };
      }

      // 成功：计费（视频任务每个 1000 虚拟 Token）
      const virtualTokens = 1000;
      await charge({
        userId, apiKeyId, modelId: model.id,
        vendorModelId: route.vendorModelId, vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: virtualTokens,
        completionTokens: 0,
        totalTokens: virtualTokens,
        durationMs, isStreaming: false, status: "success",
        ip: request.ip, userAgent: request.headers["user-agent"] as string,
      }).catch((err) => request.log.error({ err }, "视频计费失败"));

      await recordTokensForLimit(userId, virtualTokens);

      // 记录调度实时指标
      try {
        const { recordSchedulingStats } = await import("../services/scheduling-stats.js");
        recordSchedulingStats(route.vendorName, model.name, virtualTokens, durationMs).catch(() => {});
      } catch {}

      // 返回兼容格式
      return {
        code: 0,
        data: {
          task_id: result.data?.data?.task_id ?? result.data?.data?.id,
          task: result.data?.data?.task ?? result.data?.data,
          vendor: route.vendorName,
          model: model.name,
        },
        message: result.data?.message ?? "ok",
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await updateHealthAfterCall(route.vendorModelId, false, durationMs);
      try {
        const { recordVendorModelFailure } = await import("../services/circuit-breaker.js");
        await recordVendorModelFailure(route.vendorModelId, `网络错误: ${err.message}`);
      } catch {}
      await charge({
        userId, apiKeyId, modelId: model.id,
        vendorModelId: route.vendorModelId, vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        durationMs, isStreaming: false, status: "failed",
        errorMessage: `网络错误: ${err.message}`,
        ip: request.ip, userAgent: request.headers["user-agent"] as string,
      }).catch(() => {});
      reply.status(502);
      return openaiError(502, `上游连接失败: ${err.message}`, "upstream_error", "upstream_unreachable");
    }
  }

  async function handleVideoQuery(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const body = request.body as Record<string, unknown>;
    const modelName = body?.model as string | undefined;
    if (!modelName) {
      reply.status(400);
      return openaiError(400, "model 必填", "invalid_request_error", "missing_model");
    }
    const taskId = (request.params as any).taskId;
    if (!taskId) {
      reply.status(400);
      return openaiError(400, "taskId 必填", "invalid_request_error", "missing_task_id");
    }

    const model = await resolveModel(modelName);
    const userId = request.user!.userId;
    const apiKeyId = request.apiKey?.id ?? null;

    // 路由选择
    const route = await selectRoute({ modelName: model.name, userId });

    const startTime = Date.now();
    try {
      // 从 apiEndpoint 推导 dance-query URL（替换末尾的 dance-create 为 dance-query）
      let queryEndpoint = route.apiEndpoint;
      if (queryEndpoint.endsWith("/dance-create")) {
        queryEndpoint = queryEndpoint.replace(/\/dance-create$/, "/dance-query");
      } else {
        // 降级：在 base URL 后追加
        queryEndpoint = queryEndpoint.replace(/\/+$/, "") + "/dance-query";
      }

      const result = await fetchSeedanceApi(route.apiKeyPlain, queryEndpoint, {
        task_id: taskId,
      });

      const durationMs = Date.now() - startTime;
      await updateHealthAfterCall(route.vendorModelId, result.status < 400, durationMs);

      if (result.status >= 400) {
        await updateHealthAfterCall(route.vendorModelId, false, durationMs);
        reply.status(result.status);
        return {
          error: {
            message: result.data?.message ?? "查询任务失败",
            type: "upstream_error",
            code: "video_task_query_failed",
          },
          seedance: result.data,
        };
      }

      // 查询不计费，直接返回上游结果
      return {
        code: 0,
        data: result.data?.data ?? result.data,
        message: result.data?.message ?? "ok",
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await updateHealthAfterCall(route.vendorModelId, false, durationMs);
      reply.status(502);
      return openaiError(502, `查询上游失败: ${err.message}`, "upstream_error", "upstream_unreachable");
    }
  }

  // ── 流式处理核心 ──

  async function handleStreamingChat(
    request: FastifyRequest,
    reply: FastifyReply,
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
    const nodeStream = Readable.fromWeb(streamResult.stream);

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

      // 记录调度实时指标
      const { recordSchedulingStats } = await import("../services/scheduling-stats.js");
      recordSchedulingStats(route.vendorName, model.name, usage.totalTokens, durationMs).catch(() => {});

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
  function handleProxyError(reply: FastifyReply, err: unknown) {
    if (err instanceof AppError) {
      reply.status(err.statusCode);
      return openaiError(err.statusCode, err.message, "invalid_request_error", err.code);
    }
    if ((err as any)?.name === "ZodError") {
      reply.status(400);
      return openaiError(400, (err as any).errors?.[0]?.message || "请求参数校验失败", "invalid_request_error", "invalid_params");
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
