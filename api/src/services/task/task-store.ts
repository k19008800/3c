/**
 * 任务记录服务 — MJ / Suno 任务持久化读写
 *
 * 职责：
 * - createTaskRecord：提交成功后落库（含公开 id / 上游 id / 渠道锁定 / 记账金额）
 * - getTaskForUser / listTasksForUser：按用户查询任务（fetch 端点用，用户隔离）
 * - listInProgressTasks：轮询器取待刷新任务（submitted/queueing/processing）
 * - updateTaskStatus：轮询结果合并（状态/进度/响应/时间戳）
 * - failTaskWithRefund：失败落账 + 退款防重标记（原子：refunded=false 条件更新）
 * - getSupplierWithKey：按供应商取渠道 + key（轮询批量转发 / 渠道锁定共用）
 *
 * @module services/task
 * @see db/schema/task-records
 * @see services/task/task-poller
 */

import { db, schema } from '../../db';
import { eq, and, inArray } from 'drizzle-orm';

export type TaskType = 'midjourney' | 'suno';
export type TaskStatus = 'submitted' | 'queueing' | 'processing' | 'success' | 'failed';

/** 进行中状态集合（轮询器待刷新） */
export const IN_PROGRESS_STATUSES: TaskStatus[] = ['submitted', 'queueing', 'processing'];

export type TaskRecord = typeof schema.taskRecords.$inferSelect;

/** 创建任务入参（提交成功后调用） */
export interface CreateTaskRecordInput {
  taskType: TaskType;
  publicId: string;
  upstreamId: string | null;
  userId: number;
  apiKeyId: number | null;
  supplierId: number;
  channelKeyId: number | null;
  action: string;
  model: string;
  prompt: string | null;
  cost: string;
  requestId: string;
}

/**
 * 提交成功后落库一条任务记录
 *
 * submit_time 记为当前时间；status 初始 'submitted'，后续由轮询器推进。
 *
 * @param input - 任务信息
 * @returns 落库后的任务记录
 */
export async function createTaskRecord(input: CreateTaskRecordInput): Promise<TaskRecord> {
  const [record] = await db.insert(schema.taskRecords).values({
    taskType: input.taskType,
    publicId: input.publicId,
    upstreamId: input.upstreamId,
    userId: input.userId,
    apiKeyId: input.apiKeyId ?? null,
    supplierId: input.supplierId,
    channelKeyId: input.channelKeyId ?? null,
    action: input.action,
    model: input.model,
    prompt: input.prompt ?? null,
    status: 'submitted',
    cost: input.cost,
    requestId: input.requestId,
    submitTime: new Date(),
  }).returning();
  return record!;
}

/**
 * 删除任务记录（计费失败补偿：删除刚落库但未完成记账的任务）
 *
 * @param id - 任务记录 id
 */
export async function deleteTaskRecord(id: number): Promise<void> {
  await db.delete(schema.taskRecords).where(eq(schema.taskRecords.id, id));
}

/**
 * 按用户查询单个任务（fetch 端点；用户隔离，他人任务不可见）
 *
 * @param taskType - 任务类型
 * @param publicId - 对外公开任务 id
 * @param userId - 归属用户
 * @returns 任务记录；不存在返回 null
 */
