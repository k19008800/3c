/**
 * 管理端财务统计 — /api/v1/admin/{settlements,profit,reconciliation,refunds}
 *
 * 对齐 gap-fix-spec-2026-08-18.md §4（结算/利润/对账）与 §5（退款审核），
 * 响应契约一一对应前端 AdminSettlementPage / AdminProfitPage /
 * AdminReconciliationPage / AdminRefundReviewPage：
 *   - GET  /admin/settlements?period=week|month|quarter&status=   供应商结算列表
 *   - POST /admin/settlements/:id/settle                          标记已结算（写 vendor_settlements，持久化）
 *   - GET  /admin/profit?period=                                  利润分析（按供应商）
 *   - GET  /admin/reconciliation?period=                          对账报表（本期无供应商账单源 → diff=0/matched）
 *   - GET  /admin/refunds?status=&page_size=                      退款申请列表
 *   - POST /admin/refunds/:id/review                              审核（approve 退余额 / reject 驳回）
 *
 * 口径说明：
 *   - 收入（revenue）= 按消费 token 数 × 模型定价（supplier_models.input_price/output_price，
 *     per_1M_tokens）估算的客户应付；成本（cost）= consumption_records.cost 聚合（平台应付供应商）。
 *     定价缺失的记录 revenue 贡献 0（如实反映，不做外推）。
 *   - 佣金（commission）：agent_commissions 无按供应商归属维度，本期统一 0（规格允许「或 0」）。
 *   - 结算状态：vendor_settlements(status='confirmed', period=当前月 YYYY-MM) 存在即 settled，
 *     否则 pending；disputed 无数据源 → 0。
 *   - 对账：无真实供应商账单数据源，diff=0、status=matched（如实返回）。
 *
 * 约定：全部 adminAuth；写操作 writeAudit；金额 numeric 字段返回前转 Number。
 *
 * @see docs/gap-fix-spec-2026-08-18.md §4 §5
 * @module routes
 */

import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { db, schema } from '../db/index.js';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt.js';
import { adjustLedgerAvailable, clearNegativeFlag } from '../services/billing/ledger.js';
import { requirePerm } from '../middleware/require-perm.js';
import { requireOperation2fa } from '../middleware/require-operation-2fa.js';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  AppError,
} from '../lib/errors.js';
import {
  acquireIdempotencyLock,
  cacheIdempotentResponse,
  getCachedIdempotentResponse,
  IDEMPOTENCY_TTL_SECONDS,
} from '../services/idempotency.js';
import { IdempotencyUnavailableError } from '../lib/errors.js';

/* ───────── auth / audit / 通用 helpers ───────── */

/** 用户鉴权（解析 JWT → request.userContext） */
async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

/** 管理端鉴权（preHandler，role ∈ {admin, super_admin}） */
async function adminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

/** 管理端操作审计写库 */
function writeAudit(
  request: any,
  action: string,
  resource: string,
  resourceId: string | number | null,
  details: Record<string, unknown>,
) {
  const ctx = request.userContext ?? {};
  return db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource,
    resourceId: resourceId != null ? String(resourceId) : null,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 保留 2 位小数（金额展示口径） */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 保留 1 位小数（百分比展示口径） */
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** 正整数解析（非法回退默认值，超上限截断） */
function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

/** Financial mutations bind idempotency to operator, method, path and body digest. */
function refundIdempotency(request: any, body: unknown) {
  const raw = request.headers?.['idempotency-key'];
  const supplied = typeof raw === 'string' && raw.trim() ? raw.trim() : crypto.randomUUID();
  const path = request.url.split('?')[0];
  const operator = String(request.userContext?.userId ?? 'anonymous');
  const canonical = `${operator}|${request.method}|${path}|${JSON.stringify(body ?? {})}`;
  const fingerprint = crypto.createHash('sha256').update(canonical).digest('hex');
  return { key: `refund:${operator}:${request.method}:${path}:${supplied}`.slice(0, 100), fingerprint };
}

async function acquireRefundIdempotency(request: any, body: unknown) {
  const { key, fingerprint } = refundIdempotency(request, body);
  // 资金写路径严格模式（failClosed）：Redis 幂等锁不可用必须 503，不得静默降级绕过
  const lock = await acquireIdempotencyLock(key, IDEMPOTENCY_TTL_SECONDS, { failClosed: true });
  if (lock.status === 'unavailable') {
    throw new IdempotencyUnavailableError({ requestId: key });
  }
  if (lock.status === 'duplicate') {
    const cached = await getCachedIdempotentResponse(key);
    if (cached?.request_fingerprint !== fingerprint) throw new AppError('幂等键对应请求摘要不一致', 409, 'IDEMPOTENCY_CONFLICT');
    if (cached?.body) return { replay: cached.body };
    throw new AppError('幂等请求正在处理中或响应已过期', 409, 'IDEMPOTENCY_CONFLICT');
  }
  return { key, fingerprint };
}

/** period → 起始时间（week 近 7 天 / month 本月 / quarter 本季 / year 本年） */
function periodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'week': return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter': return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case 'year': return new Date(now.getFullYear(), 0, 1);
    default: return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  }
}

