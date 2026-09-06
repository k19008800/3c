/** 对账报告与差异表 — 仅记录平台侧真实消费汇总，不伪造外部账单。 */
import { pgTable, serial, integer, varchar, timestamp, numeric, text, jsonb, index, check, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const reconciliationReports = pgTable('reconciliation_reports', {
  id: serial('id').primaryKey(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  reconType: varchar('recon_type', { length: 30 }).notNull().default('full'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  totalOrders: integer('total_orders').notNull().default(0),
  matchedOrders: integer('matched_orders').notNull().default(0),
  mismatchedOrders: integer('mismatched_orders').notNull().default(0),
  totalAmount: numeric('total_amount', { precision: 18, scale: 6 }).notNull().default('0'),
  difference: numeric('difference', { precision: 18, scale: 6 }).notNull().default('0'),
  summary: jsonb('summary'),
  errorMessage: text('error_message'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => ({ rangeIdx: index('idx_reconciliation_reports_range').on(t.startDate, t.endDate), statusIdx: index('idx_reconciliation_reports_status').on(t.status), runningUnique: uniqueIndex('uq_reconciliation_reports_running_range').on(t.startDate, t.endDate, t.reconType).where(sql`${t.status} = 'running'`), statusCheck: check('chk_recon_report_status', sql`${t.status} in ('pending','running','completed','failed')`) }));

export const reconciliationMismatches = pgTable('reconciliation_mismatches', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id').notNull().references(() => reconciliationReports.id, { onDelete: 'cascade' }),
  source: varchar('source', { length: 50 }).notNull().default('platform'),
  reference: varchar('reference', { length: 150 }),
  differenceAmount: numeric('difference_amount', { precision: 18, scale: 8 }).notNull().default('0'),
  severity: varchar('severity', { length: 20 }).notNull().default('low'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  resolutionNote: text('resolution_note'),
  processingBy: integer('processing_by').references(() => users.id, { onDelete: 'set null' }),
  processingAt: timestamp('processing_at', { withTimezone: true }),
  resolvedBy: integer('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  reviewerId: integer('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ reportIdx: index('idx_reconciliation_mismatches_report').on(t.reportId), statusIdx: index('idx_reconciliation_mismatches_status').on(t.status), statusCheck: check('chk_recon_mismatch_status', sql`${t.status} in ('pending','processing','resolved','false_positive','ignored')`) }));

export type ReconciliationReport = typeof reconciliationReports.$inferSelect;
export type ReconciliationMismatch = typeof reconciliationMismatches.$inferSelect;
