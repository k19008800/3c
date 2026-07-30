// ============================================================
//  3cloud (3C) — 客服排班与 SLA 表
//  staff_schedules / staff_schedule_exceptions / staff_sla_configs / staff_quality_checks
// ============================================================

import { pgTable, serial, integer, varchar, boolean, time, date, jsonb, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { tickets } from "./tickets.js";
import { chatSessions } from "./chat.js";

// ── 客服排班表 ──

export const staffSchedules = pgTable("staff_schedules", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(), // 0=Sun, 1=Mon, ..., 6=Sat
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  isHoliday: boolean("is_holiday").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── 排班例外记录 ──

export const staffScheduleExceptions = pgTable("staff_schedule_exceptions", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  exceptionDate: date("exception_date").notNull(),
  exceptionType: varchar("exception_type", { length: 20 }).notNull().default("leave"),
  startTime: time("start_time"),
  endTime: time("end_time"),
  reason: varchar("reason", { length: 500 }),
  approvedBy: integer("approved_by").references(() => users.id),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── SLA 配置 ──

export const staffSlaConfigs = pgTable("staff_sla_configs", {
  id: serial("id").primaryKey(),
  ticketType: varchar("ticket_type", { length: 30 }).notNull(),
  firstResponseMin: integer("first_response_min").notNull().default(60),
  resolutionMin: integer("resolution_min").notNull().default(1440),
  escalation50pctTo: varchar("escalation_50pct_to", { length: 20 }).default("staff"),
  escalation100pctTo: varchar("escalation_100pct_to", { length: 20 }).default("supervisor"),
  escalation200pctTo: varchar("escalation_200pct_to", { length: 20 }).default("manager"),
  workingHoursOnly: boolean("working_hours_only").default(true),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── 质检记录 ──

export const staffQualityChecks = pgTable("staff_quality_checks", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
  sessionId: integer("session_id").references(() => chatSessions.id, { onDelete: "set null" }),
  staffId: integer("staff_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reviewerId: integer("reviewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  dimensions: jsonb("dimensions").default({}),
  feedback: varchar("feedback", { length: 1000 }),
  status: varchar("status", { length: 20 }).default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});