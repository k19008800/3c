/**
 * 充值/对公打款 域路由 — 用户端 + 管理端
 *
 * 用户端（jwtAuth，/api/v1/me/*）：
 *   GET  /me/balance           当前余额
 *   POST /me/recharge          发起充值（对公转账返回 bank_info；扫码返回 mock qr）
 *   GET  /me/recharge-orders   我的充值订单（前端 RechargePage 契约）
 *   GET  /me/promotions        促销列表（空）
 *
 * 管理端（requirePerm('finance.topup')，/api/v1/admin/*）：
 *   GET  /admin/recharge-orders              充值订单列表（AdminRechargeOrdersPage 契约）
 *   POST /admin/recharge-orders/:id/audit    审核通过 → 加余额 + 写 balance_transactions
 *   POST /admin/recharge-orders/:id/reject   驳回
 */

import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { db, schema } from '../db/index.js';
import { eq, and, desc, sql, inArray, gte, lte } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt.js';
import { getBalance, creditBalance } from '../services/billing/balance.js';
import { adjustLedgerAvailable, clearNegativeFlag } from '../services/billing/ledger.js';
import { notifyUser } from '../services/notify.js';
import { requirePerm } from '../middleware/require-perm.js';
import { requireOperation2fa } from '../middleware/require-operation-2fa.js';
import {
  resolveIdempotencyKey,
  acquireIdempotencyLock,
  releaseIdempotencyLock,
  cacheIdempotentResponse,
  getCachedIdempotentResponse,
  isIdempotencyUniqueViolation,
  IDEMPOTENCY_TTL_SECONDS,
  type IdempotencyCachedEntry,
} from '../services/idempotency.js';
import { calcApprovalTier, getApprovalRules } from '../lib/finance-rules.js';
import { AppError, UnauthorizedError, ValidationError, ForbiddenError, IdempotencyUnavailableError } from '../lib/errors.js';
import {
  buildApprovalMeta,
  resolveOrderApproval,
  nextPhaseAfterApprove,
  approveStagePatch,
  type RechargeApprovalPhase,
} from '../services/billing/recharge-approval.js';
// campaign_coupon_codes 未从 db/schema/index.ts 导出（该文件禁改），直接从表定义导入
import { campaignCouponCodes } from '../db/schema/coupons.js';
import { parsePaymentConfig } from './admin-payment.js';

// ── auth ─────────────────────────────────────────────
async function jwtAuth(request: any, _reply: any) {
  const token = request.headers.authorization?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid token');
  request.userContext = payload;
}

function userId(request: any): number {
  return (request as any).userContext.userId;
}

// ── 常量 ─────────────────────────────────────────────
/** 对公收款账户（默认值；后台支付配置可覆盖） */
const DEFAULT_BANK_INFO = {
  account_name: '杭州灵通云智算科技有限公司',
  account_number: '5719020097201298888',
  bank_name: '招商银行杭州分行高新支行',
  branch_name: '高新支行',
};

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: '对公转账',
  alipay: '支付宝',
  wechat: '微信支付',
  qq: 'QQ钱包',
  manual: '人工上账',
};

/** DB status → 管理端前端状态（AdminRechargeOrdersPage 用 completed/failed） */
const ADMIN_STATUS_LABEL: Record<string, string> = {
  pending: '待确认',
  paid: '已完成',
  failed: '已失败',
  cancelled: '已取消',
  refunded: '已退款',
};
function adminStatus(s: string): string {
  if (s === 'paid') return 'completed';
  return s;
}

/** DB status → 用户端前端状态（RechargePage 用 success/pending） */
function userStatus(s: string): string {
  if (s === 'paid') return 'success';
  return s;
}

/** 充值记录支付方式标签（TopupRecordsPage 显示；含专用键 bank/usdt） */
const RECORD_METHOD_LABEL: Record<string, string> = {
  alipay: '支付宝',
  wechat: '微信支付',
  bank_transfer: '对公转账',
  bank: '银行转账',
  usdt: 'USDT',
  qq: 'QQ钱包',
  manual: '人工上账',
};

