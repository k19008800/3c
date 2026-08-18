/**
 * 营销 / 争议 / 合规类缺失端点补齐 — /api/v1/admin/{campaigns,disputes,consent}
 *
 * 对齐原型（此前仅有前端页面与 MOCK，后端缺失）：
 *   ── 营销活动（admin-campaigns.html）──
 *   GET    /admin/campaigns                    活动列表（含已发放/参与人数聚合）
 *   POST   /admin/campaigns                    新建活动
 *   PUT    /admin/campaigns/:id                更新活动
 *   POST   /admin/campaigns/:id/status         变更状态（draft/active/ended/archived）
 *   GET    /admin/campaigns/:id                活动详情（含参与者列表）
 *   GET    /admin/campaigns/:id/participants   参与者列表
 *   POST   /admin/campaigns/:id/grant          手动发放（写 balance_transactions + 加余额）
 *   DELETE /admin/campaigns/:id                删除活动（前端删除按钮）
 *   ── 消费争议（admin-dispute.html）──
 *   GET    /admin/disputes?status=             争议列表（金额单位分）
 *   POST   /admin/disputes/:id/resolve         处理争议（refund 退款 / dismiss 驳回）
 *   ── 合规法务（admin-consent.html）──
 *   GET    /admin/consent/policies             合规策略列表（含同意统计）
 *   PUT    /admin/consent/policies/:id         更新策略（版本号 +1，写审计）
 *   GET    /admin/consent/logs                 用户同意记录
 *
 * 全部端点带 adminAuth（JWT + admin/super_admin 角色校验，对齐 admin-finance.ts）；
 * 写操作写 audit_logs 留痕；金额类字段统一用 Number() 转换（numeric 列返回 string）。
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  AppError,
} from '../lib/errors';

/* ───────── 鉴权（对齐 admin-finance.ts 模式） ───────── */

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

/* ───────── 工具函数 ───────── */

/** 写操作审计日志（写操作调用；只读 GET 不写，与 admin-finance-missing 语义一致） */
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

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

/** 正整数解析（非法回退默认值，超上限截断） */
function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

/** 统一分页参数：page（默认 1）/ page_size（默认 20，上限 200） */
function parsePageQuery(q: Record<string, unknown>): { page: number; pageSize: number; offset: number } {
  const page = parsePositiveInt(q.page, 1);
  const pageSize = parsePositiveInt(q.page_size, 20, 200);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 路径参数 ID 校验 */
function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法 ID');
  return id;
}

/* ───────── 枚举文案 ───────── */

/** 活动状态白名单 + 中文文案 */
const CAMPAIGN_STATUSES = ['draft', 'active', 'ended', 'archived'] as const;
const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  active: '进行中',
  ended: '已结束',
  archived: '已归档',
};

/** 活动类型白名单 + 中文文案（含历史默认 recharge_bonus） */
const CAMPAIGN_TYPES = ['recharge_gift', 'new_user', 'discount', 'recharge_bonus'] as const;
const CAMPAIGN_TYPE_LABEL: Record<string, string> = {
  recharge_gift: '充值赠送',
  new_user: '新用户礼',
  discount: '折扣活动',
  recharge_bonus: '充值赠送',
};

/** 争议状态中文文案 */
const DISPUTE_STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  investigating: '调查中',
  refunded: '已退款',
  dismissed: '已驳回',
};

/** 参与者触发方式文案 */
const TRIGGER_LABEL: Record<string, string> = {
  auto: '活动自动发放',
  manual: '手动发放',
};

/** 合规策略状态文案 */
const CONSENT_STATUSES = ['draft', 'published', 'revoked'] as const;
const CONSENT_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  revoked: '已撤销',
};

/* ───────── 活动行映射 ───────── */

