import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, pool } from "../db/index";
import { authenticateApiKey, extractBearerKey, isModelAllowed } from "../services/api-auth";
import { checkRateLimit, rateLimitError } from "../services/rate-limiter";
import { selectRoute } from "../services/router";
import { recordResult } from "../services/circuit-breaker";
import { getEffectivePrice, calcCost, round4, reserveBalance, refundBalance, recordBilling, recordCallLog } from "../services/billing";
import { recordCommissionForUser } from "../services/commission";
import { publishActivity, pushActivityHistory } from "../services/activity-push";
import { forwardChatCompletion } from "../services/upstream";
import { models } from "../db/schema/models";
import { vendors } from "../db/schema/vendors";
import { vendorApiKeys } from "../db/schema/vendor-api-keys";

/**
 * API 网关 Proxy（§5 核心）
 * OpenAI 兼容端点：POST /v1/chat/completions
 * 全链路：鉴权 → 限流 → 模型解析 → 路由 → 计费预扣 → 转发 → 实扣 → 返回
 */

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
    async (req, reply) => {
      const authorization = req.headers.authorization as string | undefined;
      const body = req.body as { model: string; messages?: []; max_tokens?: number; stream?: boolean };

      // 1. 鉴权
      const secret = extractBearerKey(authorization);
      if (!secret) {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "缺少 Authorization 头" } });
      }
      const auth = await authenticateApiKey(secret);
      if (!auth.ok) {
        const statusMap: Record<string, number> = {
          KEY_INVALID: 401, KEY_DISABLED: 403, KEY_EXPIRED: 403,
          USER_NOT_FOUND: 401, USER_DISABLED: 403, INSUFFICIENT_BALANCE: 402,
        };
        return reply.status(statusMap[auth.code] ?? 401).send({ error: { code: auth.code, message: auth.error } });
      }
      const ctx = auth.ctx;

      // 2. 模型解析
      const modelRow = await db.select().from(models).where(eq(models.name, body.model)).limit(1);
      const model = modelRow[0];
      if (!model) {
        return reply.status(404).send({ error: { code: "MODEL_NOT_FOUND", message: `模型 ${body.model} 不存在` } });
      }
      if (model.status !== "active") {
        return reply.status(404).send({ error: { code: "MODEL_DISABLED", message: "模型不可用" } });
      }
      // 模型白名单
      if (!isModelAllowed(ctx, body.model)) {
        return reply.status(403).send({ error: { code: "MODEL_NOT_ALLOWED", message: "该 API Key 无权使用此模型" } });
      }

      // 3. 限流
      const rl = await checkRateLimit({ userId: ctx.userId, apiKeyId: ctx.apiKeyId, modelId: model.id });
      if (rl.limited) {
        return reply.status(429).send(rateLimitError(rl));
      }

      // 4. 路由选择
      const route = await selectRoute(model.id);
      if (!route) {
        return reply.status(503).send({ error: { code: "ROUTING_ALL_DOWN", message: "无可用供应商" } });
      }

      // 5. 取供应商 + key
      const vendor = (await db.select().from(vendors).where(eq(vendors.id, route.vendorId)).limit(1))[0];
      const vendorKey = (await db.select().from(vendorApiKeys).where(and(eq(vendorApiKeys.vendorId, route.vendorId), eq(vendorApiKeys.isEnabled, true))).limit(1))[0];
      if (!vendor || !vendorKey) {
        return reply.status(503).send({ error: { code: "NO_VENDOR_KEY", message: "供应商未配置 Key" } });
      }

      // 6. 计费预扣
      const price = await getEffectivePrice(model.id, route.vendorModelId);
      // 预估费用：输入 token 未知(流式前)，按 max_tokens 输出预扣
      const estInput = 0;
      const estOutput = (body.max_tokens ?? 100) || 100;
      const estimatedCost = calcCost(estInput, estOutput, price.inputPrice, price.outputPrice);
      const reserved = await reserveBalance(ctx.userId, estimatedCost, "api_call");
      if (!reserved.ok) {
        return reply.status(402).send({ error: { code: reserved.error, message: "余额不足，无法预扣" } });
      }

      // 8. 读取用户当前余额（分）用于计费流水（预扣后的余额作为计费交易起点）
      const balanceRows = await pool.query("SELECT balance FROM users WHERE id=$1", [ctx.userId]);
      const balanceBefore = Number(balanceRows.rows[0]?.balance ?? 0);

      // 9. 真实转发 + 熔断器学习
      const result = await forwardChatCompletion({
        vendor,
        vendorApiKey: vendorKey.encryptedKey,
        upstreamModel: route.upstreamModel,
        body: { ...(body as any), stream: body.stream ?? false },
      });
      await recordResult(route.vendorModelId, result.ok);

      // 10. 计费结算：精算实际费用，多退少补
      let actualCost = 0;
      if (result.usage) {
        actualCost = calcCost(result.usage.inputTokens, result.usage.outputTokens, price.inputPrice, price.outputPrice);
      }
      if (result.ok) {
        // 成功：退还预扣中未使用的部分（精确到 0.0001 元）
        const refund = estimatedCost - actualCost;
        if (refund > 0.0001) {
          await refundBalance(ctx.userId, refund);
        }
      } else {
        // 失败：全额退还预扣
        await refundBalance(ctx.userId, estimatedCost);
      }
      const balanceRowsAfter = await pool.query("SELECT balance FROM users WHERE id=$1", [ctx.userId]);
      const balanceAfter = Number(balanceRowsAfter.rows[0]?.balance ?? 0);

      // 11. 落库：调用日志 + 计费日志（真实可用数据）
      const callLogId = Number(Date.now());
      await recordCallLog({
        id: callLogId,
        userId: ctx.userId,
        apiKeyId: ctx.apiKeyId,
        modelId: model.id,
        vendorId: route.vendorId,
        requestId: req.id as string | undefined,
        provider: vendor.name,
        upstreamModel: route.upstreamModel,
        requestTokens: result.usage?.inputTokens,
        responseTokens: result.usage?.outputTokens,
        cost: String(round4(actualCost)),
        status: result.ok ? "success" : "failed",
        errorCode: result.ok ? undefined : result.error?.code,
        latencyMs: undefined,
        fallbackUsed: result.ok ? false : true,
      });
      await recordBilling({
        userId: ctx.userId,
        callLogId,
        priceSource: price.priceSource,
        inputPrice: price.inputPrice,
        outputPrice: price.outputPrice,
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
        balanceBefore,
        balanceAfter,
      });

      // 11.5 代理佣金：为归属代理按消费记佣金（成功消费才记）
      if (result.ok) {
        let billId = callLogId;
        try {
          const b = await pool.query("SELECT id FROM billing_logs WHERE call_log_id = $1 LIMIT 1", [callLogId]);
          if (b.rows[0]) billId = Number(b.rows[0].id);
        } catch { /* billing id 兼容 */ }
        void recordCommissionForUser(ctx.userId, billId, round4(actualCost));
      }

      // 11.6 实时活动流：计费完成推送事件（成功+失败）
      const activity = {
        model: body.model ?? "unknown",
        status: (result.ok ? "success" : "error") as "success" | "error",
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
        cost: round4(actualCost),
        provider: vendor.name,
        userId: ctx.userId,
      };
      const ev = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now(), ...activity };
      publishActivity(activity);
      pushActivityHistory(ev);

      // 12. 返回
      if (!result.ok) {
        return reply.status(502).send({
          error: { code: result.error?.code, message: result.error?.message ?? "上游调用失败" },
          metadata: { actualCost, estimatedCost, refund: (result.ok ? estimatedCost - actualCost : estimatedCost) },
        });
      }

      // 附加计费元数据（保留上游原始 usage 结构给用户，计费信息放 _meta）
      (result.data as any)._meta = {
        provider: vendor.name,
        actualCost,
        estimatedCost,
        price: { input: price.inputPrice, output: price.outputPrice },
        usage: result.usage,
      };
      return reply.send(result.data);
    },
  );

  // 健康自检端点（网关连通性）
  app.get(
    "/v1/models",
    {
      schema: { tags: ["proxy"] },
    },
    async () => {
      const allModels = await db.select({ id: models.id, name: models.name, displayName: models.displayName }).from(models).where(eq(models.status, "active"));
      return { object: "list", data: allModels.map((m) => ({ id: m.name, object: "model", owned_by: "3cloud", displayName: m.displayName })) };
    },
  );
}
