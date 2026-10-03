/**
 * 渠道（供应商）自助门户路由 — /api/v1/vendor/*（SPEC §25 渠道增强，P1）
 *
 * 端点：
 *   POST /api/v1/vendor/auth/login            — 渠道登录（邮箱+密码，独立 vendor 令牌）
 *   GET  /api/v1/vendor/dashboard              — 仪表盘（本月消耗 / 待结算 / 已结算 / 模型数）
 *   GET  /api/v1/vendor/settlements            — 历史结算单列表（复用管理员侧聚合口径）
 *   POST /api/v1/vendor/settlements/request    — 发起自助结算申请（§25.4，最低额 ¥500）
 *   GET  /api/v1/vendor/notifications          — 渠道公告（本人 + 广播，未过期）
 *   GET  /api/v1/vendor/models                 — 本渠道下的模型列表
 *
 * 认证与用户 JWT 隔离：vendor 令牌 payload 恒带 purpose='vendor'，用户令牌无此字段；
 * vendorAuth 校验 purpose==='vendor'，交叉使用即 401。登录口令用 bcryptjs（同用户体系）。
 *
 * @module routes
 * @see db/schema/vendor-portal.ts
 * @see docs/SPEC-§25-供应商增强.md
 * @see docs/ref-25-vendor-enhance.md
 */

import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, schema } from '../db/index.js';
import { eq, and, or, sql, desc, gte, isNull } from 'drizzle-orm';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  AppError,
} from '../lib/errors.js';
import {
  listSettlements,
  aggregateBySupplier,
} from '../services/finance/vendor-settlement.js';

/* ───────── vendor 独立令牌（与用户 JWT 隔离） ───────── */

const VENDOR_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
/** 自助结算最低申请额（元）— SPEC §25.4 边界 VEN-002 */
const MIN_SETTLEMENT_AMOUNT = 500;

interface VendorTokenPayload {
  purpose: 'vendor';
  vendorAccountId: number;
  supplierId: number;
  email: string;
}

/** 签发 vendor 访问令牌（12h，无状态；purpose='vendor' 与用户令牌隔离） */
function signVendorToken(payload: Omit<VendorTokenPayload, 'purpose'>): string {
  return jwt.sign({ ...payload, purpose: 'vendor' }, VENDOR_SECRET, { expiresIn: '12h' });
}

/** 校验 vendor 令牌；purpose 必须为 'vendor'，否则视为无效（用户令牌不可当 vendor 用） */
function verifyVendorToken(token: string): VendorTokenPayload | null {
  try {
    const payload = jwt.verify(token, VENDOR_SECRET) as VendorTokenPayload;
    return payload.purpose === 'vendor' ? payload : null;
  } catch {
    return null;
  }
}

/** vendorAuth preHandler：解析 Bearer → 校验 purpose='vendor' → 挂载 request.vendorContext */
async function vendorAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing vendor token');
  const payload = verifyVendorToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired vendor token');
  request.vendorContext = payload;
}

function supplierId(request: any): number {
  return (request as any).vendorContext.supplierId;
}

/* ───────── helpers ───────── */

/** numeric 列（postgres-js 返回 string）→ number */
function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parsePage(q: Record<string, unknown>): { page: number; pageSize: number } {
  const page = Math.max(parseInt(String(q.page ?? '1'), 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(String(q.pageSize ?? '20'), 10) || 20, 1), 100);
  return { page, pageSize };
}

/** 汇总某供应商未结算（非 paid）与已结算（paid）金额（元） */
async function settlementTotals(sid: number): Promise<{ pending: number; settled: number }> {
  const rows = await db
    .select({
      status: schema.vendorSettlements.status,
      total: sql<string>`coalesce(sum(${schema.vendorSettlements.totalAmount}), 0)`,
    })
    .from(schema.vendorSettlements)
    .where(eq(schema.vendorSettlements.supplierId, sid))
    .groupBy(schema.vendorSettlements.status);
  let pending = 0;
  let settled = 0;
  for (const r of rows) {
    const amt = toNum(r.total);
    if (r.status === 'paid') settled += amt;
    else pending += amt; // draft/generated/confirmed/disputed 均为待结算
  }
  return { pending, settled };
}

