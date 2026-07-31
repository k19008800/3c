import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { models } from "./models";
import { vendors } from "./vendors";
import { users } from "./users";

/**
 * 路由手动覆盖配置表
 * 对齐 ref-5.1-routing.md §1.2
 * 用途：管理员临时强制将某模型路由到某供应商
 */
export const routingOverrides = pgTable(
  "routing_overrides",
  {
    id: serial("id").primaryKey(),
    modelId: integer("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
    vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
    overrideType: varchar("override_type", { length: 20 }).notNull().default("vendor"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    isPermanent: boolean("is_permanent").notNull().default(false),
    reason: text("reason"),
    createdBy: integer("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("routing_override_model_idx").on(table.modelId)],
);

/**
 * 路由推荐结果缓存表
 * 对齐 ref-5.1-routing.md §1.3
 */
export const routingRecommendations = pgTable("routing_recommendations", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => models.id),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  upstreamModelName: varchar("upstream_model_name", { length: 200 }),
  // 评分（0-100）
  costScore: integer("cost_score").notNull(),
  latencyScore: integer("latency_score").notNull(),
  reliabilityScore: integer("reliability_score").notNull(),
  overallScore: integer("overall_score").notNull(),
  // 原始数据
  avgCostPerCall: numeric("avg_cost_per_call", { precision: 12, scale: 6 }),
  avgLatencyMs: numeric("avg_latency_ms", { precision: 10, scale: 2 }),
  successRate: numeric("success_rate", { precision: 5, scale: 2 }),
  totalCalls: integer("total_calls").default(0),
  calcPeriod: varchar("calc_period", { length: 10 }).default("7d"),
  reason: text("reason"),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RoutingOverride = typeof routingOverrides.$inferSelect;
export type RoutingRecommendation = typeof routingRecommendations.$inferSelect;
