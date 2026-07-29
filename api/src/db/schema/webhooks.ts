import { pgTable, serial, varchar, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const globalWebhooks = pgTable("global_webhooks", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  secret: varchar("secret", { length: 100 }).notNull(),
  events: text("events").notNull(),                // 逗号分隔的事件类型
  enabled: boolean("enabled").default(true),
  retryCount: integer("retry_count").default(3),
  consecutiveFailures: integer("consecutive_failures").default(0),
  autoDisableAfter: integer("auto_disable_after").default(10),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  lastStatus: varchar("last_status", { length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
