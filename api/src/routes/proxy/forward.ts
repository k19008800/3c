import { Readable } from "node:stream";

import { eq, and, asc, sql } from "drizzle-orm";

import type { FastifyRequest, FastifyReply } from "fastify";

import { getDb } from "../../db/index.js";

import { models, callLogs, vendorModels, vendors } from "../../db/schema.js";

import {

  selectRoute,

  forwardRequest,

  forwardStreamRequest,

} from "../../services/router.js";

import type { VendorModelRoute } from "../../services/router.js";

import { AppError } from "../../services/auth-service/index.js";

import { getActiveUserQuota } from "../../services/quota-service.js";

import { charge } from "../../services/billing/index.js";

import { updateHealthAfterCall } from "../../services/health-check.js";

import { enrichCallGeo } from "../../services/geo-check.js";

import { decryptApiKey } from "../../services/encryption.js";

import {

  chatCompletionSchema,

  embeddingsSchema,

  type ChatCompletionInput,

  type EmbeddingsInput,

} from "../../schemas.js";

import {

  getUserLimitInfo,

  recordRequestForLimit,

  recordTokensForLimit,

} from "./auth.js";

import { handleProxyError } from "./logging.js";

import { openaiError } from "./types.js";



// ── 模型名称解析 ──

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



// ── 注入路由级别的类型标识──

type FastifyHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;



/**

 * 注册所有代理路由 */

export function registerForwardRoutes(app: any) {

  for (const prefix of ["/v1", "/api/v1"]) {

    // POST <prefix>/chat/completions

    app.post(prefix + "/chat/completions", (async (request: FastifyRequest, reply: FastifyReply) => {

      try {

        const body: ChatCompletionInput = chatCompletionSchema.parse(request.body);

        const modelName = body.model;



        enrichCallGeo(request.ip, request.user!.userId).catch(() => {});



        if (body.stream) {

          return await handleStreamingChat(request, reply, modelName);

        }

        return await handleNonStreaming(request, reply, body, modelName);

      } catch (err: any) {

        return handleProxyError(reply, err);

      }

    }) as FastifyHandler);



    // POST <prefix>/embeddings

    app.post(prefix + "/embeddings", (async (request: FastifyRequest, reply: FastifyReply) => {

      try {

        const body: EmbeddingsInput = embeddingsSchema.parse(request.body);

        enrichCallGeo(request.ip, request.user!.userId).catch(() => {});

        return await handleNonStreaming(request, reply, body, body.model);

      } catch (err: any) {

        return handleProxyError(reply, err);

      }

    }) as FastifyHandler);



    // POST <prefix>/rerank

    app.post(prefix + "/rerank", (async (request: FastifyRequest, reply: FastifyReply) => {

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

    }) as FastifyHandler);



    // POST <prefix>/images/generations

    app.post(prefix + "/images/generations", (async (request: FastifyRequest, reply: FastifyReply) => {

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

    }) as FastifyHandler);



    // POST <prefix>/audio/speech

    app.post(prefix + "/audio/speech", (async (request: FastifyRequest, reply: FastifyReply) => {

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

    }) as FastifyHandler);



    // POST <prefix>/audio/transcriptions

    app.post(prefix + "/audio/transcriptions", (async (request: FastifyRequest, reply: FastifyReply) => {

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

    }) as FastifyHandler);



    // POST <prefix>/video/generations

    app.post(prefix + "/video/generations", (async (request: FastifyRequest, reply: FastifyReply) => {

      try {

        return await handleVideoGeneration(request, reply);

      } catch (err: any) {

        return handleProxyError(reply, err);

      }

    }) as FastifyHandler);



    // POST <prefix>/video/generations/:taskId/query

    app.post(prefix + "/video/generations/:taskId/query", (async (request: FastifyRequest, reply: FastifyReply) => {

      try {

        return await handleVideoQuery(request, reply);

      } catch (err: any) {

        return handleProxyError(reply, err);

      }

    }) as FastifyHandler);

  }

}



// ──────────────────────────────────────────────

//  核心处理函数

