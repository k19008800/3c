import { pgTable, serial, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { models } from "./models";

/**
 * 模型级限流配置
 * 对齐 ref-5.3-rate-limiter.md（L4 模型级限流）
 * L1-L3（全局/用户/Key）限流参数存 site_configs 或运行时 Redis
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    id: serial("id").primaryKey(),
    modelId: integer("model_id").notNull().references(() => models.id),
    // 模型全局 QPS
    modelQps: integer("model_qps").default(2000),
    // 模型用户级 QPS（每用户对该模型）
    modelUserQps: integer("model_user_qps").default(50),
    // 并发请求数
    modelConcurrency: integer("model_concurrency").default(10),
    // Token 上限
    maxPromptTokens: integer("max_prompt_tokens"),
    maxCompletionTokens: integer("max_completion_tokens"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("rate_limits_model_id_idx").on(table.modelId)],
);

export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;