/** 上一周期起点（用于 trend 环比） */
function prevPeriodStart(period: string, start: Date): Date {
  switch (period) {
    case 'week': return new Date(start.getTime() - 7 * 24 * 3600 * 1000);
    case 'month': return new Date(start.getFullYear(), start.getMonth() - 1, 1);
    case 'quarter': return new Date(start.getFullYear(), start.getMonth() - 3, 1);
    case 'year': return new Date(start.getFullYear() - 1, 0, 1);
    default: return new Date(start.getTime() - 7 * 24 * 3600 * 1000);
  }
}

/** 当前月 YYYY-MM（vendor_settlements.period 存储口径，varchar(7)） */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 结算列表展示用周期标签（week 取周起点日期 / month YYYY-MM / quarter YYYY-Qn） */
function periodLabel(period: string): string {
  const now = new Date();
  switch (period) {
    case 'week': {
      const start = periodStart('week');
      return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) + 1;
      return `${now.getFullYear()}-Q${q}`;
    }
    default:
      return currentMonth();
  }
}

/* ───────── 供应商聚合（消费收入估算 + 成本） ───────── */

/**
 * 供应商解析表达式：优先 consumption_records.supplier_id，
 * 缺失时回退 supplier_models.supplier_id（与 services/finance/vendor-settlement.ts 同口径）。
 */
const supplierExpr = sql<number>`coalesce(${schema.consumptionRecords.supplierId}, ${schema.supplierModels.supplierId})`;

/**
 * 收入估算表达式：Σ( input_tokens/1e6 × 模型输入单价 + output_tokens/1e6 × 模型输出单价 )
 *
 * supplier_models.input_price/output_price 为平台售价（per_1M_tokens 字符串），
 * 定价缺失/为 0 时该记录收入贡献 0。
 */
const revenueExpr = sql<string>`round(coalesce(sum(
  coalesce((${schema.consumptionRecords.inputTokens}::numeric / 1000000) * nullif(${schema.supplierModels.inputPrice}::numeric, 0), 0) +
  coalesce((${schema.consumptionRecords.outputTokens}::numeric / 1000000) * nullif(${schema.supplierModels.outputPrice}::numeric, 0), 0)
), 0), 4)`;

/**
 * 按供应商聚合期内消费：收入估算 / 成本 / 调用数
 *
 * @param start - 周期起点（含）
 * @param end - 周期终点（不含；缺省 = 不限到当前）
 */