// ──────────────────────────────────────────────



// ── Fallback: 主厂商5xx 时尝试次优厂商──

async function tryFallback(

  model: { id: number; name: string },

  request: FastifyRequest,

  failedRoute: VendorModelRoute,

  userId: number,

  apiKeyId: number | null,

  originalStartTime: number,

): Promise<unknown> {

  try {

    const db = getDb();



    const rows = await db

      .select({

        vendorModelId: vendorModels.id,

        vendorId: vendorModels.vendorId,

        vendorName: vendors.name,

        modelId: vendorModels.modelId,

        upstreamModelName: vendorModels.upstreamModelName,

        apiEndpoint: vendorModels.apiEndpoint,

        apiKeyEncrypted: vendorModels.apiKeyEncrypted,

        keyGroupId: vendorModels.keyGroupId,

        sellPriceInput: vendorModels.sellPriceInput,

        sellPriceOutput: vendorModels.sellPriceOutput,

        weight: vendorModels.weight,

        rpmLimit: vendorModels.rpmLimit,

        tpmLimit: vendorModels.tpmLimit,

        healthScore: vendorModels.healthScore,

        isDown: vendorModels.isDown,

      })

      .from(vendorModels)

      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))

      .where(

        and(

          eq(vendorModels.modelId, model.id),

          eq(vendorModels.status, true),

          eq(vendors.status, "active"),

          sql`${vendorModels.id} != ${failedRoute.vendorModelId}`,

        ),

      )

      .orderBy(asc(vendorModels.sellPriceInput))

      .limit(1);



    if (rows.length === 0) return null;

    const r = rows[0];



    const fallbackRoute: VendorModelRoute = {

      vendorModelId: r.vendorModelId,

      vendorId: r.vendorId,

      vendorName: r.vendorName,

      modelId: r.modelId,

      upstreamModelName: r.upstreamModelName,

      apiEndpoint: r.apiEndpoint,

      apiKeyPlain: decryptApiKey(r.apiKeyEncrypted),

      keyGroupId: r.keyGroupId,

      keyGroupItemId: null,

      keySellPriceInput: null,

      keySellPriceOutput: null,

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

      route: fallbackRoute,
      }).catch(() => {});

      await recordTokensForLimit(userId, fallbackResult.usage.totalTokens);



      const { recordSchedulingStats } = await import("../../services/scheduling-stats.js");

      recordSchedulingStats(fallbackRoute.vendorName, model.name, fallbackResult.usage.totalTokens, durationMs).catch(() => {});

    }



    return fallbackResult.body;

  } catch (err) {

    console.warn("[Fallback] fallback 失败:", err);

    return null;

  }

}



// ── 通用非流式转发+ 计费 ──

async function handleNonStreaming(

  request: FastifyRequest,

  reply: FastifyReply,

  body: Record<string, unknown>,

  modelName: string,

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

      const { recordVendorModelFailure } = await import("../../services/circuit-breaker.js");

      await recordVendorModelFailure(route.vendorModelId, `网络错误: ${err.message}`);

    } catch {}



    await charge({

      userId, apiKeyId, modelId: model.id,

      vendorModelId: route.vendorModelId, vendorName: route.vendorName,

      modelName: model.name,

      promptTokens: 0, completionTokens: 0, totalTokens: 0,

      durationMs, isStreaming: false,

      status: "failed",

      errorMessage: `网络错误: ${err.message}`,

      ip: request.ip, userAgent: request.headers["user-agent"] as string,

    route: route,
    }).catch((e) => request.log.error({ err: e }, "计费记录失败"));



    reply.status(502);

    return openaiError(502, `上游厂商连接失败: ${err.message}`, "upstream_error", "upstream_unreachable");

  }

  const durationMs = Date.now() - startTime;



  await updateHealthAfterCall(route.vendorModelId, result.status >= 200 && result.status < 500, durationMs);



  if (result.status >= 400) {

    try {

      const { recordVendorModelFailure } = await import("../../services/circuit-breaker.js");

      await recordVendorModelFailure(route.vendorModelId, result.body?.error?.message ?? `HTTP ${result.status}`);

    } catch {}



    if (result.status >= 500) {

      const fallbackResult = await tryFallback(model, request, route, userId, apiKeyId, startTime);

      if (fallbackResult) return fallbackResult;

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

    route: route,
    }).catch((err) => request.log.error({ err }, "计费记录失败"));



    reply.status(result.status);

    return openaiError(result.status, result.body?.error?.message ?? "上游厂商错误", result.body?.error?.type ?? "upstream_error", result.body?.error?.code ?? String(result.status));

  }



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

    route: route,
    }).catch((err) => request.log.error({ err }, "计费记录失败"));



    await recordTokensForLimit(userId, result.usage.totalTokens);



    const { recordSchedulingStats } = await import("../../services/scheduling-stats.js");

    recordSchedulingStats(route.vendorName, model.name, result.usage.totalTokens, durationMs).catch(() => {});

  }



  return result.body;

}



