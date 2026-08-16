/**
 * 任务记录表 — MJ / Suno 任务型渠道的任务持久化
 *
 * 对齐 New API 的 model.Midjourney / model.Task 表（newapi-gap-analysis.md
 * Batch 4 遗留增强「任务落库 + 后台轮询」）：
 * - 提交成功即落库：public_id 为对外任务 id（MJ = 上游 result；Suno = 网关生成的
 *   task_<32hex>），upstream_id 为上游内部任务 id（Suno 轮询匹配用）
 * - 渠道锁定：记录 supplier_id / channel_key_id，任务后续动作（change/simple-change
 *   等）回到原渠道执行
 * - 状态机：submitted → queueing/processing → success / failed / expired；
 *   后台轮询器（services/task/task-poller.ts）刷新进度，失败/超时退款
 *   （refunded 标记防重复退款）
 *
 * @module db/schema/task-records
 * @see services/task/task-store.ts
 * @see services/task/task-poller.ts
 */

import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  jsonb,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const taskRecords = pgTable(
  'task_records',
  {
    id: serial('id').primaryKey(),
    /** 任务类型：midjourney | suno */
    taskType: varchar('task_type', { length: 20 }).notNull(),
    /** 对外公开任务 id（MJ = 上游 result；Suno = task_<32hex>） */
    publicId: varchar('public_id', { length: 64 }).notNull(),
    /** 上游内部任务 id（Suno 轮询按此匹配；MJ 与 public_id 相同） */
    upstreamId: varchar('upstream_id', { length: 200 }),
    userId: integer('user_id').notNull(),
    apiKeyId: integer('api_key_id'),
    /** 渠道锁定：提交时选中的供应商 / key */
    supplierId: integer('supplier_id').notNull(),
    channelKeyId: integer('channel_key_id'),
    /** 任务动作（MJ: imagine/change/...；Suno: MUSIC/LYRICS） */
    action: varchar('action', { length: 50 }).notNull(),
    /** 计费模型名（mj_imagine / suno_music 等） */
    model: varchar('model', { length: 100 }).notNull(),
    prompt: text('prompt'),
    /** submitted | queueing | processing | success | failed | expired */
    status: varchar('status', { length: 20 }).notNull().default('submitted'),
    /** 进度（MJ 的 '0%'~'100%'；Suno 无进度位） */
    progress: varchar('progress', { length: 10 }),
    failReason: text('fail_reason'),
    /** 最近一次轮询拿到的完整上游响应（MidjourneyDto / SunoDataResponse），fetch 直接透出 */
    response: jsonb('response'),
    /** 记账金额（¥，任务单价） */
    cost: varchar('cost', { length: 30 }),
    /** 失败已退款标记（防重复退款） */
    refunded: boolean('refunded').notNull().default(false),
    /** 网关请求 ID（关联 consumption_records.request_id，退款冲销佣金用） */
    requestId: varchar('request_id', { length: 64 }),
    submitTime: timestamp('submit_time'),
    startTime: timestamp('start_time'),
    finishTime: timestamp('finish_time'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    publicIdUnique: uniqueIndex('uq_task_records_public_id').on(table.publicId),
    userIdIdx: index('idx_task_records_user_id').on(table.userId),
    statusIdx: index('idx_task_records_status').on(table.status),
    supplierIdIdx: index('idx_task_records_supplier_id').on(table.supplierId),
  }),
);

export type TaskRecord = typeof taskRecords.$inferSelect;
export type NewTaskRecord = typeof taskRecords.$inferInsert;
