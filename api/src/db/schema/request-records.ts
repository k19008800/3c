// ============================================================
//  3cloud (3C) — 请求记录（风险分析）
//  记录每次 API 调用的请求/响应内容，用于风险审计与分析
//  按月分区（PARTITION BY RANGE created_at）
// ============================================================

import {
  pgTable,
  bigserial,
  bigint,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  smallint,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./users.js";
import { apiKeys } from "./api-keys.js";
import { models } from "./vendors.js";

export const requestRecords = pgTable(
  "request_records",
  {
    id: bigserial("id", { mode: "bigint" }).notNull(),
    callLogId: bigint("call_log_id", { mode: "bigint" }).notNull(),
    userId: integer("user_id").notNull().references(() => users.id),
    apiKeyId: integer("api_key_id").references(() => apiKeys.id),
    modelId: integer("model_id").references(() => models.id),
    modelName: varchar("model_name", { length: 100 }),
    vendorName: varchar("vendor_name", { length: 100 }),
    requestBody: jsonb("request_body").notNull(),
    requestHeaders: jsonb("request_headers"),
    requestBodySize: integer("request_body_size").default(0).notNull(),
    responseBody: jsonb("response_body"),
    responseBodySize: integer("response_body_size").default(0),
    responseStatus: smallint("response_status"),
    isStreaming: boolean("is_streaming").default(false).notNull(),
    streamContent: text("stream_content"),
    riskLevel: varchar("risk_level", { length: 20 }).default("normal").notNull(),
    riskTags: text("risk_tags").array(),
    riskReason: text("risk_reason"),
    reviewed: boolean("reviewed").default(false).notNull(),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // 复合 PK（分区列必须在 PK 中）
    pk: primaryKey({ columns: [table.id, table.createdAt] }),

    // 索引
    userCreatedIdx: index("req_user_created_idx").on(table.userId, table.createdAt.desc()),
    callLogIdx: index("req_call_log_idx").on(table.callLogId),
    riskLevelIdx: index("req_risk_level_idx").on(table.riskLevel).where(sql`${table.riskLevel} != 'normal'`),
    riskTagsIdx: index("req_risk_tags_idx").using("gin", table.riskTags),
    createdAtIdx: index("req_created_at_idx").on(table.createdAt.desc()),
  })
);