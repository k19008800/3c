/**
 * 模型健康度聚合 Worker
 *
 * 从 conversation_context_records（全量留痕，成功/失败/402 都记）滚动聚合
 * 到 model_health_stats 5 分钟桶。API 只查桶表，不实时扫明细。
 *
 * 口径：
 *   - 成功 = status = 'succeeded'；失败 = status <> 'succeeded'
 *   - 延迟(ms) = completed_at - occurred_at，桶边界见 lib/latency.ts
 *   - platform_model = requested_model（客户请求的标准模型名）
 *   - supplier_id IS NOT NULL（跳过 mock 回退的请求）
 *
 * 节奏：每 30s tick；每次处理「已完成的桶」+ 重算「当前进行中的桶」。
 * 自愈：内存游标 lastCompleted 记录已处理的桶起点，缺桶跨 tick 自动补。
 */

import { db, schema } from '../../db';
import { sql } from 'drizzle-orm';
import { LATENCY_BOUNDARIES } from '../../lib/latency';
import type { Histogram } from '../../lib/latency';

/** 桶宽（5 分钟） */
export const BUCKET_MS = 5 * 60 * 1000;

/** 最大补算回溯窗口（6 小时），避免停机后无限追桶 */
const MAX_BACKFILL_MS = 6 * 60 * 60 * 1000;

/** 聚合 tick 间隔（30s） */
const TICK_INTERVAL_MS = 30 * 1000;

let schedulerStarted = false;
/** 已完整处理的桶起点（ms），启动时置为上一桶，保证启动即补最近 10 分钟 */
let lastCompleted = Number.NaN;

/** 5 分钟对齐的桶起点 */
export function bucketStartFrom(ts: number): number {
  return Math.floor(ts / BUCKET_MS) * BUCKET_MS;
}

/**
 * 构造延迟桶 CASE 表达式：
 *   WHEN lat IS NULL THEN 0
 *   WHEN lat < 50 THEN 0
 *   WHEN lat < 100 THEN 50
 *   ...
 *   ELSE 5000
 */
function latencyBucketExpr(latExpr: string): string {
  const bnd = LATENCY_BOUNDARIES;
  let expr = `CASE WHEN ${latExpr} IS NULL THEN 0`;
  for (let i = 1; i < bnd.length; i++) {
    expr += ` WHEN ${latExpr} < ${bnd[i]} THEN ${bnd[i - 1]}`;
  }
  expr += ` ELSE ${bnd[bnd.length - 1]} END`;
  return expr;
}

interface FoldedRow {
  requestCount: number;
  successCount: number;
  errorCount: number;
  errorCodeDist: Record<string, number>;
  latencyHist: Histogram;
  supplierModelId: number | null;
}

/** 聚合查询的单行结果（db.execute 返回 unknown，显式 cast） */
interface AggRow {
  requested_model: string;
  supplier_id: number;
  supplier_model_id: number | null;
  is_error: boolean;
  error_code: string | null;
  lat_bucket: number;
  cnt: number;
}

/**
 * 聚合一个 [start, end) 区间的对话留痕 → 桶表 upsert
 */
