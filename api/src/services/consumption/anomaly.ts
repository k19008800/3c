/**
 * 消费异常检测服务 — 即时扫描 consumption_records，落库 consumption_anomalies。
 *
 * 后台「消费运营 → 消费异常检测」页面 GET /admin/consumption/anomalies 前调用一次，
 * 保证列表总是反映最新检测结果；同一周期内同类型异常靠 unique 索引去重（DO NOTHING）。
 *
 * 阈值是代码常量（默认值，后续可升级为数据库可配置）。周期键 period_key = UTC+8 日期 YYYY-MM-DD。
 */
import { db, schema } from '../../db';
import { sql } from 'drizzle-orm';

/** 单次消费异常阈值（¥） */
const SINGLE_SPIKE_COST = '50';
/** 高频调用：10 分钟窗口内请求数上限 */
const HIGH_FREQ_WINDOW_MIN = 10;
const HIGH_FREQ_LIMIT = 60;
/** 时段突增：今日消费 / 昨日同时段 倍率上限 */
const PERIOD_SURGE_MULTIPLIER = 5;
/** 余额骤降：近 1 小时消费占可用余额的比例上限 */
const BALANCE_DROP_RATIO = 0.5;

/** UTC+8 当前日期键 YYYY-MM-DD */
function todayKey(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * 扫描并落库异常。幂等：同一用户+类型+周期只保留一条。
 * 返回本次扫描探测到的异常条数（含已存在的，仅供参考）。
 */
export async function scanConsumptionAnomalies(): Promise<number> {
  const key = todayKey();

  const writes: Array<{
    userId: number;
    anomalyType: string;
    amount: string;
    severity: string;
    detail: unknown;
  }> = [];

  // ── 1. 单次消费异常 critical：单条 cost > ¥50（今日） ──
  const spikes = await db.execute(sql`
    SELECT user_id, cost::text AS amount, model, request_id
    FROM consumption_records
    WHERE created_at >= date_trunc('day', NOW()) - INTERVAL '8 hours'
      AND cost::numeric > ${SINGLE_SPIKE_COST}
    ORDER BY cost DESC
    LIMIT 100
  `);
  for (const r of spikes as any[]) {
    writes.push({
      userId: r.user_id,
      anomalyType: 'single_spike',
      amount: r.amount,
      severity: 'critical',
      detail: { model: r.model, request_id: r.request_id },
    });
  }

  // ── 2. 高频调用 warning：10 分钟窗口请求数 > 60 ──
  const freq = await db.execute(sql`
    SELECT user_id, COUNT(*)::int AS cnt
    FROM consumption_records
    WHERE created_at >= NOW() - (${HIGH_FREQ_WINDOW_MIN} || ' minutes')::INTERVAL
    GROUP BY user_id
    HAVING COUNT(*) > ${HIGH_FREQ_LIMIT}
  `);
  for (const r of freq as any[]) {
    writes.push({
      userId: r.user_id,
      anomalyType: 'high_frequency',
      amount: String(r.cnt),
      severity: 'warning',
      detail: { window_minutes: HIGH_FREQ_WINDOW_MIN, requests: r.cnt },
    });
  }

  // ── 3. 时段突增 critical：今日消费 vs 昨日同时段 > 5x ──
  //    今日 = UTC+8 自然日 00:00 至今；昨日同时段 = 昨日 00:00 至昨日 UTC+8 当前时刻
  const surge = await db.execute(sql`
    WITH today AS (
      SELECT user_id, SUM(cost::numeric) AS spend
      FROM consumption_records
      WHERE created_at >= date_trunc('day', NOW()) - INTERVAL '8 hours'
      GROUP BY user_id
    ), yesterday AS (
      SELECT user_id, SUM(cost::numeric) AS spend
      FROM consumption_records
      WHERE created_at >= date_trunc('day', NOW()) - INTERVAL '32 hours'
        AND created_at < date_trunc('day', NOW()) - INTERVAL '8 hours'
      GROUP BY user_id
    )
    SELECT t.user_id, t.spend::text AS amount,
           COALESCE(y.spend, 0)::text AS yesterday_spend
    FROM today t
    LEFT JOIN yesterday y ON y.user_id = t.user_id
    WHERE COALESCE(y.spend, 0) > 0
      AND t.spend > COALESCE(y.spend, 0) * ${PERIOD_SURGE_MULTIPLIER}
  `);
  for (const r of surge as any[]) {
    writes.push({
      userId: r.user_id,
      anomalyType: 'period_surge',
      amount: r.amount,
      severity: 'critical',
      detail: { yesterday_spend: r.yesterday_spend, multiplier: PERIOD_SURGE_MULTIPLIER },
    });
  }

  // ── 4. 余额骤降 warning：近 1 小时消费 > 可用余额 50% ──
  const drops = await db.execute(sql`
    SELECT cr.user_id,
           SUM(cr.cost::numeric)::text AS amount,
           cb.available_balance::text AS available_balance
    FROM consumption_records cr
    JOIN customer_balances cb ON cb.user_id = cr.user_id
    WHERE cr.created_at >= NOW() - INTERVAL '1 hour'
      AND cb.available_balance::numeric > 0
    GROUP BY cr.user_id, cb.available_balance
    HAVING SUM(cr.cost::numeric) > cb.available_balance::numeric * ${BALANCE_DROP_RATIO}
  `);
  for (const r of drops as any[]) {
    writes.push({
      userId: r.user_id,
      anomalyType: 'balance_drop',
      amount: r.amount,
      severity: 'warning',
      detail: { available_balance: r.available_balance, ratio: BALANCE_DROP_RATIO },
    });
  }

  if (writes.length === 0) return 0;

  // 一次性批量 upsert（同周期同类型冲突则跳过）
  // 注意：postgres-js 的 db.execute 不返回可靠 rowCount，返回的是本次尝试写入条数
  for (const w of writes) {
    await db.execute(sql`
      INSERT INTO consumption_anomalies
        (user_id, anomaly_type, amount, severity, period_key, detail, created_at, updated_at)
      VALUES
        (${w.userId}, ${w.anomalyType}, ${w.amount}, ${w.severity}, ${key},
         ${JSON.stringify(w.detail ?? {})}::jsonb, NOW(), NOW())
      ON CONFLICT (user_id, anomaly_type, period_key) DO NOTHING
    `);
  }

  return writes.length;
}
