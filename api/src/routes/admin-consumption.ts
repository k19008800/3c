/**
 * 后台「消费运营」API — 消费明细追踪 / 实时消费流水 / 消费异常检测 / 余额预警
 *
 * 端点：
 *   GET  /api/v1/admin/consumption/tracking             — 按用户聚合的消费明细（period / keyword 筛选）
 *   GET  /api/v1/admin/consumption/stream               — 近实时消费流（metrics + 最近流水）
 *   GET  /api/v1/admin/consumption/anomalies            — 异常列表（查询前即时扫描一次）
 *   POST /api/v1/admin/consumption/anomalies/:id/:op    — 处理异常（resolve / ignore，写审计）
 *   GET  /api/v1/admin/balance-alert-config             — 余额预警阈值配置
 *   PUT  /api/v1/admin/balance-alert-config             — 保存阈值配置（写审计）
 *   GET  /api/v1/admin/balance-alerts                   — 低余额预警列表 + 汇总
 *   POST /api/v1/admin/balance-alerts/:userId/notify    — 手动提醒（站内信 + 邮件，写审计）
 *
 * 时区约定：业务时间按 UTC+8，数据库存 UTC。period / 窗口边界用「now+8h 后取 UTC 日期」模式
 * （对齐 services/audit/retention.ts 的 cstDate）。
 * 审计约定：常规查询不写 audit_logs；处理 / 通知 / 配置保存等操作类写 audit_logs。
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, gte, lte, sql, desc, count } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { sendMail } from '../services/mailer';
import { scanConsumptionAnomalies } from '../services/consumption/anomaly';
import { UnauthorizedError, ForbiddenError, ValidationError, NotFoundError } from '../lib/errors';

/* ───────── 鉴权（对齐 admin-conversation-records.ts） ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

async function adminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

/* ───────── 工具 ───────── */

/** 余额预警配置默认值 */
const DEFAULT_ALERT_CONFIG = { lowBalanceThreshold: 10, warnMultiplier: 2 };

/** UTC+8 偏移常量（小时） */
const CST_OFFSET_MS = 8 * 3600 * 1000;

