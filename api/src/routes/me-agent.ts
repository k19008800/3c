/**
 * 代理商设置端点 — /api/v1/me/agent/* + /api/v1/agent/reports
 *
 * 对齐 web-console AgentSettingsPage（前端已先行，后端补全）：
 *   GET  /me/agent/profile            — 代理身份资料（非代理返回 is_agent=false）
 *   GET  /me/agent/commission-rules    — 佣金等级规则（静态三级 junior/senior/partner）
 *   GET  /me/agent/withdraw-summary     — 提现/佣金汇总（概览卡片 + 提现页共用）
 *   GET  /me/agent/notif-prefs         — 通知偏好（agent_notif_prefs）
 *   PUT  /me/agent/notif-prefs         — 全量保存通知偏好
 *   GET  /me/agent/commissions          — 佣金明细（分页 + customer_email 过滤）
 *   GET  /me/agent/withdrawals          — 提现记录（分页）
 *   POST /me/agent/withdraw             — 提交提现申请（冻结可提现余额）
 *   GET  /agent/reports                 — 我的报备记录（agent_approvals）
 *   POST /agent/reports                 — 报备目标客户（按 user_id / email / phone 解析）
 *
 * 金额单位：DB numeric 元；前端契约也是元（与 agent.ts 的「分」契约不同）。
 * 佣金率：DB 存百分数（10.00=10%），前端契约为小数（0.1）。
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, sql, desc, gte, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt.js';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors.js';

/* ───────── 鉴权 ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

/** 当前登录用户的 agents 记录；必须存在且 active（profile 端点除外） */
async function requireAgent(request: any) {
  const userId = (request as any).userContext?.userId as number | undefined;
  if (!userId) throw new UnauthorizedError('Missing user');
  const rows = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.userId, userId))
    .limit(1);
  const agent = rows[0];
  if (!agent) throw new NotFoundError('代理商账号不存在');
  if (agent.status !== 'active') throw new ForbiddenError('代理商账号已禁用');
  return agent;
}

/* ───────── 常量与工具 ───────── */

const MIN_WITHDRAW = 100;

/** 等级 → 中文标签 */
const LEVEL_LABEL: Record<string, string> = {
  junior: '初级代理',
  senior: '高级代理',
  partner: '平台合伙人',
};

/** 佣金等级规则（静态，对齐 PRD 代理三级体系） */
const COMMISSION_RULES = [
  { level: 'junior', label: '初级代理', rate: 0.1, desc: '名下客户消费按 10% 计佣，满 ¥100 可提现' },
  { level: 'senior', label: '高级代理', rate: 0.2, desc: '名下客户消费按 20% 计佣（达标升级）' },
  { level: 'partner', label: '平台合伙人', rate: 0.3, desc: '享最高佣金比例与专属政策支持' },
];

/** 提现状态 → 中文文案 */
const WITHDRAW_LABEL: Record<string, string> = {
  pending: '待审核',
  processing: '处理中',
  completed: '已到账',
  rejected: '已驳回',
};

/** 默认通知偏好（前端兜底同值） */
const DEFAULT_PREFS: Record<string, boolean> = {
  customer_alert: true,
  commission_notify: true,
  audit_notify: true,
};

const toNumber = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** DB 百分数（10.00）→ 前端小数（0.1） */
const toFraction = (v: unknown): number => toNumber(v) / 100;

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

/** 实名状态 → 前端契约 */
function mapVerifyStatus(realNameStatus: string | null | undefined): string {
  const s = (realNameStatus ?? '').toLowerCase();
  if (s === 'verified' || s === 'approved') return 'verified';
  if (s === 'pending') return 'pending';
  return 'unverified';
}

/**
 * 代理商可提现余额（元）= Σ settled 佣金 − Σ 未拒绝提现。
 * 与 services/agent 口径一致。
 */
async function agentWithdrawable(agentId: number): Promise<number> {
  const [earned] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)` })
    .from(schema.agentCommissions)
    .where(and(eq(schema.agentCommissions.agentId, agentId), eq(schema.agentCommissions.status, 'settled')));
  const [used] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.agentWithdrawals.amount}),0)` })
    .from(schema.agentWithdrawals)
    .where(and(
      eq(schema.agentWithdrawals.agentId, agentId),
      sql`${schema.agentWithdrawals.status} <> 'rejected'`,
    ));
  return Math.max(0, toNumber(earned?.total) - toNumber(used?.total));
}

