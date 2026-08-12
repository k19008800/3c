import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  index,
  numeric,
  jsonb,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * 实名认证记录表
 * 对齐 flowcharts/03-real-name-review.md 与原型 admin-verification.html
 * 状态机: unverified → pending_review → approved / rejected
 * 用户提交(approved_via='submit') 或 管理员代审(approved_via='admin') 两种通过路径。
 */
export const realNameRecords = pgTable(
  'real_name_records',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),

    // 类型: individual(个人) / enterprise(企业)
    type: varchar('type', { length: 20 }).notNull().default('individual'),
    // 真实姓名 / 企业名称
    realName: varchar('real_name', { length: 100 }).notNull(),
    // 证件号（身份证 / 统一社会信用代码）
    idNumber: varchar('id_number', { length: 50 }).notNull(),
    // 联系电话
    phone: varchar('phone', { length: 20 }),
    // 企业认证补充
    legalPerson: varchar('legal_person', { length: 50 }),
    companyAddress: varchar('company_address', { length: 200 }),

    // 状态机
    status: varchar('status', { length: 20 }).notNull().default('pending_review'),

    // 审核
    reviewerId: integer('reviewer_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectReason: varchar('reject_reason', { length: 500 }),
    // 通过来源: submit(用户提交) / admin(管理员代审通过)
    approvedVia: varchar('approved_via', { length: 20 }),
    // 代审备注
    directNote: text('direct_note'),

    // 风控与资料
    // 人证比对相似度 0~1
    simScore: numeric('sim_score', { precision: 4, scale: 3 }),
    // 风险标签 jsonb: [{type,label,level,detail}]
    risk: jsonb('risk'),
    // OCR 识别字段 jsonb: {name,idNumber,address,birth,...}
    ocrFields: jsonb('ocr_fields'),
    // 证件影像 jsonb: [{id,type:front/back/businessLicense,url,masked}]
    images: jsonb('images'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_rnr_user').on(table.userId),
    index('idx_rnr_status').on(table.status),
    index('idx_rnr_status_created').on(table.status, table.createdAt),
  ],
);

export type RealNameRecord = typeof realNameRecords.$inferSelect;
export type NewRealNameRecord = typeof realNameRecords.$inferInsert;

/** 证件号脱敏显示 */
export function maskId(id: string): string {
  if (!id) return '';
  if (id.length <= 6) return id;
  return id.slice(0, 4) + '********' + id.slice(-4);
}

/** 证件号脱敏（企业：保留前 2 后 4） */
export function maskIdSmart(id: string, type: string): string {
  if (!id) return '';
  if (type === 'enterprise') {
    return id.length <= 6 ? id : id.slice(0, 2) + '****' + id.slice(-4);
  }
  return maskId(id);
}
