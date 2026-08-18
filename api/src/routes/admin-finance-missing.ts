/**
 * 财务域缺失端点补齐 — 人工上账 / 兑换码批次 / 对账差异 / 折扣规则 / 税务银行
 *
 * 原型有但后端缺失的财务类端点，全部带 adminAuth（JWT + admin/super_admin 角色校验）。
 *
 * 端点清单：
 *   ── 人工上账 ──
 *   GET  /api/v1/admin/manual-topup                    人工上账列表（recharge_orders method='manual' join users）
 *   POST /api/v1/admin/manual-topup/:id/review         审核通过（事务：status→paid + 加余额 + 写流水）/ 驳回（→failed）
 *   ── 兑换码批次 ──
 *   GET  /api/v1/admin/redemption/batches              批次列表（coupon_codes 模板表）
 *   GET  /api/v1/admin/redemption/batches/:id          批次详情（含 campaign_coupon_codes 单个码）
 *   POST /api/v1/admin/redemption/batches              创建批次并生成 total_count 个兑换码
 *   POST /api/v1/admin/redemption/batches/:id/toggle   启停批次（active/disabled）
 *   ── 对账差异 ──
 *   GET  /api/v1/admin/reconciliation/diffs            对账差异列表（system_config key=reconciliation_diffs）
 *   POST /api/v1/admin/reconciliation/diffs/:id/:op    处理差异（op=resolve|ignore）
 *   ── 折扣规则 ──
 *   GET  /api/v1/admin/discount-rules                  折扣规则列表（system_config key=discount_rules）
 *   POST /api/v1/admin/discount-rules                  新建规则
 *   PUT  /api/v1/admin/discount-rules/:id              更新规则（含启停 { enabled }）
 *   POST /api/v1/admin/discount-rules/:id/delete       删除规则
 *   PUT  /api/v1/admin/discount-rules                  整体替换规则列表
 *   ── 税务银行 ──
 *   GET  /api/v1/admin/tax-banking/config              税务配置（system_config key=tax_banking_config）
 *   PUT  /api/v1/admin/tax-banking/config              保存税务配置 + 写历史（key=tax_banking_history）
 *   GET  /api/v1/admin/tax-banking/history             税率变更历史
 *   GET  /api/v1/admin/tax-banking/bank-accounts       代理商银行账户列表（agent_bank_accounts join agents/users）
 *   POST /api/v1/admin/tax-banking/bank-accounts       绑定/更新代理商银行账户（agent_id 唯一，存在即更新）
 *
 * 审计约定：写操作写 audit_logs；只读 GET 不写。与 admin-ops.ts 的 writeAudit 语义一致。
 * 存储约定：无专用表的业务（对账差异 / 折扣规则 / 税务配置与历史）用 system_config 存 JSON。
 */
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db, schema } from '../db';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, ValidationError, NotFoundError, AppError } from '../lib/errors';
// campaign_coupon_codes 从表定义直接导入（与 recharge.ts 一致）
import { campaignCouponCodes } from '../db/schema/coupons';

/* ───────── auth / audit ───────── */

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

/** 写入操作审计日志（对齐 admin-consumption.ts 风格，resource 按域传入） */
async function writeAudit(request: any, action: string, resource: string, resourceId: string | null, details: unknown) {
  const ctx = request.userContext ?? {};
  await db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource,
    resourceId,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/* ───────── 通用工具 ───────── */

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

/** 分页参数解析（page ≥ 1，page_size 1~200） */
function pageParams(q: Record<string, string | undefined>): { page: number; pageSize: number; offset: number } {
  const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 200);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/* ───────── system_config JSON 存储 ───────── */

/** 读取 system_config 中某个 JSON 键；不存在/解析失败返回 fallback */
async function loadJson(key: string, fallback: unknown): Promise<any> {
  const rows = await db.select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, key))
    .limit(1);
  if (!rows[0]?.value) return fallback;
  try {
    return JSON.parse(rows[0].value);
  } catch {
    return fallback;
  }
}

