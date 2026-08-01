import { pgTable, serial, integer, varchar, text, timestamp, boolean, decimal, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";

// ===== Enum =====
export const customerStatusEnum = pgEnum("customer_status", ["lead","trial","active","silent","churned"]);
export const contactMethodEnum = pgEnum("contact_method", ["phone","wechat","email","meeting","other"]);
export const taskStatusEnum = pgEnum("task_status", ["pending","completed","cancelled"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low","normal","high","urgent"]);

// ===== 11.1 客户表 =====
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  salespersonId: integer("salesperson_id").notNull().references(() => users.id),
  status: customerStatusEnum("status").notNull().default("lead"),
  tags: text("tags").array().default([]), // tag id array
  notes: text("notes"),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ===== 11.1 联系记录 =====
export const customerContacts = pgTable("customer_contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  salespersonId: integer("salesperson_id").notNull().references(() => users.id),
  method: contactMethodEnum("method").notNull(),
  summary: text("summary").notNull(),
  nextFollowUp: timestamp("next_follow_up"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== 11.1 客户状态变更日志 =====
export const customerStatusLogs = pgTable("customer_status_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  salespersonId: integer("salesperson_id").notNull().references(() => users.id),
  fromStatus: customerStatusEnum("from_status"),
  toStatus: customerStatusEnum("to_status").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== 11.1 客户标签 =====
export const customerTagDefs = pgTable("customer_tag_defs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  color: varchar("color", { length: 7 }).default("#6366f1"),
  isPreset: boolean("is_preset").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== 11.3 跟进提醒 =====
export const followReminders = pgTable("follow_reminders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  salespersonId: integer("salesperson_id").notNull().references(() => users.id),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  dueAt: timestamp("due_at").notNull(),
  completedAt: timestamp("completed_at"),
  status: taskStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== 11.5 业绩 =====
export const salesPerformance = pgTable("sales_performance", {
  id: serial("id").primaryKey(),
  salespersonId: integer("salesperson_id").notNull().references(() => users.id),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  newCustomers: integer("new_customers").notNull().default(0),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).notNull().default("0"),
  commission: decimal("commission", { precision: 12, scale: 2 }).notNull().default("0"),
  customerCount: integer("customer_count").notNull().default(0),
  activeRate: decimal("active_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
