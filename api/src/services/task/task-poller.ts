/**
 * MJ / Suno 任务后台轮询器
 *
 * 对齐 New API 的 midjourney_poll / updateSunoTasks 后台系统任务：
 * 每 30s 批量刷新进行中任务（submitted/queueing/processing）的进度：
 * - 按（taskType, supplierId）分组，对每个渠道批量请求上游：
 *   - midjourney：POST {baseUrl}/mj/task/list-by-condition（body {ids:[...]}，mj-api-secret 头）
 *   - suno：POST {baseUrl}/suno/fetch（body {ids:[...]}，Bearer 头）
 * - 合并结果：成功 → success（存完整响应供 fetch 透出）；失败 → failed + 退款；
 *   进行中 → 更新进度/响应
 * - 超 1 小时仍进行中 → 判失败 + 退款（New API 同款策略）
 * - 渠道不可用 / 网络错误 → 记录熔断结果，任务留待下个 tick（不误杀）
 *
 * 退款：addBalance(type='refund', referenceType='consumption', referenceId=requestId)
 * —— 自动冲销该笔消费对应的代理佣金；refunded 原子标记防重复退款。
 *
 * @see newapi-gap-analysis.md Batch 4 遗留增强「任务落库 + 后台轮询」
 * @see services/task/task-store
 * @module services/task
 */

import { addBalance } from '../billing/balance';
import { recordChannelResult } from '../upstream/circuit-breaker';
import {
  getSupplierWithKey,
  listInProgressTasks,
  updateTaskStatus,
  failTaskWithRefund,
  type TaskRecord,
  type TaskStatus,
  type TaskType,
} from './task-store';

/** 轮询 tick 间隔（30s） */
export const TASK_POLL_INTERVAL_MS = 30_000;
/** 任务超时阈值（1 小时）：超过仍未完成 → 判失败 + 退款 */
export const TASK_EXPIRE_MS = 60 * 60 * 1000;

/** 单次轮询结果统计 */
export interface PollSummary {
  checked: number;
  updated: number;
  failed: number;
  refunded: number;
  skipped: number;
}

/**
 * 上游状态 → 内部状态映射（大小写归一）
 *
 * MJ（novicezk）：NOT_START / IN_PROGRESS / SUCCESS / FAILURE
 * Suno：submitted / queueing / processing / success / failed
 *
 * @param upstreamStatus - 上游返回的状态
 * @returns 内部状态；未知状态返回 null（不动该任务）
 */
export function mapUpstreamStatus(upstreamStatus: string): TaskStatus | null {
  switch (upstreamStatus.toUpperCase()) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
    case 'FAILURE':
      return 'failed';
    case 'IN_PROGRESS':
    case 'PROCESSING':
    case 'QUEUEING':
      return 'processing';
    case 'SUBMITTED':
    case 'NOT_START':
      return 'submitted';
    default:
      return null;
  }
}

