import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";

/**
 * site_configs — 站点配置 key-value 表
 * 用于 ICP/版权/维护模式等公开配置，以及各类系统参数
 * 现有表结构：key(varchar PK), value(text), updated_at(timestamp)
 */
export const siteConfigs = pgTable("site_configs", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow(),
});
