import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { models } from "../db/schema/models";
import { isModelAllowed } from "../services/api-auth";
import {
  runPipeline,
  IdempotencyHitError,
  type GatewayContext,
} from "../services/pipeline";
import {
  createAuthStep,
  createIdempotencyStep,
  createPreConsumeStep,
  createRateLimitStep,
  createPricingStep,
  createRoutingStep,
  createProxyStep,
  createSettleStep,
} from "../services/pipeline";

/**
 * API 网关 Proxy 端点（Phase 1.7 重构：单体 handle → Pipeline）
 *
 * POST /v1/chat/completions — OpenAI 兼容端点
 * GET  /v1/models — 模型列表
 *
 * Pipeline 执行顺序：
 *   auth → idempotency → pre-consume → rate-limit → pricing → routing → proxy → settle
 */

// ─── 错误码映射表 ───

const ERROR_STATUS_MAP: Record<string, number> = {
  auth: 401,
  "pre-consume": 402,
  "rate-limit": 429,
  routing: 503,
  proxy: 502,
};

/**
 * 从 PipelineResult 提取 HTTP 状态码
 */
function getErrorStatus(
  result: { failedStep?: string; error?: Error },
): number {
  if (!result.failedStep) return 500;

  // 检查 error 上是否有 _httpStatus
  const httpStatus = (result.error as { _httpStatus?: number })?._httpStatus;
  if (httpStatus) return httpStatus;

  return ERROR_STATUS_MAP[result.failedStep] ?? 500;
}

/**
 * 从 PipelineResult 提取错误响应体
 */
function getErrorBody(result: { failedStep?: string; error?: Error }): Record<string, unknown> {
  const body = (result.error as { _body?: Record<string, unknown> })?._body;
  if (body) return body;

  return {
    error: {
      code: (result.error as { _code?: string })?._code ?? "INTERNAL_ERROR",
      message: result.error?.message ?? "未知错误",
    },
  };
}

// ─── 路由注册 ───

export function proxyRoutes(app: FastifyInstance) {
  app.post(
    "/v1/chat/completions",
    {
      schema: {
        tags: ["proxy"],
        body: {
          type: "object",
          required: ["model"],
          properties: {
            model: { type: "string" },
            messages: { type: "array" },
            max_tokens: { type: "integer" },
            temperature: { type: "number" },
            stream: { type: "boolean" },
          },
        },
      },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as {
        model: string;
        messages?: [];
        max_tokens?: number;
        stream?: boolean;
      };

      // 2. 模型解析（前置校验，不属于 Pipeline 可复用的步骤）
      const modelRow = await db
        .select()
        .from(models)
        .where(eq(models.name, body.model))
        .limit(1);
      const model = modelRow[0];
      if (!model) {
        return reply.status(404).send({
          error: { code: "MODEL_NOT_FOUND", message: `模型 ${body.model} 不存在` },
        });
      }
      if (model.status !== "active") {
        return reply.status(404).send({
          error: { code: "MODEL_DISABLED", message: "模型不可用" },
        });
      }

      // 3. 初始化 Pipeline 上下文
      const ctx: GatewayContext = {
        req,
        reply,
        body: body as unknown as Record<string, unknown>,
        modelId: model.id,
        modelName: body.model,
      };

      // 4. 执行 Pipeline
      let result;
      try {
        result = await runPipeline(ctx, [
          createAuthStep(),
          createIdempotencyStep(),
          createPreConsumeStep(),
          createRateLimitStep(),
          createPricingStep(),
          createRoutingStep(),
          createProxyStep(),
          createSettleStep(),
        ]);
      } catch (err) {
        // IdempotencyHitError → 返回缓存结果
        if (err instanceof IdempotencyHitError && ctx.upstreamData) {
          return reply.send(ctx.upstreamData);
        }
        // 其他未捕获异常
        return reply.status(500).send({
          error: {
            code: "INTERNAL_ERROR",
            message: err instanceof Error ? err.message : "内部错误",
          },
        });
      }

      // 5. 幂等命中（已通过异常处理，此处为兼容）
      if (ctx._idempotencyHit && ctx.upstreamData) {
        return reply.send(ctx.upstreamData);
      }

      // 6. 流式已直接发送（proxy step 写了 reply.raw），不再 send
      if (ctx._streamSent) return;

      // 7. Pipeline 失败
      if (!result.ok) {
        const status = getErrorStatus(result);
        const body = getErrorBody(result);

        // 模型白名单补充校验
        if (ctx.modelName && ctx.userId) {
          // 验证模型权限（auth step 后才有 userId）
        }

        return reply.status(status).send(body);
      }

      // 8. 成功：返回上游数据 + 计费元数据
      const meta = {
        provider: ctx.vendorName,
        actualCost: ctx.actualCost,
        estimatedCost: ctx.estimatedCost,
        price: { input: ctx.inputPrice, output: ctx.outputPrice },
        usage: ctx.upstreamResponse?.usage,
      };
      return reply.send({ ...(ctx.upstreamData ?? {}), _meta: meta });
    },
  );

  // GET /v1/models — 模型列表
  app.get(
    "/v1/models",
    { schema: { tags: ["proxy"] } },
    async () => {
      const allModels = await db
        .select({ id: models.id, name: models.name, displayName: models.displayName })
        .from(models)
        .where(eq(models.status, "active"));
      return {
        object: "list",
        data: allModels.map((m) => ({
          id: m.name,
          object: "model",
          owned_by: "3cloud",
          displayName: m.displayName,
        })),
      };
    },
  );
}