/** 写入 system_config JSON 键（幂等 upsert） */
async function saveJson(key: string, value: unknown, description: string, operatorId?: number | null) {
  const patch: { value: string; description: string; updatedAt: Date; updatedBy?: number } = {
    value: JSON.stringify(value),
    description,
    updatedAt: new Date(),
  };
  if (operatorId != null) patch.updatedBy = operatorId;
  await db.insert(schema.systemConfig)
    .values({ key, value: patch.value, description, updatedBy: operatorId ?? null })
    .onConflictDoUpdate({ target: schema.systemConfig.key, set: patch });
}

/* ───────── 常量 / 映射 ───────── */

/** 人工上账：DB status → 前端 status（paid→approved, failed→rejected） */
const MANUAL_STATUS_MAP: Record<string, string> = { paid: 'approved', failed: 'rejected' };
const MANUAL_STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  approved: '已入账',
  rejected: '已驳回',
};

/** 兑换码批次状态文案 */
const BATCH_STATUS_LABEL: Record<string, string> = {
  active: '启用中',
  disabled: '已停用',
  expired: '已过期',
};

const DIFF_CFG_KEY = 'reconciliation_diffs';      // 对账差异列表（JSON 数组）
const DISCOUNT_CFG_KEY = 'discount_rules';        // 折扣规则列表（JSON 数组）
const TAX_CFG_KEY = 'tax_banking_config';         // 税务配置（JSON 对象）
const TAX_HISTORY_KEY = 'tax_banking_history';    // 税率变更历史（JSON 数组）

const DEFAULT_TAX_CONFIG = { tax_rate: 20, tax_threshold: 800, vat_rate: 6, effective_date: '' };