// ── ─Token 计费模型（图片、音频、Rerank）──

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

      const { recordVendorModelFailure } = await import("../../services/circuit-breaker.js");

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

    route: route,
    }).catch(() => {});

    reply.status(502);

    return openaiError(502, `上游厂商连接失败: ${err.message}`, "upstream_error", "upstream_unreachable");

  }

  const durationMs = Date.now() - startTime;



  await updateHealthAfterCall(route.vendorModelId, result.status >= 200 && result.status < 500, durationMs);



  if (result.status >= 400) {

    try {

      const { recordVendorModelFailure } = await import("../../services/circuit-breaker.js");

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

    route: route,
    }).catch(() => {});

    reply.status(result.status);

    return openaiError(result.status, result.body?.error?.message ?? "上游厂商错误", result.body?.error?.type ?? "upstream_error", result.body?.error?.code ?? String(result.status));

  }



  let virtualTokens = 0;

  if (billingUnit === "image") {

    const n = Number(body?.n ?? 1);

    virtualTokens = n * 1000;

  } else if (billingUnit === "audio") {

    virtualTokens = Math.max(500, Math.round(durationMs / 10));

  } else if (billingUnit === "rerank") {

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

  route: route,
  }).catch((err) => request.log.error({ err }, "计费记录失败"));



  await recordTokensForLimit(userId, virtualTokens);



  return result.body;

}



// ── 流式处理核心（Chat Completions SSE）──

async function handleStreamingChat(

  request: FastifyRequest,

  reply: FastifyReply,

  modelName: string,

) {

  const model = await resolveModel(modelName);

  const userId = request.user!.userId;

  const apiKeyId = request.apiKey?.id ?? null;



  await recordRequestForLimit(userId, apiKeyId);



  const route = await selectRoute({ modelName: model.name, userId });



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

    route: route,
    }).catch(() => {});

    throw err;

  }



  const durationMs = Date.now() - startTime;



  reply.raw.writeHead(streamResult.status, {

    "Content-Type": "text/event-stream",

    "Cache-Control": "no-cache",

    Connection: "keep-alive",

    "X-Accel-Buffering": "no",

    ...streamResult.headers,

  });



  const nodeStream = Readable.fromWeb(streamResult.stream);



  let disconnected = false;

  request.raw.on("close", () => {

    disconnected = true;

    nodeStream.destroy();

  });



  nodeStream.pipe(reply.raw);



  await new Promise<void>((resolve, reject) => {

    nodeStream.on("end", resolve);

    nodeStream.on("error", (err) => {

      disconnected ? resolve() : reject(err);

    });

  });



  const usage = await streamResult.usagePromise;

  const success = !disconnected;



  await updateHealthAfterCall(route.vendorModelId, success, durationMs).catch(() => {});



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

    route: route,
    }).catch((err) => request.log.error({ err }, "计费记录失败"));



    if (usage?.totalTokens) {

      await recordTokensForLimit(userId, usage.totalTokens).catch(() => {});

    }



    reply.hijacked = true;

    return;

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

    route: route,
    }).catch((err) => request.log.error({ err }, "计费记录失败"));



    const { recordSchedulingStats } = await import("../../services/scheduling-stats.js");

    recordSchedulingStats(route.vendorName, model.name, usage.totalTokens, durationMs).catch(() => {});



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

    route: route,
    }).catch(() => {});

  }



  reply.hijacked = true;

}



