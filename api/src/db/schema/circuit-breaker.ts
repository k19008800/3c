import { pgTable, serial, integer, boolean, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { vendorModels } from "./vendor-models";

/**
 * 熔断器配置持久化表
 * 对齐 ref-5.1-routing.md §1.1
 */
export const circuitBreakerConfigs = pgTable(
  "circuit_breaker_configs",
  {
    id: serial("id").primaryKey(),
    vendorModelId: integer("vendor_model_id")
      .notNull()
      .references(() => vendorModels.id, { onDelete: "cascade" }),
    // 熔断配置
    failureThreshold: integer("failure_threshold").notNull().default(5), // 连续失败触发半开
    circuitTimeoutSec: integer("circuit_timeout_sec").notNull().default(30), // 全开→半开等待
    probeCount: integer("probe_count").notNull().default(3), // 半开探针成功→恢复
    probeIntervalSec: integer("probe_interval_sec").notNull().default(10),
    // 检活配置
    healthCheckEnabled: boolean("health_check_enabled").notNull().default(true),
    healthCheckEndpoint: varchar("health_check_endpoint", { length: 500 }),
    healthCheckMethod: varchar("health_check_method", { length: 10 }).default("GET"),
    healthCheckIntervalSec: integer("health_check_interval_sec").default(30),
    healthCheckTimeoutMs: integer("health_check_timeout_ms").default(5000),
    // 生效范围
    scope: varchar("scope", { length: 20 }).notNull().default("vendor_model"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("circuit_config_vendor_model_idx").on(table.vendorModelId)],
);

export type CircuitBreakerConfig = typeof circuitBreakerConfigs.$inferSelect;
