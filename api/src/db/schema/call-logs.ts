import {
  pgTable,
  bigint,
  integer,
  numeric,
  varchar,
  timestamp,
  text,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * 调用日志表（分区父表）
 * 对齐 supplement/07 §2.4 + ref-5.1-routing.md
 * ⚠️ 分区：POSTGRESQL 原生声明式分区 PARTITION BY RANGE (created_at)
 *    分区列必须包含在唯一约束中 → 用复合主键 (id, created_at)
 *    子表按月创建，由 db/partition.ts 维护脚本自动建/删旧分区
 *    （BOSS 原拍板 pg_partman，但本地 PG17 未安装该扩展，改用原生分区+自管理脚本，功能等同）
 */
export const callLogs = pgTable(
  "call_logs",
  {
    id: bigint("id", { mode: "number" }),
    userId: integer("user_id").notNull(),
    apiKeyId: integer("api_key_id"),
    modelId: integer("model_id"),
    vendorId: integer("vendor_id"),
    // 请求信息
    requestId: varchar("request_id", { length: 64 }),
    provider: varchar("provider", { length: 100 }),
    upstreamModel: varchar("upstream_model", { length: 200 }),
    // Token 用量
    requestTokens: integer("request_tokens").default(0),
    responseTokens: integer("response_tokens").default(0),
    totalTokens: integer("total_tokens").default(0),
    // 计费（元，保留 4 位小数，对齐 DeepSeek 计费精度 0.0001 元）
    cost: numeric("cost", { precision: 18, scale: 4 }).default("0"),
    // 状态
    status: varchar("status", { length: 20 }).notNull().default("success"),
    errorCode: varchar("error_code", { length: 50 }),
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms"),
    fallbackUsed: varchar("fallback_used", { length: 10 }).default("false"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.id, table.createdAt] })],
);

export type CallLog = typeof callLogs.$inferSelect;
export type NewCallLog = typeof callLogs.$inferInsert;
