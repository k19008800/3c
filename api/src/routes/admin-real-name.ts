/**
 * 管理端实名认证审核 API — 对齐原型 admin-verification.html
 *
 * 端点覆盖：
 *   GET  /api/v1/admin/real-name/stats       — 统计卡：待审核(含超72h)/未认证(含被拦截)/今日通过/今日驳回/驳回率/平均时长 + 审核人下拉
 *   GET  /api/v1/admin/real-name             — 列表（4 Tab：pending_review / unverified / approved / rejected，分页/筛选/脱敏）
 *   GET  /api/v1/admin/real-name/:id         — 抽屉详情（未认证=账户信息；其余=影像/OCR/人证比对/风险/审核信息）
 *   POST /api/v1/admin/real-name/:id/review  — 单条 通过/驳回（写 users.real_name_status + audit_logs）
 *   POST /api/v1/admin/real-name/review      — 批量 通过/驳回
 *   POST /api/v1/admin/real-name/direct      — 批量代审通过（未认证 → approved，approved_via='admin'，无记录则补建）
 *   POST /api/v1/admin/real-name/invite      — 批量发送实名认证邀请
 *
 * 状态机：unverified → pending_review → approved / rejected
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, or, desc, sql, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';

/* ───────── helpers ───────── */

async function adminAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
  const { role } = payload as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

const STATUS_LABEL: Record<string, string> = {
  unverified: '未认证',
  pending_review: '待审核',
  approved: '已认证',
  rejected: '已驳回',
};
const TYPE_LABEL: Record<string, string> = { individual: '个人', enterprise: '企业' };

const OVERDUE_HOURS = 72;

function parseId(id: string, label = 'id'): number {
  const n = parseInt(id, 10);
  if (isNaN(n) || n <= 0) throw new ValidationError(`Invalid ${label}`);
  return n;
}

function parsePagination(query: any) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size || '20', 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 写审计日志 */
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

/** 未认证用户 → 账号状态聚合字段 */
function acctFlags(r: { contract: boolean; hasKey: boolean; hasUsage: boolean }) {
  return {
    isContract: r.contract,
    hasKey: r.hasKey,
    hasUsage: r.hasUsage,
    acctStatus: r.contract ? 'contract' : r.hasKey || r.hasUsage ? 'active' : 'idle',
  };
}

/** 从真实姓名/企业名掩码 */
function maskName(name: string, type: string): string {
  if (!name) return '';
  if (type === 'enterprise') {
    if (name.length <= 2) return name;
    return name.slice(0, 2) + '**';
  }
  if (name.length <= 1) return name;
  return name[0] + '*'.repeat(name.length - 1);
}

/* ───────── route plugin ───────── */

