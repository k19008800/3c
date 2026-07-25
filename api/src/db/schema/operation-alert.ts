// ============================================================
//  3cloud (3C) — 异常操作告警 Schema
//  operation_alerts — 告警记录
//  operation_alert_rules — 告警规则配置
// ============================================================

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

// ── 异常操作告警记录 ──

export const operationAlerts = pgTable(
  "operation_alerts",
  {
    id: serial("id").primaryKey(),
    
    // 告警类型
    alertType: varchar("alert_type", { length: 50 }).notNull(),  
    // frequent_failure | remote_login | batch_delete | sensitive_operation
    
    // 严重程度
    severity: varchar("severity", { length: 20 }).notNull().default("warning"),
    // critical | warning | info
    
    // 关联用户（触发告警的用户）
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    
    // 告警标题
    title: varchar("title", { length: 255 }).notNull(),
    
    // 告警详情
    description: text("description").notNull(),
    
    // 关联的操作日志 ID 列表
    relatedOperationIds: jsonb("related_operation_ids").$type<number[]>(),
    
    // 告警元数据（IP、位置、操作统计等）
    metadata: jsonb("metadata"),
    
    // 处理状态
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    // pending | acknowledged | resolved | ignored
    
    // 处理人
    handledBy: integer("handled_by").references(() => users.id),
    
    // 处理时间
    handledAt: timestamp("handled_at", { withTimezone: true }),
    
    // 处理备注
    handleNote: text("handle_note"),
    
    // 通知状态
    notificationSent: boolean("notification_sent").notNull().default(false),
    notificationSentAt: timestamp("notification_sent_at", { withTimezone: true }),
    
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    alertTypeIdx: index("operation_alerts_type_idx").on(table.alertType),
    userIdIdx: index("operation_alerts_user_idx").on(table.userId),
    statusIdx: index("operation_alerts_status_idx").on(table.status),
    createdAtIdx: index("operation_alerts_created_at_idx").on(table.createdAt.desc()),
    severityIdx: index("operation_alerts_severity_idx").on(table.severity),
  })
);

// ── 告警规则配置 ──

export const operationAlertRules = pgTable(
  "operation_alert_rules",
  {
    id: serial("id").primaryKey(),
    
    // 规则类型
    ruleType: varchar("rule_type", { length: 50 }).notNull().unique(),
    // frequent_failure | remote_login | batch_delete | sensitive_operation
    
    // 规则名称
    name: varchar("name", { length: 100 }).notNull(),
    
    // 规则描述
    description: text("description"),
    
    // 是否启用
    enabled: boolean("enabled").notNull().default(true),
    
    // 严重程度
    severity: varchar("severity", { length: 20 }).notNull().default("warning"),
    
    // 规则参数（JSON 配置）
    // 例如：{ "timeWindowMinutes": 10, "threshold": 10 }
    params: jsonb("params").notNull().default("{}"),
    
    // 通知配置
    notifyInApp: boolean("notify_in_app").notNull().default(true),
    notifyEmail: boolean("notify_email").notNull().default(false),
    emailRecipients: jsonb("email_recipients").$type<string[]>(),
    
    // 创建/更新信息
    createdBy: integer("created_by").references(() => users.id),
    updatedBy: integer("updated_by").references(() => users.id),
    
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ruleTypeIdx: index("operation_alert_rules_type_idx").on(table.ruleType),
    enabledIdx: index("operation_alert_rules_enabled_idx").on(table.enabled),
  })
);

// ── 类型定义 ──

export type AlertType = 
  | "frequent_failure"    // 频繁失败
  | "remote_login"        // 异地登录
  | "batch_delete"        // 批量删除
  | "sensitive_operation"; // 敏感操作

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertStatus = "pending" | "acknowledged" | "resolved" | "ignored";

export interface AlertMetadata {
  // 频繁失败
  failureCount?: number;
  timeWindowMinutes?: number;
  operations?: string[];
  
  // 异地登录
  loginLocations?: Array<{
    ip: string;
    location?: string;
    timestamp: string;
  }>;
  
  // 批量删除
  deleteCount?: number;
  targetType?: string;
  
  // 敏感操作
  sensitiveAction?: string;
  targetInfo?: string;
}
