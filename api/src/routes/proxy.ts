// ============================================================
//  3cloud (3C) — Token 代理路由
//  兼容 OpenAI API 格式：
//   POST /api/v1/chat/completions  — 非流式 + 流式 (SSE)
//   POST /api/v1/embeddings        — 非流式
//  鉴权方式：API Key (Bearer)
//  流程：鉴权 → 路由 → 转发 → 计费
// ============================================================

import { FastifyInstance } from "fastify";
import { PassThrough, Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { models } from "../db/schema.js";
import { authenticateApiKey } from "../middleware/auth.js";
import { AppError } from "../services/auth-service.js";
import { selectRoute, forwardRequest, forwardStreamRequest } from "../services/router.js";
import { charge, calculateCost } from "../services/billing.js";
import { updateHealthAfterCall } from "../services/health-check.js";
import {
  chatCompletionSchema,
  embeddingsSchema,
} from "../schemas.js";
import type { ChatCompletionInput, EmbeddingsInput } from "../schemas.js";

export async function proxyRoutes(app: FastifyInstance) {
  // ── 所有代理路由需要 API Key 鉴权 ──
  app.addHook("preHandler", authenticateApiKey);

  // ── 模型名称 → 解析 unified modelId + modelName ──
  async function resolveModel(name: string) {
    const db = getDb();
    const [model] = await db
      .select({ id: models.id, name: models.name })
      .from(models)
      .where(eq(models.name, name))
      .limit(1);

    if (!model) {
      throw new AppError(
        "MODEL_NOT_FOUND",
        `模型 "${name}" 不存在。可用模型请调用 GET /api/v1/models`,
        404,
      );
    }

    return model;
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

    // 路由选择
    const route = await selectRoute({
      modelName: model.name,
      userId,
    });

    // 转发
    const startTime = Date.now();
    const result = await forwardRequest(route, request);
    const durationMs = Date.now() - startTime;

    // 健康检测（被动）
    await updateHealthAfterCall(
      route.vendorModelId,
      result.status >= 200 && result.status < 500,
      durationMs,
    );

    // 如果上游返回错误，不扣费
    if (result.status >= 400) {
      // 记录失败日志但不扣费
      await charge({
        userId,
        apiKeyId,
        modelId: model.id,
        vendorModelId: route.vendorModelId,
        vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationMs,
        isStreaming: false,
        status: "failed",
        errorMessage: result.body?.error?.message ?? `上游返回 ${result.status}`,
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string,
      }).catch((err) => {
        // 计费失败不影响响应返回
        request.log.error({ err }, "计费记录失败");
      });

      // 按 OpenAI 错误格式返回
      reply.status(result.status);
      return {
        error: {
          message: result.body?.error?.message ?? "上游厂商错误",
          type: result.body?.error?.type ?? "upstream_error",
          code: result.body?.error?.code ?? result.status,
        },
      };
    }

    // 扣费
    if (result.usage) {
      await charge({
        userId,
        apiKeyId,
        modelId: model.id,
        vendorModelId: route.vendorModelId,
        vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        durationMs,
        isStreaming: false,
        status: "success",
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string,
      }).catch((err) => {
        request.log.error({ err }, "计费失败");
      });
    }

    // 合并响应中有用的元信息
    if (result.body && typeof result.body === "object") {
      result.body._cost = result.usage
        ? await calculateCost(
            result.usage.promptTokens,
            result.usage.completionTokens,
            route.vendorModelId,
            userId,
          ).catch(() => null)
        : null;
    }

    return result.body;
  }

  // ──────────────────────────────────────────────
  //  POST /api/v1/chat/completions
  // ──────────────────────────────────────────────

  app.post("/api/v1/chat/completions", async (request, reply) => {
    try {
      // 校验请求
      const body = chatCompletionSchema.parse((request as any).body) as ChatCompletionInput;
      const modelName = body.model;

      // 流式请求
      if (body.stream) {
        return await handleStreamingChat(request, reply, modelName);
      }

      // 非流式请求
      return await handleNonStreaming(request, reply, body, modelName);
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode);
        return {
          error: {
            message: err.message,
            type: "invalid_request_error",
            code: err.code,
          },
        };
      }
      if (err?.name === "ZodError") {
        reply.status(400);
        return {
          error: {
            message: err.errors?.[0]?.message || "请求参数校验失败",
            type: "invalid_request_error",
            code: "invalid_params",
          },
        };
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/embeddings
  // ──────────────────────────────────────────────

  app.post("/api/v1/embeddings", async (request, reply) => {
    try {
      const body = embeddingsSchema.parse((request as any).body) as EmbeddingsInput;
      return await handleNonStreaming(request, reply, body, body.model);
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode);
        return {
          error: { message: err.message, type: "invalid_request_error", code: err.code },
        };
      }
      if (err?.name === "ZodError") {
        reply.status(400);
        return {
          error: {
            message: err.errors?.[0]?.message || "请求参数校验失败",
            type: "invalid_request_error",
            code: "invalid_params",
          },
        };
      }
      throw err;
    }
  });

  // ── 流式处理核心 ──

  async function handleStreamingChat(
    request: any,
    reply: any,
    modelName: string,
  ) {
    const model = await resolveModel(modelName);
    const userId = request.user!.userId;
    const apiKeyId = request.apiKey?.id ?? null;

    // 路由选择
    const route = await selectRoute({
      modelName: model.name,
      userId,
    });

    // 发起流式转发
    const startTime = Date.now();
    let streamResult;
    try {
      streamResult = await forwardStreamRequest(route, request);
    } catch (err: any) {
      // 转发建立失败
      const durationMs = Date.now() - startTime;
      await updateHealthAfterCall(route.vendorModelId, false, durationMs);
      await charge({
        userId,
        apiKeyId,
        modelId: model.id,
        vendorModelId: route.vendorModelId,
        vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationMs,
        isStreaming: true,
        status: "failed",
        errorMessage: err.message,
        ip: request.ip,
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
      "X-Accel-Buffering": "no", // 禁用 nginx 缓冲
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

    // pipe
    nodeStream.pipe(reply.raw);

    // 等待流结束
    await new Promise<void>((resolve, reject) => {
      nodeStream.on("end", resolve);
      nodeStream.on("error", (err) => {
        if (disconnected) {
          // 客户端断连不算错误
          resolve();
        } else {
          reject(err);
        }
      });
    });

    // ── 流结束后执行计费 ──

    const usage = await streamResult.usagePromise;

    // 健康检测（被动）
    const success = !disconnected;
    await updateHealthAfterCall(route.vendorModelId, success, durationMs).catch(() => {});

    if (usage && success) {
      await charge({
        userId,
        apiKeyId,
        modelId: model.id,
        vendorModelId: route.vendorModelId,
        vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        durationMs,
        isStreaming: true,
        status: "success",
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string,
      }).catch((err) => {
        request.log.error({ err }, "流式计费失败");
      });
    } else if (disconnected) {
      // 断连场景：没有 usage 信息，但仍需记录（可能的回补由后续逻辑处理）
      // 这种场景通常是客户端中途取消了请求，不计费
      await charge({
        userId,
        apiKeyId,
        modelId: model.id,
        vendorModelId: route.vendorModelId,
        vendorName: route.vendorName,
        modelName: model.name,
        promptTokens: usage?.promptTokens ?? 0,
        completionTokens: usage?.completionTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
        durationMs,
        isStreaming: true,
        status: "cancelled",
        errorMessage: "客户端断连",
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string,
      }).catch(() => {});
    }

    // 标记响应已完成（Fastify 的 hook 需要）
    reply.hijacked = true;
  }
}

// ── 扩展 FastifyReply 类型 ──
declare module "fastify" {
  interface FastifyReply {
    hijacked?: boolean;
  }
}