async function aggregateBySupplier(start: Date, end?: Date) {
  const where = end
    ? and(gte(schema.consumptionRecords.createdAt, start), lt(schema.consumptionRecords.createdAt, end), sql`${supplierExpr} is not null`)
    : and(gte(schema.consumptionRecords.createdAt, start), sql`${supplierExpr} is not null`);

  return db
    .select({
      supplierId: supplierExpr,
      vendorName: schema.suppliers.name,
      revenue: revenueExpr,
      cost: sql<string>`round(coalesce(sum(${schema.consumptionRecords.cost}), 0), 4)`,
      calls: sql<number>`count(*)::int`,
    })
    .from(schema.consumptionRecords)
    .leftJoin(schema.supplierModels, eq(schema.consumptionRecords.supplierModelId, schema.supplierModels.id))
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, supplierExpr))
    .where(where)
    .groupBy(supplierExpr, schema.suppliers.name)
    .orderBy(desc(revenueExpr));
}

/** 已确认结算的供应商集合（当前月） */
async function settledSupplierIds(): Promise<Set<number>> {
  const rows = await db
    .select({ supplierId: schema.vendorSettlements.supplierId })
    .from(schema.vendorSettlements)
    .where(and(
      eq(schema.vendorSettlements.status, 'confirmed'),
      eq(schema.vendorSettlements.period, currentMonth()),
    ));
  return new Set(rows.map((r) => r.supplierId));
}

/* ───────── 退款状态文案 ───────── */

const REFUND_STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  processing: '执行中',
  completed: '已完成',
  failed: '执行失败',
  rejected: '已驳回',
};