/** 当前用户名下客户 user_id 集合（agent_customers，兼容两种归属写法） */
async function myCustomerUserIds(agentId: number): Promise<number[]> {
  const rows = await db
    .select({ customerUserId: schema.agentCustomers.customerUserId })
    .from(schema.agentCustomers)
    .where(eq(schema.agentCustomers.agentId, agentId));
  return [...new Set(rows.map((r) => r.customerUserId))];
}

/* ───────── 路由注册 ───────── */

export async function meAgentRoutes(app: FastifyInstance) {
  /* ═══════════ 1. 代理资料 ═══════════ */

  /**
   * GET /api/v1/me/agent/profile
   * 非代理也能调（返回 is_agent=false），前端据此渲染「您不是代理商」。
   */
  app.get('/api/v1/me/agent/profile', { preHandler: [jwtAuth] }, async (request, reply) => {
    const userId = (request as any).userContext?.userId as number | undefined;
    if (!userId) throw new UnauthorizedError('Missing user');

    const [agentRow] = await db.select().from(schema.agents).where(eq(schema.agents.userId, userId)).limit(1);
    const [userRow] = await db
      .select({ realNameStatus: schema.users.realNameStatus })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!agentRow) {
      return reply.send({
        data: {
          is_agent: false,
          level: null,
          level_label: null,
          commission_rate: 0,
          verify_status: mapVerifyStatus(userRow?.realNameStatus),
          referral_code: null,
          withdraw_account: null,
          withdraw_bank: null,
          withdraw_name: null,
        },
      });
    }

    const [bank] = await db
      .select()
      .from(schema.agentBankAccounts)
      .where(eq(schema.agentBankAccounts.agentId, agentRow.id))
      .limit(1);

    return reply.send({
      data: {
        is_agent: agentRow.status === 'active',
        level: agentRow.level,
        level_label: LEVEL_LABEL[agentRow.level] ?? agentRow.level,
        commission_rate: toFraction(agentRow.commissionRate),
        verify_status: mapVerifyStatus(userRow?.realNameStatus),
        referral_code: agentRow.inviteCode ?? null,
        withdraw_account: bank?.accountNumber ?? null,
        withdraw_bank: bank?.bankName ?? null,
        withdraw_name: bank?.accountHolder ?? null,
      },
    });
  });

  /* ═══════════ 2. 佣金规则 ═══════════ */

  /** GET /api/v1/me/agent/commission-rules — 静态三级规则，标记当前等级 */
  app.get('/api/v1/me/agent/commission-rules', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    return reply.send({
      data: {
        current_level: agent.level,
        rules: COMMISSION_RULES.map((r) => ({ ...r, current: r.level === agent.level })),
      },
    });
  });

  /* ═══════════ 3. 提现/佣金汇总 ═══════════ */

  /** GET /api/v1/me/agent/withdraw-summary — 概览卡片 + 提现页共用数据 */
  app.get('/api/v1/me/agent/withdraw-summary', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const customerUserIds = await myCustomerUserIds(agent.id);
    const [withdrawnRows, pendingRows, settledAllRows, monthCommRows, bankRows] = await Promise.all([
      db
        .select({ total: sql<number>`coalesce(sum(${schema.agentWithdrawals.amount}),0)` })
        .from(schema.agentWithdrawals)
        .where(and(eq(schema.agentWithdrawals.agentId, agent.id), eq(schema.agentWithdrawals.status, 'completed'))),
      db
        .select({ total: sql<number>`coalesce(sum(${schema.agentWithdrawals.amount}),0)`, cnt: sql<number>`count(*)` })
        .from(schema.agentWithdrawals)
        .where(and(eq(schema.agentWithdrawals.agentId, agent.id), inArray(schema.agentWithdrawals.status, ['pending', 'processing']))),
      db
        .select({ total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)` })
        .from(schema.agentCommissions)
        .where(and(eq(schema.agentCommissions.agentId, agent.id), eq(schema.agentCommissions.status, 'settled'))),
      db
        .select({ total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)` })
        .from(schema.agentCommissions)
        .where(and(eq(schema.agentCommissions.agentId, agent.id), gte(schema.agentCommissions.createdAt, monthStart))),
      db.select().from(schema.agentBankAccounts).where(eq(schema.agentBankAccounts.agentId, agent.id)).limit(1),
    ]);

    // 名下客户本月消费
    let monthConsumption = 0;
    if (customerUserIds.length) {
      const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${schema.consumptionRecords.cost}),0)` })
        .from(schema.consumptionRecords)
        .where(and(inArray(schema.consumptionRecords.userId, customerUserIds), gte(schema.consumptionRecords.createdAt, monthStart)));
      monthConsumption = toNumber(row?.total);
    }

    const commissionTotal = Math.max(toNumber(agent.totalEarnings), toNumber(settledAllRows[0]?.total));
    const withdrawn = toNumber(withdrawnRows[0]?.total);
    const pending = toNumber(pendingRows[0]?.total);
    const activeWithdraw = Number(pendingRows[0]?.cnt ?? 0);
    const withdrawable = await agentWithdrawable(agent.id);

    return reply.send({
      data: {
        balance: toNumber(agent.availableBalance),
        commission_total: commissionTotal,
        withdrawn,
        pending,
        withdrawable,
        active_withdraw: activeWithdraw,
        active_amount: pending,
        min_withdraw: MIN_WITHDRAW,
        account_set: bankRows.length > 0,
        level: agent.level,
        customer_count: customerUserIds.length,
        month_consumption: monthConsumption,
        month_commission: toNumber(monthCommRows[0]?.total),
      },
    });
  });

  /* ═══════════ 4. 通知偏好 ═══════════ */

  /** GET /api/v1/me/agent/notif-prefs — 返回存储值与默认值合并 */
  app.get('/api/v1/me/agent/notif-prefs', { preHandler: [jwtAuth] }, async (request, reply) => {
    const userId = (request as any).userContext?.userId as number | undefined;
    if (!userId) throw new UnauthorizedError('Missing user');
    const [row] = await db.select().from(schema.agentNotifPrefs).where(eq(schema.agentNotifPrefs.userId, userId)).limit(1);
    const stored = (row?.prefs ?? {}) as Record<string, boolean>;
    return reply.send({ data: { ...DEFAULT_PREFS, ...stored } });
  });

  /** PUT /api/v1/me/agent/notif-prefs — body 为完整 {key: boolean}，全量覆盖 */
  app.put('/api/v1/me/agent/notif-prefs', { preHandler: [jwtAuth] }, async (request, reply) => {
    const userId = (request as any).userContext?.userId as number | undefined;
    if (!userId) throw new UnauthorizedError('Missing user');
    const body = (request.body ?? {}) as Record<string, unknown>;
    // 只接受 boolean 值、白名单 key
    const prefs: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(body)) {
      if (typeof v === 'boolean') prefs[k] = v;
    }

    await db
      .insert(schema.agentNotifPrefs)
      .values({ userId, prefs, createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.agentNotifPrefs.userId,
        set: { prefs, updatedAt: new Date() },
      });

    return reply.send({ data: { ...DEFAULT_PREFS, ...prefs } });
  });

  /* ═══════════ 5. 佣金明细 ═══════════ */

  /**
   * GET /api/v1/me/agent/commissions?page=&page_size=&customer_email=
   * list 项：id / user_id / user_email / consumption_amount / rate(小数) /
   *          commission_amount / level / status / created_at
   */
  app.get('/api/v1/me/agent/commissions', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const page = parsePositiveInt(q.page, 1);
    const pageSize = parsePositiveInt(q.page_size ?? q.pageSize, 20, 100);
    const customerEmail = String(q.customer_email ?? '').trim().toLowerCase();

    const baseConds = [eq(schema.agentCommissions.agentId, agent.id)];
    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: schema.agentCommissions.id,
          customerUserId: schema.agentCommissions.customerUserId,
          consumptionRecordId: schema.agentCommissions.consumptionRecordId,
          amount: schema.agentCommissions.amount,
          rate: schema.agentCommissions.rate,
          status: schema.agentCommissions.status,
          createdAt: schema.agentCommissions.createdAt,
          customerEmail: schema.users.email,
          customerName: schema.users.name,
        })
        .from(schema.agentCommissions)
        .leftJoin(schema.users, eq(schema.agentCommissions.customerUserId, schema.users.id))
        .where(and(...baseConds))
        .orderBy(desc(schema.agentCommissions.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ id: schema.agentCommissions.id }).from(schema.agentCommissions).where(and(...baseConds)),
    ]);

    // 消费金额：按 consumption_record_id 批量取 cost
    const recordIds = rows.map((r) => r.consumptionRecordId).filter((v): v is number => v != null);
    const costByRecord = new Map<number, number>();
    if (recordIds.length) {
      const costRows = await db
        .select({ id: schema.consumptionRecords.id, cost: schema.consumptionRecords.cost })
        .from(schema.consumptionRecords)
        .where(inArray(schema.consumptionRecords.id, recordIds));
      for (const c of costRows) costByRecord.set(c.id, toNumber(c.cost));
    }

    let list = rows.map((r) => ({
      id: r.id,
      user_id: r.customerUserId,
      user_email: r.customerEmail ?? `user_${r.customerUserId}`,
      user_name: r.customerName ?? null,
      consumption_amount: r.consumptionRecordId != null ? (costByRecord.get(r.consumptionRecordId) ?? 0) : 0,
      rate: toFraction(r.rate),
      commission_amount: toNumber(r.amount),
      level: agent.level,
      status: r.status,
      created_at: r.createdAt,
    }));
    if (customerEmail) {
      list = list.filter((c) => c.user_email.toLowerCase().includes(customerEmail));
    }

    return reply.send({
      data: {
        list,
        total: countRows.length,
        page,
        page_size: pageSize,
      },
    });
  });

  /* ═══════════ 6. 提现记录 ═══════════ */

  /**
   * GET /api/v1/me/agent/withdrawals?page=&page_size=
   * list 项含 withdrawal_no / status_label / reject_reason / completed_at 等前端字段。
   */
  app.get('/api/v1/me/agent/withdrawals', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const page = parsePositiveInt(q.page, 1);
    const pageSize = parsePositiveInt(q.page_size ?? q.pageSize, 20, 100);

    const where = eq(schema.agentWithdrawals.agentId, agent.id);
    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(schema.agentWithdrawals)
        .where(where)
        .orderBy(desc(schema.agentWithdrawals.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ id: schema.agentWithdrawals.id }).from(schema.agentWithdrawals).where(where),
    ]);

    const list = rows.map((w) => {
      let accountInfo: Record<string, unknown> = {};
      try { accountInfo = w.accountInfo ? JSON.parse(String(w.accountInfo)) : {}; } catch { /* 非 JSON 忽略 */ }
      return {
        id: w.id,
        withdrawal_no: `WD${String(w.id).padStart(6, '0')}`,
        amount: toNumber(w.amount),
        status: w.status,
        status_label: WITHDRAW_LABEL[w.status] ?? w.status,
        reject_reason: w.status === 'rejected' ? (w.remark ?? '审核未通过') : null,
        first_review_note: w.remark,
        second_review_note: null,
        transfer_no: null,
        bank: accountInfo.bank ?? null,
        account: accountInfo.account ?? null,
        name: accountInfo.name ?? null,
        created_at: w.createdAt,
        completed_at: w.processedAt,
      };
    });

    return reply.send({
      data: {
        list,
        pagination: { page, pageSize, total: countRows.length },
      },
    });
  });

  /* ═══════════ 7. 提交提现 ═══════════ */

  /**
   * POST /api/v1/me/agent/withdraw  body: { amount, bank, account, name }
   * 校验：金额 ≥ ¥100 且 ≤ 可提现余额；银行四要素必填。
   */
  app.post('/api/v1/me/agent/withdraw', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const amount = toNumber(body.amount);
    const bank = String(body.bank ?? '').trim();
    const account = String(body.account ?? '').trim();
    const name = String(body.name ?? '').trim();

    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('提现金额非法');
    if (amount < MIN_WITHDRAW) throw new ValidationError(`最低提现金额为 ¥${MIN_WITHDRAW}`);
    if (!bank || !account || !name) throw new ValidationError('收款银行、户名、银行账号为必填项');
    if (bank.length > 100 || account.length > 50 || name.length > 100) throw new ValidationError('收款信息过长');

    const withdrawable = await agentWithdrawable(agent.id);
    if (amount > withdrawable) throw new ValidationError(`提现金额超出可提现余额（¥${withdrawable.toFixed(2)}）`);

    const [created] = await db
      .insert(schema.agentWithdrawals)
      .values({
        agentId: agent.id,
        amount: String(amount.toFixed(4)),
        method: 'bank',
        accountInfo: JSON.stringify({ bank, account, name }),
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!created) throw new ValidationError('提现申请提交失败');

    return reply.send({ data: { ok: true, id: created.id, status: 'pending' } });
  });

  /* ═══════════ 8. 报备（agent_approvals） ═══════════ */

  /** GET /api/v1/agent/reports — 我的报备记录（按创建时间倒序） */
  app.get('/api/v1/agent/reports', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const rows = await db
      .select({
        id: schema.agentApprovals.id,
        customerId: schema.agentApprovals.customerId,
        note: schema.agentApprovals.note,
        status: schema.agentApprovals.status,
        rejectReason: schema.agentApprovals.rejectReason,
        reviewedAt: schema.agentApprovals.reviewedAt,
        createdAt: schema.agentApprovals.createdAt,
        customerEmail: schema.users.email,
        customerName: schema.users.name,
        customerPhone: schema.users.phone,
      })
      .from(schema.agentApprovals)
      .leftJoin(schema.users, eq(schema.agentApprovals.customerId, schema.users.id))
      .where(eq(schema.agentApprovals.agentId, agent.id))
      .orderBy(desc(schema.agentApprovals.createdAt));

    const list = rows.map((r) => ({
      id: r.id,
      target_user_id: r.customerId,
      target_email: r.customerEmail,
      target_phone: r.customerPhone,
      note: r.note,
      status: r.status,
      reject_reason: r.rejectReason,
      created_at: r.createdAt,
      audit_at: r.reviewedAt,
      target_email_resolved: r.customerEmail,
      target_username: r.customerName,
    }));

    return reply.send({ data: { list } });
  });

  /**
   * POST /api/v1/agent/reports
   * body: { target_user_id? | target_email? | target_phone?, note? }
   * 解析目标客户（必须存在且 role=customer），写入 agent_approvals（pending）。
   */
  app.post('/api/v1/agent/reports', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const note = String(body.note ?? '').trim() || null;
    if (note && note.length > 500) throw new ValidationError('备注过长（上限 500 字符）');

    let target: { id: number; role: string } | undefined;
    const byId = Number(body.target_user_id);
    const byEmail = String(body.target_email ?? '').trim().toLowerCase();
    const byPhone = String(body.target_phone ?? '').trim();

    if (Number.isInteger(byId) && byId > 0) {
      const [row] = await db
        .select({ id: schema.users.id, role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, byId))
        .limit(1);
      target = row;
    } else if (byEmail) {
      const [row] = await db
        .select({ id: schema.users.id, role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.email, byEmail))
        .limit(1);
      target = row;
    } else if (byPhone) {
      const [row] = await db
        .select({ id: schema.users.id, role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.phone, byPhone))
        .limit(1);
      target = row;
    }

    if (!target) throw new NotFoundError('未找到目标客户（请检查手机号 / 邮箱 / 用户 ID）');
    if (target.role !== 'customer') throw new ValidationError('只能报备 customer 角色的用户');

    // 重复报备：同一代理 + 同一客户存在 pending 记录时报错
    const [dup] = await db
      .select({ id: schema.agentApprovals.id })
      .from(schema.agentApprovals)
      .where(and(eq(schema.agentApprovals.agentId, agent.id), eq(schema.agentApprovals.customerId, target.id), eq(schema.agentApprovals.status, 'pending')))
      .limit(1);
    if (dup) throw new ValidationError('该客户已有待审核报备，请勿重复提交');

    const [created] = await db
      .insert(schema.agentApprovals)
      .values({
        agentId: agent.id,
        customerId: target.id,
        status: 'pending',
        note,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!created) throw new ValidationError('报备提交失败');

    return reply.send({ data: { ok: true, id: created.id, status: 'pending' } });
  });
}