/** DB status → 充值记录前端状态（TopupRecordsPage 用 completed/pending/rejected/cancelled/refunded） */
const RECORD_STATUS: Record<string, string> = {
  paid: 'completed',
  pending: 'pending',
  failed: 'rejected',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

/** 充值记录状态标签 */
const RECORD_STATUS_LABEL: Record<string, string> = {
  completed: '充值成功',
  pending: '待审核',
  rejected: '已驳回',
  cancelled: '已取消',
  refunded: '已退款',
};

const ALLOWED_METHODS = ['bank_transfer', 'alipay', 'wechat', 'qq'];
const MAX_AMOUNT = 1_000_000;

/** 订单号：RC + yyyyMMddHHmmss + 4 位随机 */
function genOrderNo(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `RC${ts}${rand}`;
}

export async function rechargeRoutes(app: FastifyInstance) {
  // ═══ 用户端 ═══

  /** GET /api/v1/me/balance — 当前余额 */
  app.get('/api/v1/me/balance', { preHandler: [jwtAuth] }, async (request, reply) => {
    const bal = await getBalance(userId(request));
    return reply.send({ data: { balance: Number(bal.availableBalance || 0) } });
  });

  /** POST /api/v1/me/recharge — 发起充值 */
  app.post('/api/v1/me/recharge', { preHandler: [jwtAuth] }, async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const amount = Number(body.amount);
    const method = String(body.payment_method || 'bank_transfer');

    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('充值金额需大于 0');
    if (amount > MAX_AMOUNT) throw new ValidationError(`单笔充值上限 ¥${MAX_AMOUNT.toLocaleString()}`);
    if (!ALLOWED_METHODS.includes(method)) throw new ValidationError('不支持的支付方式');

    const uid = userId(request);
    const requestFingerprint = crypto.createHash('sha256')
      .update(JSON.stringify({ user_id: uid, amount: amount.toFixed(2), payment_method: method }))
      .digest('hex');
    const idemKey = resolveIdempotencyKey(request as { headers: Record<string, string | string[] | undefined> }, crypto.randomUUID());
    // 资金写路径严格模式（failClosed）：Redis 幂等锁不可用必须 503，不得静默降级绕过
    const idem = await acquireIdempotencyLock(idemKey, IDEMPOTENCY_TTL_SECONDS, { failClosed: true });
    if (idem.status === 'unavailable') {
      throw new IdempotencyUnavailableError({ requestId: idemKey });
    }
    if (idem.status === 'duplicate') {
      const cached = await getCachedIdempotentResponse(idemKey);
      if (cached?.body !== undefined) {
        if (cached.request_fingerprint !== requestFingerprint) {
          throw new AppError('相同幂等键不可用于不同充值请求', 409, 'IDEMPOTENCY_CONFLICT');
        }
        reply.header('X-Idempotent-Replay', 'true');
        return reply.send(cached.body);
      }
      throw new AppError('充值请求正在处理中或已存在', 409, 'IDEMPOTENCY_CONFLICT');
    }
    const lockToken = idem.status === 'acquired' ? idem.token : null;
    const orderNo = genOrderNo();
    // R5（ARCH v1.1 §2.2.2）：用户自助充值单创建时按金额定级并固化（B18 提交时点，
    // Q12 用户自助单同样分级）；不计入 R6 限额（B10/Q8：充值审核不计入任何维度），
    // 因此 limit_check 为 null、limit_escalated=false。
    const approvalRules = await getApprovalRules();
    const level = calcApprovalTier(amount, 'increase', approvalRules);
    let order: typeof schema.rechargeOrders.$inferSelect | undefined;
    try {
      [order] = await db
        .insert(schema.rechargeOrders)
      .values({
        userId: uid,
        orderNo,
        amount: amount.toFixed(2),
        currency: 'CNY',
        method,
        status: 'pending',
        idempotencyKey: idemKey,
        metadata: {
          source: 'web',
          approval: buildApprovalMeta(level, null),
          approval_level: level,
          approval_phase: 'level1_pending',
          limit_escalated: false,
        },
      })
        .returning();
    } catch (err) {
      if (isIdempotencyUniqueViolation(err)) {
        if (lockToken) await releaseIdempotencyLock(idemKey, lockToken);
        throw new AppError('相同幂等键的充值订单已存在', 409, 'IDEMPOTENCY_CONFLICT');
      }
      if (lockToken) await releaseIdempotencyLock(idemKey, lockToken);
      throw err;
    }

    if (!order) {
      if (lockToken) await releaseIdempotencyLock(idemKey, lockToken);
      throw new AppError('Failed to create order', 500, 'ORDER_CREATE_FAILED');
    }

    // 支付配置（后台可配置）：对公账户 + 通道启停
    const payCfg = parsePaymentConfig((await db.select({ value: schema.systemConfig.value })
      .from(schema.systemConfig)
      .where(sql`${schema.systemConfig.key} = 'payment_config'`))[0]?.value);

    const data: Record<string, unknown> = {
      order_id: order.orderNo,
      status: order.status,
    };
    if (method === 'bank_transfer') {
      const bank = payCfg.bank;
      data.bank_info = {
        account_name: bank.account_name || DEFAULT_BANK_INFO.account_name,
        account_number: bank.account_number || DEFAULT_BANK_INFO.account_number,
        bank_name: bank.bank_name || DEFAULT_BANK_INFO.bank_name,
        branch_name: bank.branch_name || DEFAULT_BANK_INFO.branch_name,
      };
    } else {
      // 线上通道：渠道未启用时前端禁用，此处仅透传订单信息 + 支付参数占位
      const channel = method === 'alipay' ? payCfg.alipay : method === 'wechat' ? payCfg.wechat : payCfg.qq;
      const channelEnabled = method === 'qq' ? payCfg.qq.enabled : (channel as { enabled: boolean }).enabled;
      data.qr_code_url = ''; // 真实支付网关对接后返回二维码/支付链接（见 docs 支付接入方案）
      data.expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      data.channel_enabled = !!channelEnabled;
    }
    const responseBody = { data };
    const cacheEntry: IdempotencyCachedEntry = {
      streamed: false,
      body: responseBody,
      request_fingerprint: requestFingerprint,
      summary: {
        idempotent_replay: false,
        model: 'recharge',
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cost: String(amount.toFixed(2)),
        finish_reason: null,
        streamed: false,
        request_id: idemKey,
      },
    };
    await cacheIdempotentResponse(idemKey, cacheEntry);
    // 成功请求的 Redis 锁保留至 TTL，防止幂等窗口内重复创建；degraded 无需释放。
    return reply.status(201).send(responseBody);
  });

  /** GET /api/v1/me/recharge-orders — 我的充值订单 */
  app.get('/api/v1/me/recharge-orders', { preHandler: [jwtAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { page?: string; page_size?: string };
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 50);
    const uid = userId(request);

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(schema.rechargeOrders)
        .where(eq(schema.rechargeOrders.userId, uid))
        .orderBy(desc(schema.rechargeOrders.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.rechargeOrders)
        .where(eq(schema.rechargeOrders.userId, uid)),
    ]);

    const list = rows.map((r) => ({
      id: r.id,
      order_id: r.orderNo,
      amount: Number(r.amount),
      payment_method: r.method,
      status: userStatus(r.status),
      paid_at: r.paidAt,
      created_at: r.createdAt,
      can_retry: r.status === 'failed',
    }));

    return reply.send({
      data: { list, pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) } },
    });
  });

  /** GET /api/v1/me/promotions — 促销活动（当前无） */
  app.get('/api/v1/me/promotions', { preHandler: [jwtAuth] }, async (_request, reply) => {
    return reply.send({ data: { list: [] } });
  });

  /**
   * POST /api/v1/me/redemption/redeem — 兑换码兑换（P1-1）
   *
   * 表语义（见 iteration-plan-v2.md P1-1）：coupon_codes 是批次模板
   * （batch_code/face_value/total_count/used_count），campaign_coupon_codes 才是单个码
   * （code/status/used_by/used_at）。本端点操作 campaign_coupon_codes：
   *   1. 按 code 查单个码 + 关联批次（campaign_coupon_codes.campaign_id → coupon_codes.id）；
   *   2. 事务内原子占用（仅 status='unused' 可兑）→ 批次 used_count +1 → 余额入账 + 写流水；
   *   3. 错误：码不存在 404 / 已使用 409 / 批次停用或过期 400。
   */
  app.post('/api/v1/me/redemption/redeem', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const body = (request.body || {}) as Record<string, unknown>;
    const code = String(body.code || '').trim();
    if (!code) throw new ValidationError('兑换码不能为空');

    // 单个码 + 关联批次模板（face_value / 批次状态 / 有效期）
    const [row] = await db.select({
      id: campaignCouponCodes.id,
      status: campaignCouponCodes.status,
      usedBy: campaignCouponCodes.usedBy,
      usedAt: campaignCouponCodes.usedAt,
      batchId: schema.couponCodes.id,
      faceValue: schema.couponCodes.faceValue,
      batchStatus: schema.couponCodes.status,
      validFrom: schema.couponCodes.validFrom,
      validTo: schema.couponCodes.validTo,
    })
      .from(campaignCouponCodes)
      .innerJoin(schema.couponCodes, eq(schema.couponCodes.id, campaignCouponCodes.campaignId))
      .where(eq(campaignCouponCodes.code, code))
      .limit(1);

    if (!row) throw new AppError('兑换码不存在', 404, 'CODE_NOT_FOUND');
    if (row.status !== 'unused' || row.usedBy != null) {
      throw new AppError('兑换码已被使用', 409, 'CODE_ALREADY_USED');
    }
    if (row.batchStatus !== 'active') {
      throw new AppError('该兑换码批次已停用', 400, 'CODE_BATCH_DISABLED');
    }
    const now = new Date();
    if (row.validFrom && now < row.validFrom) {
      throw new AppError('兑换码尚未生效', 400, 'CODE_NOT_YET_VALID');
    }
    if (row.validTo && now > row.validTo) {
      throw new AppError('兑换码已过期', 400, 'CODE_EXPIRED');
    }

    // 事务：占用 + 批次计数 + 入账 + 流水 一次性提交，失败整体回滚
    const result = await db.transaction(async (tx) => {
      // 原子占用：仅 status='unused' 可兑；并发重复兑换时第二次 UPDATE 命中 0 行 → null
      const [claimed] = await tx.update(campaignCouponCodes)
        .set({ status: 'used', usedBy: uid, usedAt: new Date() })
        .where(and(eq(campaignCouponCodes.code, code), eq(campaignCouponCodes.status, 'unused')))
        .returning({ id: campaignCouponCodes.id });
      if (!claimed) return null;

      // 批次 used_count 扣减
      await tx.update(schema.couponCodes)
        .set({ usedCount: sql`${schema.couponCodes.usedCount} + 1`, updatedAt: new Date() })
        .where(eq(schema.couponCodes.id, row.batchId));

      // 余额入账：统一收口 creditBalance（无余额行自动建户兜底 + 原子增额 + 资金流水，同事务）
      // 对齐充值审核路径（R1-USER-DRILL-002）：历史/异常用户（无 customer_balances 行）不再 404。
      const { balanceAfter } = await creditBalance(tx, {
        userId: uid,
        amount: row.faceValue,
        type: 'recharge',
        referenceType: 'redemption',
        referenceId: String(claimed.id),
        description: `兑换码 ${code} 充值`,
      });

      return { claimedId: claimed.id, balanceAfter };
    });

    if (!result) throw new AppError('兑换码已被使用', 409, 'CODE_ALREADY_USED');

    // 尽力同步 Redis 热账本（与 addBalance 语义一致，失败不影响主链路）
    await adjustLedgerAvailable(uid, Number(row.faceValue));
    await clearNegativeFlag(uid);

    return reply.send({
      data: {
        code,
        amount: Number(row.faceValue),
        balance_after: Number(result.balanceAfter),
        message: '兑换成功',
      },
    });
  });

  /** GET /api/v1/me/recharge/records — 我的充值记录（TopupRecordsPage 契约）
   *
   * P：page（默认1）、page_size（默认20，上限于10_000 以支持 CSV 导出）
   * 时间筛选：?days=7|30|90（近 N 天）或 ?start_date+end_date（自定义，ISO 日期串）。
   * 返回 { data: { list, total } }，金额为元（不复乘 100）。
   */
  app.get('/api/v1/me/recharge/records', { preHandler: [jwtAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { page?: string; page_size?: string; days?: string; start_date?: string; end_date?: string };
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 10_000);
    const uid = userId(request);

    const conditions: any[] = [eq(schema.rechargeOrders.userId, uid)];

    const daysRaw = q.days == null ? NaN : parseInt(String(q.days), 10);
    const days = Number.isFinite(daysRaw) ? daysRaw : NaN;
    if (Number.isFinite(days) && [7, 30, 90].includes(days)) {
      conditions.push(sql`${schema.rechargeOrders.createdAt} >= now() - (${days} || ' days')::interval`);
    }
    const startDate = q.start_date ? String(q.start_date).trim() : '';
    const endDate = q.end_date ? String(q.end_date).trim() : '';
    if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      conditions.push(gte(schema.rechargeOrders.createdAt, new Date(`${startDate}T00:00:00.000`)));
    }
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      conditions.push(lte(schema.rechargeOrders.createdAt, new Date(`${endDate}T23:59:59.999`)));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(schema.rechargeOrders)
        .where(whereClause)
        .orderBy(desc(schema.rechargeOrders.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.rechargeOrders)
        .where(whereClause),
    ]);

    const list = rows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const status = RECORD_STATUS[r.status] ?? r.status;
      return {
        id: r.id,
        order_id: r.orderNo,
        amount: Number(r.amount), // 元
        payment_method: r.method,
        method_label: RECORD_METHOD_LABEL[r.method] ?? r.method,
        status,
        status_label: RECORD_STATUS_LABEL[status] ?? status,
        create_time: r.createdAt,
        complete_time: r.paidAt,
        payer: null,
        trade_no: (meta.transfer_no as string) ?? null,
        remark: r.note,
        voucher: null,
        reject_reason: (meta.review_note as string) ?? null,
      };
    });

    return reply.send({
      data: { list, total: Number(countResult[0]?.count ?? 0) },
    });
  });

  /** GET /api/v1/me/redemption/history — 我的兑换历史（RedemptionPage 契约）
   *
   * campaign_coupon_codes JOIN coupon_codes，取 used_by=uid 且 status='used' 的已兑换码。
   * 返回 { data: { list } }，金额为元（face_value 元，不复乘 100）。按 usedAt 倒序。
   */
  app.get('/api/v1/me/redemption/history', { preHandler: [jwtAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { page_size?: string };
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 100);
    const uid = userId(request);

    const rows = await db
      .select({
        id: campaignCouponCodes.id,
        code: campaignCouponCodes.code,
        faceValue: schema.couponCodes.faceValue,
        batchName: schema.couponCodes.batchName,
        usedAt: campaignCouponCodes.usedAt,
        createdAt: campaignCouponCodes.createdAt,
      })
      .from(campaignCouponCodes)
      .innerJoin(schema.couponCodes, eq(schema.couponCodes.id, campaignCouponCodes.campaignId))
      .where(and(eq(campaignCouponCodes.usedBy, uid), eq(campaignCouponCodes.status, 'used')))
      .orderBy(desc(campaignCouponCodes.usedAt))
      .limit(pageSize);

    const list = rows.map((c) => ({
      id: c.id,
      code: c.code,
      amount: Number(c.faceValue), // 元
      batch_name: c.batchName ?? null,
      created_at: c.usedAt ?? c.createdAt,
    }));

    return reply.send({ data: { list } });
  });

  // ═══ 管理端 ═══

  /** GET /api/v1/admin/recharge-orders — 充值订单列表
   * 鉴权：requirePerm('finance.topup')（修复 P1-3，调度裁决）——A4 已放行 finance
   * 审核充值订单，列表必须可看（D2 财务导航闭环）；列表仅返回订单 + 用户基本信息，
   * 无敏感字段。
   */
  app.get('/api/v1/admin/recharge-orders', { preHandler: [requirePerm('finance.topup')] }, async (request, reply) => {
    const q = (request.query || {}) as { status?: string; search?: string; page?: string; page_size?: string };
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 200);

    const conditions: any[] = [];
    if (q.status) {
      // 前端用 completed → 后端 paid
      const dbStatus = q.status === 'completed' ? 'paid' : q.status;
      conditions.push(eq(schema.rechargeOrders.status, dbStatus as any));
    }
    if (q.search) {
      conditions.push(sql`(${schema.rechargeOrders.orderNo} ILIKE ${'%' + q.search + '%'} OR ${schema.users.email} ILIKE ${'%' + q.search + '%'})`);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: schema.rechargeOrders.id,
          orderNo: schema.rechargeOrders.orderNo,
          userId: schema.rechargeOrders.userId,
          amount: schema.rechargeOrders.amount,
          method: schema.rechargeOrders.method,
          status: schema.rechargeOrders.status,
          paidAt: schema.rechargeOrders.paidAt,
          createdAt: schema.rechargeOrders.createdAt,
          note: schema.rechargeOrders.note,
          metadata: schema.rechargeOrders.metadata,
          email: schema.users.email,
          name: schema.users.name,
        })
        .from(schema.rechargeOrders)
        .leftJoin(schema.users, eq(schema.users.id, schema.rechargeOrders.userId))
        .where(whereClause)
        .orderBy(desc(schema.rechargeOrders.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.rechargeOrders)
        .leftJoin(schema.users, eq(schema.users.id, schema.rechargeOrders.userId))
        .where(whereClause),
    ]);

    // 审批人姓名/邮箱回显（frontend 需求）：批量查 users
    const reviewerIds = new Set<number>();
    for (const r of rows) {
      const approval = (((r.metadata ?? {}) as Record<string, unknown>).approval ?? {}) as Record<string, unknown>;
      for (const key of ['first_reviewer', 'second_reviewer', 'super_reviewer']) {
        const vid = approval[key];
        if (vid != null && Number.isFinite(Number(vid))) reviewerIds.add(Number(vid));
      }
    }
    const reviewerRows = reviewerIds.size > 0
      ? await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
          .from(schema.users).where(inArray(schema.users.id, [...reviewerIds]))
      : [];
    const reviewerMap = new Map(reviewerRows.map((u) => [u.id, u]));

    const list = rows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const approval = (meta.approval ?? {}) as Record<string, unknown>;
      // R5 审批字段（ARCH §2.5.4，纯增量向后兼容）：终态按 status 推导，在途读顶层/嵌套键
      const approvalPhase: RechargeApprovalPhase | 'rejected' = r.status === 'paid'
        ? 'approved'
        : r.status === 'failed'
          ? 'rejected'
          : (String(meta.approval_phase ?? approval.phase ?? 'level1_pending') as RechargeApprovalPhase);
      const reviewerEmail = (key: string): string | null => {
        const vid = approval[key];
        if (vid == null || !Number.isFinite(Number(vid))) return null;
        return reviewerMap.get(Number(vid))?.email ?? null;
      };
      return {
        id: r.id,
        order_no: r.orderNo,
        user_id: r.userId,
        username: r.name,
        email: r.email,
        amount: Number(r.amount),
        payment_method: r.method,
        payment_method_label: METHOD_LABEL[r.method] ?? r.method,
        status: adminStatus(r.status),
        status_label: ADMIN_STATUS_LABEL[r.status] ?? r.status,
        // R5 审批进度（前端据此展示"待一级/待二级/待终审"并控制按钮）
        approval_level: meta.approval_level ?? approval.level ?? null,
        approval_phase: approvalPhase,
        first_reviewer_id: approval.first_reviewer ?? null,
        second_reviewer_id: approval.second_reviewer ?? null,
        super_reviewer_id: approval.super_reviewer ?? null,
        // 审批人姓名/邮箱回显（frontend 展示用；缺失返回 null）
        first_reviewer_email: reviewerEmail('first_reviewer'),
        second_reviewer_email: reviewerEmail('second_reviewer'),
        super_reviewer_email: reviewerEmail('super_reviewer'),
        created_at: r.createdAt,
        completed_at: r.paidAt,
      };
    });

    return reply.send({
      data: {
        list,
        pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) },
      },
    });
  });

  /** POST /api/v1/admin/recharge-orders/:id/audit — 审核通过（R5 多阶段，确认到账）
   *
   * 契约（ARCH §2.5.3）：
   *   - tier1 → 200 { id, order_no, status:'paid', balanceAfter }（单审路径零变化）
   *   - 多阶段 → 200 { id, order_no, status:'pending', approval_level, approval_phase }
   *   - 职责分离：仅 metadata.created_by 存在（manual 单）时校验"审核人 ≠ 创建人"；
   *     用户自助单（source='web'，创建人是用户本人）天然满足，跳过检查（ARCH §2.5.3）
   *   - 双签 B10/Q8：充值订单审核完全不计入限额（操作人/被入账用户维度均不计），
   *     因此 audit 不做限额预检/复核/计数（支付渠道风控 + Q12 分级审批已兜底）
   *   - 错误码：400 VALIDATION_ERROR（职责分离/阶段不匹配）、403 FORBIDDEN（终审非 super_admin）、
   *     409 ORDER_ALREADY_PROCESSED（并发重复审核/阶段守卫 0 行）、403/429 OPERATION_2FA_*（R7）
   */
  app.post('/api/v1/admin/recharge-orders/:id/audit', { preHandler: [requirePerm('finance.topup'), requireOperation2fa] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ValidationError('Invalid order id');
    const operatorId = ((request as any).userContext as { userId: number }).userId;
    const operatorRole = ((request as any).userContext as { role: string }).role;

    // 多阶段状态机（与人工上账 review 同构，ARCH §2.4.2）
    const result = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(schema.rechargeOrders).where(eq(schema.rechargeOrders.id, orderId)).limit(1);
      if (!order) return null;

      // 审批态解析：存量 pending 单无 approval → 沿用提交时级别（B18 = 单审，不重算）
      const approval = resolveOrderApproval(order.metadata, Number(order.amount));
      const { level, phase, meta: approvalMeta } = approval;
      if (order.status !== 'pending' || phase === 'approved') {
        throw new AppError('订单不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');
      }

      // ── 职责分离（仅 manual 单校验；用户自助单跳过，ARCH §2.6） ──
      // B4：manual 单创建人=审批人时，仅 super_admin 且带 escalation_reason 可降级代审
      const body = (request.body ?? {}) as { escalation_reason?: string };
      const escalationReason = String(body.escalation_reason ?? '').trim() || null;
      let degradedReview = false;
      const assertNotCreator = (stage: string) => {
        if (approval.createdBy != null && operatorId === approval.createdBy) {
          if (operatorRole === 'super_admin' && escalationReason) {
            degradedReview = true;
            return;
          }
          throw new ValidationError(`${stage}不能是创建人（职责分离）`);
        }
      };
      if (phase === 'level1_pending') {
        assertNotCreator('审核人');
      } else if (phase === 'level2_pending') {
        assertNotCreator('二级审批人');
        if (approvalMeta && operatorId === approvalMeta.first_reviewer) {
          throw new ValidationError('二级审批人不能是一级审批人（职责分离）');
        }
      } else if (phase === 'super_pending') {
        if (operatorRole !== 'super_admin') {
          throw new ForbiddenError('终审仅 super_admin 角色可执行');
        }
        assertNotCreator('终审人');
        if (approvalMeta && (operatorId === approvalMeta.first_reviewer || operatorId === approvalMeta.second_reviewer)) {
          throw new ValidationError('终审人不能是前两级审批人（职责分离）');
        }
      }

      // ── 阶段推进：next='approved' 表示最终批准（置 paid + 入账）；否则仍 pending ──
      const next = nextPhaseAfterApprove(phase, level);
      const now = new Date();
      const patch = approveStagePatch(order.metadata, level, phase, operatorId, next, now);
      const guardPhase = phase === 'level1_pending'
        ? sql`(metadata->>'approval_phase' IS NULL OR metadata->>'approval_phase' = 'level1_pending')`
        : sql`metadata->>'approval_phase' = ${phase}`;
      const [updated] = await tx.update(schema.rechargeOrders)
        .set({
          status: next === 'approved' ? 'paid' : 'pending',
          paidAt: next === 'approved' ? now : null,
          metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
          updatedAt: now,
        })
        .where(and(eq(schema.rechargeOrders.id, orderId), eq(schema.rechargeOrders.status, 'pending'), guardPhase))
        .returning();
      if (!updated) throw new AppError('订单不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');

      if (next !== 'approved') {
        return { kind: 'stage' as const, order, level, phase: next };
      }

      // 最终批准：R2 收口入账（无余额行自动建户 + 原子增额 + 资金流水，同事务）
      const { balanceAfter } = await creditBalance(tx, {
        userId: order.userId,
        amount: order.amount,
        type: 'recharge',
        referenceType: 'recharge_order',
        referenceId: String(order.id),
        description: `对公/线上充值审核通过 ${order.orderNo}`,
      });

      // 审核人落库（裁决 A8 语义：顶层 reviewer_id；充值审核同构）
      await tx.update(schema.rechargeOrders)
        .set({ metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ reviewer_id: operatorId })}::jsonb` })
        .where(eq(schema.rechargeOrders.id, orderId));

      return { kind: 'final' as const, order, balanceAfter, level, degradedReview, escalationReason };
    });

    if (!result) throw new AppError('订单不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');

    // 阶段推进（非最终）：不入账、不通知；写审计 recharge_order.audit_stage
    if (result.kind === 'stage') {
      await db.insert(schema.auditLogs).values({
        userId: operatorId,
        action: 'recharge_order.audit_stage',
        resource: 'recharge_order',
        resourceId: String(result.order.id),
        details: {
          userId: result.order.userId,
          order_no: result.order.orderNo,
          approval_level: result.level,
          approval_phase: result.phase,
        } as any,
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.send({
        data: {
          id: result.order.id,
          order_no: result.order.orderNo,
          status: 'pending',
          approval_level: result.level,
          approval_phase: result.phase,
        },
        message: result.phase === 'level2_pending' ? '一级审批通过，等待二级审批' : '二级审批通过，等待终审',
      });
    }

    // 事务提交后：同步 Redis 热账本 available + 充值回正清除负余额标记（尽力而为，不阻塞主响应）
    await adjustLedgerAvailable(result.order.userId, Number(result.order.amount));
    await clearNegativeFlag(result.order.userId);

    // R4：入账通知（站内信必发 + 邮件按偏好；绝不进资金事务）
    const notification = await notifyUser({
      userId: result.order.userId,
      event: 'recharge_success',
      title: '充值到账通知',
      content: `您的账户已入账 ¥${Number(result.order.amount).toFixed(2)}，当前余额 ¥${Number(result.balanceAfter).toFixed(2)}`,
      templateName: 'recharge_success',
      templateVars: {
        amount: Number(result.order.amount).toFixed(2),
        balance_after: Number(result.balanceAfter).toFixed(2),
        order_no: result.order.orderNo,
      },
      metadata: { orderId: result.order.id, orderNo: result.order.orderNo },
    });

    // 审计（本期新增：充值审核入账留痕，含通知状态；资金写操作 P3 审计要求）
    await db.insert(schema.auditLogs).values({
      userId: operatorId,
      action: 'recharge_order.audit',
      resource: 'recharge_order',
      resourceId: String(result.order.id),
      details: {
        userId: result.order.userId,
        amount: Number(result.order.amount),
        order_no: result.order.orderNo,
        // 审计 details 对齐 ARCH §6.3：notification: { in_app, email }（snake_case）
        notification: { in_app: notification.inApp, email: notification.email },
        // R7：二次确认标记（E30）
        confirmed: true,
        // B4：降级代审审计标记
        degraded: result.degradedReview,
        escalation_reason: result.degradedReview ? result.escalationReason : null,
      } as any,
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return reply.send({
      data: {
        id: result.order.id,
        order_no: result.order.orderNo,
        status: 'paid',
        balanceAfter: result.balanceAfter,
        approval_level: result.level,
        approval_phase: 'approved',
      },
    });
  });

  /** POST /api/v1/admin/recharge-orders/:id/reject — 驳回（R5：任意阶段可驳回；manual 单创建人 ≠ 驳回人）
   * P2-3（评审）：驳回原因必填并落库 metadata.review_note（对齐 manual-topup reject 语义） */
  app.post('/api/v1/admin/recharge-orders/:id/reject', { preHandler: [requirePerm('finance.topup'), requireOperation2fa] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ValidationError('Invalid order id');
    const operatorId = ((request as any).userContext as { userId: number }).userId;
    const rejectNote = String((request.body as { note?: string } | undefined)?.note ?? '').trim();
    if (!rejectNote) throw new ValidationError('请填写驳回原因');

    const result = await db.transaction(async (tx) => {
      const [order] = await tx.select({ id: schema.rechargeOrders.id, metadata: schema.rechargeOrders.metadata, userId: schema.rechargeOrders.userId, orderNo: schema.rechargeOrders.orderNo })
        .from(schema.rechargeOrders).where(eq(schema.rechargeOrders.id, orderId)).limit(1);
      if (!order) return null;
      const meta = (order.metadata ?? {}) as Record<string, unknown>;
      const createdBy = meta.created_by != null && Number.isFinite(Number(meta.created_by)) ? Number(meta.created_by) : null;
      if (createdBy != null && createdBy === operatorId) {
        throw new ValidationError('创建人不能驳回自己发起的单据（职责分离）');
      }
      const [updated] = await tx
        .update(schema.rechargeOrders)
        .set({
          status: 'failed',
          metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ approval_phase: 'rejected', review_note: rejectNote })}::jsonb`,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.rechargeOrders.id, orderId), eq(schema.rechargeOrders.status, 'pending')))
        .returning({ id: schema.rechargeOrders.id, userId: schema.rechargeOrders.userId, orderNo: schema.rechargeOrders.orderNo });
      if (!updated) throw new AppError('订单不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');
      return { userId: updated.userId, orderNo: updated.orderNo };
    });

    if (!result) throw new AppError('订单不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');

    // 审计（修复 D-04，P3 顺手）：充值订单驳回留痕，对齐 manual-topup reject 的写审计行为
    await db.insert(schema.auditLogs).values({
      userId: operatorId,
      action: 'recharge_order.reject',
      resource: 'recharge_order',
      resourceId: String(orderId),
      details: { userId: result.userId, order_no: result.orderNo } as any,
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });
    return reply.send({ data: { id: orderId, order_no: result.orderNo, status: 'failed' } });
  });
}