/** 活动行 → 前端 Campaign 契约（issued_amount / participant_count 由调用方传入聚合值） */
function mapCampaign(r: any, agg: { issuedAmount: number; participantCount: number; createdByEmail: string | null }) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    status: r.status,
    status_label: CAMPAIGN_STATUS_LABEL[r.status] ?? r.status,
    type: r.type,
    type_label: CAMPAIGN_TYPE_LABEL[r.type] ?? r.type,
    budget_amount: toNum(r.budgetAmount),
    issued_amount: agg.issuedAmount,
    participant_count: agg.participantCount,
    start_at: r.startAt ?? null,
    end_at: r.endAt ?? null,
    created_by_email: agg.createdByEmail ?? '系统',
  };
}

/** 参与者行 → 前端 Participant 契约 */
function mapParticipant(p: any) {
  return {
    user_id: p.userId,
    email: p.email ?? null,
    username: p.name ?? p.email ?? `用户 ${p.userId}`,
    amount: toNum(p.amount),
    trigger_type: TRIGGER_LABEL[p.triggerType] ?? p.triggerType,
    created_at: p.createdAt,
  };
}

/** 某活动的发放聚合（已发放金额 / 参与人数） */
async function campaignAgg(campaignId: number): Promise<{ issuedAmount: number; participantCount: number }> {
  const [row] = await db
    .select({
      issuedAmount: sql<number>`coalesce(sum(${schema.campaignParticipants.amount}),0)`,
      participantCount: sql<number>`count(${schema.campaignParticipants.id})::int`,
    })
    .from(schema.campaignParticipants)
    .where(eq(schema.campaignParticipants.campaignId, campaignId));
  return {
    issuedAmount: toNum(row?.issuedAmount),
    participantCount: Number(row?.participantCount ?? 0),
  };
}

/** 创建者邮箱（created_by → users.email） */
async function creatorEmail(createdBy: number | null): Promise<string | null> {
  if (!createdBy) return null;
  const [u] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, createdBy)).limit(1);
  return u?.email ?? null;
}

/* ═══════════ 1. 营销活动 campaigns ═══════════ */

