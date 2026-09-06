/**
 * 手动调账路由 — /api/v1/admin/adjust（产品裁决 2026-08-15 + R5 整改阶段二）
 *
 * 三页签：发起调账 / 待我审批 / 调账台账。
 * R5 统一大额规则（ARCH §2.4.3 / 双签 B1/B2，finance_rules.approval 可配置）：
 *   调增/调减 ≤ ¥10,000      → level1（一级审批；调减恰 ¥10,000 特例仍 level2，B1）
 *   > ¥10,000 且 ≤ ¥100,000  → level2（一级 → 二级复核）
 *   > ¥100,000               → level3（一级 → 二级 → super_admin 终审）
 *   金额型免审批废止（B2）；仅白名单科目免审（默认关闭）命中时 approval_level='none'
 *   提交即生效（计入 R6 限额）。
 * 状态流转：pending → pending_level2 → pending_super → approved；任一步驳回 → rejected。
 * 职责分离：申请人 ≠ 审批人；一级 ≠ 二级；终审 ≠ 前两级审批人（也 ≠ 申请人）。
 * R6 限额：调增生效（含免审/一级/二级/终审）与红冲加钱方向计入；调减不计入；
 * 红冲扣钱方向回补（DECRBY 不为负）；驳回不回退（ARCH §3.5 / 双签 B9/B19）。
 * R7 2FA：全部资金写端点（发起/一级/二级/终审/驳回/红冲）挂 requireOperation2fa。
 *
 * 端点：
 *   GET  /admin/adjust/ledger?page=&page_size=&status=  — 调账台账（全部记录）
 *   GET  /admin/adjust/pending?level=1|2|3              — 待我审批列表（排除自己申请/已审的）
 *   POST /admin/adjust                                  — 发起调账（含免审生效）
 *   POST /admin/adjust/:id/approve                      — 一级审批通过（level2/3 进入二级待审）
 *   POST /admin/adjust/:id/review                       — 二级审批通过（level2 生效 / level3 进入终审待审）或 super 终审（pending_super）
 *   POST /admin/adjust/:id/reject                       — 驳回（任意待审阶段）
 *   POST /admin/adjust/:id/reverse                      — 红字冲销（生成反向记录，本期不改造红冲审批链）
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, desc, sql, ne, isNull, or, inArray } from 'drizzle-orm';
import { AppError, ValidationError, NotFoundError, ForbiddenError } from '../lib/errors.js';
import { requirePerm, requireNotImpersonated } from '../middleware/require-perm.js';
import { requireOperation2fa } from '../middleware/require-operation-2fa.js';
import { creditBalance } from '../services/billing/balance.js';
import { adjustLedgerAvailable, clearNegativeFlag } from '../services/billing/ledger.js';
import { notifyUser } from '../services/notify.js';
import {
  getApprovalRules,
  getCreditLimits,
  calcApprovalTier,
  calcEffectiveTier,
  isReviewExempt,
  type ApprovalRules,
} from '../lib/finance-rules.js';
import {
  checkLimitsInTx,
  reserveInTx,
  syncRedisAdd,
  currentLimitContext,
  yuanToCents,
} from '../services/billing/credit-limit.js';

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

const STATUS_LABEL: Record<string, string> = {
  pending: '一级待审',
  pending_level2: '二级待审',
  pending_super: '终审待审',
  approved: '已生效',
  rejected: '已驳回',
  reversed: '已红冲',
};

/**
 * 调账审批级别（R5 统一大额规则，替代旧 calcApproval 的免审/硬编码线）。
 *
 * - 调增/调减同档（双签 B1）：按金额档 level1/level2/level3；
 * - 特例：调减恰为 singleReviewMax（¥10,000）仍按双人档（B1，不放松现状更严语义）；
 * - 免审（none）：仅白名单科目免审开关开启且命中（isReviewExempt：{赠送,补偿,纠错} 且
 *   ≤¥1,000 且调增）时产生（B2），提交即生效但仍计入 R6 累计。
 *
 * @param direction - 调账方向
 * @param amount - 金额（元）
 * @param subject - 会计科目
 * @param rules - 审批规则（getApprovalRules() 结果）
 * @returns 'none' | 'level1' | 'level2' | 'level3'
 */
function calcAdjustApprovalLevel(
  direction: 'increase' | 'decrease',
  amount: number,
  subject: string,
  rules: ApprovalRules,
): 'none' | 'level1' | 'level2' | 'level3' {
  // 白名单科目免审（仅调增；计入限额）
  if (isReviewExempt(subject, direction, amount, rules)) return 'none';
  const tier = calcApprovalTier(amount, direction, rules);
  return tier === 1 ? 'level1' : tier === 2 ? 'level2' : 'level3';
}

/** 档位 → 初始状态（none=提交即生效 approved；其余 pending 进入审批链） */
function initialStatus(level: string): 'pending' | 'approved' {
  if (level === 'none') return 'approved';
  return 'pending';
}

