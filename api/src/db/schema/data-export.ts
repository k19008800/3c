import { pgTable, serial, integer, varchar, text, timestamp, boolean, bigint, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 用户数据导出请求表（§33.3 GDPR 数据可携带权）
 * 对齐 SPEC-§33-合规法务与成本分析.md
 * status: pending / processing / completed / failed / rejected / overdue
 */
export const dataExportRequests = pgTable(
  "data_export_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    processedBy: integer("processed_by").references(() => users.id),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    fileUrl: text("file_url"),
    fileExpiresAt: timestamp("file_expires_at", { withTimezone: true }),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    fileCount: integer("file_count").default(0),
    errorMessage: text("error_message"),
    rejectReason: text("reject_reason"),
    retryCount: integer("retry_count").default(0),
    notificationSent: boolean("notification_sent").notNull().default(false),
    deadline: timestamp("deadline", { withTimezone: true }),
    priority: boolean("priority").notNull().default(false),
  },
  (table) => [index("idx_der_user").on(table.userId), index("idx_der_status").on(table.status)],
);

export type DataExportRequest = typeof dataExportRequests.$inferSelect;
export type NewDataExportRequest = typeof dataExportRequests.$inferInsert;

/** 用户导出任务分片表（大文件支持，§33.3） */
export const userExportJobs = pgTable(
  "user_export_jobs",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => dataExportRequests.id),
    partNumber: integer("part_number").default(1),
    status: varchar("status", { length: 20 }).default("pending"),
    fileUrl: text("file_url"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    dataType: varchar("data_type", { length: 50 }),
    dateRange: varchar("date_range", { length: 50 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("idx_uej_request").on(table.requestId)],
);

export type UserExportJob = typeof userExportJobs.$inferSelect;
export type NewUserExportJob = typeof userExportJobs.$inferInsert;