/** 解析上游时间字段（RFC3339 / 'YYYY-MM-DD HH:mm:ss' / 毫秒时间戳）；非法返回 null */
function parseUpstreamTime(value: unknown): Date | null {
  if (value == null) return null;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 对单个失败任务执行退款（addBalance 冲销 + 佣金冲销由 balance.ts 内部处理）
 *
 * 退款失败仅记录告警（refunded 已置位，需人工对账），不阻断轮询。
 *
 * @param task - 已标记 refunded 的任务记录
 */
async function refundFailedTask(task: TaskRecord): Promise<void> {
  if (!task.cost) return; // 无记账金额（异常数据）→ 跳过
  try {
    await addBalance(task.userId, task.cost, 'refund', 'consumption', task.requestId ?? undefined);
  } catch (err) {
    console.error(`[task-poller] 退款失败 task=${task.publicId} user=${task.userId}:`, err);
  }
}

/** 单条上游任务结果合并（MJ / Suno 各自解析后统一调用） */
interface UpstreamTaskResult {
  /** 匹配键：MJ = publicId；Suno = upstreamId */
  matchKey: string;
  status: string;
  progress?: string | null;
  failReason?: string | null;
  submitTime?: unknown;
  startTime?: unknown;
  finishTime?: unknown;
  raw: unknown;
}

/**
 * 合并一批上游结果到任务记录
 *
 * @param tasks - 同渠道的任务记录
 * @param results - 上游返回的结果列表
 * @param matchField - 匹配字段：'publicId'（MJ）| 'upstreamId'（Suno）
 * @param summary - 轮询统计（原地累加）
 */
async function mergeResults(
  tasks: TaskRecord[],
  results: UpstreamTaskResult[],
  matchField: 'publicId' | 'upstreamId',
  summary: PollSummary,
): Promise<Set<number>> {
  const matched = new Set<number>();
  const byKey = new Map(tasks.map((t) => [t[matchField] ?? '', t]));

  for (const r of results) {
    const task = byKey.get(r.matchKey);
    if (!task) continue; // 不属于本批次任务（脏数据）→ 跳过
    matched.add(task.id);
    summary.checked++;

    const status = mapUpstreamStatus(r.status);
    if (!status) {
      summary.skipped++;
      continue;
    }

    if (status === 'success') {
      await updateTaskStatus(task.id, {
        status,
        progress: r.progress ?? '100%',
        response: r.raw,
        startTime: parseUpstreamTime(r.startTime),
        finishTime: parseUpstreamTime(r.finishTime),
      });
      summary.updated++;
    } else if (status === 'failed') {
      const failed = await failTaskWithRefund(task.id, r.failReason ?? 'upstream_failure');
      summary.failed++;
      if (failed) {
        await refundFailedTask(failed);
        summary.refunded++;
      }
    } else {
      // 进行中：更新进度 + 响应（含 startTime），status 统一 processing
      await updateTaskStatus(task.id, {
        status,
        progress: r.progress ?? task.progress,
        response: r.raw,
        startTime: parseUpstreamTime(r.startTime),
      });
      summary.updated++;
    }
  }
  return matched;
}

/**
 * 单次轮询：刷新所有进行中任务
 *
 * 步骤：
 *   1. 取进行中任务，按（taskType, supplierId）分组
 *   2. 每组取渠道 + key；渠道不可用 → 组内任务全部判失败 + 退款
 *   3. 批量请求上游并合并（MJ 按 publicId / Suno 按 upstreamId 匹配）
 *   4. 网络/上游错误 → 记录熔断，任务留待下个 tick
 *   5. 剩余未更新且超 1 小时的任务 → 判失败（timeout）+ 退款
 *
 * @returns 轮询统计
 */
export async function pollTaskUpdates(): Promise<PollSummary> {
  const summary: PollSummary = { checked: 0, updated: 0, failed: 0, refunded: 0, skipped: 0 };
  const tasks = await listInProgressTasks();
  if (tasks.length === 0) return summary;

  // 1. 按（taskType, supplierId）分组
  const groups = new Map<string, { type: TaskType; tasks: TaskRecord[] }>();
  for (const t of tasks) {
    const key = `${t.taskType}:${t.supplierId}`;
    if (!groups.has(key)) groups.set(key, { type: t.taskType as TaskType, tasks: [] });
    groups.get(key)!.tasks.push(t);
  }

  const refreshed = new Set<number>();

  for (const [, group] of groups) {
    const { type, tasks: groupTasks } = group;
    const first = groupTasks[0]!;

    // 2. 取渠道 + key（渠道锁定：提交时记的 channel_key_id）
    const sup = await getSupplierWithKey(first.supplierId, first.channelKeyId);
    if (!sup) {
      // 渠道不可用 → 组内任务全部失败 + 退款
      for (const t of groupTasks) {
        const failed = await failTaskWithRefund(t.id, 'channel_unavailable');
        summary.failed++;
        if (failed) {
          await refundFailedTask(failed);
          summary.refunded++;
        }
      }
      continue;
    }

    // 3. 批量请求上游
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sup.key.keyValue}`,
    };
    let url: string;
    let body: unknown;
    if (type === 'midjourney') {
      url = `${sup.supplier.baseUrl}/mj/task/list-by-condition`;
      headers['mj-api-secret'] = sup.key.keyValue;
      body = { ids: groupTasks.map((t) => t.publicId) };
    } else {
      url = `${sup.supplier.baseUrl}/suno/fetch`;
      body = { ids: groupTasks.map((t) => t.upstreamId ?? '') };
    }

    let upstreamJson: unknown;
    try {
      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!resp.ok) throw new Error(`upstream status ${resp.status}`);
      upstreamJson = await resp.json();
    } catch (err) {
      // 4. 网络/上游错误：记录熔断，任务留待下个 tick（不误杀）
      await recordChannelResult(`supplier:${first.supplierId}:key:${sup.key.id}`, false).catch(() => {});
      console.error(`[task-poller] 渠道 ${first.supplierId} 轮询失败:`, err instanceof Error ? err.message : err);
      continue;
    }
    await recordChannelResult(`supplier:${first.supplierId}:key:${sup.key.id}`, true).catch(() => {});

    // 解析上游响应（MJ 裸数组 / Suno {code, data:[...]}，兼容两种形态）
    let results: UpstreamTaskResult[] = [];
    if (Array.isArray(upstreamJson)) {
      results = type === 'midjourney'
        ? (upstreamJson as Array<Record<string, unknown>>).map((dto) => ({
            matchKey: String(dto.id ?? ''),
            status: String(dto.status ?? ''),
            progress: dto.progress != null ? String(dto.progress) : null,
            failReason: dto.failReason != null ? String(dto.failReason) : null,
            submitTime: dto.submitTime,
            startTime: dto.startTime,
            finishTime: dto.finishTime,
            raw: dto,
          }))
        : [];
    } else if (upstreamJson && typeof upstreamJson === 'object') {
      const data = (upstreamJson as Record<string, unknown>).data;
      if (Array.isArray(data)) {
        results = (data as Array<Record<string, unknown>>).map((dto) => ({
          // Suno：task_id 是上游内部 id（= 我们的 upstreamId）
          matchKey: String(dto.task_id ?? ''),
          status: String(dto.status ?? ''),
          progress: null,
          failReason: dto.fail_reason != null ? String(dto.fail_reason) : null,
          submitTime: dto.submit_time,
          startTime: dto.start_time,
          finishTime: dto.finish_time,
          raw: dto,
        }));
      }
    }

    // 合并
    const matched = await mergeResults(
      groupTasks,
      results,
      type === 'midjourney' ? 'publicId' : 'upstreamId',
      summary,
    );
    for (const id of matched) refreshed.add(id);
  }

  // 5. 超时判失败：未在本轮刷新的进行中任务，且 submit_time 超过 1 小时
  const now = Date.now();
  for (const t of tasks) {
    if (refreshed.has(t.id)) continue;
    const submitAt = t.submitTime ? t.submitTime.getTime() : t.createdAt.getTime();
    if (now - submitAt > TASK_EXPIRE_MS) {
      const failed = await failTaskWithRefund(t.id, 'timeout');
      summary.failed++;
      if (failed) {
        await refundFailedTask(failed);
        summary.refunded++;
      }
    }
  }

  return summary;
}

let schedulerStarted = false;
let inFlight = false;

/**
 * 常驻轮询调度器（随 API 进程启动）。幂等：重复调用只启动一次。
 * inFlight 防重入：上一 tick 未结束则跳过本次（任务退款等操作单实例串行执行）。
 */
export function startTaskPollingScheduler(log: { info: (msg: string) => void }) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const summary = await pollTaskUpdates();
      if (summary.checked > 0 || summary.failed > 0) {
        log.info(`[task-poller] ${JSON.stringify(summary)}`);
      }
    } catch (err) {
      log.info(`[task-poller] tick 失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      inFlight = false;
    }
  };

  // 启动即先跑一次
  void tick();
  const timer = setInterval(() => { void tick(); }, TASK_POLL_INTERVAL_MS);
  timer.unref?.();
  log.info('[task-poller] 任务轮询器已启动（30s/tick）');
}