export async function getTaskForUser(taskType: TaskType, publicId: string, userId: number): Promise<TaskRecord | null> {
  const rows = await db.select()
    .from(schema.taskRecords)
    .where(and(
      eq(schema.taskRecords.taskType, taskType),
      eq(schema.taskRecords.publicId, publicId),
      eq(schema.taskRecords.userId, userId),
    ))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 按用户批量查询任务（Suno 批量 fetch）
 *
 * @param taskType - 任务类型
 * @param publicIds - 公开任务 id 列表
 * @param userId - 归属用户
 * @returns 命中的任务记录列表
 */
export async function listTasksForUser(taskType: TaskType, publicIds: string[], userId: number): Promise<TaskRecord[]> {
  if (publicIds.length === 0) return [];
  return db.select()
    .from(schema.taskRecords)
    .where(and(
      eq(schema.taskRecords.taskType, taskType),
      eq(schema.taskRecords.userId, userId),
      inArray(schema.taskRecords.publicId, publicIds),
    ))
    .orderBy(schema.taskRecords.id);
}

/**
 * 取全部进行中任务（轮询器待刷新），按 id 升序
 *
 * @returns 进行中任务列表
 */
export async function listInProgressTasks(): Promise<TaskRecord[]> {
  return db.select()
    .from(schema.taskRecords)
    .where(inArray(schema.taskRecords.status, IN_PROGRESS_STATUSES))
    .orderBy(schema.taskRecords.id);
}

/** 任务状态更新补丁（轮询结果合并） */
export interface TaskStatusPatch {
  status: TaskStatus;
  progress?: string | null;
  failReason?: string | null;
  response?: unknown | null;
  startTime?: Date | null;
  finishTime?: Date | null;
}

/**
 * 更新任务状态（轮询结果合并）
 *
 * @param id - 任务记录 id
 * @param patch - 状态补丁
 * @returns 更新后的任务记录；不存在返回 null
 */
export async function updateTaskStatus(id: number, patch: TaskStatusPatch): Promise<TaskRecord | null> {
  const setData: Record<string, unknown> = {
    status: patch.status,
    progress: patch.progress ?? null,
    failReason: patch.failReason ?? null,
    response: patch.response ?? null,
    startTime: patch.startTime ?? null,
    finishTime: patch.finishTime ?? null,
    updatedAt: new Date(),
  };
  const [record] = await db.update(schema.taskRecords)
    .set(setData)
    .where(eq(schema.taskRecords.id, id))
    .returning();
  return record ?? null;
}

/**
 * 任务失败落账 + 退款防重标记（原子）
 *
 * 仅在「未退款」时把任务置为 failed（refunded=false 条件更新），
 * 返回任务记录供调用方执行退款；返回 null 表示已被并发/前序处理过（不重复退款）。
 * 退款本身（addBalance）由调用方在拿到记录后执行——单实例轮询器无并发 tick，
 * 见 task-poller.ts 的 inFlight 防重入说明。
 *
 * @param id - 任务记录 id
 * @param reason - 失败原因
 * @returns 标记成功的任务记录（含 cost/userId/requestId 供退款）；已处理过返回 null
 */
export async function failTaskWithRefund(id: number, reason: string): Promise<TaskRecord | null> {
  const [record] = await db.update(schema.taskRecords)
    .set({
      status: 'failed',
      failReason: reason,
      finishTime: new Date(),
      refunded: true,
      updatedAt: new Date(),
    })
    .where(and(
      eq(schema.taskRecords.id, id),
      eq(schema.taskRecords.refunded, false),
    ))
    .returning();
  return record ?? null;
}

/** 供应商行（精简，轮询/渠道锁定用） */
export interface TaskSupplierRow {
  id: number;
  name: string;
  code: string;
  baseUrl: string;
  apiType: string;
  status: string;
}

/** 供应商 Key 行（精简） */
export interface TaskKeyRow {
  id: number;
  supplierId: number;
  keyValue: string;
  name: string | null;
  status: string;
}

/**
 * 按供应商取渠道 + Key（轮询批量转发 / 渠道锁定共用）
 *
 * Key 优先级：显式 channelKeyId（渠道锁定）→ 该供应商第一个 active key。
 * 供应商非 active 或无可用 key → 返回 null。
 *
 * @param supplierId - 供应商 id
 * @param channelKeyId - 渠道锁定的 key id（可空）
 * @returns { supplier, key }；不可用返回 null
 */
export async function getSupplierWithKey(
  supplierId: number,
  channelKeyId?: number | null,
): Promise<{ supplier: TaskSupplierRow; key: TaskKeyRow } | null> {
  const [supplier] = await db.select({
    id: schema.suppliers.id,
    name: schema.suppliers.name,
    code: schema.suppliers.code,
    baseUrl: schema.suppliers.baseUrl,
    apiType: schema.suppliers.apiType,
    status: schema.suppliers.status,
  })
    .from(schema.suppliers)
    .where(eq(schema.suppliers.id, supplierId))
    .limit(1);

  if (!supplier || supplier.status !== 'active') return null;

  const keyWhere = channelKeyId
    ? and(eq(schema.supplierKeys.id, channelKeyId), eq(schema.supplierKeys.status, 'active'))
    : and(eq(schema.supplierKeys.supplierId, supplierId), eq(schema.supplierKeys.status, 'active'));

  const [key] = await db.select({
    id: schema.supplierKeys.id,
    supplierId: schema.supplierKeys.supplierId,
    keyValue: schema.supplierKeys.keyValue,
    name: schema.supplierKeys.name,
    status: schema.supplierKeys.status,
  })
    .from(schema.supplierKeys)
    .where(keyWhere)
    .orderBy(schema.supplierKeys.id)
    .limit(1);

  if (!key) return null;

  return { supplier, key };
}