export async function adminMarketingMissingRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/campaigns?status=&page=&page_size= — 活动列表（含发放/参与聚合） */
  app.get('/api/v1/admin/campaigns', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize, offset } = parsePageQuery(q);
    const status = String(q.status ?? '').trim();

    const conds: any[] = [];
    if (status) conds.push(eq(schema.campaigns.status, status as any));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const rows = await db
      .select({
        id: schema.campaigns.id,
        name: schema.campaigns.name,
        description: schema.campaigns.description,
        type: schema.campaigns.type,
        status: schema.campaigns.status,
        budgetAmount: schema.campaigns.budgetAmount,
        startAt: schema.campaigns.startAt,
        endAt: schema.campaigns.endAt,
        createdAt: schema.campaigns.createdAt,
        createdBy: schema.campaigns.createdBy,
        createdByEmail: schema.users.email,
        issuedAmount: sql<number>`coalesce(sum(${schema.campaignParticipants.amount}),0)`,
        participantCount: sql<number>`count(${schema.campaignParticipants.id})::int`,
      })
      .from(schema.campaigns)
      .leftJoin(schema.users, eq(schema.campaigns.createdBy, schema.users.id))
      .leftJoin(schema.campaignParticipants, eq(schema.campaignParticipants.campaignId, schema.campaigns.id))
      .where(where)
      .groupBy(schema.campaigns.id, schema.users.email)
      .orderBy(desc(schema.campaigns.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.campaigns).where(where);

    return reply.send({
      data: {
        list: rows.map((r) => mapCampaign(r, {
          issuedAmount: toNum(r.issuedAmount),
          participantCount: Number(r.participantCount ?? 0),
          createdByEmail: r.createdByEmail ?? null,
        })),
        total: Number(countRow?.total ?? 0),
        page,
        pageSize,
      },
    });
  });

  /** POST /api/v1/admin/campaigns — 新建活动 */
  app.post('/api/v1/admin/campaigns', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    const type = String(body.type ?? '').trim() || 'recharge_gift';
    const budgetAmount = Number(body.budget_amount ?? 0);
    const description = body.description != null ? String(body.description) : null;
    const startAt = body.start_at ? new Date(String(body.start_at)) : null;
    const endAt = body.end_at ? new Date(String(body.end_at)) : null;

    if (!name) throw new ValidationError('活动名称不能为空');
    if (!(CAMPAIGN_TYPES as readonly string[]).includes(type)) {
      throw new ValidationError(`活动类型仅支持：${CAMPAIGN_TYPES.join(' / ')}`);
    }
    if (!isFinite(budgetAmount) || budgetAmount < 0) throw new ValidationError('预算金额必须为非负数字');
    if (startAt && endAt && startAt.getTime() > endAt.getTime()) throw new ValidationError('开始时间不能晚于结束时间');

    const operatorId = (request as any).userContext?.userId ?? null;
    const [created] = await db
      .insert(schema.campaigns)
      .values({
        name,
        type,
        description,
        config: {},
        budgetAmount: budgetAmount.toFixed(2),
        startAt,
        endAt,
        createdBy: operatorId,
      })
      .returning();
    if (!created) throw new ValidationError('活动创建失败');

    await writeAudit(request, 'campaign.create', 'campaign', String(created.id), { name, type, budgetAmount });
    return reply.send({
      data: mapCampaign(created, { issuedAmount: 0, participantCount: 0, createdByEmail: await creatorEmail(created.createdBy) }),
      message: '活动已创建',
    });
  });

  /** PUT /api/v1/admin/campaigns/:id — 更新活动（部分字段） */
  app.put('/api/v1/admin/campaigns/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as any).id);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new ValidationError('活动名称不能为空');
      patch.name = name;
    }
    if (body.type !== undefined) {
      const type = String(body.type).trim();
      if (!(CAMPAIGN_TYPES as readonly string[]).includes(type)) {
        throw new ValidationError(`活动类型仅支持：${CAMPAIGN_TYPES.join(' / ')}`);
      }
      patch.type = type;
    }
    if (body.budget_amount !== undefined) {
      const v = Number(body.budget_amount);
      if (!isFinite(v) || v < 0) throw new ValidationError('预算金额必须为非负数字');
      patch.budgetAmount = v.toFixed(2);
    }
    if (body.description !== undefined) patch.description = body.description ? String(body.description) : null;
    if (body.start_at !== undefined) patch.startAt = body.start_at ? new Date(String(body.start_at)) : null;
    if (body.end_at !== undefined) patch.endAt = body.end_at ? new Date(String(body.end_at)) : null;

    const [updated] = await db
      .update(schema.campaigns)
      .set(patch as any)
      .where(eq(schema.campaigns.id, id))
      .returning();
    if (!updated) throw new NotFoundError('营销活动', id);

    await writeAudit(request, 'campaign.update', 'campaign', String(id), { name: updated.name, patch: { ...patch, updatedAt: undefined } });
    return reply.send({
      data: mapCampaign(updated, { ...(await campaignAgg(id)), createdByEmail: await creatorEmail(updated.createdBy) }),
      message: '活动已更新',
    });
  });

  /** POST /api/v1/admin/campaigns/:id/status — 变更状态（draft/active/ended/archived） */
  app.post('/api/v1/admin/campaigns/:id/status', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as any).id);
    const status = String((request.body as any)?.status ?? '').trim();
    if (!(CAMPAIGN_STATUSES as readonly string[]).includes(status)) {
      throw new ValidationError('status 仅支持 draft / active / ended / archived');
    }

    const [updated] = await db
      .update(schema.campaigns)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.campaigns.id, id))
      .returning();
    if (!updated) throw new NotFoundError('营销活动', id);

    await writeAudit(request, 'campaign.status', 'campaign', String(id), { status });
    return reply.send({
      data: { id: updated.id, status: updated.status },
      message: `已切换为「${CAMPAIGN_STATUS_LABEL[status] ?? status}」`,
    });
  });

  /** GET /api/v1/admin/campaigns/:id — 活动详情（含参与者列表，前端详情弹窗使用） */
  app.get('/api/v1/admin/campaigns/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as any).id);
    const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id)).limit(1);
    if (!campaign) throw new NotFoundError('营销活动', id);

    const agg = await campaignAgg(id);
    const [creator] = campaign.createdBy
      ? await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, campaign.createdBy)).limit(1)
      : [];

    const participants = await db
      .select({
        userId: schema.campaignParticipants.userId,
        amount: schema.campaignParticipants.amount,
        triggerType: schema.campaignParticipants.triggerType,
        createdAt: schema.campaignParticipants.createdAt,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.campaignParticipants)
      .leftJoin(schema.users, eq(schema.campaignParticipants.userId, schema.users.id))
      .where(eq(schema.campaignParticipants.campaignId, id))
      .orderBy(desc(schema.campaignParticipants.createdAt));

    return reply.send({
      data: {
        campaign: mapCampaign(campaign, { ...agg, createdByEmail: creator?.email ?? null }),
        participants: participants.map(mapParticipant),
      },
    });
  });

  /** GET /api/v1/admin/campaigns/:id/participants — 参与者列表 */
  app.get('/api/v1/admin/campaigns/:id/participants', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as any).id);
    const [campaign] = await db.select({ id: schema.campaigns.id }).from(schema.campaigns).where(eq(schema.campaigns.id, id)).limit(1);
    if (!campaign) throw new NotFoundError('营销活动', id);

    const participants = await db
      .select({
        userId: schema.campaignParticipants.userId,
        amount: schema.campaignParticipants.amount,
        triggerType: schema.campaignParticipants.triggerType,
        createdAt: schema.campaignParticipants.createdAt,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.campaignParticipants)
      .leftJoin(schema.users, eq(schema.campaignParticipants.userId, schema.users.id))
      .where(eq(schema.campaignParticipants.campaignId, id))
      .orderBy(desc(schema.campaignParticipants.createdAt));

    return reply.send({ data: { list: participants.map(mapParticipant) } });
  });

  /** POST /api/v1/admin/campaigns/:id/grant — 手动发放（事务：加余额 + 写流水 + 写参与记录） */
  app.post('/api/v1/admin/campaigns/:id/grant', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as any).id);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const userId = Number(body.user_id);
    const amount = Number(body.amount);
    if (!Number.isInteger(userId) || userId <= 0) throw new ValidationError('用户 ID 非法');
    if (!isFinite(amount) || amount <= 0) throw new ValidationError('发放金额必须为正数');

    const [campaign] = await db.select({ id: schema.campaigns.id, name: schema.campaigns.name }).from(schema.campaigns).where(eq(schema.campaigns.id, id)).limit(1);
    if (!campaign) throw new NotFoundError('营销活动', id);

    const result = await db.transaction(async (tx) => {
      const [user] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (!user) throw new NotFoundError('用户', userId);

      // 余额账户：存在则累加；不存在（新用户未初始化）则创建
      const upd = await tx.execute(sql`
        UPDATE customer_balances
        SET available_balance = available_balance + ${amount.toFixed(8)}::numeric,
            total_balance = total_balance + ${amount.toFixed(8)}::numeric,
            version = version + 1,
            updated_at = NOW()
        WHERE user_id = ${userId}
        RETURNING available_balance AS "balanceAfter"
      `);
      const row = upd[0] as unknown as { balanceAfter?: string } | undefined;
      let balanceAfter: string;
      if (row && row.balanceAfter != null) {
        balanceAfter = row.balanceAfter as string;
      } else {
        await tx.insert(schema.customerBalances).values({
          userId,
          totalBalance: amount.toFixed(8),
          availableBalance: amount.toFixed(8),
          frozenBalance: '0',
        });
        balanceAfter = amount.toFixed(8);
      }

      // 资金流水（用户侧入账为正，记 adjustment；reference 指向活动）
      await tx.insert(schema.balanceTransactions).values({
        userId,
        type: 'adjustment',
        amount: amount.toFixed(8),
        balanceAfter,
        referenceType: 'campaign',
        referenceId: String(id),
        description: `营销活动发放：${campaign.name}`,
      });

      const [part] = await tx
        .insert(schema.campaignParticipants)
        .values({ campaignId: id, userId, amount: amount.toFixed(2), triggerType: 'manual' })
        .returning();
      if (!part) throw new ValidationError('参与记录写入失败');

      return { part, balanceAfter };
    });

    await writeAudit(request, 'campaign.grant', 'campaign', String(id), {
      userId,
      amount,
      balanceAfter: toNum(result.balanceAfter),
    });
    return reply.send({
      data: { participant: mapParticipant(result.part), balance_after: toNum(result.balanceAfter) },
      message: `已向用户 ${userId} 发放 ¥${amount}`,
    });
  });

  /** DELETE /api/v1/admin/campaigns/:id — 删除活动（前端删除按钮，级联清理参与记录） */
  app.delete('/api/v1/admin/campaigns/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as any).id);

    const deleted = await db.transaction(async (tx) => {
      const [campaign] = await tx.delete(schema.campaigns).where(eq(schema.campaigns.id, id)).returning({ id: schema.campaigns.id, name: schema.campaigns.name });
      if (!campaign) return null;
      await tx.delete(schema.campaignParticipants).where(eq(schema.campaignParticipants.campaignId, id));
      return campaign;
    });
    if (!deleted) throw new NotFoundError('营销活动', id);

    await writeAudit(request, 'campaign.delete', 'campaign', String(id), { name: deleted.name });
    return reply.send({ data: { ok: true }, message: '活动已删除' });
  });

  /* ═══════════ 2. 消费争议 disputes ═══════════ */

  /** GET /api/v1/admin/disputes?status=&page=&page_size= — 争议列表 */
  app.get('/api/v1/admin/disputes', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize, offset } = parsePageQuery(q);
    const status = String(q.status ?? '').trim();
    const handlerUsers = alias(schema.users, 'handler_users');

    const conds: any[] = [];
    if (status) conds.push(eq(schema.disputes.status, status as any));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const rows = await db
      .select({
        id: schema.disputes.id,
        disputeNo: schema.disputes.disputeNo,
        userId: schema.disputes.userId,
        amount: schema.disputes.amount,
        reason: schema.disputes.reason,
        status: schema.disputes.status,
        handlerId: schema.disputes.handlerId,
        resolution: schema.disputes.resolution,
        createdAt: schema.disputes.createdAt,
        updatedAt: schema.disputes.updatedAt,
        username: schema.users.name,
        email: schema.users.email,
        handlerName: handlerUsers.name,
      })
      .from(schema.disputes)
      .leftJoin(schema.users, eq(schema.disputes.userId, schema.users.id))
      .leftJoin(handlerUsers, eq(schema.disputes.handlerId, handlerUsers.id))
      .where(where)
      .orderBy(desc(schema.disputes.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.disputes).where(where);

    return reply.send({
      data: {
        list: rows.map((r) => ({
          id: r.id,
          dispute_no: r.disputeNo,
          user_id: r.userId,
          username: r.username ?? r.email ?? `用户 ${r.userId}`,
          amount: toNum(r.amount),
          reason: r.reason,
          status: r.status,
          status_label: DISPUTE_STATUS_LABEL[r.status] ?? r.status,
          handler_id: r.handlerId,
          handler_name: r.handlerName ?? null,
          resolution: r.resolution,
          created_at: r.createdAt,
          updated_at: r.updatedAt,
        })),
        total: Number(countRow?.total ?? 0),
        page,
        pageSize,
      },
    });
  });

  /** POST /api/v1/admin/disputes/:id/resolve — 处理争议（refund 退款 / dismiss 驳回） */
  app.post('/api/v1/admin/disputes/:id/resolve', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as any).id);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const action = String(body.action ?? '').trim();
    const resolution = String(body.resolution ?? '').trim();
    if (action !== 'refund' && action !== 'dismiss') throw new ValidationError('action 必须为 refund 或 dismiss');
    if (!resolution) throw new ValidationError('处理备注/调查结果必填');
    const operatorId = (request as any).userContext?.userId ?? 0;

    const [dispute] = await db.select().from(schema.disputes).where(eq(schema.disputes.id, id)).limit(1);
    if (!dispute) throw new NotFoundError('消费争议', id);

    /** 仅待处理/调查中可处理 */
    const resolvable = dispute.status === 'pending' || dispute.status === 'investigating';

    // 驳回：直接置 dismissed
    if (action === 'dismiss') {
      if (!resolvable) throw new AppError('该争议已处理，不能重复操作', 409, 'DISPUTE_ALREADY_RESOLVED');
      const [updated] = await db
        .update(schema.disputes)
        .set({ status: 'dismissed', handlerId: operatorId, resolution, updatedAt: new Date() })
        .where(eq(schema.disputes.id, id))
        .returning();
      if (!updated) throw new AppError('该争议已处理，不能重复操作', 409, 'DISPUTE_ALREADY_RESOLVED');
      await writeAudit(request, 'dispute.dismiss', 'dispute', String(id), { userId: dispute.userId, resolution });
      return reply.send({ data: { id, status: 'dismissed' }, message: '已驳回争议' });
    }

    // 退款：事务内原子置 refunded + 加余额 + 写流水，防重复处理
    // 金额单位：分（前端契约），转元入账
    const refundCents = Number(body.refund_amount ?? dispute.amount);
    const refundYuan = (isFinite(refundCents) && refundCents > 0 ? refundCents : toNum(dispute.amount)) / 100;

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.disputes)
        .set({ status: 'refunded', handlerId: operatorId, resolution, updatedAt: new Date() })
        .where(and(eq(schema.disputes.id, id), sql`${schema.disputes.status} IN ('pending','investigating')`))
        .returning();
      if (!updated) return null;

      const upd = await tx.execute(sql`
        UPDATE customer_balances
        SET available_balance = available_balance + ${refundYuan.toFixed(8)}::numeric,
            total_balance = total_balance + ${refundYuan.toFixed(8)}::numeric,
            version = version + 1,
            updated_at = NOW()
        WHERE user_id = ${dispute.userId}
        RETURNING available_balance AS "balanceAfter"
      `);
      const row = upd[0] as unknown as { balanceAfter?: string } | undefined;
      if (!row) throw new AppError('Balance account not found', 404, 'BALANCE_NOT_FOUND');

      await tx.insert(schema.balanceTransactions).values({
        userId: dispute.userId,
        type: 'refund',
        amount: refundYuan.toFixed(8),
        balanceAfter: row.balanceAfter as string,
        referenceType: 'dispute',
        referenceId: String(id),
        description: `消费争议退款 ${dispute.disputeNo}：${resolution}`,
      });
      return { balanceAfter: row.balanceAfter as string };
    });
    if (!result) throw new AppError('该争议已处理，不能重复操作', 409, 'DISPUTE_ALREADY_RESOLVED');

    await writeAudit(request, 'dispute.refund', 'dispute', String(id), { userId: dispute.userId, refundYuan, resolution });
    return reply.send({
      data: { id, status: 'refunded', balance_after: toNum(result.balanceAfter) },
      message: '已退款处理',
    });
  });

  /* ═══════════ 3. 合规法务 consent ═══════════ */

  /** GET /api/v1/admin/consent/policies — 合规策略列表（含同意统计，对齐页面契约字段） */
  app.get('/api/v1/admin/consent/policies', { preHandler: [adminAuth] }, async (request, reply) => {
    const rows = await db.select().from(schema.consentPolicies).orderBy(asc(schema.consentPolicies.key));

    // 同意/拒绝统计（consent_logs 按策略聚合）
    const agreeMap: Record<number, number> = {};
    const disagreeMap: Record<number, number> = {};
    const policyIds = rows.map((r) => r.id);
    if (policyIds.length > 0) {
      const agg = await db
        .select({
          policyId: schema.consentLogs.policyId,
          agree: sql<number>`count(*) filter (where ${schema.consentLogs.action} = 'agree')::int`,
          disagree: sql<number>`count(*) filter (where ${schema.consentLogs.action} = 'disagree')::int`,
        })
        .from(schema.consentLogs)
        .where(inArray(schema.consentLogs.policyId, policyIds))
        .groupBy(schema.consentLogs.policyId);
      for (const a of agg) {
        agreeMap[a.policyId] = Number(a.agree ?? 0);
        disagreeMap[a.policyId] = Number(a.disagree ?? 0);
      }
    }

    return reply.send({
      data: {
        list: rows.map((r) => {
          const consentCount = agreeMap[r.id] ?? 0;
          const pendingCount = disagreeMap[r.id] ?? 0;
          const total = consentCount + pendingCount;
          return {
            id: r.id,
            key: r.key,
            name: r.name,
            content: r.content,
            version: r.version,
            // 页面契约对齐（VersionRow）
            version_label: `v${r.version}`,
            title: r.name,
            status: r.status,
            status_label: CONSENT_STATUS_LABEL[r.status] ?? r.status,
            published_at: r.status === 'published' ? r.updatedAt : null,
            revoked_at: r.status === 'revoked' ? r.updatedAt : null,
            summary: null,
            updated_by: r.updatedBy,
            updated_at: r.updatedAt,
            created_at: r.createdAt,
            consent_count: consentCount,
            pending_count: pendingCount,
            consent_rate: total > 0 ? Math.round((consentCount / total) * 100) : 0,
          };
        }),
      },
    });
  });

  /** PUT /api/v1/admin/consent/policies/:id — 更新策略（版本号 +1，写审计） */
  app.put('/api/v1/admin/consent/policies/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as any).id);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {
      version: sql`${schema.consentPolicies.version} + 1`,
      updatedBy: (request as any).userContext?.userId ?? null,
      updatedAt: new Date(),
    };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new ValidationError('策略名称不能为空');
      patch.name = name;
    }
    if (body.content !== undefined) {
      const content = String(body.content).trim();
      if (!content) throw new ValidationError('策略内容不能为空');
      patch.content = content;
    }
    if (body.status !== undefined) {
      const status = String(body.status).trim();
      if (!(CONSENT_STATUSES as readonly string[]).includes(status)) {
        throw new ValidationError('status 仅支持 draft / published / revoked');
      }
      patch.status = status;
    }

    const [updated] = await db
      .update(schema.consentPolicies)
      .set(patch as any)
      .where(eq(schema.consentPolicies.id, id))
      .returning();
    if (!updated) throw new NotFoundError('合规策略', id);

    await writeAudit(request, 'consent.policy.update', 'consent_policy', String(id), {
      key: updated.key,
      version: updated.version,
      changed: Object.keys(patch).filter((k) => k !== 'updatedAt'),
    });
    return reply.send({
      data: { ...updated, version_label: `v${updated.version}`, status_label: CONSENT_STATUS_LABEL[updated.status] ?? updated.status },
      message: `已更新，版本升至 v${updated.version}`,
    });
  });

  /** GET /api/v1/admin/consent/logs?page=&page_size= — 用户同意记录 */
  app.get('/api/v1/admin/consent/logs', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize, offset } = parsePageQuery(q);

    const rows = await db
      .select({
        id: schema.consentLogs.id,
        userId: schema.consentLogs.userId,
        policyId: schema.consentLogs.policyId,
        action: schema.consentLogs.action,
        createdAt: schema.consentLogs.createdAt,
        email: schema.users.email,
        name: schema.users.name,
        policyName: schema.consentPolicies.name,
        policyKey: schema.consentPolicies.key,
      })
      .from(schema.consentLogs)
      .leftJoin(schema.users, eq(schema.consentLogs.userId, schema.users.id))
      .leftJoin(schema.consentPolicies, eq(schema.consentLogs.policyId, schema.consentPolicies.id))
      .orderBy(desc(schema.consentLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.consentLogs);

    return reply.send({
      data: {
        list: rows.map((r) => ({
          id: r.id,
          user_id: r.userId,
          email: r.email,
          username: r.name ?? r.email ?? `用户 ${r.userId}`,
          policy_id: r.policyId,
          policy_key: r.policyKey,
          policy_name: r.policyName,
          action: r.action,
          action_label: r.action === 'agree' ? '同意' : '拒绝',
          created_at: r.createdAt,
        })),
        total: Number(countRow?.total ?? 0),
        page,
        pageSize,
      },
    });
  });
}