export async function adminAdjustRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/adjust/ledger — 调账台账 */
  app.get('/api/v1/admin/adjust/ledger', { preHandler: [requirePerm('finance.adjust')] }, async (request, reply) => {
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
        superReviewedBy: schema.adjustmentRecords.superReviewedBy,
        limitEscalated: schema.adjustmentRecords.limitEscalated,
        escalationReason: schema.adjustmentRecords.escalationReason,
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

    // 审批人姓名/邮箱回显（frontend 需求）：批量查 users（申请人/一级/二级/终审）
    const personIds = new Set<number>();
    for (const r of rows) {
      for (const pid of [r.requestedBy, r.approvedBy, r.reviewedBy, r.superReviewedBy]) {
        if (pid != null && Number.isFinite(Number(pid))) personIds.add(Number(pid));
      }
    }
    const personRows = personIds.size > 0
      ? await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
          .from(schema.users).where(inArray(schema.users.id, [...personIds]))
      : [];
    const personMap = new Map(personRows.map((u) => [u.id, u]));

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
      requester_email: r.requesterEmail ?? personMap.get(Number(r.requestedBy))?.email ?? null,
      approved_by: r.approvedBy,
      approved_by_email: r.approvedBy != null ? personMap.get(Number(r.approvedBy))?.email ?? null : null,
      reviewed_by: r.reviewedBy,
      reviewed_by_email: r.reviewedBy != null ? personMap.get(Number(r.reviewedBy))?.email ?? null : null,
      super_reviewed_by: r.superReviewedBy,
      super_reviewer_email: r.superReviewedBy != null ? personMap.get(Number(r.superReviewedBy))?.email ?? null : null,
      // R6（migration 0030）：限额升级标记与原因（PRD §3.1.2）
      limit_escalated: r.limitEscalated,
      escalation_reason: r.escalationReason,
      reject_reason: r.rejectReason,
      reversed_by_id: r.reversedById,
      approved_at: r.approvedAt,
      created_at: r.createdAt,
    }));

    return reply.send({ data: { list, pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) } } });
  });

  /** GET /api/v1/admin/adjust/pending?level=1|2|3 — 待我审批（排除自己申请/已审的，职责分离） */
  app.get('/api/v1/admin/adjust/pending', { preHandler: [requirePerm('finance.adjust')] }, async (request, reply) => {
    const q = request.query as { level?: string };
    const level = q.level ?? '1';
    const operatorId = ((request as any).userContext as { userId: number }).userId;

    // level=1 → pending（一级待审）；level=2 → pending_level2（二级待审，排除一级审批人）；
    // level=3 → pending_super（终审待审，排除申请人/一级/二级审批人，ARCH §2.5.5）。
    // 存量 pending_level2 单（旧流程）approvedBy 为 NULL：NULL 比较恒 NULL → 用 OR isNull 兼容
    const statusCond = level === '2'
      ? eq(schema.adjustmentRecords.status, 'pending_level2' as any)
      : level === '3'
        ? eq(schema.adjustmentRecords.status, 'pending_super' as any)
        : eq(schema.adjustmentRecords.status, 'pending' as any);
    const notApprovedBy = or(isNull(schema.adjustmentRecords.approvedBy), ne(schema.adjustmentRecords.approvedBy, operatorId));
    const notReviewedBy = or(isNull(schema.adjustmentRecords.reviewedBy), ne(schema.adjustmentRecords.reviewedBy, operatorId));
    const excludeCond = level === '2'
      ? and(ne(schema.adjustmentRecords.requestedBy, operatorId), notApprovedBy)
      : level === '3'
        ? and(ne(schema.adjustmentRecords.requestedBy, operatorId), notApprovedBy, notReviewedBy)
        : ne(schema.adjustmentRecords.requestedBy, operatorId);
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
      .where(and(statusCond, excludeCond))
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

  /** POST /api/v1/admin/adjust — 发起调账（R5 分级 + R6 限额 + R7 2FA）
   *
   * R5：调增/调减按统一大额规则定级（B1 调减恰 ¥10,000 特例双人）；金额型免审批取消，
   * 仅白名单科目免审（默认关闭）命中 → 'none' 提交即生效（计入限额）。
   * R6：调增发起先预检（soft 升级审批 / hard 429 拒创建）；免审生效在事务内完成
   * 复核+入账+计数一次；待审单不计数（计入时点 = 生效）。调减不计入（B9）。
   */
  app.post('/api/v1/admin/adjust', { preHandler: [requireNotImpersonated(), requirePerm('finance.adjust'), requireOperation2fa] }, async (request, reply) => {
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

    // ── R5 定级（先限额 → 再定审批级别，ARCH v1.1 §3.4） ──
    const [approvalRules, limits] = await Promise.all([getApprovalRules(), getCreditLimits()]);
    const operatorRole = ((request as any).userContext as { role: string }).role;
    let approvalLevel = calcAdjustApprovalLevel(direction as 'increase' | 'decrease', amount, subject, approvalRules);
    let limitCheck: { op_projected_cents: number; user_projected_cents: number; escalated: boolean; exempt_reason?: string } | null = null;
    let opExempt = false;

    // R6 预占判定（仅加钱方向：调增 / 免审；调减不计入，B9）在创建事务内完成
    // （advisory lock + 24h 滚动汇总；soft 升级 / hard 429；exceed_action 可配；B8 豁免）
    const status = initialStatus(approvalLevel);

    // 创建事务：限额判定/预占 → 插入记录 → 事件插行（op+user，refType='adjustment'）→
    // 免审生效时同事务完成入账（终裁 B9/B18/B19：创建时预占，驳回/红冲不回退）
    const result = await db.transaction(async (tx) => {
      let check: Awaited<ReturnType<typeof checkLimitsInTx>> | null = null;
      if (direction === 'increase') {
        check = await checkLimitsInTx(tx, {
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
        opExempt = check.op.exempt;
        limitCheck = {
          op_projected_cents: yuanToCents(check.op.projectedYuan),
          user_projected_cents: yuanToCents(check.user.projectedYuan),
          escalated: check.op.escalated || check.user.escalated,
          // 调度终裁 P1-3：tier3 单笔豁免原因（大额由审批链承接，仍计入累计）
          ...(check.largeApprovalChain ? { exempt_reason: 'large_approval_chain' } : {}),
        };
        if (approvalLevel !== 'none') {
          const tier = approvalLevel === 'level1' ? 1 : approvalLevel === 'level2' ? 2 : 3;
          const effTier = calcEffectiveTier(tier, check.op.escalated, check.user.escalated);
          if (effTier !== tier) approvalLevel = effTier === 2 ? 'level2' : 'level3';
        }
      }

      const escalated = check?.op.escalated || check?.user.escalated || false;
      const [rec] = await tx.insert(schema.adjustmentRecords)
        .values({
          userId, direction, amount: amount.toFixed(8), reason, subject,
          referenceNo, attachment, approvalLevel, status,
          balanceBefore: balanceBefore.toFixed(8),
          requestedBy: operatorId,
          approvedAt: status === 'approved' ? new Date() : null,
          approvedBy: status === 'approved' ? operatorId : null,
          // R6（migration 0030）：限额升级标记与原因（PRD §3.1.2）
          limitEscalated: escalated,
          escalationReason: escalated ? `24h 累计超限（¥${limits.softLimit.toLocaleString()}），已升级审批` : null,
        })
        .returning();
      if (!rec) throw new AppError('Failed to create adjustment', 500, 'ADJUST_CREATE_FAILED');

      // R6 创建时预占：op + user 各插一行（refType='adjustment'，refId=rec.id；B8 豁免角色跳过 op）
      if (direction === 'increase') {
        if (!opExempt) await reserveInTx(tx, { scope: 'operator', userId: operatorId, amountYuan: amount, refType: 'adjustment', refId: String(rec.id) });
        await reserveInTx(tx, { scope: 'user', userId, amountYuan: amount, refType: 'adjustment', refId: String(rec.id) });
      }

      let balanceAfter = balanceBefore;
      if (status === 'approved') {
        if (direction === 'increase') {
          // 免审调增（加钱方向）：creditBalance 收口（无余额行自动建户 + 原子增额 + 流水）
          const res = await creditBalance(tx, {
            userId,
            amount: amount.toFixed(8),
            type: 'adjustment',
            referenceType: 'adjustment',
            referenceId: String(rec.id),
            description: `手动调账(调增) ${subject}：${reason}`,
          });
          balanceAfter = toNum(res.balanceAfter);
          await tx.update(schema.adjustmentRecords)
            .set({ balanceAfter: res.balanceAfter, approvedAt: new Date() })
            .where(eq(schema.adjustmentRecords.id, rec.id));
        } else {
          // 调减（扣钱方向）：保持现状 UPDATE（裁决 Q6，本期不收口）
          const upd = await tx.execute(sql`
            UPDATE customer_balances
            SET available_balance = available_balance + ${(-amount).toFixed(8)}::numeric,
                total_balance = total_balance + ${(-amount).toFixed(8)}::numeric,
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
            amount: (-amount).toFixed(8),
            balanceAfter: balanceAfter.toFixed(8),
            referenceType: 'adjustment',
            referenceId: String(rec.id),
            description: `手动调账(调减) ${subject}：${reason}`,
          });
        }
      }

      return { rec, balanceAfter, check };
    });

    // 事务提交后：调增生效同步 Redis 热账本 + R6 ZSET 同步 + R4 通知（扣钱方向不通知，PRD N4）
    let notification: { inApp: boolean; email: string } | null = null;
    if (status === 'approved' && direction === 'increase') {
      await adjustLedgerAvailable(userId, amount);
      await clearNegativeFlag(userId);
      const limitCtx = await currentLimitContext();
      if (!opExempt) await syncRedisAdd('operator', operatorId, 'adjustment', result.rec.id, yuanToCents(amount), limitCtx.windowMs);
      await syncRedisAdd('user', userId, 'adjustment', result.rec.id, yuanToCents(amount), limitCtx.windowMs);
      notification = await notifyUser({
        userId,
        event: 'recharge_success',
        title: '充值到账通知',
        content: `您的账户已调增 ¥${amount.toFixed(2)}，当前余额 ¥${result.balanceAfter.toFixed(2)}`,
        templateName: 'recharge_success',
        templateVars: {
          amount: amount.toFixed(2),
          balance_after: result.balanceAfter.toFixed(2),
        },
        metadata: { adjustmentId: result.rec.id, direction, amount },
      });
    } else if (direction === 'increase' && status !== 'approved') {
      // 待审调增：创建时已预占（计入时点 = 创建），提交后同步 Redis ZSET（尽力而为）
      const limitCtx = await currentLimitContext();
      if (!opExempt) await syncRedisAdd('operator', operatorId, 'adjustment', result.rec.id, yuanToCents(amount), limitCtx.windowMs);
      await syncRedisAdd('user', userId, 'adjustment', result.rec.id, yuanToCents(amount), limitCtx.windowMs);
    }

    await db.insert(schema.auditLogs).values({
      userId: operatorId,
      action: 'finance.adjust.create',
      resource: 'adjustment',
      resourceId: String(result.rec.id),
      // 审计 details 对齐 ARCH §6.3：notification: { in_app, email }（snake_case）
      details: { userId, direction, amount, approvalLevel, status, notification: notification ? { in_app: notification.inApp, email: notification.email } : null, limit_check: limitCheck, confirmed: true, limit_exempt: opExempt } as any,
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    // R5 文案（ARCH §2.5.5）：免审消息仅白名单科目命中时出现，默认按档位提示
    const msg = status === 'approved'
      ? '调账已生效（免审批）'
      : approvalLevel === 'level3'
        ? '已提交三级审批（super_admin 终审）'
        : approvalLevel === 'level2'
          ? '已提交二级审批'
          : '已提交一级审批';
    return reply.status(201).send({ data: { id: result.rec.id, status, approval_level: approvalLevel, balance_after: result.balanceAfter }, message: msg });
  });

  /** POST /api/v1/admin/adjust/:id/approve — 一级审批通过
   *  level1 pending → approved（生效）；level2/level3 pending → pending_level2（进入二级复核）
   *  B4：申请人=审批人时，仅 super_admin 且带 escalation_reason 可降级代审（审计标记 degraded） */
  app.post('/api/v1/admin/adjust/:id/approve', { preHandler: [requireNotImpersonated(), requirePerm('finance.adjust'), requireOperation2fa] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const adjustId = parseInt(id, 10);
    if (!Number.isInteger(adjustId) || adjustId <= 0) throw new ValidationError('Invalid adjustment id');
    const operatorId = ((request as any).userContext as { userId: number }).userId;
    const operatorRole = ((request as any).userContext as { role: string }).role;
    const escalationReason = String((request.body as { escalation_reason?: string } | undefined)?.escalation_reason ?? '').trim() || null;

    const [rec] = await db.select().from(schema.adjustmentRecords).where(eq(schema.adjustmentRecords.id, adjustId)).limit(1);
    if (!rec) throw new NotFoundError('Adjustment', id);
    if (rec.requestedBy === operatorId) {
      // B4 降级代审：仅 super_admin 且必填原因
      if (!(operatorRole === 'super_admin' && escalationReason)) {
        throw new ValidationError('申请人不能审批自己的调账（职责分离）');
      }
    }
    if (rec.status === 'rejected' || rec.status === 'reversed') throw new ValidationError('该调账已终态，不可审批');

    // level2/level3：一级通过 → pending_level2 进入二级复核（不生效、不计数）
    if (rec.approvalLevel === 'level2' || rec.approvalLevel === 'level3') {
      if (rec.status !== 'pending') throw new ValidationError('该调账不在一级待审状态');
      // 原子状态守卫（修复 P1-2）：仅 pending 可转 pending_level2，防并发重复一级通过
      const [upd] = await db.update(schema.adjustmentRecords)
        .set({ status: 'pending_level2', approvedBy: operatorId, updatedAt: new Date() })
        .where(and(eq(schema.adjustmentRecords.id, adjustId), eq(schema.adjustmentRecords.status, 'pending')))
        .returning({ id: schema.adjustmentRecords.id });
      if (!upd) throw new AppError('该调账不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');
      // B4：降级代审审计留痕
      await db.insert(schema.auditLogs).values({
        userId: operatorId,
        action: 'finance.adjust.approve',
        resource: 'adjustment',
        resourceId: String(adjustId),
        details: { status: 'pending_level2', degraded: rec.requestedBy === operatorId, escalation_reason: rec.requestedBy === operatorId ? escalationReason : null, confirmed: true } as any,
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.send({ data: { id: adjustId, status: 'pending_level2' }, message: '一级审批通过，已进入二级复核' });
    }

    if (rec.status !== 'pending') throw new ValidationError('该调账不在待审状态');
    const result = await applyApproval(adjustId, rec, operatorId, 'approved', request);
    // B4：降级代审审计补充（applyApproval 审计后追加 degraded 标记）
    if (rec.requestedBy === operatorId) {
      await db.insert(schema.auditLogs).values({
        userId: operatorId,
        action: 'finance.adjust.approve',
        resource: 'adjustment',
        resourceId: String(adjustId),
        details: { status: 'approved', degraded: true, escalation_reason: escalationReason, confirmed: true } as any,
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
    }
    return reply.send({ data: { id: adjustId, status: 'approved', balance_after: result.balanceAfter }, message: '审批通过，调账已生效' });
  });

  /** POST /api/v1/admin/adjust/:id/review — 二级审批 / super 终审（R5，ARCH §2.2.3）
   *  - pending_level2 + level2 → approved（生效）
   *  - pending_level2 + level3 → pending_super（进入终审待审，记录二级审批人）
   *  - pending_super（level3）→ approved（生效；强制 super_admin 且 ≠ 申请人/一级/二级）
   *  B4：申请人=审批人时，仅 super_admin 且带 escalation_reason 可降级代审 */
  app.post('/api/v1/admin/adjust/:id/review', { preHandler: [requireNotImpersonated(), requirePerm('finance.adjust'), requireOperation2fa] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const adjustId = parseInt(id, 10);
    if (!Number.isInteger(adjustId) || adjustId <= 0) throw new ValidationError('Invalid adjustment id');
    const operatorId = ((request as any).userContext as { userId: number }).userId;
    const operatorRole = ((request as any).userContext as { role: string }).role;
    const escalationReason = String((request.body as { escalation_reason?: string } | undefined)?.escalation_reason ?? '').trim() || null;

    const [rec] = await db.select().from(schema.adjustmentRecords).where(eq(schema.adjustmentRecords.id, adjustId)).limit(1);
    if (!rec) throw new NotFoundError('Adjustment', id);

    // ── super 终审（pending_super，仅 level3 产生） ──
    if (rec.status === 'pending_super') {
      if (rec.approvalLevel !== 'level3') throw new ValidationError('仅 level3 调账可进行终审');
      if (operatorRole !== 'super_admin') throw new ForbiddenError('终审仅 super_admin 角色可执行');
      if (rec.requestedBy === operatorId) {
        // B4 降级代审：仅 super_admin 且必填原因
        if (!(operatorRole === 'super_admin' && escalationReason)) {
          throw new ValidationError('终审人不能是申请人（职责分离）');
        }
      }
      if (rec.approvedBy === operatorId) throw new ValidationError('终审人不能是一级审批人（职责分离）');
      if (rec.reviewedBy === operatorId) throw new ValidationError('终审人不能是二级审批人（职责分离）');
      const result = await applyApproval(adjustId, rec, operatorId, 'super_reviewed', request);
      if (rec.requestedBy === operatorId) {
        await db.insert(schema.auditLogs).values({
          userId: operatorId,
          action: 'finance.adjust.super_review',
          resource: 'adjustment',
          resourceId: String(adjustId),
          details: { status: 'approved', degraded: true, escalation_reason: escalationReason, confirmed: true } as any,
          ipAddress: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        });
      }
      return reply.send({ data: { id: adjustId, status: 'approved', balance_after: result.balanceAfter }, message: '终审通过，调账已生效' });
    }

    // ── 二级审批（pending_level2） ──
    if (rec.status !== 'pending_level2') throw new ValidationError('仅二级待审或终审待审的调账可复核');
    if (rec.requestedBy === operatorId) {
      // B4 降级代审：仅 super_admin 且必填原因
      if (!(operatorRole === 'super_admin' && escalationReason)) {
        throw new ValidationError('申请人不能审批自己的调账（职责分离）');
      }
    }
    if (rec.approvedBy === operatorId) throw new ValidationError('一级与二级审批不能为同一人');

    // level3：二级通过 → pending_super（进入 super 终审，不生效、不计数）
    if (rec.approvalLevel === 'level3') {
      const [upd] = await db.update(schema.adjustmentRecords)
        .set({ status: 'pending_super', reviewedBy: operatorId, updatedAt: new Date() })
        .where(and(eq(schema.adjustmentRecords.id, adjustId), eq(schema.adjustmentRecords.status, 'pending_level2')))
        .returning({ id: schema.adjustmentRecords.id });
      if (!upd) throw new AppError('该调账不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');
      if (rec.requestedBy === operatorId) {
        await db.insert(schema.auditLogs).values({
          userId: operatorId,
          action: 'finance.adjust.review',
          resource: 'adjustment',
          resourceId: String(adjustId),
          details: { status: 'pending_super', degraded: true, escalation_reason: escalationReason, confirmed: true } as any,
          ipAddress: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        });
      }
      return reply.send({ data: { id: adjustId, status: 'pending_super' }, message: '二级审批通过，已进入 super_admin 终审' });
    }

    const result = await applyApproval(adjustId, rec, operatorId, 'reviewed', request);
    if (rec.requestedBy === operatorId) {
      await db.insert(schema.auditLogs).values({
        userId: operatorId,
        action: 'finance.adjust.review',
        resource: 'adjustment',
        resourceId: String(adjustId),
        details: { status: 'approved', degraded: true, escalation_reason: escalationReason, confirmed: true } as any,
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
    }
    return reply.send({ data: { id: adjustId, status: 'approved', balance_after: result.balanceAfter }, message: '二级复核通过，调账已生效' });
  });

  /** 审批生效公共逻辑（事务：置 approved + 余额变动 + 快照 + 流水）
   *
   * R6 计数在创建时已预占（终裁 B9/B18/B19），生效环节不再触碰限额。
   *
   * @param role - 'approved'（一级，期望 pending）/ 'reviewed'（二级，期望 pending_level2）/
   *               'super_reviewed'（super 终审，期望 pending_super，落 superReviewedBy 列，migration 0030）
   */
  async function applyApproval(adjustId: number, rec: any, operatorId: number, role: 'approved' | 'reviewed' | 'super_reviewed', request: any) {
    const amountNum = toNum(rec.amount);
    // 原子守卫期望的初始状态（修复 P1-2）：一级 approve → pending；二级 review → pending_level2；
    // super 终审 → pending_super
    const expectedStatus = role === 'approved' ? 'pending' : role === 'reviewed' ? 'pending_level2' : 'pending_super';
    const result = await db.transaction(async (tx) => {
      let balanceAfterStr: string;
      if (rec.direction === 'increase') {
        // 调增（加钱方向，裁决 Q6）：creditBalance 收口（无余额行自动建户 + 流水）
        const res = await creditBalance(tx, {
          userId: rec.userId,
          amount: amountNum.toFixed(8),
          type: 'adjustment',
          referenceType: 'adjustment',
          referenceId: String(adjustId),
          description: `手动调账${role === 'approved' ? '(一级审批)' : role === 'reviewed' ? '(二级复核)' : '(super 终审)'} ${rec.subject}：${rec.reason}`,
        });
        balanceAfterStr = res.balanceAfter;
      } else {
        // 调减（扣钱方向）：保持现状 UPDATE（裁决 Q6，本期不收口）
        const upd = await tx.execute(sql`
          UPDATE customer_balances
          SET available_balance = available_balance + ${(-amountNum).toFixed(8)}::numeric,
              total_balance = total_balance + ${(-amountNum).toFixed(8)}::numeric,
              version = version + 1,
              updated_at = NOW()
          WHERE user_id = ${rec.userId}
          RETURNING available_balance AS "balanceAfter"
        `);
        const row = upd[0] as unknown as { balanceAfter: string };
        if (!row) throw new AppError('Balance account not found', 404, 'BALANCE_NOT_FOUND');
        balanceAfterStr = row.balanceAfter;
        await tx.insert(schema.balanceTransactions).values({
          userId: rec.userId,
          type: 'adjustment',
          amount: (-amountNum).toFixed(8),
          balanceAfter: balanceAfterStr,
          referenceType: 'adjustment',
          referenceId: String(adjustId),
          description: `手动调账${role === 'approved' ? '(一级审批)' : role === 'reviewed' ? '(二级复核)' : '(super 终审)'} ${rec.subject}：${rec.reason}`,
        });
      }

      // 原子状态守卫（修复 P1-2）：仅期望状态可置 approved；0 行 → 并发/已处理 →
      // 抛 409 回滚整个事务（含上面的余额变更与流水），防并发双 approve 双重入账/扣减
      const setData: Record<string, unknown> = {
        status: 'approved',
        balanceAfter: balanceAfterStr,
        approvedAt: new Date(),
        updatedAt: new Date(),
      };
      if (role === 'approved') setData.approvedBy = operatorId;
      else if (role === 'reviewed') setData.reviewedBy = operatorId;
      else setData.superReviewedBy = operatorId;   // super 终审人落库（migration 0030）
      const upd = await tx.update(schema.adjustmentRecords)
        .set(setData)
        .where(and(eq(schema.adjustmentRecords.id, adjustId), eq(schema.adjustmentRecords.status, expectedStatus)))
        .returning({ id: schema.adjustmentRecords.id });
      if (upd.length === 0) throw new AppError('该调账不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');

      return { balanceAfter: toNum(balanceAfterStr) };
    });

    // 事务提交后：调增生效同步 Redis 热账本 + R4 通知（站内信必发；扣钱方向不通知，PRD N4）
    let notification: { inApp: boolean; email: string } | null = null;
    if (rec.direction === 'increase') {
      await adjustLedgerAvailable(rec.userId, amountNum);
      await clearNegativeFlag(rec.userId);
      notification = await notifyUser({
        userId: rec.userId,
        event: 'recharge_success',
        title: '充值到账通知',
        content: `您的账户已调增 ¥${amountNum.toFixed(2)}，当前余额 ¥${result.balanceAfter.toFixed(2)}`,
        templateName: 'recharge_success',
        templateVars: {
          amount: amountNum.toFixed(2),
          balance_after: result.balanceAfter.toFixed(2),
        },
        metadata: { adjustmentId: adjustId, direction: rec.direction, amount: amountNum },
      });
    }

    await db.insert(schema.auditLogs).values({
      userId: operatorId,
      action: `finance.adjust.${role}`,
      resource: 'adjustment',
      resourceId: String(adjustId),
      // 审计 details 对齐 ARCH §6.3：notification: { in_app, email }（snake_case）；
      // R7：二次确认标记（E30）；B4：降级代审由调用方注入 degraded
      details: { status: 'approved', notification: notification ? { in_app: notification.inApp, email: notification.email } : null, reviewer_id: operatorId, review_role: role, confirmed: true } as any,
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });
    return result;
  }

  /** POST /api/v1/admin/adjust/:id/reject — 驳回（R5：任意待审阶段可驳回，含 pending_super；2FA）
   *
   * P1-1（评审）：驳回 UPDATE 带**原子状态守卫** `status IN ('pending','pending_level2','pending_super')`，
   * 0 行 → 409 `ORDER_ALREADY_PROCESSED` 整体回滚——防并发"驳回 × 通过"竞态：
   * approve 先提交生效（余额已入账）后，reject 不再命中该行覆盖为 rejected（账实矛盾无法自愈）。
   */
  app.post('/api/v1/admin/adjust/:id/reject', { preHandler: [requireNotImpersonated(), requirePerm('finance.adjust'), requireOperation2fa] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const adjustId = parseInt(id, 10);
    if (!Number.isInteger(adjustId) || adjustId <= 0) throw new ValidationError('Invalid adjustment id');
    const body = (request.body || {}) as { reason?: string };
    const reason = String(body.reason || '').trim() || '审核未通过';
    const operatorId = ((request as any).userContext as { userId: number }).userId;

    const [rec] = await db.select().from(schema.adjustmentRecords).where(eq(schema.adjustmentRecords.id, adjustId)).limit(1);
    if (!rec) throw new NotFoundError('Adjustment', id);
    if (rec.requestedBy === operatorId) throw new ValidationError('申请人不能驳回自己的调账');

    // 原子状态守卫（P1-1）：仅待审状态可置 rejected；0 行 → 并发已通过/已驳回 → 409
    const [updated] = await db.update(schema.adjustmentRecords)
      .set({ status: 'rejected', rejectReason: reason, updatedAt: new Date() })
      .where(and(
        eq(schema.adjustmentRecords.id, adjustId),
        inArray(schema.adjustmentRecords.status, ['pending', 'pending_level2', 'pending_super'] as any),
      ))
      .returning({ id: schema.adjustmentRecords.id });
    if (!updated) throw new AppError('该调账不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');
    return reply.send({ data: { id: adjustId, status: 'rejected' }, message: '已驳回' });
  });

  /** POST /api/v1/admin/adjust/:id/reverse — 红字冲销（生成反向记录，原记录不删除不编辑）
   *
   * R6 语义（终裁 B9/B19：创建时预占 + 不回退）：
   *   - 加钱方向（原调减被冲回）：创建时预占（op=红冲操作者 + user，refType='reverse'，
   *     advisory lock + 24h 滚动汇总判定，soft 升级 / hard 429）；
   *   - 扣钱方向（原调增被冲销）：**不计入、不回退**（原调增发起时已预占，红冲不释放）。
   * 本期不改造红冲审批链（P2-12 保持直接生效，approval_level='level1' + status='approved'，R12 范围）。
   */
  app.post('/api/v1/admin/adjust/:id/reverse', { preHandler: [requireNotImpersonated(), requirePerm('finance.adjust'), requireOperation2fa] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const adjustId = parseInt(id, 10);
    if (!Number.isInteger(adjustId) || adjustId <= 0) throw new ValidationError('Invalid adjustment id');
    const operatorId = ((request as any).userContext as { userId: number }).userId;
    const operatorRole = ((request as any).userContext as { role: string }).role;

    const [rec] = await db.select().from(schema.adjustmentRecords).where(eq(schema.adjustmentRecords.id, adjustId)).limit(1);
    if (!rec) throw new NotFoundError('Adjustment', id);
    if (rec.status !== 'approved') throw new ValidationError('仅已生效的调账可红冲');
    if (rec.reversedById) throw new ValidationError('该调账已红冲过');

    const reverseDirection = rec.direction === 'increase' ? 'decrease' : 'increase';
    const amountNum = toNum(rec.amount);
    const limits = await getCreditLimits();

    // 加钱方向：创建事务内预占判定（advisory lock + 滚动汇总；hard 超限 → 429 拒红冲）
    const result = await db.transaction(async (tx) => {
      let check: Awaited<ReturnType<typeof checkLimitsInTx>> | null = null;
      if (reverseDirection === 'increase') {
        check = await checkLimitsInTx(tx, {
          opUserId: operatorId,
          targetUserId: rec.userId,
          amountYuan: amountNum,
          role: operatorRole,
          softLimitYuan: limits.softLimit,
          hardLimitYuan: limits.hardLimit,
          exceedAction: limits.exceedAction,
          exemptRoles: limits.exemptRoles,
          windowHours: limits.windowHours,
        });
      }

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
      if (!rev) throw new AppError('Failed to create reverse adjustment', 500, 'ADJUST_CREATE_FAILED');

      // R6 创建时预占：红冲加钱方向作新单据预占（op + user，refType='reverse'，refId=rev.id；B8 豁免跳过 op）
      if (reverseDirection === 'increase') {
        if (!check!.op.exempt) await reserveInTx(tx, { scope: 'operator', userId: operatorId, amountYuan: amountNum, refType: 'reverse', refId: String(rev.id) });
        await reserveInTx(tx, { scope: 'user', userId: rec.userId, amountYuan: amountNum, refType: 'reverse', refId: String(rev.id) });
      }

      let balanceAfterStr: string;
      if (reverseDirection === 'increase') {
        // 红冲加钱方向（原调减被冲回）：creditBalance 收口（裁决 Q6）
        const res = await creditBalance(tx, {
          userId: rec.userId,
          amount: amountNum.toFixed(8),
          type: 'adjustment',
          referenceType: 'adjustment',
          referenceId: String(rev.id),
          description: `红字冲销 原调账#${adjustId}`,
        });
        balanceAfterStr = res.balanceAfter;
      } else {
        // 红冲扣钱方向（原调增被冲销）：保持现状 UPDATE（裁决 Q6，本期不收口；不回退计数，B19）
        const upd = await tx.execute(sql`
          UPDATE customer_balances
          SET available_balance = available_balance + ${(-amountNum).toFixed(8)}::numeric,
              total_balance = total_balance + ${(-amountNum).toFixed(8)}::numeric,
              version = version + 1,
              updated_at = NOW()
          WHERE user_id = ${rec.userId}
          RETURNING available_balance AS "balanceAfter"
        `);
        const row = upd[0] as unknown as { balanceAfter: string };
        if (!row) throw new AppError('Balance account not found', 404, 'BALANCE_NOT_FOUND');
        balanceAfterStr = row.balanceAfter;
        await tx.insert(schema.balanceTransactions).values({
          userId: rec.userId,
          type: 'adjustment',
          amount: (-amountNum).toFixed(8),
          balanceAfter: balanceAfterStr,
          referenceType: 'adjustment',
          referenceId: String(rev.id),
          description: `红字冲销 原调账#${adjustId}`,
        });
      }

      await tx.update(schema.adjustmentRecords)
        .set({ balanceAfter: balanceAfterStr })
        .where(eq(schema.adjustmentRecords.id, rev.id));
      // 原子状态守卫（修复 P1-2）：仅 approved 且未红冲可置 reversed；0 行 → 并发双红冲
      // → 抛 409 回滚整个事务（含反向记录与余额变更），防重复冲销
      const [reversed] = await tx.update(schema.adjustmentRecords)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(and(
          eq(schema.adjustmentRecords.id, adjustId),
          eq(schema.adjustmentRecords.status, 'approved'),
          isNull(schema.adjustmentRecords.reversedById),
        ))
        .returning({ id: schema.adjustmentRecords.id });
      if (!reversed) throw new AppError('该调账不存在或已处理', 409, 'ORDER_ALREADY_PROCESSED');

      return { reverseId: rev.id, balanceAfter: toNum(balanceAfterStr), check };
    });

    // 事务提交后：红冲加钱方向同步 Redis 热账本 + ZSET 同步（尽力而为，不阻塞主响应）
    const limitCtx = await currentLimitContext();
    if (reverseDirection === 'increase') {
      await adjustLedgerAvailable(rec.userId, amountNum);
      await clearNegativeFlag(rec.userId);
      if (!result.check!.op.exempt) await syncRedisAdd('operator', operatorId, 'reverse', result.reverseId, yuanToCents(amountNum), limitCtx.windowMs);
      await syncRedisAdd('user', rec.userId, 'reverse', result.reverseId, yuanToCents(amountNum), limitCtx.windowMs);
    }

    await db.insert(schema.auditLogs).values({
      userId: operatorId,
      action: 'finance.adjust.reverse',
      resource: 'adjustment',
      resourceId: String(adjustId),
      details: {
        reverse_id: result.reverseId,
        direction: reverseDirection,
        amount: amountNum,
        limit_check: result.check ? {
          op_projected_cents: yuanToCents(result.check.op.projectedYuan),
          user_projected_cents: yuanToCents(result.check.user.projectedYuan),
        } : null,
        limit_exempt: result.check?.op.exempt ?? false,
        confirmed: true,
      } as any,
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return reply.send({ data: { id: adjustId, status: 'reversed', reverse_id: result.reverseId, balance_after: result.balanceAfter }, message: '已生成红字冲销记录' });
  });
}
