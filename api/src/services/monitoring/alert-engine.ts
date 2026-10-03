/**
 * 告警检测引擎 — PRD §5.4 告警中心
 *
 * 常驻定时任务（每 60s tick）：
 *   1. 读取 enabled 的 monitoring_rules
 *   2. 从 conversation_context_records（网关留痕）聚合最近窗口的
 *      error_rate（失败率 %）与 response_latency（P99 延迟 ms），
 *      从 consumption_records 聚合 cache_hit_rate 与 cost_spike
 *   3. 逐规则对比阈值：超限 → 创建 firing alert；回落 → 把 firing alert 置 resolved
 *   4. 告警去重：同一规则已有未 resolved（firing/acknowledged）alert 时不重复创建，
 *      防止每 60s 刷一条（防告警风暴，边界 ALERT-001）
 *
 * 当前可评估指标（有数据源）：error_rate / response_latency / qps /
 * cache_hit_rate / cost_spike。vendor_health / balance_low 暂无接入数据源，
 * 引擎跳过（measure 置 null），不产生误报。
 *
 * 纯函数 evaluateRules 与 DB I/O 分离，便于单测（.test.ts）。
 *
 * @see docs/ref-5.4-alert-rules.md
 * @module services/monitoring
 */

import { db, schema } from '../../db/index.js';
import { sql, eq, inArray, and } from 'drizzle-orm';
import type { MonitoringRule, NewAlert, Alert } from '../../db/schema/alert-rules.js';

/** 引擎评估窗口（秒）——固定 5 分钟，与任务规格「最近 5 分钟」一致 */
export const EVAL_WINDOW_SEC = 300;
/** tick 间隔（60s） */
const TICK_INTERVAL_MS = 60 * 1000;

/** 一次 tick 聚合出的全局指标（无法评估的为 null） */
export interface MeasuredMetrics {
  /** 失败率百分比 0-100（status <> 'succeeded' 占比） */
  errorRatePct: number | null;
  /** P99 响应延迟（毫秒，仅 succeeded 请求） */
  p99LatencyMs: number | null;
  /** 每秒请求数（窗口内总请求 / 窗口秒数） */
  qps: number | null;
  /** 缓存命中率百分比 0-100（cache_hit_tokens / total_tokens） */
  cacheHitRatePct: number | null;
  /** 窗口内总消费（元） */
  costYuan: number | null;
}

/** 评估结果：需要新建的 alert 与需要 resolved 的 alert id 列表 */
export interface EvaluationResult {
  toCreate: NewAlert[];
  toResolve: number[];
}

/** 指标 → 从 MeasuredMetrics 取数的映射（higher-is-worse 类指标统一 value > threshold 触发） */
function metricValue(metric: string, m: MeasuredMetrics): number | null {
  switch (metric) {
    case 'error_rate': return m.errorRatePct;
    case 'response_latency': return m.p99LatencyMs;
    case 'qps': return m.qps;
    case 'cache_hit_rate': return m.cacheHitRatePct;
    case 'cost_spike': return m.costYuan;
    // vendor_health / balance_low 暂无数据源，跳过评估
    default: return null;
  }
}

function metricUnit(metric: string): string {
  switch (metric) {
    case 'error_rate': return '%';
    case 'response_latency': return 'ms';
    case 'qps': return 'req/s';
    case 'cache_hit_rate': return '%';
    case 'cost_spike': return '元';
    default: return '';
  }
}

/**
 * 纯函数：根据规则 + 当前指标 + 已存在的未解决告警，算出要新建/解决哪些 alert。
 *
 * 触发语义（higher-is-worse）：value > threshold → 应处于 firing。
 *   - 超限且该规则没有未解决 alert → 新建 firing
 *   - 超限但已有未解决 alert → 跳过（去重）
 *   - 回落到 threshold 及以下且存在未解决 alert → resolve 它
 *
 * @param rules      启用中的规则
 * @param openAlerts 规则 id → 当前未解决（firing/acknowledged）alert
 * @param metrics    本次 tick 聚合的全局指标
 */
export function evaluateRules(
  rules: MonitoringRule[],
  openAlerts: Map<number, Alert>,
  metrics: MeasuredMetrics,
): EvaluationResult {
  const toCreate: NewAlert[] = [];
  const toResolve: number[] = [];

  for (const rule of rules) {
    const value = metricValue(rule.metric, metrics);
    if (value == null) continue; // 无数据源，跳过
    const open = openAlerts.get(rule.id);
    const breached = value > rule.threshold;

    if (breached) {
      if (!open) {
        const unit = metricUnit(rule.metric);
        toCreate.push({
          ruleId: rule.id,
          status: 'firing',
          metricValue: value,
          threshold: rule.threshold,
          message: `${rule.name}：${rule.metric} 当前 ${value.toFixed(2)}${unit}（阈值 ${rule.threshold}${unit}）`,
          firedAt: new Date(),
        });
      }
      // 已有 open alert：保持现状，不重复创建
    } else if (open) {
      // 指标回落 → 自动恢复
      toResolve.push(open.id);
    }
  }

  return { toCreate, toResolve };
}

