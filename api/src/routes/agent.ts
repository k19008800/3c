/**
 * 代理商端路由 — /api/v1/agent/*
 *
 * 契约对齐（web-console AgentCommissionPage / AgentWithdrawPage / AgentSettlementPage / AgentRankingPage / AgentInvitePage）：
 *   GET  /agent/commission            — 佣金记录 + 统计（分）
 *   GET  /agent/withdraw/balance      — 可提现余额（分）
 *   GET  /agent/withdraw/bank-info    — 收款银行账户
 *   PUT  /agent/withdraw/bank-info    — 保存收款银行账户
 *   POST /agent/withdraw/apply        — 申请提现（冻结余额）
 *   GET  /agent/withdraw/records      — 提现记录（分）
 *   GET  /agent/settlements           — 月度结算单列表（分）
 *   GET  /agent/settlements/:period   — 单期结算单详情（分）
 *   POST /agent/settlements/:period/confirm — 确认结算（幂等）
 *   GET  /agent/ranking               — 业绩排名 Top 榜（分）
 *   GET  /agent/invite/code           — 当前有效邀请码
 *   POST /agent/invite/code/regenerate — 重新生成邀请码
 *   GET  /agent/invite/records        — 邀请记录（按创建时间倒序）
 *   GET  /agent/materials             — 营销素材库（published 素材，P2-2）
 *
 * 金额单位：DB/管理端为「元」（numeric 18,4），代理商端契约为「分」（×100/÷100）。
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, NotFoundError, ValidationError, AppError } from '../lib/errors';
import {
  listAgentSettlements,
  getAgentSettlementDetail,
  confirmAgentSettlement,
  agentSettlementRanking,
  getActiveInviteCode,
  regenerateInviteCode,
  listInviteRecords,
} from '../services/agent/settlement';

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

/** 当前登录用户对应的代理商记录（必须是 agent 角色且 status=active） */
async function requireAgent(request: any) {
  const userId = (request as any).userContext?.userId as number | undefined;
  if (!userId) throw new UnauthorizedError('Missing user');
  const rows = await db
    .select({ id: schema.agents.id, userId: schema.agents.userId, status: schema.agents.status })
    .from(schema.agents)
    .where(eq(schema.agents.userId, userId))
    .limit(1);
  const agent = rows[0];
  if (!agent) throw new NotFoundError('代理商账号不存在');
  if (agent.status !== 'active') throw new AppError('代理商账号已禁用', 403, 'AGENT_DISABLED');
  return { ...agent, userId: agent.userId };
}

const yuanToCents = (v: unknown): number => Math.round(Number(v ?? 0) * 100);
const centsToYuan = (v: number): string => (v / 100).toFixed(4);

function monthRange(): { start: Date; end: Date } {
  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
}

/** 代理商可提现余额（元）= Σ settled 佣金 − Σ 未拒绝提现 */
async function agentWithdrawable(agentId: number): Promise<number> {
  const [earned] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)` })
    .from(schema.agentCommissions)
    .where(and(eq(schema.agentCommissions.agentId, agentId), eq(schema.agentCommissions.status, 'settled')));
  const [withdrawn] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.agentWithdrawals.amount}),0)` })
    .from(schema.agentWithdrawals)
    .where(and(
      eq(schema.agentWithdrawals.agentId, agentId),
      sql`${schema.agentWithdrawals.status} <> 'rejected'`,
    ));
  return Math.max(0, Number(earned?.total ?? 0) - Number(withdrawn?.total ?? 0));
}

/** 提现状态 → 中文文案 */
const WITHDRAW_LABEL: Record<string, string> = {
  pending: '待审核',
  processing: '处理中',
  completed: '已到账',
  rejected: '已驳回',
};

