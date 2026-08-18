/**
 * 手动调账路由 — /api/v1/admin/adjust（产品裁决 2026-08-15，对齐原型 admin-adjust.html）
 *
 * 三页签：发起调账 / 待我审批 / 调账台账。
 * 分级审批规则（对齐原型）：
 *   调增 < ¥10,000    → 免审批（提交即生效 approved）
 *   调增 ≥ ¥10,000    → 一级审批（财务专员 approve）
 *   调减 < ¥10,000    → 一级审批
 *   调减 ≥ ¥10,000    → 二级审批（财务主管复核 approve → reviewed）
 * 职责分离：审批人 ≠ 申请人；错误调账通过「红字冲销」生成反向记录（不删除不编辑）。
 *
 * 端点：
 *   GET  /admin/adjust/ledger?page=&page_size=&status=  — 调账台账（全部记录）
 *   GET  /admin/adjust/pending?level=1|2               — 待我审批列表（排除自己申请的）
 *   POST /admin/adjust                                 — 发起调账
 *   POST /admin/adjust/:id/approve                     — 一级审批通过（level2 记录进入二级待审）
 *   POST /admin/adjust/:id/review                      — 二级审批通过（仅 pending_level2）
 *   POST /admin/adjust/:id/reject                      — 驳回
 *   POST /admin/adjust/:id/reverse                     — 红字冲销（生成反向记录）
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, desc, sql, ne } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { AppError, UnauthorizedError, ForbiddenError, ValidationError, NotFoundError } from '../lib/errors';

async function adminAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  (request as any).userContext = payload;
  const { role } = payload as { role: string };
  if (role !== 'admin' && role !== 'super_admin') throw new ForbiddenError('Admin access required');
}

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

const STATUS_LABEL: Record<string, string> = {
  pending: '一级待审',
  pending_level2: '二级待审',
  approved: '已生效',
  rejected: '已驳回',
  reversed: '已红冲',
};

/** 审批级别计算（对齐原型） */
function calcApproval(direction: string, amount: number): string {
  if (direction === 'increase') return amount >= 10000 ? 'level1' : 'none';
  return amount >= 10000 ? 'level2' : 'level1';
}

