/**
 * 充值/对公打款 域路由 — 用户端 + 管理端
 *
 * 用户端（jwtAuth，/api/v1/me/*）：
 *   GET  /me/balance           当前余额
 *   POST /me/recharge          发起充值（对公转账返回 bank_info；扫码返回 mock qr）
 *   GET  /me/recharge-orders   我的充值订单（前端 RechargePage 契约）
 *   GET  /me/promotions        促销列表（空）
 *
 * 管理端（adminAuth，/api/v1/admin/*）：
 *   GET  /admin/recharge-orders              充值订单列表（AdminRechargeOrdersPage 契约）
 *   POST /admin/recharge-orders/:id/audit    审核通过 → 加余额 + 写 balance_transactions
 *   POST /admin/recharge-orders/:id/reject   驳回
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { getBalance } from '../services/billing/balance';
import { adjustLedgerAvailable, clearNegativeFlag } from '../services/billing/ledger';
// campaign_coupon_codes 未从 db/schema/index.ts 导出（该文件禁改），直接从表定义导入
import { campaignCouponCodes } from '../db/schema/coupons';
import { AppError, UnauthorizedError, ForbiddenError, ValidationError } from '../lib/errors';

// ── auth ─────────────────────────────────────────────
async function jwtAuth(request: any, _reply: any) {
  const token = request.headers.authorization?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid token');
  request.userContext = payload;
}

async function adminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
  if (role !== 'admin' && role !== 'super_admin') throw new ForbiddenError('Admin access required');
}

function userId(request: any): number {
  return (request as any).userContext.userId;
}

// ── 常量 ─────────────────────────────────────────────
/** 对公收款账户（对应前端 RechargePage 静态展示 + BankModal） */
const BANK_INFO = {
  account_name: '杭州灵通云智算科技有限公司',
  account_number: '5719020097201298888',
  bank_name: '招商银行杭州分行高新支行',
  branch_name: '高新支行',
};

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: '对公转账',
  alipay: '支付宝',
  wechat: '微信支付',
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

const ALLOWED_METHODS = ['bank_transfer', 'alipay', 'wechat'];
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
    const orderNo = genOrderNo();
    const [order] = await db
      .insert(schema.rechargeOrders)
      .values({
        userId: uid,
        orderNo,
        amount: amount.toFixed(2),
        currency: 'CNY',
        method,
        status: 'pending',
        metadata: { source: 'web' },
      })
      .returning();

    if (!order) throw new AppError('Failed to create order', 500, 'ORDER_CREATE_FAILED');

    const data: Record<string, unknown> = {
      order_id: order.orderNo,
      status: order.status,
    };
    if (method === 'bank_transfer') {
      data.bank_info = BANK_INFO;
    } else {
      data.qr_code_url = ''; // 扫码支付未接支付渠道，前端展示「二维码加载中」
      data.expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    }
    return reply.status(201).send({ data });
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

      // 余额入账（amount = face_value，元）
      const upd = await tx.execute(sql`
        UPDATE customer_balances
        SET available_balance = available_balance + ${row.faceValue}::numeric,
            total_balance = total_balance + ${row.faceValue}::numeric,
            version = version + 1,
            updated_at = NOW()
        WHERE user_id = ${uid}
        RETURNING available_balance AS "balanceAfter"
      `);
      const bal = upd[0] as unknown as { balanceAfter: string };
      if (!bal) throw new AppError('Balance account not found', 404, 'BALANCE_NOT_FOUND');

      await tx.insert(schema.balanceTransactions).values({
        userId: uid,
        type: 'recharge',
        amount: row.faceValue,
        balanceAfter: bal.balanceAfter,
        referenceType: 'redemption',
        referenceId: String(claimed.id),
        description: `兑换码 ${code} 充值`,
      });

      return { claimedId: claimed.id, balanceAfter: bal.balanceAfter };
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

  // ═══ 管理端 ═══

  /** GET /api/v1/admin/recharge-orders — 充值订单列表 */
  app.get('/api/v1/admin/recharge-orders', { preHandler: [adminAuth] }, async (request, reply) => {
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

    const list = rows.map((r) => ({
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
      created_at: r.createdAt,
      completed_at: r.paidAt,
    }));

    return reply.send({
      data: {
        list,
        pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) },
      },
    });
  });

  /** POST /api/v1/admin/recharge-orders/:id/audit — 审核通过（确认到账） */
  app.post('/api/v1/admin/recharge-orders/:id/audit', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ValidationError('Invalid order id');

    // 事务：原子置 paid + 加余额 + 写流水，防重复审核
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .update(schema.rechargeOrders)
        .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
        .where(and(eq(schema.rechargeOrders.id, orderId), eq(schema.rechargeOrders.status, 'pending')))
        .returning();
      if (!order) return null;

      const upd = await tx.execute(sql`
        UPDATE customer_balances
        SET available_balance = available_balance + ${order.amount}::numeric,
            total_balance = total_balance + ${order.amount}::numeric,
            version = version + 1,
            updated_at = NOW()
        WHERE user_id = ${order.userId}
        RETURNING available_balance AS "balanceAfter"
      `);
      const row = upd[0] as unknown as { balanceAfter: string };
      if (!row) throw new AppError('Balance account not found', 404, 'BALANCE_NOT_FOUND');

      await tx.insert(schema.balanceTransactions).values({
        userId: order.userId,
        type: 'recharge',
        amount: order.amount,
        balanceAfter: row.balanceAfter,
        referenceType: 'recharge_order',
        referenceId: String(order.id),
        description: `对公/线上充值审核通过 ${order.orderNo}`,
      });

      return { order, balanceAfter: row.balanceAfter };
    });

    if (!result) throw new AppError('订单不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');

    return reply.send({
      data: {
        id: result.order.id,
        order_no: result.order.orderNo,
        status: 'paid',
        balanceAfter: result.balanceAfter,
      },
    });
  });

  /** POST /api/v1/admin/recharge-orders/:id/reject — 驳回 */
  app.post('/api/v1/admin/recharge-orders/:id/reject', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ValidationError('Invalid order id');

    const [order] = await db
      .update(schema.rechargeOrders)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(and(eq(schema.rechargeOrders.id, orderId), eq(schema.rechargeOrders.status, 'pending')))
      .returning();

    if (!order) throw new AppError('订单不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');
    return reply.send({ data: { id: order.id, order_no: order.orderNo, status: 'failed' } });
  });
}