export async function agentRoutes(app: FastifyInstance) {
  /** GET /api/v1/agent/commission — 佣金记录 + 统计 */
  app.get('/api/v1/agent/commission', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const q = (request.query || {}) as { page?: string; status?: string };
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(schema.agentCommissions.agentId, agent.id)];
    if (q.status === 'pending' || q.status === 'settled' || q.status === 'cancelled') {
      conditions.push(eq(schema.agentCommissions.status, q.status));
    }
    const whereClause = and(...conditions);

    const { start, end } = monthRange();
    const [rows, stats, monthAgg, countResult] = await Promise.all([
      db
        .select({
          id: schema.agentCommissions.id,
          customerName: schema.users.email,
          amount: schema.consumptionRecords.cost,
          rate: schema.agentCommissions.rate,
          commission: schema.agentCommissions.amount,
          status: schema.agentCommissions.status,
          settledAt: schema.agentCommissions.settledAt,
          createdAt: schema.agentCommissions.createdAt,
        })
        .from(schema.agentCommissions)
        .innerJoin(schema.users, eq(schema.users.id, schema.agentCommissions.customerUserId))
        .leftJoin(schema.consumptionRecords, eq(schema.consumptionRecords.id, schema.agentCommissions.consumptionRecordId))
        .where(whereClause)
        .orderBy(desc(schema.agentCommissions.id))
        .limit(pageSize)
        .offset(offset),
      db
        .select({
          total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)`,
          pending: sql<number>`coalesce(sum(${schema.agentCommissions.amount}) filter (where status='pending'),0)`,
          settled: sql<number>`coalesce(sum(${schema.agentCommissions.amount}) filter (where status='settled'),0)`,
        })
        .from(schema.agentCommissions)
        .where(eq(schema.agentCommissions.agentId, agent.id)),
      db
        .select({ total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)` })
        .from(schema.agentCommissions)
        .where(and(
          eq(schema.agentCommissions.agentId, agent.id),
          eq(schema.agentCommissions.status, 'settled'),
          gte(schema.agentCommissions.createdAt, start),
          lte(schema.agentCommissions.createdAt, end),
        )),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.agentCommissions).where(whereClause),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    const list = rows.map((r) => ({
      id: r.id,
      customer_name: r.customerName,
      amount: yuanToCents(r.amount),
      rate: Number(r.rate),
      commission: yuanToCents(r.commission),
      status: r.status,
      settled_at: r.settledAt ? r.settledAt.toISOString() : null,
      created_at: r.createdAt.toISOString(),
    }));

    return reply.send({
      data: {
        list,
        pagination: { page, pageSize, total },
        stats: {
          total: yuanToCents(stats[0]?.total),
          pending: yuanToCents(stats[0]?.pending),
          settled: yuanToCents(stats[0]?.settled),
          this_month: yuanToCents(monthAgg[0]?.total),
        },
      },
    });
  });

  /** GET /api/v1/agent/withdraw/balance — 可提现余额（分） */
  app.get('/api/v1/agent/withdraw/balance', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const balance = await agentWithdrawable(agent.id);
    return reply.send({ data: { balance: yuanToCents(balance) } });
  });

  /** GET /api/v1/agent/withdraw/bank-info — 收款银行账户 */
  app.get('/api/v1/agent/withdraw/bank-info', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const rows = await db
      .select()
      .from(schema.agentBankAccounts)
      .where(eq(schema.agentBankAccounts.agentId, agent.id))
      .limit(1);
    const b = rows[0];
    return reply.send({
      data: b
        ? { bank_name: b.bankName, account_number: b.accountNumber, account_holder: b.accountHolder }
        : { bank_name: '', account_number: '', account_holder: '' },
    });
  });

  /** PUT /api/v1/agent/withdraw/bank-info — 保存收款银行账户 */
  app.put('/api/v1/agent/withdraw/bank-info', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const body = (request.body || {}) as { bank_name?: string; account_number?: string; account_holder?: string };
    if (!body.bank_name || !body.account_number || !body.account_holder) {
      throw new ValidationError('银行名称、卡号、户名均必填');
    }
    await db.insert(schema.agentBankAccounts).values({
      agentId: agent.id,
      bankName: body.bank_name.trim(),
      accountNumber: body.account_number.trim(),
      accountHolder: body.account_holder.trim(),
    }).onConflictDoUpdate({
      target: schema.agentBankAccounts.agentId,
      set: {
        bankName: body.bank_name.trim(),
        accountNumber: body.account_number.trim(),
        accountHolder: body.account_holder.trim(),
        updatedAt: new Date(),
      },
    });
    return reply.send({ data: { bank_name: body.bank_name, account_number: body.account_number, account_holder: body.account_holder }, message: '银行账户已更新' });
  });

  /** POST /api/v1/agent/withdraw/apply — 申请提现（事务：建单 + 冻结余额） */
  app.post('/api/v1/agent/withdraw/apply', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const body = (request.body || {}) as { amount?: number };
    const amountCents = Math.floor(Number(body.amount));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new ValidationError('提现金额无效');
    }
    const amountYuan = amountCents / 100;
    if (amountYuan < 100) throw new ValidationError('提现金额需 ≥ ¥100');

    // 收款账户
    const banks = await db
      .select()
      .from(schema.agentBankAccounts)
      .where(eq(schema.agentBankAccounts.agentId, agent.id))
      .limit(1);
    const bank = banks[0];
    if (!bank) throw new ValidationError('请先完善收款银行账户');

    const withdrawable = await agentWithdrawable(agent.id);
    if (amountYuan > withdrawable + 1e-6) {
      throw new ValidationError('提现金额超过可提现余额');
    }

    // 事务：插入提现单（pending）+ 扣减代理余额（冻结）
    const withdrawal = await db.transaction(async (tx) => {
      const [wd] = await tx.insert(schema.agentWithdrawals).values({
        agentId: agent.id,
        amount: amountYuan.toFixed(4),
        method: 'bank',
        accountInfo: JSON.stringify({ bank_name: bank.bankName, account_number: bank.accountNumber, account_holder: bank.accountHolder }),
        status: 'pending',
      }).returning();

      await tx.execute(sql`
        UPDATE agents
        SET available_balance = GREATEST(available_balance - ${amountYuan.toFixed(4)}::numeric, 0),
            updated_at = NOW()
        WHERE id = ${agent.id}
      `);
      return wd;
    });

    return reply.send({ data: { id: withdrawal!.id, withdraw_no: `W${withdrawal!.id}` }, message: '提现申请已提交，等待审核' });
  });

  /** GET /api/v1/agent/withdraw/records — 提现记录（分） */
  app.get('/api/v1/agent/withdraw/records', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const rows = await db
      .select()
      .from(schema.agentWithdrawals)
      .where(eq(schema.agentWithdrawals.agentId, agent.id))
      .orderBy(desc(schema.agentWithdrawals.id));
    const list = rows.map((r) => {
      let acc = { bank_name: '', account_number: '', account_holder: '' };
      try { acc = { ...acc, ...JSON.parse(r.accountInfo ?? '{}') }; } catch { /* ignore */ }
      return {
        id: r.id,
        withdraw_no: `W${r.id}`,
        amount: yuanToCents(r.amount),
        bank_name: acc.bank_name,
        account_number: acc.account_number,
        account_holder: acc.account_holder,
        status: r.status,
        status_label: WITHDRAW_LABEL[r.status] ?? r.status,
        reviewer_note: r.remark,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      };
    });
    return reply.send({ data: { list } });
  });

  /** GET /api/v1/agent/settlements — 月度结算单列表（分） */
  app.get('/api/v1/agent/settlements', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const q = (request.query || {}) as { status?: string; page?: string; page_size?: string };
    const result = await listAgentSettlements(agent.id, {
      status: q.status,
      page: parseInt(q.page ?? '1', 10) || 1,
      pageSize: parseInt(q.page_size ?? '20', 10) || 20,
    });
    return reply.send({ data: result });
  });

  /** GET /api/v1/agent/settlements/:period — 单期结算单详情（分） */
  app.get('/api/v1/agent/settlements/:period', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const period = String((request.params as { period: string }).period);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new ValidationError('结算期格式必须为 YYYY-MM');
    }
    const detail = await getAgentSettlementDetail(agent.id, period);
    return reply.send({ data: detail });
  });

  /** POST /api/v1/agent/settlements/:period/confirm — 确认结算（幂等） */
  app.post('/api/v1/agent/settlements/:period/confirm', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const period = String((request.params as { period: string }).period);
    const result = await confirmAgentSettlement(agent.id, period);
    return reply.send({ data: result, message: '结算单已确认' });
  });

  /** GET /api/v1/agent/ranking — 业绩排名 Top 榜（分，含自己的名次） */
  app.get('/api/v1/agent/ranking', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const q = (request.query || {}) as { period?: string; limit?: string };
    const result = await agentSettlementRanking(agent.id, {
      period: q.period === 'total' ? 'total' : 'month',
      limit: parseInt(q.limit ?? '50', 10) || 50,
    });
    return reply.send({ data: result });
  });

  /** GET /api/v1/agent/invite/code — 当前有效邀请码（无则 { code: null }） */
  app.get('/api/v1/agent/invite/code', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const result = await getActiveInviteCode(agent.id);
    return reply.send({ data: result });
  });

  /** POST /api/v1/agent/invite/code/regenerate — 重新生成邀请码（旧 active 码置 disabled） */
  app.post('/api/v1/agent/invite/code/regenerate', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const result = await regenerateInviteCode(agent.id);
    return reply.send({ data: result, message: '邀请码已重新生成' });
  });

  /** GET /api/v1/agent/invite/records — 邀请记录（所有码 + 使用情况，按创建时间倒序） */
  app.get('/api/v1/agent/invite/records', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const list = await listInviteRecords(agent.id);
    return reply.send({ data: { list } });
  });

  /** GET /api/v1/agent/materials — 营销素材库（P2-2，仅 published 素材） */
  app.get('/api/v1/agent/materials', { preHandler: [jwtAuth] }, async (request, reply) => {
    await requireAgent(request);
    const rows = await db
      .select({
        id: schema.siteContents.id,
        slug: schema.siteContents.slug,
        title: schema.siteContents.title,
        content: schema.siteContents.content,
        updatedAt: schema.siteContents.updatedAt,
      })
      .from(schema.siteContents)
      .where(and(
        eq(schema.siteContents.type, 'marketing-material'),
        eq(schema.siteContents.status, 'published'),
      ))
      .orderBy(desc(schema.siteContents.updatedAt));
    const list = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      content: r.content,
      updated_at: r.updatedAt.toISOString(),
    }));
    return reply.send({ data: { list, total: list.length } });
  });
}
