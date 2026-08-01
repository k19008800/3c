import { pgTable, serial, varchar, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 隐私政策版本表（§33.1）
 * 对齐 SPEC-§33-合规法务与成本分析.md
 * status: draft(草稿) / published(已发布) / revoked(已回滚撤销)
 */
export const privacyPolicyVersions = pgTable(
  "privacy_policy_versions",
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
  (table) => [index("idx_ppv_status").on(table.status)],
);

export type PrivacyPolicyVersion = typeof privacyPolicyVersions.$inferSelect;
export type NewPrivacyPolicyVersion = typeof privacyPolicyVersions.$inferInsert;

/** 用户隐私政策同意记录（§33.1） */
export const userPrivacyConsents = pgTable(
  "user_privacy_consents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    versionId: integer("version_id")
      .notNull()
      .references(() => privacyPolicyVersions.id),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
    ip: varchar("ip", { length: 45 }),
  },
  (table) => [index("idx_upc_user").on(table.userId), index("idx_upc_version").on(table.versionId)],
);

export type UserPrivacyConsent = typeof userPrivacyConsents.$inferSelect;
export type NewUserPrivacyConsent = typeof userPrivacyConsents.$inferInsert;
