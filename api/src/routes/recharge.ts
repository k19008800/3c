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
