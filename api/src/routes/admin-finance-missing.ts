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
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, ValidationError, NotFoundError, AppError, IdempotencyConflictError, IdempotencyUnavailableError } from '../lib/errors';
import { requirePerm } from '../middleware/require-perm';
import { requireOperation2fa } from '../middleware/require-operation-2fa';
import { creditBalance } from '../services/billing/balance';
import { adjustLedgerAvailable, clearNegativeFlag } from '../services/billing/ledger';
import { notifyUser } from '../services/notify';
import {
  getManualTopupMaxAmount,
  getApprovalRules,
  getCreditLimits,
  calcApprovalTier,
  calcEffectiveTier,
} from '../lib/finance-rules';
import {
  checkLimitsInTx,
  reserveInTx,
  syncRedisAdd,
  currentLimitContext,
  yuanToCents,
} from '../services/billing/credit-limit';
import {
  buildApprovalMeta,
  resolveOrderApproval,
  nextPhaseAfterApprove,
  approveStagePatch,
  type RechargeApprovalPhase,
} from '../services/billing/recharge-approval';
import {
  resolveIdempotencyKey,
  acquireIdempotencyLock,
  releaseIdempotencyLock,
  cacheIdempotentResponse,
  getCachedIdempotentResponse,
  IDEMPOTENCY_TTL_SECONDS,
} from '../services/idempotency';
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

/** 人工上账订单号：MT + yyyyMMddHHmmss + 4 位随机（对齐 recharge.ts genOrderNo 风格，避免与用户端 RC 前缀混淆） */
function genManualOrderNo(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `MT${ts}${rand}`;
}

/**
 * 判断 recharge_orders 唯一约束冲突类型（Postgres 23505，L2 幂等/单号唯一兜底）。
 *
 * 与 services/idempotency.ts 的 isIdempotencyUniqueViolation 区别：后者匹配
 * consumption_records.request_id 约束名（消费链路专用），财务写操作无对应语义，
 * 需按本表约束/索引名单独匹配（ARCH §3.4 / 修复 P1-1）。注意：PG 错误消息受
 * 服务端 lc_messages 影响可能是本地化文本，故只依赖 code=23505 + 约束/索引名
 * 关键字（英文/中文消息均可命中）。
 *
 * @param err - 捕获的异常（支持 Error.cause 解包，最多 3 层防环）
 * @returns 'idempotency_key'（uq_recharge_orders_idempotency_key）| 'transfer_no'
 *          （uq_recharge_orders_transfer_no）| null（非唯一约束冲突）
 */