/** 写入操作审计日志 */
async function writeAudit(request: any, action: string, resourceId: string | null, details: unknown) {
  const ctx = request.userContext ?? {};
  await db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource: 'consumption',
    resourceId,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/** 将 db.execute 返回的 count/sum 字符串转数字 */
function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

/**
 * period → 查询下界（UTC+8 对齐后的 UTC 时间）。
 * today / yesterday / week(周一) / month(1 号) 的 00:00(+8) 对应 UTC 前一天的 16:00。
 */
function periodStart(period: string): Date {
  const now = new Date(Date.now() + CST_OFFSET_MS); // 模拟 UTC+8 时钟
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  const dow = now.getUTCDay(); // 0=周日
  let startCST: Date;
  switch (period) {
    case 'yesterday':
      startCST = new Date(Date.UTC(y, m - 1, d - 1));
      break;
    case 'week': {
      const mondayOffset = (dow + 6) % 7; // 周一到今天的偏移
      startCST = new Date(Date.UTC(y, m - 1, d - mondayOffset));
      break;
    }
    case 'month':
      startCST = new Date(Date.UTC(y, m - 1, 1));
      break;
    case 'today':
    default:
      startCST = new Date(Date.UTC(y, m - 1, d));
  }
  return new Date(startCST.getTime() - CST_OFFSET_MS); // 转回真实 UTC
}

/**
 * GET /api/v1/admin/consumption/tracking — 按用户聚合的消费明细
 * query: keyword（email/model/供应商 模糊）、period（today|yesterday|week|month）、page_size
 */
async function trackingHandler(request: any, reply: any) {
  const q = (request.query ?? {}) as Record<string, string>;
  const period = ['today', 'yesterday', 'week', 'month'].includes(String(q.period)) ? String(q.period) : 'today';
  const pageSize = parsePositiveInt(q.page_size, 50, 200);
  const keyword = String(q.keyword ?? '').trim();

  const since = periodStart(period);
  const kw = keyword ? `%${keyword}%` : null;

  // 列表：base CTE（LEFT JOIN users/suppliers 取 email/vendor 名）→ 按用户聚合
  const listRows = await db.execute(sql`
    WITH base AS (
      SELECT cr.user_id, cr.model, cr.total_tokens, cr.cost,
             u.email,
             COALESCE(s.name, '') AS vendor
      FROM consumption_records cr
      LEFT JOIN users u ON u.id = cr.user_id
      LEFT JOIN suppliers s ON s.id = cr.supplier_id
      WHERE cr.created_at >= ${since.toISOString()}
        ${kw ? sql`AND (u.email ILIKE ${kw} OR cr.model ILIKE ${kw} OR COALESCE(s.name, '') ILIKE ${kw})` : sql``}
    ),
    agg AS (
      SELECT user_id, MAX(email) AS email,
             COUNT(*)::int AS request_count,
             SUM(total_tokens)::bigint AS total_tokens,
             SUM(cost::numeric) AS total_cost
      FROM base
      GROUP BY user_id
    ),
    top_model AS (
      SELECT DISTINCT ON (user_id) user_id, model AS top_model
      FROM (
        SELECT user_id, model, COUNT(*) AS cnt
        FROM base GROUP BY user_id, model
      ) t
      ORDER BY user_id, cnt DESC, model
    ),
    top_vendor AS (
      SELECT DISTINCT ON (user_id) user_id, vendor AS top_vendor
      FROM (
        SELECT user_id, vendor, COUNT(*) AS cnt
        FROM base WHERE vendor <> '' GROUP BY user_id, vendor
      ) t
      ORDER BY user_id, cnt DESC, vendor
    )
    SELECT a.user_id, a.email, a.request_count, a.total_tokens, a.total_cost::text,
           COALESCE(tm.top_model, '') AS top_model,
           COALESCE(tv.top_vendor, '') AS top_vendor
    FROM agg a
    LEFT JOIN top_model tm ON tm.user_id = a.user_id
    LEFT JOIN top_vendor tv ON tv.user_id = a.user_id
    ORDER BY a.total_cost DESC
    LIMIT ${pageSize}
  `);

  const list = (listRows as any[]).map((r) => ({
    user_id: toNum(r.user_id),
    user_email: r.email ?? '',
    request_count: toNum(r.request_count),
    total_tokens: toNum(r.total_tokens),
    total_cost: toNum(r.total_cost),
    top_model: r.top_model ?? '',
    top_vendor: r.top_vendor ?? '',
  }));

  // summary：与 list 同 where 的总体指标
  const summaryRows = await db.execute(sql`
    SELECT COUNT(DISTINCT cr.user_id)::int AS active_users,
           COUNT(DISTINCT cr.model)::int AS model_count,
           COUNT(*)::bigint AS total_requests,
           COALESCE(SUM(cr.cost::numeric), 0)::text AS total_cost
    FROM consumption_records cr
    LEFT JOIN users u ON u.id = cr.user_id
    LEFT JOIN suppliers s ON s.id = cr.supplier_id
    WHERE cr.created_at >= ${since.toISOString()}
      ${kw ? sql`AND (u.email ILIKE ${kw} OR cr.model ILIKE ${kw} OR COALESCE(s.name, '') ILIKE ${kw})` : sql``}
  `);
  const s = (summaryRows as any[])[0] || {};

  return reply.send({
    data: {
      summary: {
        active_users: toNum(s.active_users),
        model_count: toNum(s.model_count),
        total_requests: toNum(s.total_requests),
        total_cost: toNum(s.total_cost),
      },
      list,
    },
  });
}

/**
 * GET /api/v1/admin/consumption/stream — 近实时消费流
 * query: vendor（供应商 id，可选）
 * metrics 为近似值（基于 consumption_records 的时间窗口统计，无在途计数器）：
 *   qps = 近 5 分钟请求数 / 300；burn_rate = 近 1 分钟消费额(¥/min)
 *   active_requests = 近 5 分钟 distinct request_id；success_rate = 近 5 分钟无 error 占比
 */
async function streamHandler(request: any, reply: any) {
  const q = (request.query ?? {}) as Record<string, string>;
  const vendor = q.vendor ? parsePositiveInt(q.vendor, 0) : null;

  const metrics = await db.execute(sql`
    SELECT
      (COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '5 minutes'))::int AS five_min_count,
      (COUNT(DISTINCT request_id) FILTER (WHERE created_at >= NOW() - INTERVAL '5 minutes'))::int AS active_requests,
      COALESCE(SUM(cost::numeric) FILTER (WHERE created_at >= NOW() - INTERVAL '1 minute'), 0)::text AS burn_rate,
      (COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '5 minutes' AND error_code IS NULL))::int AS ok_5min,
      (COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '5 minutes'))::int AS total_5min
    FROM consumption_records
    ${vendor ? sql`WHERE supplier_id = ${vendor}` : sql``}
  `);
  const m = (metrics as any[])[0] || {};
  const total5 = toNum(m.total_5min);

  const streamRows = await db.execute(sql`
    SELECT cr.id, cr.created_at, cr.model, cr.total_tokens, cr.cost::text,
           cr.error_code,
           COALESCE(u.email, '') AS user,
           COALESCE(s.name, '') AS vendor
    FROM consumption_records cr
    LEFT JOIN users u ON u.id = cr.user_id
    LEFT JOIN suppliers s ON s.id = cr.supplier_id
    ${vendor ? sql`WHERE cr.supplier_id = ${vendor}` : sql``}
    ORDER BY cr.created_at DESC
    LIMIT 30
  `);

  const stream = (streamRows as any[]).map((r) => ({
    id: toNum(r.id),
    timestamp: r.created_at ? new Date(r.created_at).toLocaleString('zh-CN', { hour12: false }) : '',
    user: r.user ?? '',
    model: r.model ?? '',
    vendor: r.vendor ?? '',
    tokens: toNum(r.total_tokens),
    cost: toNum(r.cost),
    latency: null, // 无延迟数据源
    status: r.error_code ? 'error' : 'success',
  }));

  return reply.send({
    data: {
      metrics: {
        qps: Math.round(toNum(m.five_min_count) / 300 * 100) / 100,
        burn_rate: Math.round(toNum(m.burn_rate) * 100) / 100,
        active_requests: toNum(m.active_requests),
        success_rate: total5 > 0 ? Math.round((toNum(m.ok_5min) / total5) * 1000) / 10 : 0,
      },
      stream,
    },
  });
}

/**
 * GET /api/v1/admin/consumption/anomalies — 异常列表（查询前即时扫描）
 * query: severity、page_size
 */
async function anomaliesHandler(request: any, reply: any) {
  await scanConsumptionAnomalies();

  const q = (request.query ?? {}) as Record<string, string>;
  const pageSize = parsePositiveInt(q.page_size, 50, 200);
  const severity = String(q.severity ?? '').trim();

  const conditions = [sql`${schema.consumptionAnomalies.status} <> 'ignored'`];
  if (severity) conditions.push(eq(schema.consumptionAnomalies.severity, severity));
  const where = and(...conditions);

  const rows = await db
    .select({
      id: schema.consumptionAnomalies.id,
      createdAt: schema.consumptionAnomalies.createdAt,
      userId: schema.consumptionAnomalies.userId,
      email: schema.users.email,
      anomalyType: schema.consumptionAnomalies.anomalyType,
      amount: schema.consumptionAnomalies.amount,
      severity: schema.consumptionAnomalies.severity,
      status: schema.consumptionAnomalies.status,
    })
    .from(schema.consumptionAnomalies)
    .leftJoin(schema.users, eq(schema.consumptionAnomalies.userId, schema.users.id))
    .where(where)
    .orderBy(desc(schema.consumptionAnomalies.createdAt))
    .limit(pageSize);

  const summaryRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE severity = 'critical' AND status <> 'ignored')::int AS critical,
      COUNT(*) FILTER (WHERE severity = 'warning' AND status <> 'ignored')::int AS warning,
      COUNT(*) FILTER (WHERE severity = 'info' AND status <> 'ignored')::int AS info,
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved
    FROM consumption_anomalies
  `);
  const s = (summaryRows as any[])[0] || {};

  const list = rows.map((r) => ({
    id: r.id,
    created_at: r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false }) : '',
    user_email: r.email ?? '',
    anomaly_type: r.anomalyType,
    amount: toNum(r.amount),
    severity: r.severity,
    status: r.status,
  }));

  return reply.send({
    data: {
      summary: { critical: toNum(s.critical), warning: toNum(s.warning), info: toNum(s.info), resolved: toNum(s.resolved) },
      list,
    },
  });
}

/**
 * POST /api/v1/admin/consumption/anomalies/:id/:op — 处理异常（resolve / ignore）
 */
async function anomalyActionHandler(request: any, reply: any) {
  const { id, op } = request.params as { id: string; op: string };
  const anomalyId = parsePositiveInt(id, 0);
  if (!anomalyId) throw new ValidationError('Invalid anomaly id');
  if (op !== 'resolve' && op !== 'ignore') throw new ValidationError(`Invalid op: ${op}`);

  const status = op === 'resolve' ? 'resolved' : 'ignored';
  const res = await db
    .update(schema.consumptionAnomalies)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.consumptionAnomalies.id, anomalyId));

  if ((res as any)?.rowCount === 0) throw new NotFoundError('Anomaly', id);

  await writeAudit(request, `consumption_anomaly.${op}`, String(anomalyId), {});
  return reply.send({ data: { id: anomalyId, status } });
}

/* ───────── 余额预警 ───────── */

/** 读取余额预警阈值配置（system_config key=balance_alert） */
async function readAlertConfig(): Promise<typeof DEFAULT_ALERT_CONFIG> {
  const rows = await db
    .select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, 'balance_alert'));
  try {
    return { ...DEFAULT_ALERT_CONFIG, ...JSON.parse(rows[0]?.value ?? '{}') };
  } catch {
    return { ...DEFAULT_ALERT_CONFIG };
  }
}

/** 校验并保存配置 */
async function saveAlertConfig(updatedBy: number | null, input: Record<string, unknown>) {
  const cfg = { ...DEFAULT_ALERT_CONFIG };
  if (input.lowBalanceThreshold !== undefined) {
    const v = Number(input.lowBalanceThreshold);
    if (!isNaN(v) && v >= 0) cfg.lowBalanceThreshold = v;
  }
  if (input.warnMultiplier !== undefined) {
    const v = Number(input.warnMultiplier);
    if (!isNaN(v) && v >= 1) cfg.warnMultiplier = v;
  }
  await db.execute(sql`
    INSERT INTO system_config (key, value, description, created_at, updated_at)
    VALUES ('balance_alert', ${JSON.stringify(cfg)}, '余额预警阈值配置（低余额阈值 ¥ / 周消费预警倍率）', NOW(), NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = ${updatedBy}, updated_at = NOW()
  `);
  return cfg;
}

/**
 * 耗尽预估文案：按近 7 天消费速率估算余额耗尽时间（UTC+8 时间语义）。
 * 余额 ≤0 → 已耗尽；周消费 ≤0 → 永不耗尽；否则按速率折算小时/天。
 */
function exhaustionEstimate(balance: number, weekSpend: number): string {
  if (balance <= 0) return '已耗尽';
  if (weekSpend <= 0) return '暂无消耗';
  const hours = (balance / (weekSpend / 7)) * 24;
  if (hours <= 1) return '1小时内';
  if (hours < 24) return `${Math.ceil(hours)}小时后`;
  const days = Math.ceil(hours / 24);
  return days === 1 ? '明天' : `${days}天后`;
}

/**
 * GET /api/v1/admin/balance-alerts — 低余额预警列表 + 汇总
 */
async function alertsHandler(request: any, reply: any) {
  const cfg = await readAlertConfig();

  const rows = await db.execute(sql`
    SELECT cb.user_id,
           COALESCE(u.email, '') AS user_email,
           cb.available_balance::text AS balance,
           COALESCE(w.week_spend, 0)::text AS week_spend,
           n.last_notified
    FROM customer_balances cb
    JOIN users u ON u.id = cb.user_id
    LEFT JOIN (
      SELECT user_id, SUM(cost::numeric) AS week_spend
      FROM consumption_records
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY user_id
    ) w ON w.user_id = cb.user_id
    LEFT JOIN LATERAL (
      SELECT created_at AS last_notified
      FROM notifications
      WHERE user_id = cb.user_id AND type = 'balance_alert'
      ORDER BY created_at DESC
      LIMIT 1
    ) n ON true
    ORDER BY cb.available_balance::numeric ASC
    LIMIT 200
  `);

  const list = (rows as any[]).map((r) => ({
    user_id: toNum(r.user_id),
    user_email: r.user_email ?? '',
    balance: toNum(r.balance),
    week_spend: toNum(r.week_spend),
    exhaustion_estimate: exhaustionEstimate(toNum(r.balance), toNum(r.week_spend)),
    last_notified: r.last_notified ? new Date(r.last_notified).toISOString().slice(0, 10) : null,
  }));

  // summary：仅统计有可用余额的账户
  const summaryRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE cb.available_balance::numeric = 0)::int AS exhausted_count,
      COUNT(*) FILTER (WHERE cb.available_balance::numeric < ${cfg.lowBalanceThreshold} AND cb.available_balance::numeric > 0)::int AS low_balance_count,
      COUNT(*) FILTER (WHERE w.week_spend > cb.available_balance::numeric * ${cfg.warnMultiplier})::int AS warning_count,
      COUNT(DISTINCT n.user_id) FILTER (WHERE n.created_at >= NOW() - INTERVAL '1 day')::int AS notified_today
    FROM customer_balances cb
    LEFT JOIN (
      SELECT user_id, SUM(cost::numeric) AS week_spend
      FROM consumption_records
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY user_id
    ) w ON w.user_id = cb.user_id
    LEFT JOIN notifications n ON n.user_id = cb.user_id AND n.type = 'balance_alert'
  `);
  const s = (summaryRows as any[])[0] || {};

  return reply.send({
    data: {
      summary: {
        low_balance_count: toNum(s.low_balance_count),
        exhausted_count: toNum(s.exhausted_count),
        warning_count: toNum(s.warning_count),
        notified_today: toNum(s.notified_today),
      },
      list,
    },
  });
}