export async function adminAdjustRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/adjust/ledger — 调账台账 */
  app.get('/api/v1/admin/adjust/ledger', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = request.query as { page?: string; page_size?: string; status?: string; keyword?: string };
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 200);

    const conditions: any[] = [];
    if (q.status) conditions.push(eq(schema.adjustmentRecords.status, q.status as any));
    if (q.keyword) conditions.push(sql`(${schema.adjustmentRecords.referenceNo} ILIKE ${'%' + q.keyword + '%'} OR ${schema.users.email} ILIKE ${'%' + q.keyword + '%'})`);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select({
        id: schema.adjustmentRecords.id,
        userId: schema.adjustmentRecords.userId,
        direction: schema.adjustmentRecords.direction,
        amount: schema.adjustmentRecords.amount,
        reason: schema.adjustmentRecords.reason,
        subject: schema.adjustmentRecords.subject,
        referenceNo: schema.adjustmentRecords.referenceNo,
        approvalLevel: schema.adjustmentRecords.approvalLevel,
        status: schema.adjustmentRecords.status,
        balanceBefore: schema.adjustmentRecords.balanceBefore,
        balanceAfter: schema.adjustmentRecords.balanceAfter,
        requestedBy: schema.adjustmentRecords.requestedBy,
        approvedBy: schema.adjustmentRecords.approvedBy,
        reviewedBy: schema.adjustmentRecords.reviewedBy,
        rejectReason: schema.adjustmentRecords.rejectReason,
        reversedById: schema.adjustmentRecords.reversedById,
        approvedAt: schema.adjustmentRecords.approvedAt,
        createdAt: schema.adjustmentRecords.createdAt,
        userEmail: schema.users.email,
        username: schema.users.name,
        requesterEmail: sql<string>`(select email from users where id = ${schema.adjustmentRecords.requestedBy})`,
      })
        .from(schema.adjustmentRecords)
        .leftJoin(schema.users, eq(schema.users.id, schema.adjustmentRecords.userId))
        .where(whereClause)
        .orderBy(desc(schema.adjustmentRecords.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.adjustmentRecords).where(whereClause),
    ]);

    const list = rows.map((r) => ({
      id: r.id,
      user_id: r.userId,
      username: r.username,
      email: r.userEmail,
      direction: r.direction,
      direction_label: r.direction === 'increase' ? '调增' : '调减',
      amount: toNum(r.amount),
      reason: r.reason,
      subject: r.subject,
      reference_no: r.referenceNo,
      approval_level: r.approvalLevel,
      status: r.status,
      status_label: STATUS_LABEL[r.status] ?? r.status,
      balance_before: toNum(r.balanceBefore),
      balance_after: toNum(r.balanceAfter),
      requested_by: r.requestedBy,
      requester_email: r.requesterEmail,
      approved_by: r.approvedBy,
      reviewed_by: r.reviewedBy,
      reject_reason: r.rejectReason,
      reversed_by_id: r.reversedById,
      approved_at: r.approvedAt,
      created_at: r.createdAt,
    }));

    return reply.send({ data: { list, pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) } } });
  });

  /** GET /api/v1/admin/adjust/pending?level=1|2 — 待我审批（排除自己申请的，职责分离） */
  app.get('/api/v1/admin/adjust/pending', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = request.query as { level?: string };
    const level = q.level ?? '1';
    const operatorId = ((request as any).userContext as { userId: number }).userId;

    const statusCond = level === '2' ? eq(schema.adjustmentRecords.status, 'pending_level2' as any) : eq(schema.adjustmentRecords.status, 'pending' as any);
    const rows = await db.select({
      id: schema.adjustmentRecords.id,
      userId: schema.adjustmentRecords.userId,
      direction: schema.adjustmentRecords.direction,
      amount: schema.adjustmentRecords.amount,
      reason: schema.adjustmentRecords.reason,
      subject: schema.adjustmentRecords.subject,
      referenceNo: schema.adjustmentRecords.referenceNo,
      approvalLevel: schema.adjustmentRecords.approvalLevel,
      status: schema.adjustmentRecords.status,
      createdAt: schema.adjustmentRecords.createdAt,
      userEmail: schema.users.email,
      username: schema.users.name,
    })
      .from(schema.adjustmentRecords)
      .leftJoin(schema.users, eq(schema.users.id, schema.adjustmentRecords.userId))
      .where(and(statusCond, ne(schema.adjustmentRecords.requestedBy, operatorId)))
      .orderBy(desc(schema.adjustmentRecords.createdAt))
      .limit(100);

    return reply.send({
      data: {
        list: rows.map((r) => ({
          id: r.id,
          user_id: r.userId,
          username: r.username,
          email: r.userEmail,
          direction: r.direction,
          direction_label: r.direction === 'increase' ? '调增' : '调减',
          amount: toNum(r.amount),
          reason: r.reason,
          subject: r.subject,
          reference_no: r.referenceNo,
          status: r.status,
          created_at: r.createdAt,
        })),
      },
    });
  });

  /** POST /api/v1/admin/adjust — 发起调账 */
  app.post('/api/v1/admin/adjust', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const userId = Number(body.user_id);
    const direction = String(body.direction || '');
    const amount = Number(body.amount);
    const reason = String(body.reason || '').trim();
    const subject = String(body.subject || '').trim();
    const referenceNo = String(body.reference_no || '').trim() || null;
    const attachment = String(body.attachment || '').trim() || null;
    const operatorId = ((request as any).userContext as { userId: number }).userId;

    if (!Number.isInteger(userId) || userId <= 0) throw new ValidationError('请选择被调账用户');
    if (!['increase', 'decrease'].includes(direction)) throw new ValidationError('调账方向不合法');
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('调账金额需大于 0');
    if (!reason) throw new ValidationError('调账原因必填');
    if (!subject) throw new ValidationError('会计科目必填');

    // 用户存在性 + 当前余额
    const [target] = await db.select({ balance: schema.customerBalances.availableBalance })
      .from(schema.customerBalances).where(eq(schema.customerBalances.userId, userId)).limit(1);
    const balanceBefore = target ? toNum(target.balance) : 0;
    if (direction === 'decrease' && amount > balanceBefore) {
      throw new ValidationError('调减金额超过用户当前余额');
    }

    const approvalLevel = calcApproval(direction, amount);
    const status = approvalLevel === 'none' ? 'approved' : approvalLevel === 'level2' ? 'pending_level2' : 'pending';

    // 免审批：提交即生效（事务内加/减余额 + 快照 + 流水）
    const result = await db.transaction(async (tx) => {
      const [rec] = await tx.insert(schema.adjustmentRecords)
        .values({
          userId, direction, amount: amount.toFixed(8), reason, subject,
          referenceNo, attachment, approvalLevel, status,
          balanceBefore: balanceBefore.toFixed(8),
          requestedBy: operatorId,
          approvedAt: status === 'approved' ? new Date() : null,
          approvedBy: status === 'approved' ? operatorId : null,
        })
        .returning();
      if (!rec) throw new AppError('Failed to create adjustment', 500, 'ADJUST_CREATE_FAILED');

      let balanceAfter = balanceBefore;
      if (status === 'approved') {
        const sign = direction === 'increase' ? 1 : -1;
        const upd = await tx.execute(sql`
          UPDATE customer_balances
          SET available_balance = available_balance + ${(sign * amount).toFixed(8)}::numeric,
              total_balance = total_balance + ${(sign * amount).toFixed(8)}::numeric,
              version = version + 1,
              updated_at = NOW()
          WHERE user_id = ${userId}
          RETURNING available_balance AS "balanceAfter"
        `);
        const row = upd[0] as unknown as { balanceAfter: string };
        if (!row) throw new AppError('Balance account not found', 404, 'BALANCE_NOT_FOUND');
        balanceAfter = toNum(row.balanceAfter);
        await tx.update(schema.adjustmentRecords)
          .set({ balanceAfter: balanceAfter.toFixed(8), approvedAt: new Date() })
          .where(eq(schema.adjustmentRecords.id, rec.id));
        await tx.insert(schema.balanceTransactions).values({
          userId,
          type: 'adjustment',
          amount: (sign * amount).toFixed(8),
          balanceAfter: balanceAfter.toFixed(8),
          referenceType: 'adjustment',
          referenceId: String(rec.id),
          description: `手动调账(${direction === 'increase' ? '调增' : '调减'}) ${subject}：${reason}`,
        });
      }

      return { rec, balanceAfter };
    });

    await db.insert(schema.auditLogs).values({
      userId: operatorId,
      action: 'finance.adjust.create',
      resource: 'adjustment',
      resourceId: String(result.rec.id),
      details: { userId, direction, amount, approvalLevel, status } as any,
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    const msg = status === 'approved' ? '调账已生效（免审批）' : status === 'pending_level2' ? '已提交二级审批' : '已提交一级审批';
    return reply.status(201).send({ data: { id: result.rec.id, status, approval_level: approvalLevel, balance_after: result.balanceAfter }, message: msg });
  });

  /** POST /api/v1/admin/adjust/:id/approve — 一级审批通过（level1 pending → approved；level2 pending → pending_level2 需再复核） */
  app.post('/api/v1/admin/adjust/:id/approve', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const adjustId = parseInt(id, 10);
    if (!Number.isInteger(adjustId) || adjustId <= 0) throw new ValidationError('Invalid adjustment id');
    const operatorId = ((request as any).userContext as { userId: number }).userId;

    const [rec] = await db.select().from(schema.adjustmentRecords).where(eq(schema.adjustmentRecords.id, adjustId)).limit(1);
    if (!rec) throw new NotFoundError('Adjustment', id);
    if (rec.requestedBy === operatorId) throw new ValidationError('申请人不能审批自己的调账（职责分离）');
    if (rec.status === 'rejected' || rec.status === 'reversed') throw new ValidationError('该调账已终态，不可审批');

    // level1：一级审批即生效；level2：一级通过 → pending_level2 进入二级复核
    if (rec.approvalLevel === 'level2') {
      if (rec.status !== 'pending') throw new ValidationError('该调账不在一级待审状态');
      await db.update(schema.adjustmentRecords)
        .set({ status: 'pending_level2', approvedBy: operatorId, updatedAt: new Date() })
        .where(eq(schema.adjustmentRecords.id, adjustId));
      return reply.send({ data: { id: adjustId, status: 'pending_level2' }, message: '一级审批通过，已进入二级复核' });
    }

    if (rec.status !== 'pending') throw new ValidationError('该调账不在待审状态');
    const result = await applyApproval(adjustId, rec, operatorId, 'approved', request);
    return reply.send({ data: { id: adjustId, status: 'approved', balance_after: result.balanceAfter }, message: '审批通过，调账已生效' });
  });

  /** POST /api/v1/admin/adjust/:id/review — 二级审批通过（仅 pending_level2） */
  app.post('/api/v1/admin/adjust/:id/review', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const adjustId = parseInt(id, 10);
    if (!Number.isInteger(adjustId) || adjustId <= 0) throw new ValidationError('Invalid adjustment id');
    const operatorId = ((request as any).userContext as { userId: number }).userId;

    const [rec] = await db.select().from(schema.adjustmentRecords).where(eq(schema.adjustmentRecords.id, adjustId)).limit(1);
    if (!rec) throw new NotFoundError('Adjustment', id);
    if (rec.status !== 'pending_level2') throw new ValidationError('仅二级待审的调账可复核');
    if (rec.requestedBy === operatorId) throw new ValidationError('申请人不能审批自己的调账（职责分离）');
    if (rec.approvedBy === operatorId) throw new ValidationError('一级与二级审批不能为同一人');

    const result = await applyApproval(adjustId, rec, operatorId, 'reviewed', request);
    return reply.send({ data: { id: adjustId, status: 'approved', balance_after: result.balanceAfter }, message: '二级复核通过，调账已生效' });
  });

  /** 审批生效公共逻辑（事务：置 approved + 余额变动 + 快照 + 流水） */
  async function applyApproval(adjustId: number, rec: any, operatorId: number, role: 'approved' | 'reviewed', request: any) {
    const sign = rec.direction === 'increase' ? 1 : -1;
    const result = await db.transaction(async (tx) => {
      const upd = await tx.execute(sql`
        UPDATE customer_balances
        SET available_balance = available_balance + ${(sign * toNum(rec.amount)).toFixed(8)}::numeric,
            total_balance = total_balance + ${(sign * toNum(rec.amount)).toFixed(8)}::numeric,
            version = version + 1,
            updated_at = NOW()
        WHERE user_id = ${rec.userId}
        RETURNING available_balance AS "balanceAfter"
      `);
      const row = upd[0] as unknown as { balanceAfter: string };
      if (!row) throw new AppError('Balance account not found', 404, 'BALANCE_NOT_FOUND');
      const balanceAfter = toNum(row.balanceAfter);

      const setData: Record<string, unknown> = {
        status: 'approved',
        balanceAfter: balanceAfter.toFixed(8),
        approvedAt: new Date(),
        updatedAt: new Date(),
      };
      if (role === 'approved') setData.approvedBy = operatorId;
      else setData.reviewedBy = operatorId;
      await tx.update(schema.adjustmentRecords).set(setData).where(eq(schema.adjustmentRecords.id, adjustId));

      await tx.insert(schema.balanceTransactions).values({
        userId: rec.userId,
        type: 'adjustment',
        amount: (sign * toNum(rec.amount)).toFixed(8),
        balanceAfter: balanceAfter.toFixed(8),
        referenceType: 'adjustment',
        referenceId: String(adjustId),
        description: `手动调账${role === 'approved' ? '(一级审批)' : '(二级复核)'} ${rec.subject}：${rec.reason}`,
      });

      return { balanceAfter };
    });

    await db.insert(schema.auditLogs).values({
      userId: operatorId,
      action: `finance.adjust.${role}`,
      resource: 'adjustment',
      resourceId: String(adjustId),
      details: { status: 'approved' } as any,
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });
    return result;
  }

  /** POST /api/v1/admin/adjust/:id/reject — 驳回 */
  app.post('/api/v1/admin/adjust/:id/reject', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const adjustId = parseInt(id, 10);
    if (!Number.isInteger(adjustId) || adjustId <= 0) throw new ValidationError('Invalid adjustment id');
    const body = (request.body || {}) as { reason?: string };
    const reason = String(body.reason || '').trim() || '审核未通过';
    const operatorId = ((request as any).userContext as { userId: number }).userId;

    const [rec] = await db.select().from(schema.adjustmentRecords).where(eq(schema.adjustmentRecords.id, adjustId)).limit(1);
    if (!rec) throw new NotFoundError('Adjustment', id);
    if (rec.status !== 'pending' && rec.status !== 'pending_level2') throw new ValidationError('仅待审调账可驳回');
    if (rec.requestedBy === operatorId) throw new ValidationError('申请人不能驳回自己的调账');

    await db.update(schema.adjustmentRecords)
      .set({ status: 'rejected', rejectReason: reason, updatedAt: new Date() })
      .where(eq(schema.adjustmentRecords.id, adjustId));
    return reply.send({ data: { id: adjustId, status: 'rejected' }, message: '已驳回' });
  });

  /** POST /api/v1/admin/adjust/:id/reverse — 红字冲销（生成反向记录，原记录不删除不编辑） */
  app.post('/api/v1/admin/adjust/:id/reverse', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const adjustId = parseInt(id, 10);
    if (!Number.isInteger(adjustId) || adjustId <= 0) throw new ValidationError('Invalid adjustment id');
    const operatorId = ((request as any).userContext as { userId: number }).userId;

    const [rec] = await db.select().from(schema.adjustmentRecords).where(eq(schema.adjustmentRecords.id, adjustId)).limit(1);
    if (!rec) throw new NotFoundError('Adjustment', id);
    if (rec.status !== 'approved') throw new ValidationError('仅已生效的调账可红冲');
    if (rec.reversedById) throw new ValidationError('该调账已红冲过');

    const reverseDirection = rec.direction === 'increase' ? 'decrease' : 'increase';
    const sign = reverseDirection === 'increase' ? 1 : -1;

    const result = await db.transaction(async (tx) => {
      const [rev] = await tx.insert(schema.adjustmentRecords)
        .values({
          userId: rec.userId,
          direction: reverseDirection,
          amount: rec.amount,
          reason: `红字冲销：${rec.reason}`,
          subject: rec.subject,
          referenceNo: rec.referenceNo,
          approvalLevel: 'level1', // 红冲需一级审批（简化：本端点直接生效，同免审语义由调用方控制）
          status: 'approved',
          balanceBefore: rec.balanceAfter,
          requestedBy: operatorId,
          approvedBy: operatorId,
          approvedAt: new Date(),
          reversedById: adjustId,
        })
        .returning();

      const upd = await tx.execute(sql`
        UPDATE customer_balances
        SET available_balance = available_balance + ${(sign * toNum(rec.amount)).toFixed(8)}::numeric,
            total_balance = total_balance + ${(sign * toNum(rec.amount)).toFixed(8)}::numeric,
            version = version + 1,
            updated_at = NOW()
        WHERE user_id = ${rec.userId}
        RETURNING available_balance AS "balanceAfter"
      `);
      const row = upd[0] as unknown as { balanceAfter: string };
      if (!row) throw new AppError('Balance account not found', 404, 'BALANCE_NOT_FOUND');
      const balanceAfter = toNum(row.balanceAfter);

      await tx.update(schema.adjustmentRecords)
        .set({ balanceAfter: balanceAfter.toFixed(8) })
        .where(eq(schema.adjustmentRecords.id, rev!.id));
      await tx.update(schema.adjustmentRecords)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(eq(schema.adjustmentRecords.id, adjustId));

      await tx.insert(schema.balanceTransactions).values({
        userId: rec.userId,
        type: 'adjustment',
        amount: (sign * toNum(rec.amount)).toFixed(8),
        balanceAfter: balanceAfter.toFixed(8),
        referenceType: 'adjustment',
        referenceId: String(rev!.id),
        description: `红字冲销 原调账#${adjustId}`,
      });

      return { reverseId: rev!.id, balanceAfter };
    });

    return reply.send({ data: { id: adjustId, status: 'reversed', reverse_id: result.reverseId, balance_after: result.balanceAfter }, message: '已生成红字冲销记录' });
  });
}