// ══════════════════════════════════════════════

//  视频生成代理 (Seedance / 火山引擎)

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



  await recordRequestForLimit(userId, apiKeyId);



  const route = await selectRoute({ modelName: model.name, userId });



  const startTime = Date.now();

  try {

    const seedanceBody: Record<string, unknown> = {

      model_name: route.upstreamModelName,

      content: body.content ?? {},

      user_id: body.user_id ?? String(userId),

    };



    for (const key of Object.keys(body as Record<string, unknown>)) {

      if (!["model", "content", "user_id"].includes(key)) {

        seedanceBody[key] = (body as Record<string, unknown>)[key];

      }

    }



    const result = await fetchSeedanceApi(route.apiKeyPlain, route.apiEndpoint, seedanceBody);

    const durationMs = Date.now() - startTime;



    await updateHealthAfterCall(route.vendorModelId, result.status < 400, durationMs);



    if (result.status >= 400 || result.data?.code !== 0) {

      await updateHealthAfterCall(route.vendorModelId, false, durationMs);

      try {

        const { recordVendorModelFailure } = await import("../../services/circuit-breaker.js");

        await recordVendorModelFailure(route.vendorModelId, result.data?.message ?? `HTTP ${result.status}`);

      } catch {}



      await charge({

        userId, apiKeyId, modelId: model.id,

        vendorModelId: route.vendorModelId, vendorName: route.vendorName,

        modelName: model.name,

        promptTokens: 0, completionTokens: 0, totalTokens: 0,

        durationMs, isStreaming: false, status: "failed",

        errorMessage: result.data?.message ?? `上游返回 ${result.status}`,

        ip: request.ip, userAgent: request.headers["user-agent"] as string,

      route: route,
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

    route: route,
    }).catch((err) => request.log.error({ err }, "计费记录失败"));



    await recordTokensForLimit(userId, virtualTokens);



    try {

      const { recordSchedulingStats } = await import("../../services/scheduling-stats.js");

      recordSchedulingStats(route.vendorName, model.name, virtualTokens, durationMs).catch(() => {});

    } catch {}



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

      const { recordVendorModelFailure } = await import("../../services/circuit-breaker.js");

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

    route: route,
    }).catch(() => {});

    reply.status(502);

    return openaiError(502, `上游厂商连接失败: ${err.message}`, "upstream_error", "upstream_unreachable");

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



  const route = await selectRoute({ modelName: model.name, userId });



  const startTime = Date.now();

  try {

    let queryEndpoint = route.apiEndpoint;

    if (queryEndpoint.endsWith("/dance-create")) {

      queryEndpoint = queryEndpoint.replace(/\/dance-create$/, "/dance-query");

    } else {

      queryEndpoint = queryEndpoint.replace(/\/+$/, "") + "/dance-query";

    }



    const result = await fetchSeedanceApi(route.apiKeyPlain, queryEndpoint, { task_id: taskId });



    const durationMs = Date.now() - startTime;

    await updateHealthAfterCall(route.vendorModelId, result.status < 400, durationMs);



    if (result.status >= 400) {

      await updateHealthAfterCall(route.vendorModelId, false, durationMs);

      reply.status(result.status);

      return {

        error: {

          message: result.data?.message ?? "视频生成任务创建失败",

          type: "upstream_error",

          code: "video_task_query_failed",

        },

        seedance: result.data,

      };

    }



    return {

      code: 0,

      data: result.data?.data ?? result.data,

      message: result.data?.message ?? "ok",

    };

  } catch (err: any) {

    const durationMs = Date.now() - startTime;

    await updateHealthAfterCall(route.vendorModelId, false, durationMs);

    reply.status(502);

    return openaiError(502, `上游厂商连接失败: ${err.message}`, "upstream_error", "upstream_unreachable");

  }

}