export async function adminFinanceMissingRoutes(app: FastifyInstance) {
  /* ═══════════ 1. 人工上账 ═══════════ */

  /** GET /api/v1/admin/manual-topup?status=&page=&page_size= — 人工上账列表 */
  app.get('/api/v1/admin/manual-topup', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { status?: string; page?: string; page_size?: string };
    const { page, pageSize, offset } = pageParams(q);

    const conditions: any[] = [eq(schema.rechargeOrders.method, 'manual')];
    if (q.status) {
      // 前端状态 → DB 状态：approved→paid, rejected→failed, pending→pending
      const dbStatus = q.status === 'approved' ? 'paid' : q.status === 'rejected' ? 'failed' : q.status;
      conditions.push(eq(schema.rechargeOrders.status, dbStatus as any));
    }
    const whereClause = and(...conditions);

    const [rows, countResult] = await Promise.all([
      db.select({
        id: schema.rechargeOrders.id,
        userId: schema.rechargeOrders.userId,
        orderNo: schema.rechargeOrders.orderNo,
        amount: schema.rechargeOrders.amount,
        status: schema.rechargeOrders.status,
        note: schema.rechargeOrders.note,
        paidAt: schema.rechargeOrders.paidAt,
        createdAt: schema.rechargeOrders.createdAt,
        email: schema.users.email,
        name: schema.users.name,
      })
        .from(schema.rechargeOrders)
        .leftJoin(schema.users, eq(schema.users.id, schema.rechargeOrders.userId))
        .where(whereClause)
        .orderBy(desc(schema.rechargeOrders.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(schema.rechargeOrders)
        .leftJoin(schema.users, eq(schema.users.id, schema.rechargeOrders.userId))
        .where(whereClause),
    ]);

    const list = rows.map((r) => {
      const status = MANUAL_STATUS_MAP[r.status] ?? r.status;
      return {
        id: r.id,
        user_id: r.userId,
        username: r.name,
        email: r.email,
        amount: toNum(r.amount),
        note: r.note,
        status,
        status_label: MANUAL_STATUS_LABEL[status] ?? status,
        evidence_url: null,          // 凭证附件字段（当前表未存，留空契约）
        evidence_remark: null,
        review_note: r.status === 'failed' ? r.note : null, // 驳回时展示原因
        transfer_no: null,
        reviewer_id: null,
        created_at: r.createdAt,
      };
    });

    return reply.send({
      data: { list, pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) } },
    });
  });

  /** POST /api/v1/admin/manual-topup/:id/review — 审核（approve / reject） */
  app.post('/api/v1/admin/manual-topup/:id/review', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ValidationError('Invalid order id');
    const body = (request.body || {}) as { action?: string; note?: string };
    if (body.action !== 'approve' && body.action !== 'reject') {
      throw new ValidationError('action 必须为 approve 或 reject');
    }

    // 驳回：仅 pending 可驳回 → failed，记录驳回原因
    if (body.action === 'reject') {
      const [order] = await db
        .update(schema.rechargeOrders)
        .set({ status: 'failed', note: body.note?.trim() || null, updatedAt: new Date() })
        .where(and(eq(schema.rechargeOrders.id, orderId), eq(schema.rechargeOrders.status, 'pending')))
        .returning();
      if (!order) throw new AppError('上账申请不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');
      await writeAudit(request, 'manual_topup.reject', 'recharge_order', String(orderId), { userId: order.userId });
      return reply.send({ data: { id: order.id, status: 'rejected' }, message: '已驳回' });
    }

    // 通过：事务内 原子置 paid + 加余额 + 写流水，防重复审核（对齐 recharge.ts /audit 模式）
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
        description: `人工上账审核通过 ${order.orderNo}`,
      });

      return { order, balanceAfter: row.balanceAfter };
    });

    if (!result) throw new AppError('上账申请不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');
    await writeAudit(request, 'manual_topup.approve', 'recharge_order', String(orderId), {
      userId: result.order.userId,
      amount: toNum(result.order.amount),
    });
    return reply.send({
      data: { id: result.order.id, status: 'approved', balance_after: toNum(result.balanceAfter) },
      message: '上账成功，金额已入账',
    });
  });

  /* ═══════════ 2. 兑换码批次 ═══════════ */

  /** 批次行 → 前端 Batch 契约（保留 batch_code/batch_name/face_value 与 name/amount 双命名） */
  function mapBatch(r: any) {
    const status = r.status;
    return {
      id: r.id,
      batch_code: r.batchCode,
      batch_name: r.batchName,
      name: r.batchName,
      face_value: toNum(r.faceValue),
      amount: toNum(r.faceValue),
      total_count: r.totalCount,
      used_count: r.usedCount,
      status,
      status_label: BATCH_STATUS_LABEL[status] ?? status,
      note: null,
      created_at: r.createdAt,
      expires_at: r.validTo,
    };
  }

  /** 批次号：B + yyyyMMddHHmmss + 4 位随机 */
  function genBatchCode(): string {
    const d = new Date();
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const rand = String(Math.floor(1000 + Math.random() * 9000));
    return `B${ts}${rand}`;
  }

  /** 兑换码：12 位大写字母数字（去除易混淆字符） */
  function genCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const buf = crypto.randomBytes(12);
    let code = '';
    for (let i = 0; i < 12; i++) code += chars.charAt((buf[i] ?? 0) % chars.length);
    return code;
  }

  /** GET /api/v1/admin/redemption/batches — 批次列表 */
  app.get('/api/v1/admin/redemption/batches', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rows = await db.select().from(schema.couponCodes).orderBy(desc(schema.couponCodes.createdAt));
    return reply.send({ data: { list: rows.map(mapBatch) } });
  });

  /** GET /api/v1/admin/redemption/batches/:id — 批次详情（含兑换码 + 使用人邮箱） */
  app.get('/api/v1/admin/redemption/batches/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid batch id');

    const [batch] = await db.select().from(schema.couponCodes).where(eq(schema.couponCodes.id, id)).limit(1);
    if (!batch) throw new NotFoundError('Redemption batch', id);

    const codeRows = await db.select({
      id: campaignCouponCodes.id,
      code: campaignCouponCodes.code,
      status: campaignCouponCodes.status,
      usedAt: campaignCouponCodes.usedAt,
      email: schema.users.email,
    })
      .from(campaignCouponCodes)
      .leftJoin(schema.users, eq(schema.users.id, campaignCouponCodes.usedBy))
      .where(eq(campaignCouponCodes.campaignId, id))
      .orderBy(asc(campaignCouponCodes.id));

    const codes = codeRows.map((c) => ({
      id: c.id,
      code: c.code,
      status: c.status,
      used_by_email: c.email ?? null,
      used_at: c.usedAt,
    }));

    return reply.send({ data: { batch: mapBatch(batch), codes } });
  });

  /** POST /api/v1/admin/redemption/batches — 创建批次并生成兑换码 */
  app.post('/api/v1/admin/redemption/batches', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as { name?: string; amount?: number; total_count?: number; expires_at?: string; note?: string };
    const name = String(body.name ?? '').trim();
    const amount = Number(body.amount);
    const totalCount = parseInt(String(body.total_count ?? ''), 10);
    if (!name) throw new ValidationError('批次名称必填');
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('单码面额需大于 0');
    if (!Number.isInteger(totalCount) || totalCount <= 0 || totalCount > 10000) {
      throw new ValidationError('生成数量需在 1~10000 之间');
    }
    const expiresAt = body.expires_at ? new Date(body.expires_at) : null;
    if (expiresAt && isNaN(expiresAt.getTime())) throw new ValidationError('过期时间格式错误');
    const operatorId = (request as any).userContext?.userId ?? null;

    // 事务：写批次模板（coupon_codes）+ 批量生成单个码（campaign_coupon_codes），失败整体回滚
    const batch = await db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.couponCodes)
        .values({
          batchCode: genBatchCode(),
          batchName: name,
          couponType: 'fixed_amount',
          faceValue: amount.toFixed(2),
          totalCount,
          usedCount: 0,
          status: 'active',
          validTo: expiresAt,
          createdBy: operatorId,
        })
        .returning();
      if (!row) throw new AppError('批次创建失败', 500, 'BATCH_CREATE_FAILED');

      // 生成 total_count 个不重复兑换码（高熵随机，冲突概率可忽略）
      const codes: { campaignId: number; code: string }[] = [];
      const seen = new Set<string>();
      while (codes.length < totalCount) {
        const code = genCode();
        if (seen.has(code)) continue;
        seen.add(code);
        codes.push({ campaignId: row.id, code });
      }
      await tx.insert(campaignCouponCodes).values(codes);
      return row;
    });

    await writeAudit(request, 'redemption.batch.create', 'coupon_codes', String(batch.id), { name, amount, totalCount });
    return reply.status(201).send({
      data: { batch: mapBatch(batch), message: `批次已创建，已生成 ${totalCount} 个兑换码` },
    });
  });

  /** POST /api/v1/admin/redemption/batches/:id/toggle — 启停批次 */
  app.post('/api/v1/admin/redemption/batches/:id/toggle', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid batch id');
    const { status } = (request.body || {}) as { status?: string };
    if (status !== 'active' && status !== 'disabled') throw new ValidationError('status 必须为 active 或 disabled');

    const [batch] = await db.update(schema.couponCodes)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.couponCodes.id, id))
      .returning();
    if (!batch) throw new NotFoundError('Redemption batch', id);

    await writeAudit(request, 'redemption.batch.toggle', 'coupon_codes', String(id), { status });
    return reply.send({
      data: { id: batch.id, status: batch.status },
      message: status === 'active' ? '批次已启用' : '批次已停用',
    });
  });

  /* ═══════════ 3. 对账差异 ═══════════ */

  /** GET /api/v1/admin/reconciliation/diffs?status=&page=&page_size= — 对账差异列表
   * 数据源：system_config key=reconciliation_diffs（JSON 数组）。未来对账引擎可将
   * 平台/供应商账单比对结果写入同一键，本端点与处理操作即自动生效。
   */
  app.get('/api/v1/admin/reconciliation/diffs', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { status?: string; page?: string; page_size?: string };
    const { page, pageSize, offset } = pageParams(q);

    const all = await loadJson(DIFF_CFG_KEY, []) as any[];
    const filtered = q.status ? all.filter((d) => d.status === q.status) : all;

    return reply.send({
      data: {
        list: filtered.slice(offset, offset + pageSize),
        pagination: { page, pageSize, total: filtered.length },
        // 汇总（原型对账工作台 stages 口径）
        stages: {
          total: all.length,
          unresolved: all.filter((d) => d.status === 'unresolved').length,
          resolved: all.filter((d) => d.status === 'resolved').length,
          ignored: all.filter((d) => d.status === 'ignored').length,
        },
      },
    });
  });

  /** POST /api/v1/admin/reconciliation/diffs/:id/:op — 处理差异（resolve / ignore） */
  app.post('/api/v1/admin/reconciliation/diffs/:id/:op', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id, op } = request.params as { id: string; op: string };
    if (op !== 'resolve' && op !== 'ignore') throw new ValidationError('op 必须为 resolve 或 ignore');
    const diffId = parseInt(id, 10);
    if (!Number.isInteger(diffId) || diffId <= 0) throw new ValidationError('Invalid diff id');

    const diffs = await loadJson(DIFF_CFG_KEY, []) as any[];
    const target = diffs.find((d) => d.id === diffId);
    if (!target) throw new NotFoundError('Reconciliation diff', diffId);

    const operatorId = (request as any).userContext?.userId ?? null;
    target.status = op === 'resolve' ? 'resolved' : 'ignored';
    target.handled_at = new Date().toISOString();
    target.handled_by = operatorId;
    await saveJson(DIFF_CFG_KEY, diffs, '对账差异列表（JSON）', operatorId);

    await writeAudit(request, `reconciliation.diff.${op}`, 'reconciliation_diff', String(diffId), { status: target.status });
    return reply.send({
      data: { id: diffId, status: target.status },
      message: op === 'resolve' ? '差异已确认处理' : '差异已忽略',
    });
  });

  /* ═══════════ 4. 折扣规则 ═══════════ */

  interface DiscountRule {
    id: number;
    name: string;
    discount_type: string;
    discount_value: number;
    conditions: string;
    priority: number;
    enabled: boolean;
    start_date: string;
    end_date: string;
  }

  /** 归一化规则字段（容错前端任意/缺失字段） */
  function normalizeRule(raw: Partial<DiscountRule> & { id: number }): DiscountRule {
    return {
      id: raw.id,
      name: String(raw.name ?? '').trim() || '未命名规则',
      discount_type: ['percentage', 'fixed', 'threshold'].includes(String(raw.discount_type)) ? String(raw.discount_type) : 'percentage',
      discount_value: Number(raw.discount_value) || 0,
      conditions: typeof raw.conditions === 'string' ? raw.conditions : JSON.stringify(raw.conditions ?? {}),
      priority: Number(raw.priority) || 0,
      enabled: raw.enabled !== undefined ? !!raw.enabled : true,
      start_date: String(raw.start_date ?? ''),
      end_date: String(raw.end_date ?? ''),
    };
  }

  /** GET /api/v1/admin/discount-rules — 折扣规则列表 */
  app.get('/api/v1/admin/discount-rules', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rules = await loadJson(DISCOUNT_CFG_KEY, []) as DiscountRule[];
    return reply.send({ data: { list: rules } });
  });

  /** POST /api/v1/admin/discount-rules — 新建规则 */
  app.post('/api/v1/admin/discount-rules', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as Partial<DiscountRule>;
    const name = String(body.name ?? '').trim();
    if (!name) throw new ValidationError('规则名称必填');
    if (!Number.isFinite(Number(body.discount_value)) || Number(body.discount_value) < 0) {
      throw new ValidationError('折扣值必须为非负数字');
    }

    const rules = await loadJson(DISCOUNT_CFG_KEY, []) as DiscountRule[];
    const nextId = rules.length ? Math.max(...rules.map((r) => r.id)) + 1 : 1;
    const rule = normalizeRule({ ...body, id: nextId });
    rules.push(rule);
    const operatorId = (request as any).userContext?.userId ?? null;
    await saveJson(DISCOUNT_CFG_KEY, rules, '折扣规则列表（JSON）', operatorId);

    await writeAudit(request, 'discount_rule.create', 'discount_rules', String(rule.id), { name: rule.name });
    return reply.send({ data: { rule, message: '规则已创建' } });
  });

  /** PUT /api/v1/admin/discount-rules/:id — 更新规则（部分字段，含启停 { enabled }） */
  app.put('/api/v1/admin/discount-rules/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid rule id');
    const body = (request.body || {}) as Partial<DiscountRule>;

    const rules = await loadJson(DISCOUNT_CFG_KEY, []) as DiscountRule[];
    const idx = rules.findIndex((r) => r.id === id);
    if (idx < 0) throw new NotFoundError('Discount rule', id);

    const rule = normalizeRule({ ...rules[idx], ...body, id });
    rules[idx] = rule;
    const operatorId = (request as any).userContext?.userId ?? null;
    await saveJson(DISCOUNT_CFG_KEY, rules, '折扣规则列表（JSON）', operatorId);

    await writeAudit(request, 'discount_rule.update', 'discount_rules', String(id), { name: rule.name, enabled: rule.enabled });
    return reply.send({ data: { rule, message: '规则已更新' } });
  });

  /** POST /api/v1/admin/discount-rules/:id/delete — 删除规则 */
  app.post('/api/v1/admin/discount-rules/:id/delete', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid rule id');

    const rules = await loadJson(DISCOUNT_CFG_KEY, []) as DiscountRule[];
    const idx = rules.findIndex((r) => r.id === id);
    if (idx < 0) throw new NotFoundError('Discount rule', id);
    const removed = rules[idx] as DiscountRule;
    rules.splice(idx, 1);
    const operatorId = (request as any).userContext?.userId ?? null;
    await saveJson(DISCOUNT_CFG_KEY, rules, '折扣规则列表（JSON）', operatorId);

    await writeAudit(request, 'discount_rule.delete', 'discount_rules', String(id), { name: removed.name });
    return reply.send({ data: { id }, message: '规则已删除' });
  });

  /** PUT /api/v1/admin/discount-rules — 整体替换规则列表（{ list: [...] }） */
  app.put('/api/v1/admin/discount-rules', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as { list?: DiscountRule[] };
    const list = (Array.isArray(body.list) ? body.list : [])
      .map((r, i) => normalizeRule({ ...r, id: Number(r.id) || i + 1 }));
    const operatorId = (request as any).userContext?.userId ?? null;
    await saveJson(DISCOUNT_CFG_KEY, list, '折扣规则列表（JSON）', operatorId);

    await writeAudit(request, 'discount_rule.replace', 'discount_rules', null, { count: list.length });
    return reply.send({ data: { list, message: '规则已保存' } });
  });

  /* ═══════════ 5. 税务银行 ═══════════ */

  /** GET /api/v1/admin/tax-banking/config — 税务配置 */
  app.get('/api/v1/admin/tax-banking/config', { preHandler: [adminAuth] }, async (_request, reply) => {
    const cfg = await loadJson(TAX_CFG_KEY, DEFAULT_TAX_CONFIG);
    return reply.send({ data: cfg });
  });

  /** PUT /api/v1/admin/tax-banking/config — 保存税务配置并追加历史 */
  app.put('/api/v1/admin/tax-banking/config', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const taxRate = Number(body.tax_rate);
    const taxThreshold = Number(body.tax_threshold);
    const vatRate = Number(body.vat_rate);
    if (!Number.isFinite(taxRate) || taxRate < 0) throw new ValidationError('个税税率必须为非负数字');
    if (!Number.isFinite(taxThreshold) || taxThreshold < 0) throw new ValidationError('起征点必须为非负数字');
    if (!Number.isFinite(vatRate) || vatRate < 0) throw new ValidationError('增值税税率必须为非负数字');

    const cfg = {
      tax_rate: taxRate,
      tax_threshold: taxThreshold,
      vat_rate: vatRate,
      effective_date: String(body.effective_date ?? new Date().toISOString().slice(0, 10)),
    };
    const ctx = (request as any).userContext ?? {};
    const operatorId: number | null = ctx.userId ?? null;

    // 操作人显示名（优先 users.name，回退邮箱前缀）
    let operatorName = ctx.email ? String(ctx.email).split('@')[0] : '管理员';
    if (operatorId != null) {
      const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, operatorId)).limit(1);
      if (u) operatorName = u.name;
    }

    await saveJson(TAX_CFG_KEY, cfg, '税务配置（JSON）', operatorId);

    const history = await loadJson(TAX_HISTORY_KEY, []) as any[];
    history.unshift({
      id: history.length ? Math.max(...history.map((h) => h.id)) + 1 : 1,
      ...cfg,
      operator_name: operatorName,
      created_at: new Date().toISOString(),
    });
    await saveJson(TAX_HISTORY_KEY, history.slice(0, 50), '税率变更历史（JSON，最多 50 条）', operatorId);

    await writeAudit(request, 'tax_banking.config.update', 'system_config', TAX_CFG_KEY, cfg);
    return reply.send({ data: cfg, message: '税务配置已保存' });
  });

  /** GET /api/v1/admin/tax-banking/history — 税率变更历史 */
  app.get('/api/v1/admin/tax-banking/history', { preHandler: [adminAuth] }, async (_request, reply) => {
    const history = await loadJson(TAX_HISTORY_KEY, []);
    return reply.send({ data: { list: history } });
  });

  /** GET /api/v1/admin/tax-banking/bank-accounts — 代理商银行账户列表 */
  app.get('/api/v1/admin/tax-banking/bank-accounts', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rows = await db.select({
      id: schema.agentBankAccounts.id,
      agentId: schema.agentBankAccounts.agentId,
      bankName: schema.agentBankAccounts.bankName,
      accountNumber: schema.agentBankAccounts.accountNumber,
      accountHolder: schema.agentBankAccounts.accountHolder,
      updatedAt: schema.agentBankAccounts.updatedAt,
      agentName: schema.users.name,
    })
      .from(schema.agentBankAccounts)
      .leftJoin(schema.agents, eq(schema.agents.id, schema.agentBankAccounts.agentId))
      .leftJoin(schema.users, eq(schema.users.id, schema.agents.userId))
      .orderBy(desc(schema.agentBankAccounts.updatedAt));

    const list = rows.map((r) => ({
      id: r.id,
      agent_id: r.agentId,
      agent_name: r.agentName ?? `代理#${r.agentId}`,
      bank_name: r.bankName,
      account_number: r.accountNumber,
      account_holder: r.accountHolder,
      created_at: r.updatedAt, // 表无 created_at，用 updated_at 兜底
    }));
    return reply.send({ data: { list } });
  });

  /** POST /api/v1/admin/tax-banking/bank-accounts — 绑定/更新代理商银行账户（agent_id 唯一） */
  app.post('/api/v1/admin/tax-banking/bank-accounts', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as { agent_id?: number; bank_name?: string; account_number?: string; account_holder?: string };
    const agentId = Number(body.agent_id);
    const bankName = String(body.bank_name ?? '').trim();
    const accountNumber = String(body.account_number ?? '').trim();
    const accountHolder = String(body.account_holder ?? '').trim();
    if (!Number.isInteger(agentId) || agentId <= 0) throw new ValidationError('代理商 ID 必填');
    if (!bankName || !accountNumber || !accountHolder) throw new ValidationError('银行名称 / 卡号 / 持卡人必填');

    const [agent] = await db.select({ id: schema.agents.id }).from(schema.agents).where(eq(schema.agents.id, agentId)).limit(1);
    if (!agent) throw new NotFoundError('Agent', agentId);

    const existing = await db.select({ id: schema.agentBankAccounts.id })
      .from(schema.agentBankAccounts)
      .where(eq(schema.agentBankAccounts.agentId, agentId))
      .limit(1);

    let accountId: number;
    if (existing[0]) {
      await db.update(schema.agentBankAccounts)
        .set({ bankName, accountNumber, accountHolder, updatedAt: new Date() })
        .where(eq(schema.agentBankAccounts.id, existing[0].id));
      accountId = existing[0].id;
    } else {
      const [ins] = await db.insert(schema.agentBankAccounts)
        .values({ agentId, bankName, accountNumber, accountHolder })
        .returning();
      if (!ins) throw new AppError('银行账户创建失败', 500, 'BANK_ACCOUNT_CREATE_FAILED');
      accountId = ins.id;
    }

    const operatorId = (request as any).userContext?.userId ?? null;
    await writeAudit(request, 'tax_banking.bank_account.upsert', 'agent_bank_accounts', String(accountId), { agentId });
    return reply.send({ data: { id: accountId, agent_id: agentId }, message: '银行账户已保存' });
  });
}
