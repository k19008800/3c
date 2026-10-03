import {
  pgTable, serial, integer, varchar, text, boolean, timestamp, doublePrecision, jsonb, index,
} from 'drizzle-orm/pg-core';

/**
 * 告警中心 Schema（PRD §5.4，migration 0046）
 *
 * 三张表：
 * - monitoring_rules    告警规则配置（指标 / 阈值 / 窗口 / 通知渠道 / 开关）
 * - alerts              告警事件记录（检测引擎命中时写入，firing → acknowledged → resolved）
 * - alert_notifications 告警通知发送记录（email/webhook 投递留痕）
 *
 * 设计要点：
 * - 指标 metric 取值：response_latency / error_rate / qps / cost_spike /
 *   balance_low / vendor_health / cache_hit_rate（与 ref-5.4 对齐的网关可观测指标集）。
 * - alerts.status 单值状态机：firing（命中未处理）→ acknowledged（已确认仍在持续）
 *   → resolved（指标恢复，引擎自动回写 resolved_at）。
 * - 无外键级联：规则删除后历史 alerts 仍保留（审计留痕），与平台总账一致。
 *
 * @see docs/ref-5.4-alert-rules.md
 * @module db/schema
 */
export const monitoringRules = pgTable('monitoring_rules', {
  id: serial('id').primaryKey(),
  /** 规则名称，如「API 失败率告警」 */
  name: varchar('name', { length: 100 }).notNull(),
  /** 指标类型：response_latency/error_rate/qps/cost_spike/balance_low/vendor_health/cache_hit_rate */
  metric: varchar('metric', { length: 50 }).notNull(),
  /** 阈值（单位随 metric 而定：error_rate=%, response_latency=ms, qps=req/s, cache_hit_rate=%） */
  threshold: doublePrecision('threshold').notNull(),
  /** 评估窗口（秒），引擎按最近 windowSec 聚合指标 */
  windowSec: integer('window_sec').notNull().default(300),
  /** 通知渠道配置 id 列表（对应后续通知渠道表；当前仅留档，不强制投递） */
  channelIds: jsonb('channel_ids').$type<number[]>().notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  metricIdx: index('idx_monitoring_rules_metric').on(t.metric),
  enabledIdx: index('idx_monitoring_rules_enabled').on(t.enabled),
}));

/**
 * 告警事件记录
 *
 * status 状态机：firing（超限命中）→ acknowledged（管理员确认，仍持续）→
 * resolved（指标回落到阈值以下，引擎自动回写）。同一规则在未 resolved 期间
 * 不重复创建 alert（防告警风暴，见 alert-engine tick 去重）。
 */
export const alerts = pgTable('alerts', {
  id: serial('id').primaryKey(),
  ruleId: integer('rule_id').notNull().references(() => monitoringRules.id),
  /** firing | acknowledged | resolved */
  status: varchar('status', { length: 20 }).notNull().default('firing'),
  /** 命中时的实际指标值 */
  metricValue: doublePrecision('metric_value').notNull(),
  /** 命中时的规则阈值快照 */
  threshold: doublePrecision('threshold').notNull(),
  /** 可读告警消息，如「API 失败率告警: error_rate 当前 7.2（阈值 5）」 */
  message: text('message').notNull(),
  firedAt: timestamp('fired_at', { withTimezone: true }).defaultNow().notNull(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  ruleIdx: index('idx_alerts_rule').on(t.ruleId),
  statusIdx: index('idx_alerts_status').on(t.status),
  firedIdx: index('idx_alerts_fired_at').on(t.firedAt),
}));

/**
 * 告警通知发送记录（投递留痕）
 *
 * 当前引擎命中时仅写 alerts，不强制外发通知；本表为后续 email/webhook 投递预留，
 * 投递动作接入后写 status=sent/failed + sent_at。
 */
export const alertNotifications = pgTable('alert_notifications', {
  id: serial('id').primaryKey(),
  alertId: integer('alert_id').notNull().references(() => alerts.id),
  /** email | webhook */
  channel: varchar('channel', { length: 20 }).notNull(),
  recipient: varchar('recipient', { length: 255 }).notNull(),
  /** pending | sent | failed */
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  alertIdx: index('idx_alert_notifications_alert').on(t.alertId),
}));

export type MonitoringRule = typeof monitoringRules.$inferSelect;
export type NewMonitoringRule = typeof monitoringRules.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type AlertNotification = typeof alertNotifications.$inferSelect;
export type NewAlertNotification = typeof alertNotifications.$inferInsert;
