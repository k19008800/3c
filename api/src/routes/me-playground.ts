import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { models } from "../db/schema/models";
import { apiKeys } from "../db/schema/api-keys";
import { authenticateApiKey } from "../services/api-auth";
import { runPipeline, IdempotencyHitError, type GatewayContext } from "../services/pipeline";
import {
  createAuthStep,
  createPreConsumeStep,
  createRateLimitStep,
  createPricingStep,
  createRoutingStep,
  createProxyStep,
  createSettleStep,
} from "../services/pipeline";

/**
 * Playground / API 调试端点
 * 用户端使用自身 API Key 调试调用，走用户配额，非流式返回
 */

function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

export function mePlaygroundRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);

  app.post("/me/playground/chat", { onRequest: [auth] }, async (req: any, reply: any) => {
    const body = req.body as {
      model: string;
      messages?: [];
      max_tokens?: number;
      temperature?: number;
    };

    if (!body.model) {
      return reply.status(400).send({ code: 400, error: "BAD_PARAMS", message: "缺少 model" });
    }

    // 模型解析
    const modelRow = await db.select().from(models).where(eq(models.name, body.model)).limit(1);
    const model = modelRow[0];
    if (!model) {
      return reply.status(404).send({ error: { code: "MODEL_NOT_FOUND", message: `模型 ${body.model} 不存在` } });
    }

    // 初始化 Pipeline 上下文（用户身份来自 JWT，而不是 API Key）
    const ctx: GatewayContext = {
      req,
      reply,
      body: { ...body, stream: false },
      modelId: model.id,
      modelName: body.model,
    };

    // 注入 JWT 用户身份到 context
    (ctx as any).jwtUserId = Number(req.user.sub);
    (ctx as any).jwtUserBalance = Number(req.user.balance ?? 0);

    let result;
    try {
      result = await runPipeline(ctx, [
        createPlaygroundAuthStep(),
        createPreConsumeStep(),
        createRateLimitStep(),
        createPricingStep(),
        createRoutingStep(),
        createProxyStep(),
        createSettleStep(),
      ]);
    } catch (err) {
      if (err instanceof IdempotencyHitError && ctx.upstreamData) {
        return reply.send(ctx.upstreamData);
      }
      return reply.status(500).send({
        error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "内部错误" },
      });
    }

    if (!result.ok) {
      return reply.status(502).send({
        error: { code: "UPSTREAM_ERROR", message: result.error?.message ?? "上游调用失败" },
      });
    }

    const meta = {
      provider: ctx.vendorName,
      actualCost: ctx.actualCost,
      estimatedCost: ctx.estimatedCost,
      price: { input: ctx.inputPrice, output: ctx.outputPrice },
      usage: ctx.upstreamResponse?.usage,
    };
    return reply.send({ ...(ctx.upstreamData ?? {}), _meta: meta });
  });
}

/**
 * Playground 专用鉴权步骤 — 使用 JWT 用户身份
 */
function createPlaygroundAuthStep() {
  return {
    name: "auth",
    execute: async (ctx: any) => {
      const userId = ctx.jwtUserId;
      const userBalance = ctx.jwtUserBalance;
      if (!userId) throw Object.assign(new Error("JWT 用户身份无效"), { _httpStatus: 401, _code: "UNAUTHORIZED" });

      // 查找用户的有效 API Key（取第一个 active key）
      const key = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.userId, userId))
        .limit(1);

      if (!key[0]) {
        throw Object.assign(new Error("请先创建 API Key"), { _httpStatus: 400, _code: "NO_API_KEY" });
      }

      ctx.userId = userId;
      ctx.apiKeyId = key[0].id;
      ctx.balanceBefore = userBalance;
    },
  };
}
