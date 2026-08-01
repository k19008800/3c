import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 实名认证记录表
 * 对齐 flowcharts/03-real-name-review.md
 * 状态机: unverified → pending_review → approved / rejected
 * 用户可提交实名信息（个人/企业），管理员审核
 */
export const realNameRecords = pgTable(
  "real_name_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),

    // 类型: individual(个人) / enterprise(企业)
    type: varchar("type", { length: 20 }).notNull().default("individual"),
    // 真实姓名 / 企业名称
    realName: varchar("real_name", { length: 100 }).notNull(),
    // 证件号（身份证 / 统一社会信用代码，脱敏存储展示用前缀）
    idNumber: varchar("id_number", { length: 50 }).notNull(),
    // 联系电话
    phone: varchar("phone", { length: 20 }),
    // 企业认证补充
    legalPerson: varchar("legal_person", { length: 50 }),   // 法人代表
    companyAddress: varchar("company_address", { length: 200 }),

    // 状态机
    status: varchar("status", { length: 20 }).notNull().default("pending_review"),

    // 审核
    reviewerId: integer("reviewer_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: varchar("reject_reason", { length: 500 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_rnr_user").on(table.userId),
    index("idx_rnr_status").on(table.status),
  ],
);

export type RealNameRecord = typeof realNameRecords.$inferSelect;
export type NewRealNameRecord = typeof realNameRecords.$inferInsert;

/** 身份证脱敏显示 */
export function maskId(id: string): string {
  if (id.length <= 6) return id;
  return id.slice(0, 4) + "********" + id.slice(-4);
}
