import { pgTable, serial, varchar, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 服务条款版本表（§33.2）
 * 对齐 SPEC-§33-合规法务与成本分析.md
 * 与 privacy_policy_versions 结构一致，内容独立存储
 */
export const termsOfServiceVersions = pgTable(
  "terms_of_service_versions",
  {
    id: serial("id").primaryKey(),
    version: varchar("version", { length: 20 }).notNull(),
    title: varchar("title", { length: 200 }),
    content: text("content").notNull(),
    summary: text("summary"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_tosv_status").on(table.status)],
);

export type TermsOfServiceVersion = typeof termsOfServiceVersions.$inferSelect;
export type NewTermsOfServiceVersion = typeof termsOfServiceVersions.$inferInsert;

/** 用户服务条款同意记录（§33.2） */
export const userTosConsents = pgTable(
  "user_tos_consents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    versionId: integer("version_id")
      .notNull()
      .references(() => termsOfServiceVersions.id),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
    ip: varchar("ip", { length: 45 }),
  },
  (table) => [index("idx_utc_user").on(table.userId), index("idx_utc_version").on(table.versionId)],
);

export type UserTosConsent = typeof userTosConsents.$inferSelect;
export type NewUserTosConsent = typeof userTosConsents.$inferInsert;