export async function vendorRoutes(app: FastifyInstance) {
  /* ───────── 登录（公开） ───────── */

  /**
   * POST /api/v1/vendor/auth/login — 渠道登录
   * body: { email, password }
   * 返回独立 vendor 令牌（purpose='vendor'）+ 渠道基本信息。
   */
  app.post('/api/v1/vendor/auth/login', async (request, reply) => {
    const body = (request.body ?? {}) as { email?: string; password?: string };
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    if (!email || !password) throw new ValidationError('email 和 password 不能为空');

    const [account] = await db
      .select()
      .from(schema.vendorAccounts)
      .where(eq(schema.vendorAccounts.email, email))
      .limit(1);
    // 统一错误文案，避免枚举账号是否存在
    if (!account || !bcrypt.compareSync(password, account.passwordHash)) {
      throw new UnauthorizedError('邮箱或密码错误');
    }
    if (account.status !== 'active') throw new ForbiddenError('该渠道账号已被冻结，请联系平台');

    const [supplier] = await db
      .select({ id: schema.suppliers.id, name: schema.suppliers.name, status: schema.suppliers.status })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.id, account.supplierId))
      .limit(1);
    if (!supplier) throw new NotFoundError('supplier', account.supplierId);
    if (supplier.status !== 'active') throw new ForbiddenError('该渠道当前不可用，请联系平台');

    // 记录登录时间
    await db
      .update(schema.vendorAccounts)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.vendorAccounts.id, account.id));

    const token = signVendorToken({
      vendorAccountId: account.id,
      supplierId: supplier.id,
      email: account.email,
    });

    return reply.send({
      data: {
        token,
        vendor: {
          id: account.id,
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          email: account.email,
        },
      },
    });
  });

  /* ───────── 以下均需 vendor 令牌 ───────── */

  /**
   * GET /api/v1/vendor/dashboard — 仪表盘
   * 返回本月消耗、待结算金额、已结算金额、模型数、是否有进行中的结算申请。
   */
  app.get('/api/v1/vendor/dashboard', { preHandler: [vendorAuth] }, async (request, reply) => {
    const sid = supplierId(request);
    const period = currentMonth();

    const [aggAll, totals, modelCount, openReq, supplierRow] = await Promise.all([
      aggregateBySupplier(period),
      settlementTotals(sid),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.supplierModels)
        .where(eq(schema.supplierModels.supplierId, sid)),
      db
        .select({ id: schema.vendorSettlementRequests.id })
        .from(schema.vendorSettlementRequests)
        .where(and(
          eq(schema.vendorSettlementRequests.supplierId, sid),
          eq(schema.vendorSettlementRequests.status, 'pending'),
        ))
        .limit(1),
      db
        .select({ name: schema.suppliers.name })
        .from(schema.suppliers)
        .where(eq(schema.suppliers.id, sid))
        .limit(1),
    ]);

    const thisMonth = aggAll.find((r) => r.supplierId === sid);

    return reply.send({
      data: {
        supplier_name: supplierRow[0]?.name ?? `#${sid}`,
        period,
        this_month_consumption: thisMonth ? thisMonth.totalAmount : 0,
        pending_settlement: totals.pending,
        settled_total: totals.settled,
        model_count: modelCount[0]?.c ?? 0,
        min_settlement_amount: MIN_SETTLEMENT_AMOUNT,
        has_open_settlement_request: openReq.length > 0,
      },
    });
  });

  /**
   * GET /api/v1/vendor/settlements — 历史结算单列表（仅本渠道）
   * query: page, pageSize
   */
  app.get('/api/v1/vendor/settlements', { preHandler: [vendorAuth] }, async (request, reply) => {
    const sid = supplierId(request);
    const { page, pageSize } = parsePage((request.query ?? {}) as Record<string, unknown>);
    const result = await listSettlements({ supplierId: sid, page, pageSize });
    return reply.send({ data: result });
  });

  /**
   * POST /api/v1/vendor/settlements/request — 发起自助结算申请（§25.4）
   *
   * 校验：渠道 active；待结算金额 ≥ ¥500；当前无 pending 申请。
   * 成功后状态 pending，等待管理员审核。
   */
  app.post('/api/v1/vendor/settlements/request', { preHandler: [vendorAuth] }, async (request, reply) => {
    const sid = supplierId(request);

    const totals = await settlementTotals(sid);
    if (totals.pending < MIN_SETTLEMENT_AMOUNT) {
      throw new AppError(
        `待结算金额 ¥${totals.pending.toFixed(2)} 不足最低结算额 ¥${MIN_SETTLEMENT_AMOUNT}，请累计后再申请`,
        422,
        'SETTLEMENT_BELOW_MINIMUM',
      );
    }

    const [existing] = await db
      .select({ id: schema.vendorSettlementRequests.id })
      .from(schema.vendorSettlementRequests)
      .where(and(
        eq(schema.vendorSettlementRequests.supplierId, sid),
        eq(schema.vendorSettlementRequests.status, 'pending'),
      ))
      .limit(1);
    if (existing) {
      throw new AppError('已有进行中的结算申请，请等待平台审核后再提交', 409, 'SETTLEMENT_REQUEST_DUPLICATE');
    }

    const [created] = await db
      .insert(schema.vendorSettlementRequests)
      .values({
        supplierId: sid,
        period: currentMonth(),
        estimatedAmount: totals.pending.toFixed(4),
        status: 'pending',
      })
      .returning();

    return reply.send({
      data: {
        id: created!.id,
        period: created!.period,
        estimated_amount: toNum(created!.estimatedAmount),
        status: created!.status,
        created_at: created!.createdAt.toISOString(),
      },
      message: '结算申请已提交，等待平台审核',
    });
  });

  /**
   * GET /api/v1/vendor/notifications — 渠道公告列表（本人 + 广播，未过期）
   * query: page, pageSize；置顶优先，其次按时间倒序。
   */
  app.get('/api/v1/vendor/notifications', { preHandler: [vendorAuth] }, async (request, reply) => {
    const sid = supplierId(request);
    const { page, pageSize } = parsePage((request.query ?? {}) as Record<string, unknown>);
    const offset = (page - 1) * pageSize;
    const now = new Date();

    const where = and(
      or(
        eq(schema.vendorNotifications.supplierId, sid),
        isNull(schema.vendorNotifications.supplierId),
      ),
      or(
        isNull(schema.vendorNotifications.expiresAt),
        gte(schema.vendorNotifications.expiresAt, now),
      ),
    );

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: schema.vendorNotifications.id,
          title: schema.vendorNotifications.title,
          content: schema.vendorNotifications.content,
          category: schema.vendorNotifications.category,
          priority: schema.vendorNotifications.priority,
          isPinned: schema.vendorNotifications.isPinned,
          createdAt: schema.vendorNotifications.createdAt,
        })
        .from(schema.vendorNotifications)
        .where(where)
        .orderBy(desc(schema.vendorNotifications.isPinned), desc(schema.vendorNotifications.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.vendorNotifications).where(where),
    ]);

    return reply.send({
      data: {
        items: rows.map((r) => ({
          id: r.id,
          title: r.title,
          content: r.content,
          category: r.category,
          priority: r.priority,
          is_pinned: r.isPinned,
          created_at: r.createdAt.toISOString(),
        })),
        total: countRows[0]?.count ?? 0,
        page,
        pageSize,
      },
    });
  });

  /**
   * GET /api/v1/vendor/models — 本渠道下的模型列表
   */
  app.get('/api/v1/vendor/models', { preHandler: [vendorAuth] }, async (request, reply) => {
    const sid = supplierId(request);
    const rows = await db
      .select({
        id: schema.supplierModels.id,
        model_name: schema.supplierModels.modelName,
        platform_model: schema.supplierModels.platformModel,
        model_code: schema.supplierModels.modelCode,
        input_price: schema.supplierModels.inputPrice,
        output_price: schema.supplierModels.outputPrice,
        currency: schema.supplierModels.currency,
        status: schema.supplierModels.status,
      })
      .from(schema.supplierModels)
      .where(eq(schema.supplierModels.supplierId, sid))
      .orderBy(desc(schema.supplierModels.id));

    return reply.send({ data: { items: rows, total: rows.length } });
  });
}
