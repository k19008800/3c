import { pgTable, serial, varchar, text, boolean, timestamp, integer, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * SSO 单点登录配置
 * 对齐 docs/ref-32-sso-integration.md §32.2
 * provider: 'oidc' | 'saml' | 'ldap'
 * config 字段存储对应类型的 JSON 配置
 */
export const ssoConfigs = pgTable(
  "sso_configs",
  {
    id: serial("id").primaryKey(),
    provider: varchar("provider", { length: 30 }).notNull().unique(), // oidc | saml | ldap
    label: varchar("label", { length: 50 }).default("SSO"),
    isEnabled: boolean("is_enabled").notNull().default(false),
    config: text("config").notNull(),
    forcedDomains: text("forced_domains"), // JSON 数组
    defaultRole: varchar("default_role", { length: 50 }),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerIdx: index("idx_sso_provider").on(table.provider),
  }),
);

export type SSOConfig = typeof ssoConfigs.$inferSelect;
export type NewSSOConfig = typeof ssoConfigs.$inferInsert;

/**
 * 企业通讯录 OAuth 配置
 * 对齐 docs/ref-32-sso-integration.md §32.3
 * platform: 'wecom' | 'dingtalk' | 'feishu'
 */
export const enterpriseOAuthConfigs = pgTable(
  "enterprise_oauth_configs",
  {
    id: serial("id").primaryKey(),
    platform: varchar("platform", { length: 20 }).notNull().unique(),
    label: varchar("label", { length: 50 }),
    isEnabled: boolean("is_enabled").notNull().default(false),
    config: text("config").notNull(), // JSON: WecomConfig | DingtalkConfig | FeishuConfig
    autoCreateUser: boolean("auto_create_user").notNull().default(true),
    defaultRole: varchar("default_role", { length: 50 }),
    syncContacts: boolean("sync_contacts").notNull().default(false),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    platformIdx: index("idx_enterprise_oauth_platform").on(table.platform),
  }),
);

export type EnterpriseOAuthConfig = typeof enterpriseOAuthConfigs.$inferSelect;
export type NewEnterpriseOAuthConfig = typeof enterpriseOAuthConfigs.$inferInsert;