/**
 * POST /api/v1/admin/balance-alerts/:userId/notify — 手动提醒（站内信 + 邮件）
 */
async function notifyHandler(request: any, reply: any) {
  const userId = parsePositiveInt((request.params as { userId: string }).userId, 0);
  if (!userId) throw new ValidationError('Invalid userId');

  const users = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const user = users[0];
  if (!user) throw new NotFoundError('User', String(userId));

  const [balanceRow] = await db
    .select({ availableBalance: schema.customerBalances.availableBalance })
    .from(schema.customerBalances)
    .where(eq(schema.customerBalances.userId, userId))
    .limit(1);
  const balance = toNum(balanceRow?.availableBalance);
  const cfg = await readAlertConfig();

  const title = `⚠️ 余额不足提醒`;
  const content = `您的账户可用余额 ¥${balance.toFixed(2)} 已低于预警线 ¥${cfg.lowBalanceThreshold}，请及时充值以免影响服务。`;

  await db.insert(schema.notifications).values({
    userId,
    type: 'balance_alert',
    title,
    content,
    metadata: { balance: String(balance), threshold: cfg.lowBalanceThreshold } as any,
  });

  const mailRes = await sendMail({
    to: user.email,
    subject: title,
    html: `<p>${user.name}，您好：</p><p>${content}</p>`,
    templateName: 'balance_alert',
  });

  await writeAudit(request, 'balance_alert.notify', String(userId), {
    balance,
    threshold: cfg.lowBalanceThreshold,
    email: mailRes.ok ? 'sent' : mailRes.skipped ? 'skipped' : 'failed',
  });

  return reply.send({ data: { userId, notified: true, email: mailRes.ok ? 'sent' : mailRes.skipped ? 'skipped' : 'failed' } });
}