/**
 * 从网关留痕聚合 error_rate / p99 latency / qps（最近 windowSec 秒）。
 * 无数据时各值为 null，不触发任何告警。
 */
async function measureGatewayMetrics(windowSec: number): Promise<Pick<MeasuredMetrics, 'errorRatePct' | 'p99LatencyMs' | 'qps'>> {
  const gate = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status <> 'succeeded')::int AS errors,
      percentile_cont(0.99) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (completed_at - occurred_at)) * 1000
      ) AS p99_ms
    FROM conversation_context_records
    WHERE occurred_at >= now() - (${windowSec} || ' seconds')::interval
      AND completed_at IS NOT NULL
  `) as unknown as Array<{ total: number; errors: number; p99_ms: number | null }>;

  const row = gate[0];
  if (!row || row.total === 0) {
    return { errorRatePct: null, p99LatencyMs: null, qps: null };
  }
  return {
    errorRatePct: (row.errors / row.total) * 100,
    p99LatencyMs: row.p99_ms != null ? Number(row.p99_ms) : null,
    qps: row.total / windowSec,
  };
}

/**
 * 从消费记录聚合 cache_hit_rate / cost_spike（最近 windowSec 秒）。
 */
async function measureBillingMetrics(windowSec: number): Promise<Pick<MeasuredMetrics, 'cacheHitRatePct' | 'costYuan'>> {
  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
      COALESCE(SUM(cache_hit_tokens), 0)::bigint AS cache_tokens,
      COALESCE(SUM(cost), 0)::float AS cost_yuan
    FROM consumption_records
    WHERE created_at >= now() - (${windowSec} || ' seconds')::interval
  `) as unknown as Array<{ total_tokens: string | number; cache_tokens: string | number; cost_yuan: number }>;

  const row = rows[0];
  if (!row || Number(row.total_tokens) === 0) {
    return { cacheHitRatePct: null, costYuan: null };
  }
  const total = Number(row.total_tokens);
  const cache = Number(row.cache_tokens);
  return {
    cacheHitRatePct: total > 0 ? (cache / total) * 100 : null,
    costYuan: Number(row.cost_yuan) || 0,
  };
}

/** 单次 tick：聚合指标 → 评估规则 → 新建/恢复告警 */
export async function tickAlertEngine(): Promise<EvaluationResult> {
  // 1. 启用中的规则
  const rules = await db.select().from(schema.monitoringRules).where(eq(schema.monitoringRules.enabled, true));
  if (rules.length === 0) return { toCreate: [], toResolve: [] };

  // 2. 这些规则当前未解决的 alert（firing/acknowledged），按 rule_id 建索引
  const ruleIds = rules.map((r) => r.id);
  const openRows = await db
    .select()
    .from(schema.alerts)
    .where(and(
      inArray(schema.alerts.ruleId, ruleIds),
      inArray(schema.alerts.status, ['firing', 'acknowledged']),
    ));
  const openAlerts = new Map<number, Alert>();
  for (const a of openRows) openAlerts.set(a.ruleId, a);

  // 3. 聚合指标
  const [gate, bill] = await Promise.all([
    measureGatewayMetrics(EVAL_WINDOW_SEC),
    measureBillingMetrics(EVAL_WINDOW_SEC),
  ]);
  const metrics: MeasuredMetrics = { ...gate, ...bill };

  // 4. 纯函数评估
  const result = evaluateRules(rules, openAlerts, metrics);

  // 5. 落库：新建 firing + 恢复回落
  for (const alert of result.toCreate) {
    await db.insert(schema.alerts).values(alert);
  }
  const now = new Date();
  for (const alertId of result.toResolve) {
    await db
      .update(schema.alerts)
      .set({ status: 'resolved', resolvedAt: now })
      .where(eq(schema.alerts.id, alertId));
  }

  return result;
}

let schedulerStarted = false;

/**
 * 常驻调度器（随 API 进程启动）。幂等：重复调用只启动一次。
 */
export function startAlertEngine(log: { info: (msg: string) => void; error?: (msg: string) => void }) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  void tickAlertEngine()
    .then((r) => {
      if (r.toCreate.length > 0) log.info(`[alert-engine] 启动评估：新建 ${r.toCreate.length} 条，恢复 ${r.toResolve.length} 条`);
    })
    .catch((err: Error) => {
      log.info(`[alert-engine] 启动评估失败: ${err.message}`);
    });

  const timer = setInterval(() => {
    void tickAlertEngine()
      .then((r) => {
        if (r.toCreate.length > 0 || r.toResolve.length > 0) {
          log.info(`[alert-engine] tick：新建 ${r.toCreate.length} 条，恢复 ${r.toResolve.length} 条`);
        }
      })
      .catch((err: Error) => {
        log.info(`[alert-engine] tick 失败: ${err.message}`);
      });
  }, TICK_INTERVAL_MS);

  timer.unref?.();
  log.info(`[alert-engine] 告警检测引擎已启动（${TICK_INTERVAL_MS / 1000}s/tick，${EVAL_WINDOW_SEC}s 窗口）`);
}