export async function aggregateBucket(startMs: number, endMs: number): Promise<void> {
  const latExpr = `EXTRACT(EPOCH FROM (completed_at - occurred_at)) * 1000`;
  const bucketExpr = latencyBucketExpr(latExpr);

  const result = await db.execute(sql`
    SELECT
      requested_model,
      supplier_id,
      supplier_model_id,
      (status <> 'succeeded') AS is_error,
      error_code,
      ${sql.raw(bucketExpr)} AS lat_bucket,
      COUNT(*)::int AS cnt
    FROM conversation_context_records
    WHERE occurred_at >= to_timestamp(${startMs} / 1000.0)
      AND occurred_at < to_timestamp(${endMs} / 1000.0)
      AND supplier_id IS NOT NULL
    GROUP BY requested_model, supplier_id, supplier_model_id, is_error, error_code, lat_bucket
  `) as unknown as AggRow[];

  // 按 model → supplier 两级折叠（避免模型名含分隔符冲突）
  const folded = new Map<string, Map<number, FoldedRow>>();
  for (const r of result) {
    let bySupplier = folded.get(r.requested_model);
    if (!bySupplier) {
      bySupplier = new Map();
      folded.set(r.requested_model, bySupplier);
    }
    let f = bySupplier.get(r.supplier_id);
    if (!f) {
      f = {
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        errorCodeDist: {},
        latencyHist: {},
        supplierModelId: r.supplier_model_id,
      };
      bySupplier.set(r.supplier_id, f);
    }
    f.requestCount += r.cnt;
    if (r.is_error) {
      f.errorCount += r.cnt;
      if (r.error_code) {
        f.errorCodeDist[r.error_code] = (f.errorCodeDist[r.error_code] ?? 0) + r.cnt;
      }
    } else {
      f.successCount += r.cnt;
    }
    const bk = String(r.lat_bucket ?? 0);
    f.latencyHist[bk] = (f.latencyHist[bk] ?? 0) + r.cnt;
    if (r.supplier_model_id != null) f.supplierModelId = r.supplier_model_id;
  }

  if (folded.size === 0) return;

  const bucketStart = new Date(startMs);
  for (const [platformModel, bySupplier] of folded) {
    for (const [supplierId, f] of bySupplier) {
      await db
        .insert(schema.modelHealthStats)
        .values({
          bucketStart,
          platformModel,
          supplierId,
          supplierModelId: f.supplierModelId,
          requestCount: f.requestCount,
          successCount: f.successCount,
          errorCount: f.errorCount,
          errorCodeDist: f.errorCodeDist,
          latencyHist: f.latencyHist,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.modelHealthStats.bucketStart, schema.modelHealthStats.platformModel, schema.modelHealthStats.supplierId],
          set: {
            requestCount: f.requestCount,
            successCount: f.successCount,
            errorCount: f.errorCount,
            errorCodeDist: f.errorCodeDist,
            latencyHist: f.latencyHist,
            supplierModelId: f.supplierModelId,
            updatedAt: new Date(),
          },
        });
    }
  }
}

/** 单次 tick：处理全部已完成桶 + 当前进行中桶 */
async function tick(): Promise<void> {
  const now = Date.now();
  const curBucket = bucketStartFrom(now);

  if (!Number.isFinite(lastCompleted)) {
    lastCompleted = curBucket - 2 * BUCKET_MS; // 启动补最近 10 分钟
  }
  const oldestAllowed = now - MAX_BACKFILL_MS;
  if (lastCompleted < oldestAllowed) lastCompleted = oldestAllowed;

  // 1. 已完成的桶（[lastCompleted, curBucket) 每个整 5min 桶）
  for (let b = lastCompleted; b < curBucket; b += BUCKET_MS) {
    await aggregateBucket(b, b + BUCKET_MS);
  }
  // 2. 当前进行中的桶（[curBucket, now]，每 tick 重算）
  await aggregateBucket(curBucket, now);

  lastCompleted = curBucket;
}

/**
 * 常驻调度器（随 API 进程启动）。幂等：重复调用只启动一次。
 */
export function startModelHealthAggregator(log: { info: (msg: string) => void }) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // 启动即先跑一次，尽早出数
  void tick()
    .catch((err) => {
      log.info(`[model-health] 启动聚合失败: ${err.message}`);
    });

  const timer = setInterval(() => {
    void tick().catch((err: Error) => {
      log.info(`[model-health] 聚合 tick 失败: ${err.message}`);
    });
  }, TICK_INTERVAL_MS);

  // 不阻塞进程退出
  timer.unref?.();
  log.info('[model-health] 聚合 Worker 已启动（30s/tick，5min 桶）');
}
