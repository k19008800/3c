import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { rateLimits } from "../db/schema/rate-limits";
import { redis } from "../lib/redis";

/**
 * 限流管理路由（§5.3 管理端）
 * 覆盖 ref-5.3-rate-limiter.md §2.2：
 * - 模型限流规则列表/详情/更新
 * - 全局限流配置（site_configs，简化用 Redis 存储运行时值）
 * - 当前限流命中统计（可视化看板数据）
 */

const GLOBAL_LIMIT_KEY = "rate_limit:global";

interface GlobalRateLimit {
  globalQps: number;
  globalTpm: number;
  defaultUserQps: number;
  defaultUserTpm: number;
  defaultKeyQps: number;
  defaultKeyTpm: number;
  algorithm: "sliding_window" | "token_bucket";
}

const DEFAULT_GLOBAL_LIMIT: GlobalRateLimit = {
  globalQps: 10000,
  globalTpm: 60000000,
  defaultUserQps: 100,
  defaultUserTpm: 600000,
  defaultKeyQps: 50,
  defaultKeyTpm: 300000,
  algorithm: "sliding_window",
};

export function rateLimitAdminRoutes(app: FastifyInstance) {
  // 模型限流规则列表
  app.get(
    "/admin/rate-limits",
    { schema: { tags: ["admin-rate-limit"] } },
    async () => {
      const rules = await db.select().from(rateLimits);
      return { list: rules };
    },
  );

  // 指定模型限流规则
  app.get(
    "/admin/rate-limits/:modelId",
    {
      schema: { tags: ["admin-rate-limit"], params: { type: "object", required: ["modelId"], properties: { modelId: { type: "integer" } } } },
    },
    async (req, reply) => {
      const { modelId } = req.params as { modelId: number };
      const rule = await db.select().from(rateLimits).where(eq(rateLimits.modelId, modelId)).limit(1);
      if (!rule[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "该模型未配置限流规则" });
      return rule[0];
    },
  );

  // 更新模型限流规则（不存在则创建）
  app.put(
    "/admin/rate-limits/:modelId",
    {
      schema: {
        tags: ["admin-rate-limit"],
        params: { type: "object", required: ["modelId"], properties: { modelId: { type: "integer" } } },
        body: {
          type: "object",
          properties: {
            modelQps: { type: "integer" },
            modelUserQps: { type: "integer" },
            modelConcurrency: { type: "integer" },
            maxPromptTokens: { type: "integer" },
            maxCompletionTokens: { type: "integer" },
            enabled: { type: "boolean" },
          },
        },
      },
    },
    async (req) => {
      const { modelId } = req.params as { modelId: number };
      const body = req.body as Partial<typeof rateLimits.$inferSelect>;

      const existing = await db.select().from(rateLimits).where(eq(rateLimits.modelId, modelId)).limit(1);
      if (!existing[0]) {
        // 创建
        const created = await db
          .insert(rateLimits)
          .values({ modelId, modelQps: body.modelQps ?? 2000, modelUserQps: body.modelUserQps ?? 50, enabled: body.enabled ?? true })
          .returning();
        return created[0];
      }
      // 更新
      const updated = await db.update(rateLimits).set(body).where(eq(rateLimits.modelId, modelId)).returning();
      return updated[0];
    },
  );

  // 获取全局限流配置
  app.get(
    "/admin/site-configs/rate-limit",
    { schema: { tags: ["admin-rate-limit"] } },
    async () => {
      const val = await redis.get(GLOBAL_LIMIT_KEY);
      return val ? (JSON.parse(val) as GlobalRateLimit) : DEFAULT_GLOBAL_LIMIT;
    },
  );

  // 更新全局限流配置
  app.put(
    "/admin/site-configs/rate-limit",
    {
      schema: {
        tags: ["admin-rate-limit"],
        body: {
          type: "object",
          properties: {
            globalQps: { type: "integer" },
            globalTpm: { type: "integer" },
            defaultUserQps: { type: "integer" },
            defaultUserTpm: { type: "integer" },
            defaultKeyQps: { type: "integer" },
            defaultKeyTpm: { type: "integer" },
            algorithm: { type: "string", enum: ["sliding_window", "token_bucket"] },
          },
        },
      },
    },
    async (req) => {
      const body = req.body as Partial<GlobalRateLimit>;
      const current = await (async () => {
        const val = await redis.get(GLOBAL_LIMIT_KEY);
        return val ? (JSON.parse(val) as GlobalRateLimit) : DEFAULT_GLOBAL_LIMIT;
      })();
      const merged: GlobalRateLimit = { ...current, ...body };
      await redis.set(GLOBAL_LIMIT_KEY, JSON.stringify(merged));
      return merged;
    },
  );

  // 限流命中统计（可视化：各维度当前命中情况，模拟/实时取 Redis）
  app.get(
    "/admin/rate-limits/stats",
    {
      schema: { tags: ["admin-rate-limit"], querystring: { type: "object", properties: { range: { type: "string", enum: ["1h", "24h"] } } } },
    },
    async () => {
      // 从 Redis 统计各限流维度 key 数量和近似命中（生产可增强为精确计数）
      const keys = await redis.keys("rl:*");
      const counts: Record<string, number> = {};
      for (const k of keys) {
        const parts = k.split(":");
        const dim = parts[1] ?? "unknown";
        counts[dim] = (counts[dim] ?? 0) + 1;
      }
      return { dimensions: counts, totalKeys: keys.length };
    },
  );
}
