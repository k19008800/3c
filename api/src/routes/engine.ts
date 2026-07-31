import type { FastifyInstance } from "fastify";
import { selectRoute, scoreCandidate } from "../services/router";
import { getState, manualOpen, manualClose, recordResult } from "../services/circuit-breaker";
import { checkRateLimit, rateLimitError } from "../services/rate-limiter";
import { getEffectivePrice, calcCost } from "../services/billing";

/**
 * 核心引擎演示/管理路由（§5）
 */
export function engineRoutes(app: FastifyInstance) {
  // ===== 路由 =====

  // 模拟路由选择（演示路由引擎如何为模型选供应商）
  app.get(
    "/route/simulate",
    {
      schema: {
        tags: ["engine"],
        querystring: {
          type: "object",
          required: ["modelId"],
          properties: { modelId: { type: "integer" } },
        },
        response: {
          200: {
            type: "object",
            properties: {
              vendorModelId: { type: "integer" },
              upstreamModel: { type: "string" },
              viaOverride: { type: "boolean" },
            },
          },
          503: { type: "object", properties: { error: { type: "string" }, message: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const { modelId } = req.query as { modelId: number };
      const result = await selectRoute(modelId);
      if (!result) {
        return reply.status(503).send({ error: "ROUTING_ALL_DOWN", message: "无可用路由候选（可能全部熔断或未配置）" });
      }
      return result;
    },
  );

  // 模拟一次调用（选路 + 计费预检 + 计费模拟）
  app.post(
    "/simulate-call",
    {
      schema: {
        tags: ["engine"],
        body: {
          type: "object",
          required: ["userId", "modelId", "inputTokens", "outputTokens"],
          properties: {
            userId: { type: "integer" },
            modelId: { type: "integer" },
            inputTokens: { type: "integer" },
            outputTokens: { type: "integer" },
          },
        },
      },
    },
    async (req, reply) => {
      const { userId, modelId, inputTokens, outputTokens } = req.body as {
        userId: number;
        modelId: number;
        inputTokens: number;
        outputTokens: number;
      };

      // 1. 限流检查
      const rl = await checkRateLimit({ userId, modelId });
      if (rl.limited) return reply.status(429).send(rateLimitError(rl));

      // 2. 路由选择
      const route = await selectRoute(modelId);
      if (!route) return reply.status(503).send({ error: "ROUTING_ALL_DOWN", message: "无可用路由" });

      // 3. 计费预检
      const price = await getEffectivePrice(modelId, route.vendorModelId);
      const cost = calcCost(inputTokens, outputTokens, price.inputPrice, price.outputPrice);

      // 4. 模拟调用成功 → 记录路由结果（供熔断器学习）
      await recordResult(route.vendorModelId, true);

      return {
        route,
        price,
        estimatedCost: cost,
        note: "模拟调用（未实际扣费，演示路由+计费链路）",
      };
    },
  );

  // ===== 熔断器 =====

  // 查询熔断器状态
  app.get(
    "/circuit/:vendorModelId",
    {
      schema: {
        tags: ["engine"],
        params: { type: "object", required: ["vendorModelId"], properties: { vendorModelId: { type: "integer" } } },
      },
    },
    async (req) => {
      const { vendorModelId } = req.params as { vendorModelId: number };
      return getState(vendorModelId);
    },
  );

  // 手动触发熔断
  app.post(
    "/circuit/:vendorModelId/open",
    {
      schema: { tags: ["engine"], params: { type: "object", required: ["vendorModelId"], properties: { vendorModelId: { type: "integer" } } } },
    },
    async (req, reply) => {
      const { vendorModelId } = req.params as { vendorModelId: number };
      await manualOpen(vendorModelId);
      return reply.send({ ok: true });
    },
  );

  // 手动恢复
  app.post(
    "/circuit/:vendorModelId/close",
    {
      schema: { tags: ["engine"], params: { type: "object", required: ["vendorModelId"], properties: { vendorModelId: { type: "integer" } } } },
    },
    async (req, reply) => {
      const { vendorModelId } = req.params as { vendorModelId: number };
      await manualClose(vendorModelId);
      return reply.send({ ok: true });
    },
  );

  // ===== 路由推荐评分（演示）=====

  app.post(
    "/score",
    {
      schema: {
        tags: ["engine"],
        body: {
          type: "object",
          required: ["avgCostPerCall", "avgLatencyMs", "successRate"],
          properties: {
            avgCostPerCall: { type: "number" },
            avgLatencyMs: { type: "number" },
            successRate: { type: "number" },
          },
        },
      },
    },
    async (req) => {
      const { avgCostPerCall, avgLatencyMs, successRate } = req.body as {
        avgCostPerCall: number;
        avgLatencyMs: number;
        successRate: number;
      };
      return scoreCandidate({ avgCostPerCall, avgLatencyMs, successRate });
    },
  );
}