function getRechargeOrderUniqueViolation(err: unknown): 'idempotency_key' | 'transfer_no' | null {
  let e: unknown = err;
  for (let i = 0; i < 3 && e && typeof e === 'object'; i++) {
    const cur = e as { code?: unknown; message?: unknown; cause?: unknown };
    if (cur.code === '23505' && typeof cur.message === 'string') {
      if (/idempotency_key/i.test(cur.message)) return 'idempotency_key';
      if (/transfer_no/i.test(cur.message)) return 'transfer_no';
    }
    e = cur.cause;
    if (e === undefined || e === null) break;
  }
  return null;
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
  app.get('/api/v1/admin/manual-topup', { preHandler: [requirePerm('finance.topup')] }, async (request, reply) => {
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
        metadata: schema.rechargeOrders.metadata,
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

    // 审批人姓名/邮箱回显（frontend 需求）：批量查 users（first/second/super reviewer）
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
      const status = MANUAL_STATUS_MAP[r.status] ?? r.status;
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const approval = (meta.approval ?? {}) as Record<string, unknown>;
      // R5 审批字段（ARCH §2.5.4，纯增量向后兼容）：终态按 status 推导，在途读顶层/嵌套键
      const approvalLevel = (meta.approval_level ?? approval.level ?? null);
      // R5 审批阶段（终态推导 / 在途读顶层或嵌套键）：approved/rejected 为终态展示值
      const approvalPhase: RechargeApprovalPhase | 'rejected' = status === 'approved'
        ? 'approved'
        : status === 'rejected'
          ? 'rejected'
          : (String(meta.approval_phase ?? approval.phase ?? 'level1_pending') as RechargeApprovalPhase);
      const reviewerEmail = (key: string): string | null => {
        const vid = approval[key];
        if (vid == null || !Number.isFinite(Number(vid))) return null;
        return reviewerMap.get(Number(vid))?.email ?? null;
      };
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
        // D-02：驳回原因独立存 metadata.review_note（原 note 保留为入账原因）
        review_note: r.status === 'failed' ? (meta.review_note ? String(meta.review_note) : null) : null,
        // R5：transfer_no 从 metadata 读取（创建端点写入，审核列表可见）
        transfer_no: meta.transfer_no ? String(meta.transfer_no) : null,
        reviewer_id: null,
        // R5 审批进度字段（ARCH §2.5.4）：前端据此展示"待一级/待二级/待终审"并控制按钮
        approval_level: approvalLevel ?? null,
        approval_phase: approvalPhase,
        first_reviewer_id: approval.first_reviewer ?? null,
        second_reviewer_id: approval.second_reviewer ?? null,
        super_reviewer_id: approval.super_reviewer ?? null,
        // 审批人姓名/邮箱回显（frontend 展示用；缺失返回 null）
        first_reviewer_email: reviewerEmail('first_reviewer'),
        second_reviewer_email: reviewerEmail('second_reviewer'),
        super_reviewer_email: reviewerEmail('super_reviewer'),
        created_at: r.createdAt,
      };
    });

    return reply.send({
      data: { list, pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) } },
    });
  });

  /** GET /api/v1/admin/manual-topup/users?search=&page_size= — 人工上账用户搜索（补充裁决 D1）
   *
   * 轻量只读搜索：finance 角色在人工上账页选择目标用户时调用（原 GET /admin/customers
   * 走 adminAuth，finance 角色 403，前端仅有直接输入用户 ID 兜底）。按 邮箱(ILIKE 模糊) /
   * 用户ID(精确) / 手机号(精确+模糊) 匹配，最多返回 10 条；只读 users 基本信息 +
   * customer_balances.available_balance，不返回密钥/证件等敏感字段；只读查询不写审计。
   * 不放开 GET /admin/customers（避免 agent/sales 越权看全量客户列表）。
   *
   * @see docs/ARCH-整改R1-R4-技术方案.md §12.4 补充裁决 D1
   */
  app.get('/api/v1/admin/manual-topup/users', { preHandler: [requirePerm('finance.topup')] }, async (request, reply) => {
    const q = (request.query || {}) as { search?: string; page_size?: string };
    const search = String(q.search ?? '').trim();
    // 搜索端点语义：无关键词返回空列表（避免退化为全量客户列表；D1 目的仅为辅助选择用户）
    if (!search) return reply.send({ data: { list: [] } });
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '10', 10) || 10, 1), 10);

    // 邮箱 ILIKE 模糊 / 用户ID 精确（id::text = search）/ 手机号 精确+模糊（ILIKE %search%）
    const rows = await db.select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      status: schema.users.status,
      availableBalance: schema.customerBalances.availableBalance,
    })
      .from(schema.users)
      .leftJoin(schema.customerBalances, eq(schema.customerBalances.userId, schema.users.id))
      .where(sql`(${schema.users.id}::text = ${search}
          OR ${schema.users.email} ILIKE ${'%' + search + '%'}
          OR ${schema.users.phone} ILIKE ${'%' + search + '%'})`)
      .orderBy(asc(schema.users.id))
      .limit(pageSize);

    return reply.send({
      data: {
        list: rows.map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          status: r.status,
          available_balance: toNum(r.availableBalance),   // 无余额行 → 0（只读占位）
        })),
      },
    });
  });

  /** POST /api/v1/admin/manual-topup — 发起人工上账（R1 创建端点 + R5 分级 + R6 限额 + R7 2FA）
   *
   * 契约见 ARCH §3.2 / §2.5.1：method='manual' / status='pending'；metadata 写
   * { source:'admin-manual-topup', created_by, transfer_no?, evidence_remark? } +
   * R5 { approval, approval_level, approval_phase }；仅 active 用户可入账（裁决 A7）；
   * 单笔上限由 finance_rules 配置，默认值遵循 accepted 裁决（人工上账 ¥50,000）；evidence_url 本期不接受（R9）；
   * 幂等按 §3.4（L1 Redis 锁 + L2 唯一列）；R6 创建预检（soft 升级/hard 429）；R7 操作级 2FA。
   */
  app.post('/api/v1/admin/manual-topup', { preHandler: [requirePerm('finance.topup'), requireOperation2fa] }, async (request, reply) => {
    const operatorId = ((request as any).userContext as { userId: number }).userId;
    const body = (request.body || {}) as {
      user_id?: number; amount?: number; note?: string;
      transfer_no?: string; evidence_remark?: string; evidence_url?: string;
    };

    // ── 参数校验 ──
    if (body.evidence_url !== undefined && body.evidence_url !== null && String(body.evidence_url).trim() !== '') {
      throw new ValidationError('本期不支持凭证上传（evidence_url），凭证上传能力将在后续版本开放');
    }
    const userId = Number(body.user_id);
    if (!Number.isInteger(userId) || userId <= 0) throw new ValidationError('请选择上账用户');
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('入账金额必须大于 0');
    // 最多 2 位小数（浮点容差：0.07*100 = 7.000000000000001 不误判）
    if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) throw new ValidationError('金额最多保留 2 位小数');
    const maxAmount = await getManualTopupMaxAmount();
    if (amount > maxAmount) {
      throw new ValidationError(`单笔上账金额不得超过 ¥${maxAmount.toLocaleString()}`);
    }
    const note = String(body.note ?? '').trim();
    if (!note) throw new ValidationError('请填写入账原因（对公到账请注明核实说明）');
    if (note.length > 500) throw new ValidationError('入账原因不能超过 500 字');
    const transferNo = body.transfer_no != null ? String(body.transfer_no).trim() : '';
    if (transferNo.length > 100) throw new ValidationError('转账单号不能超过 100 字符');
    const evidenceRemark = body.evidence_remark != null ? String(body.evidence_remark).trim() : '';
    if (evidenceRemark.length > 500) throw new ValidationError('凭证备注不能超过 500 字');

    // 转账单号全平台唯一（裁决 A6 / PRD C9 / 边界 B4，修复 P1-1）：
    // 填写则校验已存在记录 → 409；并发窗口由 0028 表达式唯一索引兜底（catch 转 409）
    if (transferNo) {
      const [dup] = await db.select({ id: schema.rechargeOrders.id })
        .from(schema.rechargeOrders)
        .where(sql`${schema.rechargeOrders.metadata}->>'transfer_no' = ${transferNo}`)
        .limit(1);
      if (dup) {
        throw new AppError('该转账单号已存在上账记录，请核实是否重复入账', 409, 'TRANSFER_NO_DUPLICATE');
      }
    }

    // 用户存在性 + 状态（仅 active 可入账，frozen/禁用拒绝，裁决 A7）
    const [user] = await db.select({ id: schema.users.id, status: schema.users.status })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!user) throw new NotFoundError('User', userId);
    if (user.status !== 'active') {
      throw new ValidationError('该用户处于禁用/冻结状态，请先在用户管理中解锁后再上账', { userId, status: user.status });
    }

    // ── R6 限额配置（先查限额 → 再定审批级别，ARCH v1.1 §3.4 时序） ──
    const [limits, approvalRules] = await Promise.all([getCreditLimits(), getApprovalRules()]);
    const operatorRole = ((request as any).userContext as { role: string }).role;

    // ── 幂等（L1 Redis 锁；duplicate → 缓存命中回放 / 否则 409；degraded → L2 唯一列兜底）──
    // 注意：不复用 replayIdempotentRequest（其 L2 DB 兜底绑定 consumption_records，
    // 财务写操作无对应语义，ARCH §3.4 不可复用清单）；仅按裁决回放 L1 缓存。
    const idemKey = resolveIdempotencyKey(request, crypto.randomUUID());
    // 资金写路径严格模式（failClosed）：Redis 幂等锁不可用必须 503，不得静默降级绕过
    const lock = await acquireIdempotencyLock(idemKey, IDEMPOTENCY_TTL_SECONDS, { failClosed: true });
    if (lock.status === 'unavailable') {
      throw new IdempotencyUnavailableError({ requestId: idemKey });
    }
    if (lock.status === 'duplicate') {
      const cached = await getCachedIdempotentResponse(idemKey);
      if (cached && cached.body !== undefined) {
        reply.header('X-Idempotent-Replay', 'true');
        return reply.send(cached.body);   // 回放首次响应（200 + 回放头）
      }
      throw new IdempotencyConflictError(idemKey);  // 首请求仍在处理中 / 缓存未命中
    }
    const lockToken = lock.status === 'acquired' ? lock.token : null;

    try {
      const orderNo = genManualOrderNo();

      // 创建事务：R6 创建时预占判定（advisory lock + 24h 滚动汇总 + 超限拒绝）→ 插入订单 →
      // 事件插行（op + user，refType='manual_topup'，幂等）。超 hard / exceed_action=reject →
      // 429 → 事务回滚 → 单据不创建（终裁 B9/B18/B19：创建时预占，驳回不回退）。
      const result = await db.transaction(async (tx) => {
        const check = await checkLimitsInTx(tx, {
          opUserId: operatorId,
          targetUserId: userId,
          amountYuan: amount,
          role: operatorRole,
          softLimitYuan: limits.softLimit,
          hardLimitYuan: limits.hardLimit,
          exceedAction: limits.exceedAction,
          exemptRoles: limits.exemptRoles,
          windowHours: limits.windowHours,
          // 调度终裁 P1-3：单笔 tier3（> superReviewThreshold）豁免 hard/soft，大额由三人审批链承接
          superReviewThresholdYuan: approvalRules.superReviewThreshold,
        });
        const escalated = check.op.escalated || check.user.escalated;
        // 审批档位 = max(金额档, 限额升级档)：任一维度 projected > soft → 至少 level2
        const tierByAmount = calcApprovalTier(amount, 'increase', approvalRules);
        const tier = calcEffectiveTier(tierByAmount, check.op.escalated, check.user.escalated);

        // R5：metadata.approval 初始化（level/phase='level1_pending'/limit_check）+ 顶层便捷键
        const approvalMeta = buildApprovalMeta(tier, {
          op_projected_cents: yuanToCents(check.op.projectedYuan),
          user_projected_cents: yuanToCents(check.user.projectedYuan),
          escalated,
          // 调度终裁 P1-3：tier3 单笔豁免原因（大额由审批链承接，仍计入累计）
          ...(check.largeApprovalChain ? { exempt_reason: 'large_approval_chain' } : {}),
        });
        const metadata: Record<string, unknown> = {
          source: 'admin-manual-topup',
          created_by: operatorId,     // 预留 R8 operatorId 来源
          approval: approvalMeta,
          approval_level: tier,
          approval_phase: 'level1_pending',
          // v1.1 §2.3.1：limit_escalated（R6 限额升级标记）
          limit_escalated: escalated,
        };
        if (transferNo) metadata.transfer_no = transferNo;
        if (evidenceRemark) metadata.evidence_remark = evidenceRemark;

        const [order] = await tx.insert(schema.rechargeOrders).values({
          userId,
          orderNo,
          amount: amount.toFixed(2),
          currency: 'CNY',
          method: 'manual',
          status: 'pending',
          note,
          metadata: metadata as any,
          idempotencyKey: idemKey,
        }).returning();
        if (!order) throw new AppError('上账订单创建失败', 500, 'ORDER_CREATE_FAILED');

        // R6 创建时预占：op + user 各插一行（B8 豁免角色跳过 op 维度；幂等 UNIQUE）
        if (!check.op.exempt) {
          await reserveInTx(tx, { scope: 'operator', userId: operatorId, amountYuan: amount, refType: 'manual_topup', refId: String(order.id) });
        }
        await reserveInTx(tx, { scope: 'user', userId, amountYuan: amount, refType: 'manual_topup', refId: String(order.id) });

        return { order, tier, check };
      });

      // 事务提交后：R6 Redis ZSET 热路径同步（尽力而为，失败不阻断；PG 权威已落可回填）
      const { order, tier, check } = result;
      const limitCtx = await currentLimitContext();
      const amountCents = yuanToCents(amount);
      if (!check.op.exempt) {
        await syncRedisAdd('operator', operatorId, 'manual_topup', order.id, amountCents, limitCtx.windowMs);
      }
      await syncRedisAdd('user', userId, 'manual_topup', order.id, amountCents, limitCtx.windowMs);

      // 审计 manual_topup.create
      await db.insert(schema.auditLogs).values({
        userId: operatorId,
        action: 'manual_topup.create',
        resource: 'recharge_order',
        resourceId: String(order.id),
        details: { userId, amount, order_no: orderNo, created_by: operatorId, limit_escalated: check.op.escalated || check.user.escalated } as any,
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });

      // R5 响应契约（ARCH §2.5.1）：新增 approval_level / approval_phase / message 按档位提示
      const tierMessage: Record<number, string> = {
        1: '上账申请已创建，待一级审批',
        2: '上账申请已创建，已进入双人审批',
        3: '上账申请已创建，已进入多级审批（super_admin 终审）',
      };
      const responseBody = {
        data: {
          id: order.id,
          order_no: orderNo,
          user_id: userId,
          amount: Number(amount.toFixed(2)),
          method: 'manual',
          status: 'pending',
          status_label: '待审核',
          approval_level: tier,
          approval_phase: 'level1_pending',
          created_at: order.createdAt,
        },
        message: tierMessage[tier] ?? '上账申请已创建',
      };

      // 缓存首次响应（幂等回放用，TTL 24h 与 IDEMPOTENCY_TTL_SECONDS 一致）
      await cacheIdempotentResponse(idemKey, {
        streamed: false,
        body: responseBody,
        summary: {
          idempotent_replay: true,
          model: 'manual_topup',
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          cost: '0',
          finish_reason: null,
          streamed: false,
          request_id: idemKey,
        },
      });

      return reply.status(201).send(responseBody);
    } catch (err) {
      // 业务异常（校验/插入失败）→ 释放锁，允许客户端用同键重试；成功请求的锁保留至 TTL
      if (lockToken) await releaseIdempotencyLock(idemKey, lockToken);
      // L2 兜底（修复 P1-1）：并发双写撞唯一索引 → 幂等冲突 409 / 单号重复 409
      const violation = getRechargeOrderUniqueViolation(err);
      if (violation === 'idempotency_key') {
        throw new IdempotencyConflictError(idemKey);
      }
      if (violation === 'transfer_no') {
        throw new AppError('该转账单号已存在上账记录，请核实是否重复入账', 409, 'TRANSFER_NO_DUPLICATE');
      }
      throw err;
    }
  });

  /** POST /api/v1/admin/manual-topup/:id/review — 审核（approve / reject，R5 多阶段）
   *
   * 契约（ARCH §2.5.2）：
   *   - tier1 approve → 200 { data:{ id, status:'approved', balance_after } }（单审路径零变化）
   *   - tier2/3 一审 approve → 200 { data:{ id, status:'pending', approval_level, approval_phase:'level2_pending' }, message }
   *   - 二审 / super 终审 approve → 200 { data:{ id, status:'approved', balance_after, approval_level, approval_phase:'approved' } }
   *   - reject → 200 { data:{ id, status:'rejected' } }（任意阶段可驳回，驳回原因必填）
   * 错误码：400 VALIDATION_ERROR（职责分离/阶段不匹配）、403 FORBIDDEN（终审非 super_admin）、
   *         409 ORDER_ALREADY_PROCESSED（并发重复审批/阶段守卫 0 行）、429 DAILY_LIMIT_EXCEEDED
   *         （最终批准限额复核/计数超 hard_limit，事务回滚单据滞留）、403/429 OPERATION_2FA_*（R7）。
   */
  app.post('/api/v1/admin/manual-topup/:id/review', { preHandler: [requirePerm('finance.topup'), requireOperation2fa] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ValidationError('Invalid order id');
    const body = (request.body || {}) as { action?: string; note?: string };
    if (body.action !== 'approve' && body.action !== 'reject') {
      throw new ValidationError('action 必须为 approve 或 reject');
    }
    const operatorId = ((request as any).userContext as { userId: number }).userId;
    const operatorRole = ((request as any).userContext as { role: string }).role;

    // 驳回：仅 pending 可驳回 → failed，驳回原因必填；创建人 ≠ 驳回人（R5 职责分离）
    if (body.action === 'reject') {
      const rejectNote = String(body.note ?? '').trim();
      if (!rejectNote) throw new ValidationError('请填写驳回原因');
      const result = await db.transaction(async (tx) => {
        const [order] = await tx.select({ id: schema.rechargeOrders.id, metadata: schema.rechargeOrders.metadata, userId: schema.rechargeOrders.userId })
          .from(schema.rechargeOrders).where(eq(schema.rechargeOrders.id, orderId)).limit(1);
        if (!order) return null;
        const meta = (order.metadata ?? {}) as Record<string, unknown>;
        const createdBy = meta.created_by != null && Number.isFinite(Number(meta.created_by)) ? Number(meta.created_by) : null;
        if (createdBy != null && createdBy === operatorId) {
          throw new ValidationError('创建人不能驳回自己发起的上账单（职责分离）');
        }
        const [updated] = await tx
          .update(schema.rechargeOrders)
          .set({
            status: 'failed',
            // D-02：原 note（入账原因）保留不动；驳回原因独立写 metadata.review_note
            // R5：同时记录 approval_phase='rejected'（列表审批进度字段）
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ review_note: rejectNote, approval_phase: 'rejected' })}::jsonb`,
            updatedAt: new Date(),
          })
          .where(and(eq(schema.rechargeOrders.id, orderId), eq(schema.rechargeOrders.status, 'pending')))
          .returning({ id: schema.rechargeOrders.id, userId: schema.rechargeOrders.userId });
        if (!updated) throw new AppError('上账申请不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');
        return { userId: updated.userId };
      });
      if (!result) throw new AppError('上账申请不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');
      await writeAudit(request, 'manual_topup.reject', 'recharge_order', String(orderId), { userId: result.userId, reject_reason: rejectNote });
      return reply.send({ data: { id: orderId, status: 'rejected' }, message: '已驳回' });
    }

    // 通过：多阶段状态机（R5 §2.2.2）——每阶段事务内 UPDATE 带阶段条件，0 行 → 409 回滚；
    // 最终批准事务内才 creditBalance 入账 + 通知；阶段推进不触碰余额。
    // R6 计数在创建时已预占（终裁 B9/B18/B19），审核环节不再触碰限额。
    // B4：super_admin 自建自审（审批人不足降级代审）→ 必填 escalation_reason + 审计 degraded:true。
    const reviewNote = String(body.note ?? '').trim() || null;
    const escalationReason = String((body as any).escalation_reason ?? '').trim() || null;
    let degradedReview = false;
    const result = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(schema.rechargeOrders).where(eq(schema.rechargeOrders.id, orderId)).limit(1);
      if (!order) return null;

      // 审批态解析：存量 pending 单无 approval → 沿用提交时级别（B18 = 单审，不重算）
      const approval = resolveOrderApproval(order.metadata, Number(order.amount));
      const { level, phase, meta: approvalMeta } = approval;
      if (order.status !== 'pending' || phase === 'approved') {
        throw new AppError('上账申请不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');
      }

      // ── 职责分离（ARCH §2.6 矩阵）：创建≠任一审批人 / 一审≠二审 / super≠前两级 ──
      // B4：创建人=审批人时，仅 super_admin 且带 escalation_reason 可降级代审（审计标记）
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
      // 原子阶段守卫（ARCH §2.2.2）：status='pending' + 阶段条件；存量单（无 approval_phase）一审放行
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
      if (!updated) throw new AppError('上账申请不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');

      // 阶段推进（非最终）不触碰余额：直接返回
      if (next !== 'approved') {
        return { kind: 'stage' as const, order, level, phase: next };
      }

      // ── 最终批准事务内：R2 收口入账（无余额行自动建户 + 原子增额 + 资金流水）──
      const { balanceAfter } = await creditBalance(tx, {
        userId: order.userId,
        amount: order.amount,
        type: 'recharge',
        referenceType: 'recharge_order',
        referenceId: String(order.id),
        description: `人工上账审核通过 ${order.orderNo}`,
      });

      // 审核人落库（裁决 A8：顶层 reviewer_id/review_note，正式列随 R9）
      await tx.update(schema.rechargeOrders)
        .set({ metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ reviewer_id: operatorId, review_note: reviewNote })}::jsonb` })
        .where(eq(schema.rechargeOrders.id, orderId));

      return {
        kind: 'final' as const,
        order,
        balanceAfter,
        level,
        phase: 'approved' as const,
        degradedReview,
        escalationReason,
      };
    });

    if (!result) throw new AppError('上账申请不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');

    // 阶段推进（非最终）：不入账、不通知；写审计 manual_topup.approve_stage
    if (result.kind === 'stage') {
      await writeAudit(request, 'manual_topup.approve_stage', 'recharge_order', String(orderId), {
        userId: result.order.userId,
        amount: toNum(result.order.amount),
        approval_level: result.level,
        approval_phase: result.phase,
        reviewer_id: operatorId,
      });
      return reply.send({
        data: {
          id: result.order.id,
          status: 'pending',
          approval_level: result.level,
          approval_phase: result.phase,
        },
        message: result.phase === 'level2_pending' ? '一级审批通过，等待二级审批' : '二级审批通过，等待终审',
      });
    }

    // 最终批准：事务提交后同步 Redis 热账本 + R4 入账通知（绝不进资金事务）
    const { order, balanceAfter } = result;
    await adjustLedgerAvailable(order.userId, Number(order.amount));
    await clearNegativeFlag(order.userId);

    // R4：入账通知（站内信必发 + 邮件按偏好）
    const notification = await notifyUser({
      userId: order.userId,
      event: 'recharge_success',
      title: '充值到账通知',
      content: `您的账户已入账 ¥${Number(order.amount).toFixed(2)}，当前余额 ¥${Number(balanceAfter).toFixed(2)}`,
      templateName: 'recharge_success',
      templateVars: {
        amount: Number(order.amount).toFixed(2),
        balance_after: Number(balanceAfter).toFixed(2),
        order_no: order.orderNo,
      },
      metadata: { orderId: order.id, orderNo: order.orderNo },
    });

    await writeAudit(request, 'manual_topup.approve', 'recharge_order', String(orderId), {
      userId: order.userId,
      amount: toNum(order.amount),
      // 审计 details 对齐 ARCH §6.3：notification: { in_app, email }（snake_case）
      notification: { in_app: notification.inApp, email: notification.email },
      // R7：二次确认标记（E30，中间件已校验 X-Operation-Confirm）
      confirmed: true,
      // B4：降级代审审计标记
      degraded: result.degradedReview,
      escalation_reason: result.degradedReview ? result.escalationReason : null,
    });
    return reply.send({
      data: { id: order.id, status: 'approved', balance_after: toNum(balanceAfter), approval_level: result.level, approval_phase: 'approved' },
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

    await writeAudit(request, 'tax_banking.bank_account.upsert', 'agent_bank_accounts', String(accountId), { agentId });
    return reply.send({ data: { id: accountId, agent_id: agentId }, message: '银行账户已保存' });
  });
}