/* ───────── route plugin ───────── */

export async function adminConsumptionRoutes(app: FastifyInstance) {
  app.get('/api/v1/admin/consumption/tracking', { preHandler: [adminAuth] }, trackingHandler);
  app.get('/api/v1/admin/consumption/stream', { preHandler: [adminAuth] }, streamHandler);
  app.get('/api/v1/admin/consumption/anomalies', { preHandler: [adminAuth] }, anomaliesHandler);
  app.post('/api/v1/admin/consumption/anomalies/:id/:op', { preHandler: [adminAuth] }, anomalyActionHandler);

  app.get('/api/v1/admin/balance-alert-config', { preHandler: [adminAuth] }, async (_request, reply) => {
    const cfg = await readAlertConfig();
    return reply.send({ data: cfg });
  });
  app.put('/api/v1/admin/balance-alert-config', { preHandler: [adminAuth] }, async (request, reply) => {
    const cfg = await saveAlertConfig((request as any).userContext?.userId ?? null, (request.body ?? {}) as Record<string, unknown>);
    await writeAudit(request, 'balance_alert.config.update', null, { config: cfg });
    return reply.send({ data: cfg });
  });
  app.get('/api/v1/admin/balance-alerts', { preHandler: [adminAuth] }, alertsHandler);
  app.post('/api/v1/admin/balance-alerts/:userId/notify', { preHandler: [adminAuth] }, notifyHandler);
}