export function adminFinanceStatsRoutes(app: FastifyInstance) {
  /* ═══════════ 1. 结算列表 ═══════════ */

  /** GET /api/v1/admin/settlements?period=week|month|quarter&status=pending|settled|disputed — 供应商结算列表 */
  app.get('/api/v1/admin/settlements', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const period = String(q.period ?? 'month');
    if (!['week', 'month', 'quarter'].includes(period)) {
      throw new ValidationError('period 仅支持 week / month / quarter');
    }
    const statusFilter = String(q.status ?? '').trim();
    const start = periodStart(period);
    const label = periodLabel(period);

    const [rows, settledIds] = await Promise.all([
      aggregateBySupplier(start),
      settledSupplierIds(),
    ]);

    const all = rows.map((r) => {
      const revenue = toNum(r.revenue);
      const cost = toNum(r.cost);
      return {
        id: r.supplierId,
        vendor_name: r.vendorName ?? `供应商#${r.supplierId}`,
        period: label,
        revenue: round2(revenue),
        cost: round2(cost),
        profit: round2(revenue - cost),
        status: settledIds.has(r.supplierId) ? 'settled' : 'pending',
      } as { id: number; vendor_name: string; period: string; revenue: number; cost: number; profit: number; status: string };
    });

    // status 过滤（disputed 无数据源 → 恒空）
    const list = statusFilter
      ? all.filter((s) => s.status === statusFilter)
      : all;
    const pendingList = list.filter((s) => s.status === 'pending');
    const settledList = list.filter((s) => s.status === 'settled');

    return reply.send({
      data: {
        summary: {
          pending_total: round2(pendingList.reduce((sum, s) => sum + s.revenue, 0)),
          settled_total: round2(settledList.reduce((sum, s) => sum + s.revenue, 0)),
          pending_vendors: pendingList.length,
          disputed: 0,
        },
        list,
      },
    });
  });

  /* ═══════════ 2. 标记结算 ═══════════ */

  /**
   * POST /api/v1/admin/settlements/:id/settle — 标记供应商本期已结算
   *
   * id = 列表项 id（供应商 id）。持久化到 vendor_settlements（status='confirmed',
   * period=当前月 YYYY-MM，total_amount=本期成本聚合）；已存在则置 confirmed（幂等）。
   * 简化说明：week/quarter 视图结算同样落到当前月（表唯一约束 (supplier_id, period)）。
   */
  app.post('/api/v1/admin/settlements/:id/settle', { preHandler: [adminAuth] }, async (request, reply) => {
    const supplierId = Number((request.params as any)?.id);
    if (!Number.isInteger(supplierId) || supplierId <= 0) throw new ValidationError('供应商 ID 非法');

    const [supplier] = await db
      .select({ id: schema.suppliers.id, name: schema.suppliers.name })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.id, supplierId))
      .limit(1);
    if (!supplier) throw new NotFoundError('供应商', supplierId);

    const period = currentMonth();
    // 本期成本聚合（与列表 cost 同口径：本月初 → 现在）
    const [agg] = await db
      .select({ total: sql<string>`round(coalesce(sum(${schema.consumptionRecords.cost}), 0), 4)` })
      .from(schema.consumptionRecords)
      .leftJoin(schema.supplierModels, eq(schema.consumptionRecords.supplierModelId, schema.supplierModels.id))
      .where(and(
        gte(schema.consumptionRecords.createdAt, periodStart('month')),
        eq(supplierExpr, supplierId),
      ));
    const totalAmount = toNum(agg?.total);
    const operatorId = (request as any).userContext?.userId ?? null;

    const [existing] = await db
      .select({ id: schema.vendorSettlements.id })
      .from(schema.vendorSettlements)
      .where(and(
        eq(schema.vendorSettlements.supplierId, supplierId),
        eq(schema.vendorSettlements.period, period),
      ))
      .limit(1);

    if (existing) {
      await db.update(schema.vendorSettlements)
        .set({ status: 'confirmed', totalAmount: String(totalAmount), updatedAt: new Date() })
        .where(eq(schema.vendorSettlements.id, existing.id));
    } else {
      await db.insert(schema.vendorSettlements)
        .values({
          supplierId,
          period,
          totalAmount: String(totalAmount),
          itemCount: 0,
          status: 'confirmed',
          createdBy: operatorId,
        })
        .onConflictDoNothing();
    }

    await writeAudit(request, 'settlement.settle', 'vendor_settlement', supplierId, {
      vendorName: supplier.name,
      period,
      totalAmount,
    });

    return reply.send({
      data: { id: supplierId, period, status: 'settled' },
      message: `「${supplier.name}」本期已结算`,
    });
  });

  /* ═══════════ 3. 利润分析 ═══════════ */

  /** GET /api/v1/admin/profit?period=week|month|quarter|year — 按供应商利润分析 */
  app.get('/api/v1/admin/profit', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const period = String(q.period ?? 'month');
    const start = periodStart(period);
    const prevStart = prevPeriodStart(period, start);

    const [rows, prevRows] = await Promise.all([
      aggregateBySupplier(start),
      aggregateBySupplier(prevStart, start),
    ]);
    const prevMap = new Map<number, number>();
    for (const r of prevRows) prevMap.set(r.supplierId, toNum(r.revenue));

    const list = rows.map((r) => {
      const revenue = toNum(r.revenue);
      const cost = toNum(r.cost);
      // 佣金无按供应商归属维度，本期统一 0（规格允许）
      const commission = 0;
      const netProfit = round2(revenue - cost - commission);
      const margin = revenue > 0 ? round1((netProfit / revenue) * 100) : 0;
      const prevRevenue = prevMap.get(r.supplierId) ?? 0;
      const trend = prevRevenue > 0
        ? (revenue > prevRevenue * 1.1 ? 'up' : revenue < prevRevenue * 0.9 ? 'down' : 'flat')
        : 'flat';
      return {
        vendor_name: r.vendorName ?? `供应商#${r.supplierId}`,
        revenue: round2(revenue),
        cost: round2(cost),
        commission: round2(commission),
        net_profit: netProfit,
        margin,
        trend,
      };
    });

    const totalRevenue = list.reduce((sum, x) => sum + x.revenue, 0);
    const totalCost = list.reduce((sum, x) => sum + x.cost, 0);
    const totalProfit = round2(totalRevenue - totalCost);

    return reply.send({
      data: {
        summary: {
          revenue: round2(totalRevenue),
          cost: round2(totalCost),
          profit: totalProfit,
          margin: totalRevenue > 0 ? round1((totalProfit / totalRevenue) * 100) : 0,
        },
        list,
      },
    });
  });

  /* ═══════════ 4. 对账报表 ═══════════ */

  /** GET /api/v1/admin/reconciliation?period=week|month|quarter — 对账报表（本期无供应商账单源，diff=0/matched） */
  app.get('/api/v1/admin/reconciliation', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const period = String(q.period ?? 'month');
    const start = periodStart(period);

    const rows = await aggregateBySupplier(start);

    const list = rows.map((r) => {
      const revenue = toNum(r.revenue);
      const cost = toNum(r.cost);
      const profit = round2(revenue - cost);
      const margin = revenue > 0 ? round1((profit / revenue) * 100) : 0;
      return {
        vendor_name: r.vendorName ?? `供应商#${r.supplierId}`,
        revenue: round2(revenue),
        cost: round2(cost),
        profit,
        margin,
        // 无真实供应商账单数据源：平台金额 vs 账单金额差异记为 0，状态一致
        diff: 0,
        status: 'matched',
      };
    });

    const totalRevenue = list.reduce((sum, x) => sum + x.revenue, 0);
    const totalCost = list.reduce((sum, x) => sum + x.cost, 0);
    const totalProfit = round2(totalRevenue - totalCost);

    return reply.send({
      data: {
        summary: {
          revenue: round2(totalRevenue),
          cost: round2(totalCost),
          profit: totalProfit,
          margin: totalRevenue > 0 ? round1((totalProfit / totalRevenue) * 100) : 0,
        },
        list,
      },
    });
  });

  /* ═══════════ 5. 退款申请列表 ═══════════ */

  /** GET /api/v1/admin/refunds?status=pending|approved|rejected&page_size= — 退款申请列表
   * 鉴权：requirePerm('finance.refund')（P2-1 评审：finance 角色可审退款必须能看列表，
   * 闭环对齐 B16；只读端点不挂 2FA） */
  app.get('/api/v1/admin/refunds', { preHandler: [requirePerm('finance.refund')] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const pageSize = parsePositiveInt(q.page_size, 50, 200);
    const status = String(q.status ?? '').trim();
    if (status && !['pending', 'approved', 'processing', 'completed', 'failed', 'rejected'].includes(status)) {
      throw new ValidationError('status 状态不合法');
    }

    const whereClause = status ? eq(schema.refundRequests.status, status) : undefined;

    const [rows, countRow] = await Promise.all([
      db
        .select({
          id: schema.refundRequests.id,
          userId: schema.refundRequests.userId,
          amount: schema.refundRequests.amount,
          reason: schema.refundRequests.reason,
          orderNo: schema.refundRequests.orderNo,
          refundType: schema.refundRequests.refundType,
          reviewStage: schema.refundRequests.reviewStage,
          executionAttempts: schema.refundRequests.executionAttempts,
          manualInterventionRequired: schema.refundRequests.manualInterventionRequired,
          status: schema.refundRequests.status,
          reviewNote: schema.refundRequests.reviewNote,
          reviewedBy: schema.refundRequests.reviewedBy,
          reviewedAt: schema.refundRequests.reviewedAt,
          createdAt: schema.refundRequests.createdAt,
          username: schema.users.name,
          email: schema.users.email,
        })
        .from(schema.refundRequests)
        .leftJoin(schema.users, eq(schema.refundRequests.userId, schema.users.id))
        .where(whereClause)
        .orderBy(desc(schema.refundRequests.createdAt))
        .limit(pageSize),
      db.select({ total: sql<number>`count(*)::int` }).from(schema.refundRequests).where(whereClause),
    ]);

    const list = rows.map((r) => ({
      id: r.id,
      user_id: r.userId,
      username: r.username ?? null,
      email: r.email ?? null,
      amount: toNum(r.amount),
      reason: r.reason ?? null,
      order_no: r.orderNo ?? null,
      refund_type: r.refundType,
      review_stage: r.reviewStage,
      execution_attempts: r.executionAttempts,
      manual_intervention_required: r.manualInterventionRequired,
      status: r.status,
      status_label: REFUND_STATUS_LABEL[r.status] ?? r.status,
      review_note: r.reviewNote ?? null,
      reviewed_by: r.reviewedBy ?? null,
      reviewed_at: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      created_at: r.createdAt.toISOString(),
    }));

    return reply.send({
      data: {
        list,
        pagination: { total: toNum(countRow?.[0]?.total) },
      },
    });
  });

  /* ═══════════ 6. 退款审核/执行 ═══════════ */

  /** POST /api/v1/admin/refunds/:id/review — body { action: approve|reject, note }
   * 鉴权：requirePerm('finance.refund') + requireOperation2fa（双签 B16：退款审核纳入 R7，
   * 通过/驳回需 2FA + 二次确认；鉴权从 adminAuth 收敛至权限点，与 R3 同型改造）。
   * 注意：adminAuth 只放行 admin/super_admin；finance.refund 由 finance/admin/super_admin 持有
   *（权限树见 lib/permissions.ts），此处收敛后 finance 角色（持 finance.refund）可审核退款。
   */
  app.post('/api/v1/admin/refunds/:id/review', { preHandler: [requirePerm('finance.refund'), requireOperation2fa] }, async (request, reply) => {
    const refundId = Number((request.params as any)?.id);
    if (!Number.isInteger(refundId) || refundId <= 0) throw new ValidationError('退款申请 ID 非法');

    const body = (request.body ?? {}) as Record<string, unknown>;
    const idem = await acquireRefundIdempotency(request, body);
    if ('replay' in idem) return reply.send(idem.replay);
    const action = String(body.action ?? '').trim();
    if (action !== 'approve' && action !== 'reject') {
      throw new ValidationError('action 必须为 approve 或 reject');
    }
    const note = body.note != null ? String(body.note).trim().slice(0, 1000) : null;
    const operatorId = (request as any).userContext?.userId ?? null;

    const [req] = await db
      .select({ id: schema.refundRequests.id, userId: schema.refundRequests.userId, amount: schema.refundRequests.amount, reviewStage: schema.refundRequests.reviewStage })
      .from(schema.refundRequests)
      .where(eq(schema.refundRequests.id, refundId))
      .limit(1);
    if (!req) throw new NotFoundError('退款申请', refundId);

    // 审批阶段：金额阈值由服务端强制，阶段字段提供可审计的多级审批。
    const amount = Number(req.amount);
    const required = amount > 100000 ? 'super' : amount > 10000 ? 'second' : 'first';
    const expectedStage = req.reviewStage === 'pending'
      ? 'first'
      : req.reviewStage === 'pending_level2'
        ? 'second'
        : req.reviewStage === 'pending_super' ? 'super' : null;
    const requestedStage = String(body.stage ?? expectedStage ?? '');
    if (action === 'approve' && !expectedStage) {
      throw new AppError('退款申请当前不在可审批阶段', 409, 'INVALID_REVIEW_STAGE');
    }
    if (action === 'approve' && requestedStage !== expectedStage) {
      throw new AppError('审批阶段与当前单据阶段不匹配', 409, 'INVALID_REVIEW_STAGE');
    }
    // 审核只推进状态；资金入账必须由 execute 端点完成。
    await db.transaction(async (tx) => {
      const [current] = await tx.select({ stage: schema.refundRequests.reviewStage, status: schema.refundRequests.status, first: schema.refundRequests.firstReviewedBy, second: schema.refundRequests.secondReviewedBy }).from(schema.refundRequests).where(eq(schema.refundRequests.id, refundId)).limit(1);
      if (!current || current.status !== 'pending') throw new AppError('退款申请已处理，不能重复审核', 409, 'REFUND_ALREADY_PROCESSED');
      if (action === 'approve' && requestedStage !== 'first' && (!current.first || current.first === operatorId)) throw new AppError('审批职责不分离', 403, 'REVIEW_SOD_VIOLATION');
      if (action === 'approve' && requestedStage === 'super' && (!current.second || current.second === operatorId)) throw new AppError('终审职责不分离', 403, 'REVIEW_SOD_VIOLATION');
      const nextStage = action === 'reject'
        ? 'rejected'
        : required === 'first'
          ? 'approved'
          : required === 'second'
            ? requestedStage === 'first' ? 'pending_level2' : 'approved'
            : requestedStage === 'first' ? 'pending_level2' : requestedStage === 'second' ? 'pending_super' : 'approved';
      const stageSet: any = { reviewStage: nextStage };
      if (requestedStage === 'first') stageSet.firstReviewedBy = operatorId;
      if (requestedStage === 'second') stageSet.secondReviewedBy = operatorId;
      if (requestedStage === 'super') stageSet.superReviewedBy = operatorId;
      const [updated] = await tx.update(schema.refundRequests)
        .set({
          status: nextStage === 'rejected' ? 'rejected' : nextStage === 'approved' ? 'approved' : 'pending',
          ...stageSet,
          reviewNote: note,
          reviewedBy: operatorId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.refundRequests.id, refundId),
          eq(schema.refundRequests.status, 'pending'), eq(schema.refundRequests.reviewStage, current.stage),
        ))
        .returning({ id: schema.refundRequests.id, status: schema.refundRequests.status });
      if (!updated) {
        throw new AppError('退款申请已处理，不能重复审核', 409, 'REFUND_ALREADY_PROCESSED');
      }

      return { updated };
    });

    await writeAudit(request, `refund.review.${action}`, 'refund_request', refundId, {
      userId: req.userId,
      amount: toNum(req.amount),
      action,
      note,
    });

    const responseStatus = action === 'reject'
      ? 'rejected'
      : required === 'first' || (required === 'second' && requestedStage === 'second') || (required === 'super' && requestedStage === 'super')
        ? 'approved'
        : 'pending';
    const responseStage = action === 'reject'
      ? 'rejected'
      : required === 'first'
        ? 'approved'
        : required === 'second'
          ? requestedStage === 'first' ? 'pending_level2' : 'approved'
          : requestedStage === 'first' ? 'pending_level2' : requestedStage === 'second' ? 'pending_super' : 'approved';
    const response = {
      data: { id: refundId, status: responseStatus, review_stage: responseStage },
      message: responseStatus === 'approved' ? '退款审核通过，待执行' : action === 'approve' ? '本级审核通过，等待下一级审核' : '退款申请已驳回',
    };
    await cacheIdempotentResponse(idem.key, { streamed: false, body: response, request_fingerprint: idem.fingerprint, summary: {} as any });
    return reply.send(response);
  });

  /** POST /api/v1/admin/refunds/:id/execute — approved/failed → processing → completed/failed */
  app.post('/api/v1/admin/refunds/:id/execute', { preHandler: [requirePerm('finance.refund'), requireOperation2fa] }, async (request, reply) => {
    const refundId = Number((request.params as any)?.id);
    if (!Number.isInteger(refundId) || refundId <= 0) throw new ValidationError('退款申请 ID 非法');
    const body = (request.body ?? {}) as Record<string, unknown>;
    const idem = await acquireRefundIdempotency(request, body);
    if ('replay' in idem) return reply.send(idem.replay);

    const [req] = await db.select({
      id: schema.refundRequests.id,
      userId: schema.refundRequests.userId,
      amount: schema.refundRequests.amount,
      status: schema.refundRequests.status,
      refundType: schema.refundRequests.refundType,
      executionAttempts: schema.refundRequests.executionAttempts,
      manualInterventionRequired: schema.refundRequests.manualInterventionRequired,
    }).from(schema.refundRequests).where(eq(schema.refundRequests.id, refundId)).limit(1);
    if (!req) throw new NotFoundError('退款申请', refundId);
    if (req.status !== 'approved' && req.status !== 'failed') {
      throw new AppError('退款单已处理或尚未审核', 409, 'REFUND_ALREADY_PROCESSED');
    }
    if (req.manualInterventionRequired || Number(req.executionAttempts) >= 3) {
      throw new AppError('退款执行已达到重试上限，需要人工介入', 409, 'MANUAL_INTERVENTION_REQUIRED');
    }

    // 状态条件更新是并发/重复执行的最终守卫；failed 可重试。
    const [claimed] = await db.update(schema.refundRequests)
      .set({ status: 'processing', executionAttempts: sql`${schema.refundRequests.executionAttempts} + 1`, updatedAt: new Date() })
      .where(and(eq(schema.refundRequests.id, refundId), eq(schema.refundRequests.status, req.status)))
      .returning({ id: schema.refundRequests.id });
    if (!claimed) throw new AppError('退款单已处理或尚未审核', 409, 'REFUND_ALREADY_PROCESSED');

    try {
      if (req.refundType === 'channel_refund') throw new AppError('支付通道退款适配器未配置', 503, 'CHANNEL_REFUND_NOT_CONFIGURED');
      if (req.refundType === 'reversal') throw new AppError('红冲请使用调账反向接口', 501, 'REVERSAL_NOT_IMPLEMENTED');
      const result = await db.transaction(async (tx) => {
        const prior = await tx.execute(sql`SELECT 1 FROM balance_transactions WHERE reference_type = 'refund_request' AND reference_id = ${String(refundId)} LIMIT 1`);
        if (prior.length) throw new AppError('退款流水已存在', 409, 'DUPLICATE_BUSINESS_REFERENCE');
        const upd = await tx.execute(sql`
          UPDATE customer_balances
          SET available_balance = available_balance + ${String(req.amount)}::numeric,
              total_balance = total_balance + ${String(req.amount)}::numeric,
              version = version + 1,
              updated_at = NOW()
          WHERE user_id = ${req.userId}
          RETURNING available_balance AS "balanceAfter"
        `);
        const row = upd[0] as unknown as { balanceAfter: string } | undefined;
        if (!row) throw new AppError('Balance account not found', 404, 'BALANCE_NOT_FOUND');
        await tx.insert(schema.balanceTransactions).values({
          userId: req.userId,
          type: 'refund',
          amount: String(req.amount),
          balanceAfter: row.balanceAfter,
          referenceType: 'refund_request',
          referenceId: String(refundId),
        });
        const [completed] = await tx.update(schema.refundRequests)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(and(eq(schema.refundRequests.id, refundId), eq(schema.refundRequests.status, 'processing')))
          .returning({ id: schema.refundRequests.id });
        if (!completed) throw new AppError('退款状态更新失败', 409, 'REFUND_ALREADY_PROCESSED');
        return row.balanceAfter;
      });
      await adjustLedgerAvailable(req.userId, Number(req.amount));
      await clearNegativeFlag(req.userId);
      await writeAudit(request, 'refund.execute.completed', 'refund_request', refundId, {
        userId: req.userId, amount: toNum(req.amount), fromStatus: req.status, status: 'completed',
      });
      const response = { data: { id: refundId, status: 'completed', balance_after: toNum(result) }, message: '退款执行完成' };
      await cacheIdempotentResponse(idem.key, { streamed: false, body: response, request_fingerprint: idem.fingerprint, summary: {} as any });
      return reply.send(response);
    } catch (error) {
      // 资金事务失败时余额/流水已整体回滚；仅单独标记 failed，允许安全重试。
      const attempts = Number(req.executionAttempts) + 1;
      await db.update(schema.refundRequests).set({ status: 'failed', lastError: String((error as any)?.message ?? error).slice(0, 1000), manualInterventionRequired: attempts >= 3, updatedAt: new Date() })
        .where(and(eq(schema.refundRequests.id, refundId), eq(schema.refundRequests.status, 'processing')));
      await writeAudit(request, 'refund.execute.failed', 'refund_request', refundId, {
        userId: req.userId, amount: toNum(req.amount), fromStatus: req.status, status: 'failed',
        errorCode: (error as any)?.code ?? 'REFUND_EXECUTE_FAILED',
      });
      throw error;
    }
  });
}