export async function adminRealNameRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/admin/real-name/stats — 统计卡数据
   */
  app.get('/api/v1/admin/real-name/stats', { preHandler: [adminAuth] }, async (_request, reply) => {
    const [pendRow, unvRow, approvedRow, rejectedRow, todayApprovedRow, todayRejectedRow, avgRow, overdueRow, blockedRow, reviewers] =
      await Promise.all([
        // 待审核总数
        db.select({ n: sql<number>`count(*)` }).from(schema.realNameRecords).where(eq(schema.realNameRecords.status, 'pending_review')),
        // 未认证用户总数（从未提交，且仍为未认证态）
        db.select({ n: sql<number>`count(*)` }).from(schema.users).where(eq(schema.users.realNameStatus, 'unverified')),
        // 已通过总数
        db.select({ n: sql<number>`count(*)` }).from(schema.realNameRecords).where(eq(schema.realNameRecords.status, 'approved')),
        // 已驳回总数
        db.select({ n: sql<number>`count(*)` }).from(schema.realNameRecords).where(eq(schema.realNameRecords.status, 'rejected')),
        // 今日通过 / 今日驳回
        db.select({ n: sql<number>`count(*)` }).from(schema.realNameRecords)
          .where(and(eq(schema.realNameRecords.status, 'approved'), sql`${schema.realNameRecords.reviewedAt} >= CURRENT_DATE`)),
        db.select({ n: sql<number>`count(*)` }).from(schema.realNameRecords)
          .where(and(eq(schema.realNameRecords.status, 'rejected'), sql`${schema.realNameRecords.reviewedAt} >= CURRENT_DATE`)),
        // 平均审核时长（分）
        db.execute(sql`
          SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 60), 0)::int AS "min"
          FROM real_name_records WHERE reviewed_at IS NOT NULL
        `),
        // 超 72h 未处理
        db.select({ n: sql<number>`count(*)` }).from(schema.realNameRecords)
          .where(and(eq(schema.realNameRecords.status, 'pending_review'), sql`${schema.realNameRecords.createdAt} < NOW() - INTERVAL '72 hours'`)),
        // 未认证中被拦截（有KEY 或 曾调用）
        db.select({ n: sql<number>`count(*)` }).from(schema.users)
          .where(and(
            eq(schema.users.realNameStatus, 'unverified'),
            or(
              sql`EXISTS (SELECT 1 FROM api_keys k WHERE k.user_id = ${schema.users.id})`,
              sql`EXISTS (SELECT 1 FROM consumption_records c WHERE c.user_id = ${schema.users.id})`,
            ),
          )),
        // 审核人下拉（去重）
        db.execute(sql`
          SELECT DISTINCT r.reviewer_id AS "id", u.email AS "email"
          FROM real_name_records r LEFT JOIN users u ON u.id = r.reviewer_id
          WHERE r.reviewer_id IS NOT NULL ORDER BY u.email
        `),
      ]);

    const pend = Number(pendRow[0]?.n ?? 0);
    const unv = Number(unvRow[0]?.n ?? 0);
    const approvedTotal = Number(approvedRow[0]?.n ?? 0);
    const rejectedTotal = Number(rejectedRow[0]?.n ?? 0);
    const todayApproved = Number(todayApprovedRow[0]?.n ?? 0);
    const todayRejected = Number(todayRejectedRow[0]?.n ?? 0);
    const overdue = Number(overdueRow[0]?.n ?? 0);
    const blocked = Number(blockedRow[0]?.n ?? 0);
    const avgTimeMin = Number((avgRow[0] as any)?.min ?? 0);
    const rejectRate = approvedTotal + rejectedTotal > 0
      ? Math.round((rejectedTotal / (approvedTotal + rejectedTotal)) * 100)
      : 0;

    return reply.send({
      data: {
        pending: { count: pend, overdue },
        unverified: { count: unv, blocked },
        todayApproved,
        todayRejected,
        rejectRate,
        avgTimeMin,
        reviewers: (reviewers as any[]).map((r) => ({ id: r.id, email: r.email })),
      },
    });
  });

  /**
   * GET /api/v1/admin/real-name — 列表
   * query: status(必), type?, reviewer?, acct?(仅 unverified), kw?, page?, page_size?
   */
  app.get('/api/v1/admin/real-name', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const q = request.query || {};
    const { page, pageSize, offset } = parsePagination(q);
    const status = String(q.status || 'pending_review');
    if (!['pending_review', 'unverified', 'approved', 'rejected'].includes(status)) {
      throw new ValidationError('status must be pending_review | unverified | approved | rejected');
    }

    const kw = String(q.kw || '').trim();
    const type = String(q.type || '');
    const reviewer = String(q.reviewer || '');
    const acct = String(q.acct || '');
    const from = String(q.from || '');
    const to = String(q.to || '');

    // ---- 未认证：注册未提交的用户 ----
    if (status === 'unverified') {
      const conditions: any[] = [eq(schema.users.realNameStatus, 'unverified')];
      if (type === 'individual' || type === 'enterprise') {
        conditions.push(eq(schema.users.customerType, type === 'enterprise' ? 'enterprise' : 'personal'));
      }
      if (kw) {
        conditions.push(sql`(${schema.users.email} ILIKE ${'%' + kw + '%'} OR ${schema.users.name} ILIKE ${'%' + kw + '%'})`);
      }
      if (from) conditions.push(sql`${schema.users.createdAt} >= ${from}::date`);
      if (to) conditions.push(sql`${schema.users.createdAt} <= (${to}::date + INTERVAL '1 day')`);
      const whereClause = and(...conditions);

      const [rows, countRow] = await Promise.all([
        db.select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          type: schema.users.customerType,
          isContract: schema.users.isContract,
          registeredAt: schema.users.createdAt,
          lastLogin: schema.users.lastLoginAt,
        }).from(schema.users)
          .where(whereClause)
          .orderBy(desc(schema.users.createdAt))
          .limit(pageSize).offset(offset),
        db.select({ n: sql<number>`count(*)` }).from(schema.users).where(whereClause),
      ]);

      // 每用户的 hasKey / hasUsage / invites
      const ids = rows.map((r) => r.id);
      const [keyRows, usageRows, inviteRows] = ids.length
        ? await Promise.all([
            db.select({ userId: schema.apiKeys.userId })
              .from(schema.apiKeys)
              .where(inArray(schema.apiKeys.userId, ids)).groupBy(schema.apiKeys.userId),
            db.select({ userId: schema.consumptionRecords.userId })
              .from(schema.consumptionRecords)
              .where(inArray(schema.consumptionRecords.userId, ids)).groupBy(schema.consumptionRecords.userId),
            db.select({ userId: schema.realNameInvites.userId, n: sql<number>`count(*)` })
              .from(schema.realNameInvites)
              .where(inArray(schema.realNameInvites.userId, ids)).groupBy(schema.realNameInvites.userId),
          ])
        : [[], [], []];

      const keySet = new Set(keyRows.map((r) => r.userId));
      const usageSet = new Set(usageRows.map((r) => r.userId));
      const inviteMap = new Map(inviteRows.map((r) => [r.userId, Number(r.n)]));

      let list = rows.map((r) => {
        const hasKey = keySet.has(r.id);
        const hasUsage = usageSet.has(r.id);
        return {
          id: r.id,
          userId: r.id,
          recordId: null,
          status: 'unverified',
          type: r.type === 'enterprise' ? 'enterprise' : 'individual',
          typeLabel: TYPE_LABEL[r.type === 'enterprise' ? 'enterprise' : 'individual'],
          name: r.name,
          email: r.email,
          idNo: null,
          idNoMasked: '—',
          registeredAt: r.registeredAt,
          lastLogin: r.lastLogin,
          invites: inviteMap.get(r.id) ?? 0,
          ...acctFlags({ contract: r.isContract, hasKey, hasUsage }),
        };
      });

      // 账号状态筛选（contract / active / idle）
      if (acct) {
        list = list.filter((r: any) =>
          acct === 'contract' ? r.isContract :
          acct === 'active' ? (r.hasKey || r.hasUsage) :
          acct === 'idle' ? !(r.hasKey || r.hasUsage || r.isContract) : true,
        );
      }

      // 前端本地过滤后重新分页
      const total = Number(countRow[0]?.n ?? 0);
      const filteredCount = list.length;
      return reply.send({
        data: { list, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), filtered: filteredCount } },
      });
    }

    // ---- 已提交记录（pending_review / approved / rejected）----
    const conditions: any[] = [eq(schema.realNameRecords.status, status)];
    if (type === 'individual' || type === 'enterprise') conditions.push(eq(schema.realNameRecords.type, type));
    if (reviewer) {
      const rv = parseInt(reviewer, 10);
      if (Number.isInteger(rv)) conditions.push(eq(schema.realNameRecords.reviewerId, rv));
      else conditions.push(sql`EXISTS (SELECT 1 FROM users rv_u WHERE rv_u.id = ${schema.realNameRecords.reviewerId} AND rv_u.email ILIKE ${'%' + reviewer + '%'})`);
    }
    if (kw) {
      conditions.push(sql`(
        ${schema.users.email} ILIKE ${'%' + kw + '%'}
        OR ${schema.realNameRecords.realName} ILIKE ${'%' + kw + '%'}
        OR ${schema.realNameRecords.idNumber} ILIKE ${'%' + kw + '%'}
      )`);
    }
    if (from) conditions.push(sql`${schema.realNameRecords.createdAt} >= ${from}::date`);
    if (to) conditions.push(sql`${schema.realNameRecords.createdAt} <= (${to}::date + INTERVAL '1 day')`);
    const whereClause = and(...conditions);

    const [rows, countRow] = await Promise.all([
      db.select({
        id: schema.realNameRecords.id,
        userId: schema.realNameRecords.userId,
        type: schema.realNameRecords.type,
        realName: schema.realNameRecords.realName,
        idNumber: schema.realNameRecords.idNumber,
        status: schema.realNameRecords.status,
        approvedVia: schema.realNameRecords.approvedVia,
        directNote: schema.realNameRecords.directNote,
        rejectReason: schema.realNameRecords.rejectReason,
        reviewerId: schema.realNameRecords.reviewerId,
        reviewedAt: schema.realNameRecords.reviewedAt,
        createdAt: schema.realNameRecords.createdAt,
        simScore: schema.realNameRecords.simScore,
        risk: schema.realNameRecords.risk,
        email: schema.users.email,
        name: schema.users.name,
      })
        .from(schema.realNameRecords)
        .leftJoin(schema.users, eq(schema.users.id, schema.realNameRecords.userId))
        .where(whereClause)
        .orderBy(desc(schema.realNameRecords.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ n: sql<number>`count(*)` })
        .from(schema.realNameRecords)
        .leftJoin(schema.users, eq(schema.users.id, schema.realNameRecords.userId))
        .where(whereClause),
    ]);

    // 审核人邮箱
    const reviewerIds = [...new Set(rows.map((r) => r.reviewerId).filter(Boolean))] as number[];
    const reviewerMap = new Map<number, string>();
    if (reviewerIds.length) {
      const rvs = await db.select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users).where(inArray(schema.users.id, reviewerIds));
      for (const rv of rvs) reviewerMap.set(rv.id, rv.email);
    }

    const list = rows.map((r) => {
      const isEnterprise = r.type === 'enterprise';
      return {
        id: r.id,
        userId: r.userId,
        recordId: r.id,
        status: r.status,
        type: isEnterprise ? 'enterprise' : 'individual',
        typeLabel: TYPE_LABEL[isEnterprise ? 'enterprise' : 'individual'],
        name: r.realName,
        nameMasked: maskName(r.realName, r.type),
        idNo: r.idNumber,
        idNoMasked: r.idNumber ? schema.maskIdSmart(r.idNumber, r.type) : '—',
        email: r.email,
        submittedAt: r.createdAt,
        overdue: status === 'pending_review' && r.createdAt < new Date(Date.now() - OVERDUE_HOURS * 3600_000),
        risk: (r.risk as any[]) ?? [],
        sim: r.simScore != null ? Math.round(Number(r.simScore) * 100) : null,
        approvedVia: r.approvedVia ?? null,
        directNote: r.directNote ?? null,
        rejectReason: r.rejectReason ?? null,
        reviewerId: r.reviewerId ?? null,
        reviewer: r.reviewerId ? (reviewerMap.get(r.reviewerId) ?? `#${r.reviewerId}`) : null,
        reviewedAt: r.reviewedAt,
        registeredAt: r.createdAt,
        lastLogin: null,
        invites: 0,
      };
    });

    const total = Number(countRow[0]?.n ?? 0);
    return reply.send({
      data: { list, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), filtered: list.length } },
    });
  });

  /**
   * GET /api/v1/admin/real-name/:id — 抽屉详情
   * :id 为 record id；若不存在，视为未认证用户 id，返回账户信息。
   */
  app.get('/api/v1/admin/real-name/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseId(request.params.id);

    const [rec] = await db.select().from(schema.realNameRecords).where(eq(schema.realNameRecords.id, id));

    // 记录详情
    if (rec) {
      const [u] = await db.select({
        id: schema.users.id, email: schema.users.email, name: schema.users.name,
        customerType: schema.users.customerType, realNameStatus: schema.users.realNameStatus,
        isContract: schema.users.isContract, createdAt: schema.users.createdAt, lastLoginAt: schema.users.lastLoginAt,
      }).from(schema.users).where(eq(schema.users.id, rec.userId));

      const reviewerEmail = rec.reviewerId
        ? (await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, rec.reviewerId)))[0]?.email
        : null;

      return reply.send({
        data: {
          kind: 'record',
          id: rec.id,
          userId: rec.userId,
          type: rec.type,
          typeLabel: TYPE_LABEL[rec.type],
          realName: rec.realName,
          realNameMasked: maskName(rec.realName, rec.type),
          idNumber: rec.idNumber,
          idNumberMasked: schema.maskIdSmart(rec.idNumber, rec.type),
          phone: rec.phone,
          legalPerson: rec.legalPerson,
          companyAddress: rec.companyAddress,
          status: rec.status,
          statusLabel: STATUS_LABEL[rec.status],
          approvedVia: rec.approvedVia,
          directNote: rec.directNote,
          rejectReason: rec.rejectReason,
          reviewer: reviewerEmail,
          reviewedAt: rec.reviewedAt,
          createdAt: rec.createdAt,
          simScore: rec.simScore != null ? Number(rec.simScore) : null,
          risk: rec.risk,
          ocrFields: rec.ocrFields,
          images: rec.images,
          account: u ? {
            email: u.email, name: u.name, customerType: u.customerType, isContract: u.isContract,
            createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
          } : null,
        },
      });
    }

    // 未认证用户详情
    const [u] = await db.select({
      id: schema.users.id, email: schema.users.email, name: schema.users.name,
      customerType: schema.users.customerType, realNameStatus: schema.users.realNameStatus,
      isContract: schema.users.isContract, createdAt: schema.users.createdAt, lastLoginAt: schema.users.lastLoginAt,
    }).from(schema.users).where(eq(schema.users.id, id));
    if (!u) throw new NotFoundError('Record or user');

    const [keyRows, usageRows, inviteRow] = await Promise.all([
      db.select({ name: schema.apiKeys.name, status: schema.apiKeys.status, lastUsedAt: schema.apiKeys.lastUsedAt })
        .from(schema.apiKeys).where(eq(schema.apiKeys.userId, id)).orderBy(desc(schema.apiKeys.createdAt)),
      db.select({ model: schema.consumptionRecords.model, cost: schema.consumptionRecords.cost, createdAt: schema.consumptionRecords.createdAt })
        .from(schema.consumptionRecords).where(eq(schema.consumptionRecords.userId, id)).orderBy(desc(schema.consumptionRecords.createdAt)).limit(10),
      db.select({ n: sql<number>`count(*)` }).from(schema.realNameInvites).where(eq(schema.realNameInvites.userId, id)),
    ]);

    return reply.send({
      data: {
        kind: 'account',
        id: u.id,
        userId: u.id,
        status: 'unverified',
        statusLabel: '未认证',
        email: u.email,
        name: u.name,
        type: u.customerType === 'enterprise' ? 'enterprise' : 'individual',
        typeLabel: u.customerType === 'enterprise' ? '企业' : '个人',
        isContract: u.isContract,
        registeredAt: u.createdAt,
        lastLogin: u.lastLoginAt,
        hasKey: keyRows.length > 0,
        keys: keyRows,
        hasUsage: usageRows.length > 0,
        recentUsage: usageRows,
        invites: Number(inviteRow[0]?.n ?? 0),
      },
    });
  });

  /**
   * POST /api/v1/admin/real-name/:id/review — 单条 通过/驳回
   * body: { action: 'approve'|'reject', reason? }
   */
  app.post('/api/v1/admin/real-name/:id/review', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseId(request.params.id);
    const { action, reason } = (request.body || {}) as { action?: string; reason?: string };
    if (action !== 'approve' && action !== 'reject') throw new ValidationError('action must be approve | reject');
    if (action === 'reject' && !(reason ?? '').trim()) throw new ValidationError('驳回需填写原因');

    const [rec] = await db.select().from(schema.realNameRecords).where(eq(schema.realNameRecords.id, id));
    if (!rec) throw new NotFoundError('Record');
    if (rec.status !== 'pending_review') throw new ValidationError('仅待审核记录可审核');

    const ctx = request.userContext ?? {};
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await db.update(schema.realNameRecords).set({
      status: newStatus,
      reviewerId: ctx.userId ?? null,
      reviewedAt: sql`NOW()`,
      rejectReason: action === 'reject' ? reason : null,
      approvedVia: action === 'approve' ? (rec.approvedVia ?? 'submit') : null,
      updatedAt: sql`NOW()`,
    }).where(eq(schema.realNameRecords.id, id));

    await db.update(schema.users).set({ realNameStatus: newStatus }).where(eq(schema.users.id, rec.userId));

    await writeAudit(request, action === 'approve' ? 'realname.approve' : 'realname.reject', 'real_name_record', String(id), {
      userId: rec.userId, reason: action === 'reject' ? reason : null,
    });

    return reply.send({ data: { id, status: newStatus, statusLabel: STATUS_LABEL[newStatus] } });
  });

  /**
   * POST /api/v1/admin/real-name/review — 批量 通过/驳回
   * body: { action: 'approve'|'reject', ids: number[], reason? }
   */
  app.post('/api/v1/admin/real-name/review', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const { action, ids, reason } = (request.body || {}) as { action?: string; ids?: number[]; reason?: string };
    if (action !== 'approve' && action !== 'reject') throw new ValidationError('action must be approve | reject');
    if (!Array.isArray(ids) || ids.length === 0) throw new ValidationError('ids 不能为空');
    if (action === 'reject' && !(reason ?? '').trim()) throw new ValidationError('批量驳回需填写统一原因');

    const ctx = request.userContext ?? {};
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const recs = await db.select({ id: schema.realNameRecords.id, userId: schema.realNameRecords.userId })
      .from(schema.realNameRecords)
      .where(and(inArray(schema.realNameRecords.id, ids), eq(schema.realNameRecords.status, 'pending_review')));

    for (const rec of recs) {
      await db.update(schema.realNameRecords).set({
        status: newStatus,
        reviewerId: ctx.userId ?? null,
        reviewedAt: sql`NOW()`,
        rejectReason: action === 'reject' ? reason : null,
        approvedVia: action === 'approve' ? 'submit' : null,
        updatedAt: sql`NOW()`,
      }).where(eq(schema.realNameRecords.id, rec.id));
      await db.update(schema.users).set({ realNameStatus: newStatus }).where(eq(schema.users.id, rec.userId));
    }

    await writeAudit(request, action === 'approve' ? 'realname.approve.batch' : 'realname.reject.batch', 'real_name_record', null, {
      ids: recs.map((r) => r.id), reason: action === 'reject' ? reason : null,
    });

    return reply.send({ data: { processed: recs.length } });
  });

  /**
   * POST /api/v1/admin/real-name/direct — 批量代审通过（未认证 → approved）
   * body: { ids: number[] /* userIds, note? }
   * approved_via='admin'；无记录则补建（类型取自 users.customer_type）。
   */
  app.post('/api/v1/admin/real-name/direct', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const { ids, note } = (request.body || {}) as { ids?: number[]; note?: string };
    if (!Array.isArray(ids) || ids.length === 0) throw new ValidationError('ids 不能为空');

    const ctx = request.userContext ?? {};

    const users = await db.select({
      id: schema.users.id, email: schema.users.email, name: schema.users.name, customerType: schema.users.customerType,
    }).from(schema.users).where(inArray(schema.users.id, ids));

    let processed = 0;
    for (const u of users) {
      const [rec] = await db.select({ id: schema.realNameRecords.id }).from(schema.realNameRecords).where(eq(schema.realNameRecords.userId, u.id));
      if (rec) {
        await db.update(schema.realNameRecords).set({
          status: 'approved',
          reviewerId: ctx.userId ?? null,
          reviewedAt: sql`NOW()`,
          rejectReason: null,
          approvedVia: 'admin',
          directNote: note ?? null,
          updatedAt: sql`NOW()`,
        }).where(eq(schema.realNameRecords.id, rec.id));
      } else {
        await db.insert(schema.realNameRecords).values({
          userId: u.id,
          type: u.customerType === 'enterprise' ? 'enterprise' : 'individual',
          realName: u.name,
          idNumber: `MANUAL-${u.id}`,
          status: 'approved',
          reviewerId: ctx.userId ?? null,
          reviewedAt: sql`NOW()`,
          approvedVia: 'admin',
          directNote: note ?? null,
        });
      }
      await db.update(schema.users).set({ realNameStatus: 'approved' }).where(eq(schema.users.id, u.id));
      processed++;
    }

    await writeAudit(request, 'realname.direct', 'real_name_record', null, { ids, note });

    return reply.send({ data: { processed } });
  });

  /**
   * POST /api/v1/admin/real-name/invite — 批量发送实名认证邀请
   * body: { ids: number[] /* userIds, channel: 'email'|'sms'|'system' }
   */
  app.post('/api/v1/admin/real-name/invite', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const { ids, channel } = (request.body || {}) as { ids?: number[]; channel?: string };
    if (!Array.isArray(ids) || ids.length === 0) throw new ValidationError('ids 不能为空');
    const ch = channel === 'sms' ? 'sms' : channel === 'system' ? 'system' : 'email';

    const ctx = request.userContext ?? {};
    await db.insert(schema.realNameInvites).values(
      ids.map((userId) => ({ userId, channel: ch, sentBy: ctx.userId ?? null })),
    );

    await writeAudit(request, 'realname.invite', 'real_name_invite', null, { ids, channel: ch });

    return reply.send({ data: { processed: ids.length, channel: ch } });
  });
}
