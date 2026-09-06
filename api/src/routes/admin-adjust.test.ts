/**
 * 手动调账路由集成测试 — 生效走 creditBalance 收口 + 越权 + R5–R7（真实 PG）
 *
 * 覆盖 ARCH §8 用例 11/14（阶段一）+ ARCH §6 R5/R6/R7 扩展（真实 PG + Redis）：
 *   11. 调账-生效走收口（R2）：无余额行用户调增免审批生效 → 自动建行 + 余额正确 +
 *       流水 type='adjustment'；一级/二级审批生效同验；红冲（加钱方向）同验
 *   14. 越权-调账（R3）：finance 角色 POST /admin/adjust → 403；admin → 201
 *
 * R5 语义变更（双签 B1/B2/B4，§10.2-3 要求更新阶段一用例）：
 *   - 调增 ≤¥10,000 不再免审批（默认待审）：原"免审批生效"用例改为"待审 → 一级审批生效"
 *   - 调减恰 ¥10,000 仍双人档（B1 特例）：创建 status='pending' → approve → 'pending_level2' → review → 'approved'
 * R7：全部资金写端点强制操作级 2FA（操作员 user_2fa + X-Operation-Token）
 *
 * @see docs/ARCH-整改R1-R4-技术方案.md §8 用例 11、14
 * @see docs/ARCH-整改R5-R7-资金风控.md §6 / §10.2-3
 * @module routes/admin-adjust.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { and, eq, inArray, or, sql, desc } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt';
import { adminAdjustRoutes } from './admin-adjust';
import { enableTest2fa, op2faHeaders, clearCreditCounters } from './test-helpers';
import { resetFinanceRulesCache } from '../lib/finance-rules';

// 独立 JWT 密钥（路由内 verifyToken 与测试签发共用同一 process.env 值）
process.env.JWT_SECRET = 'test-admin-adjust-secret';

const ts = Date.now();

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

// 操作员 / 被调账用户 id
let requesterId = 0;    // admin A（发起调账）
let approverId = 0;     // admin B（审批，职责分离：≠ 申请人）
let approver2Id = 0;    // admin C（并发审批第二人 / 二级审批）
let superAdminId = 0;   // super_admin（R5 tier3 终审）
let financeUserId = 0; // JWT role=finance（DB 角色 customer，user_role 枚举无 finance）
let targetUserId = 0;      // 无余额行（调增兜底用例）
let targetUser2Id = 0;     // 有余额行 ¥50,000（二级审批调减 + 红冲用例）
let tier3TargetId = 0;     // R5 tier3 用例被调账用户（独立，避免计数交叉）

let requesterToken = '';
let approverToken = '';
let approver2Token = '';
let superAdminToken = '';
let financeToken = '';
// R7：操作级 2FA 请求头
let requesterOp: () => Record<string, string> = () => ({});
let approverOp: () => Record<string, string> = () => ({});
let approver2Op: () => Record<string, string> = () => ({});
let superAdminOp: () => Record<string, string> = () => ({});

let app: FastifyInstance;

/** 组装仅含本模块路由的最小 Fastify 实例 + 错误处理 */
function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  instance.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ code: status, message: err?.message ?? 'Internal Server Error' });
  });
  adminAdjustRoutes(instance);
  return instance;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** 查询用户可用余额（无行返回 0） */
async function balanceOf(userId: number): Promise<number> {
  const [row] = await db.select({ availableBalance: schema.customerBalances.availableBalance })
    .from(schema.customerBalances).where(eq(schema.customerBalances.userId, userId)).limit(1);
  return row ? toNum(row.availableBalance) : 0;
}

beforeAll(async () => {
  const [req] = await db.insert(schema.users).values({
    email: `adj-req-${ts}@test.com`, passwordHash: 'x', name: 'AdjRequester', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  requesterId = req!.id;

  const [appr] = await db.insert(schema.users).values({
    email: `adj-appr-${ts}@test.com`, passwordHash: 'x', name: 'AdjApprover', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  approverId = appr!.id;

  const [appr2] = await db.insert(schema.users).values({
    email: `adj-appr2-${ts}@test.com`, passwordHash: 'x', name: 'AdjApprover2', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  approver2Id = appr2!.id;

  const [superAd] = await db.insert(schema.users).values({
    email: `adj-super-${ts}@test.com`, passwordHash: 'x', name: 'AdjSuper', role: 'super_admin', status: 'active',
  }).returning({ id: schema.users.id });
  superAdminId = superAd!.id;

  const [fin] = await db.insert(schema.users).values({
    email: `adj-fin-${ts}@test.com`, passwordHash: 'x', name: 'AdjFinance', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  financeUserId = fin!.id;

  const [t1] = await db.insert(schema.users).values({
    email: `adj-t1-${ts}@test.com`, passwordHash: 'x', name: 'AdjTarget1', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  targetUserId = t1!.id;

  const [t2] = await db.insert(schema.users).values({
    email: `adj-t2-${ts}@test.com`, passwordHash: 'x', name: 'AdjTarget2', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  targetUser2Id = t2!.id;
  await db.insert(schema.customerBalances).values({
    userId: targetUser2Id, totalBalance: '50000', availableBalance: '50000', frozenBalance: '0', currency: 'CNY',
  });

  const [t3] = await db.insert(schema.users).values({
    email: `adj-t3-${ts}@test.com`, passwordHash: 'x', name: 'AdjTarget3', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  tier3TargetId = t3!.id;

  requesterToken = generateAccessToken({ userId: requesterId, email: `adj-req-${ts}@test.com`, role: 'admin' });
  approverToken = generateAccessToken({ userId: approverId, email: `adj-appr-${ts}@test.com`, role: 'admin' });
  approver2Token = generateAccessToken({ userId: approver2Id, email: `adj-appr2-${ts}@test.com`, role: 'admin' });
  superAdminToken = generateAccessToken({ userId: superAdminId, email: `adj-super-${ts}@test.com`, role: 'super_admin' });
  financeToken = generateAccessToken({ userId: financeUserId, email: `adj-fin-${ts}@test.com`, role: 'finance' });

  // R7：资金写操作者启用 2FA + 签发操作令牌
  await enableTest2fa(requesterId);
  await enableTest2fa(approverId);
  await enableTest2fa(approver2Id);
  await enableTest2fa(superAdminId);
  requesterOp = () => op2faHeaders(requesterToken, requesterId, `adj-req-${ts}@test.com`, 'admin');
  approverOp = () => op2faHeaders(approverToken, approverId, `adj-appr-${ts}@test.com`, 'admin');
  approver2Op = () => op2faHeaders(approver2Token, approver2Id, `adj-appr2-${ts}@test.com`, 'admin');
  superAdminOp = () => op2faHeaders(superAdminToken, superAdminId, `adj-super-${ts}@test.com`, 'super_admin');

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    const userIds = [requesterId, approverId, approver2Id, superAdminId, financeUserId, targetUserId, targetUser2Id, tier3TargetId].filter((x) => x > 0);
    // adjustment_records 同时引用申请人、审批人和被调账用户；先清理所有相关 FK 记录。
    const relatedUserIds = [requesterId, approverId, approver2Id, superAdminId, targetUserId, targetUser2Id, tier3TargetId].filter((x) => x > 0);
    await db.delete(schema.adjustmentRecords).where(or(
      inArray(schema.adjustmentRecords.userId, relatedUserIds),
      inArray(schema.adjustmentRecords.requestedBy, relatedUserIds),
      inArray(schema.adjustmentRecords.approvedBy, relatedUserIds),
      inArray(schema.adjustmentRecords.reviewedBy, relatedUserIds),
      inArray(schema.adjustmentRecords.superReviewedBy, relatedUserIds),
    ));
    await db.delete(schema.balanceTransactions).where(inArray(schema.balanceTransactions.userId, [targetUserId, targetUser2Id, tier3TargetId]));
    await db.delete(schema.customerBalances).where(inArray(schema.customerBalances.userId, [targetUserId, targetUser2Id, tier3TargetId]));
    await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.userId, [requesterId, approverId, approver2Id, superAdminId]));
    // R6/R7 清理：限额计数行 + Redis 键 + user_2fa（FK 依赖 users）
    await clearCreditCounters(userIds);
    await db.delete(schema.user2fa).where(inArray(schema.user2fa.userId, [requesterId, approverId, approver2Id, superAdminId]));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
  } catch (err) {
    console.error('[admin-adjust.test] cleanup failed:', err);
  }
});

/* ═══════════ 用例 11：调账生效走收口（R2）+ R5 待审语义更新 ═══════════ */

describe('R2 调账生效收口（R5 语义更新）', () => {
  beforeAll(async () => {
    // ⚠️ 并行隔离：finance_rules 为跨测试进程共享表。本组用例依赖默认 single_review_max=10000
    // （B1 调减恰 ¥10,000 → level2）；只修正该字段（保留 review_exempt 等其他字段），
    // 避免删行破坏并行文件正在使用的配置。无配置行 → 默认即 10000，无需处理。
    await ensureDefaultSingleReviewMax();
    resetFinanceRulesCache();
  });

  it('用例11 调增 ¥100（无余额行）：R5 取消免审批 → 创建 pending，一级审批生效 → 自动建行 + 余额正确 + 流水 type=adjustment', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/adjust', headers: requesterOp(),
      payload: { user_id: targetUserId, direction: 'increase', amount: 100, reason: '平台赠送', subject: '赠送' },
    });
    // 阶段一"免审批生效"用例更新为待审语义（双签 B2/B4，§10.2-3）
    expect(create.statusCode).toBe(201);
    expect(create.json().data.status).toBe('pending');
    expect(create.json().data.approval_level).toBe('level1');
    const adjustId = create.json().data.id;

    // 一级审批生效（职责分离：审批人 ≠ 申请人）
    const approve = await app.inject({
      method: 'POST', url: `/api/v1/admin/adjust/${adjustId}/approve`, headers: approverOp(), payload: {},
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().data.status).toBe('approved');
    expect(toNum(approve.json().data.balance_after)).toBeCloseTo(100, 4);
    expect(await balanceOf(targetUserId)).toBeCloseTo(100, 4);

    const [bal] = await db.select({ id: schema.customerBalances.id }).from(schema.customerBalances)
      .where(eq(schema.customerBalances.userId, targetUserId)).limit(1);
    expect(bal).toBeDefined();   // 无余额行自动建户

    const [txRow] = await db.select({ type: schema.balanceTransactions.type, balanceAfter: schema.balanceTransactions.balanceAfter })
      .from(schema.balanceTransactions)
      .where(and(eq(schema.balanceTransactions.userId, targetUserId), eq(schema.balanceTransactions.referenceType, 'adjustment')))
      .orderBy(schema.balanceTransactions.id).limit(1);
    expect(txRow).toBeDefined();
    expect(txRow!.type).toBe('adjustment');
    expect(toNum(txRow!.balanceAfter)).toBeCloseTo(100, 4);
  });

  it('用例11 一级审批调增生效 → approved + 余额累加（走收口）', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/adjust', headers: requesterOp(),
      payload: { user_id: targetUserId, direction: 'increase', amount: 10000, reason: '大额调增', subject: '补偿' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().data.status).toBe('pending');
    expect(create.json().data.approval_level).toBe('level1');   // 恰 ¥10,000 调增 → 单审档（B1 特例仅调减）
    const adjustId = create.json().data.id;

    const approve = await app.inject({
      method: 'POST', url: `/api/v1/admin/adjust/${adjustId}/approve`, headers: approverOp(), payload: {},
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().data.status).toBe('approved');
    expect(toNum(approve.json().data.balance_after)).toBeCloseTo(10100, 4);
    expect(await balanceOf(targetUserId)).toBeCloseTo(10100, 4);
  });

  it('用例11 二级审批调减生效（恰 ¥10,000 双人特例 B1）：创建 pending → approve → pending_level2 → review → approved + 余额扣减', async () => {
    // ⚠️ 并行兜底：本用例断言依赖默认 single_review_max=10000（B1 调减恰 ¥10,000 → level2）。
    // 只修正该字段（保留 review_exempt 等其他字段），避免删行破坏并行文件正在使用的配置。
    await ensureDefaultSingleReviewMax();
    resetFinanceRulesCache();

    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/adjust', headers: requesterOp(),
      payload: { user_id: targetUser2Id, direction: 'decrease', amount: 10000, reason: '调减测试', subject: '退款' },
    });
    // 阶段一"创建即 pending_level2"更新为"创建 pending → 一级 approve → pending_level2"（R5 §2.4.3）
    expect(create.statusCode).toBe(201);
    expect(create.json().data.status).toBe('pending');
    expect(create.json().data.approval_level).toBe('level2');
    const adjustId = create.json().data.id;

    const approve = await app.inject({
      method: 'POST', url: `/api/v1/admin/adjust/${adjustId}/approve`, headers: approverOp(), payload: {},
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().data.status).toBe('pending_level2');

    const review = await app.inject({
      method: 'POST', url: `/api/v1/admin/adjust/${adjustId}/review`, headers: approver2Op(), payload: {},
    });
    expect(review.statusCode).toBe(200);
    expect(review.json().data.status).toBe('approved');
    expect(toNum(review.json().data.balance_after)).toBeCloseTo(40000, 4);
    expect(await balanceOf(targetUser2Id)).toBeCloseTo(40000, 4);
  });

  it('用例11 红冲（加钱方向：原调减被冲回）→ 反向记录 direction=increase + 余额回补（走收口）', async () => {
    // 找到上一用例生成的已生效调减记录（status=approved 且未被红冲）
    const [rec] = await db.select({ id: schema.adjustmentRecords.id })
      .from(schema.adjustmentRecords)
      .where(and(eq(schema.adjustmentRecords.userId, targetUser2Id), eq(schema.adjustmentRecords.direction, 'decrease')))
      .orderBy(schema.adjustmentRecords.id).limit(1);
    expect(rec).toBeDefined();

    const reverse = await app.inject({
      method: 'POST', url: `/api/v1/admin/adjust/${rec!.id}/reverse`, headers: requesterOp(), payload: {},
    });
    expect(reverse.statusCode).toBe(200);
    expect(reverse.json().data.status).toBe('reversed');
    expect(toNum(reverse.json().data.balance_after)).toBeCloseTo(50000, 4);
    expect(await balanceOf(targetUser2Id)).toBeCloseTo(50000, 4);

    const [revRec] = await db.select({ direction: schema.adjustmentRecords.direction, status: schema.adjustmentRecords.status })
      .from(schema.adjustmentRecords).where(eq(schema.adjustmentRecords.reversedById, rec!.id)).limit(1);
    expect(revRec).toBeDefined();
    expect(revRec!.direction).toBe('increase');   // 加钱方向
    expect(revRec!.status).toBe('approved');
  });
});

/* ═══════════ 用例 14：越权-调账（R3） ═══════════ */

describe('R3 调账权限点', () => {
  it('用例14 finance 角色 POST /admin/adjust → 403 FORBIDDEN', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/adjust', headers: auth(financeToken),
      payload: { user_id: targetUser2Id, direction: 'increase', amount: 50, reason: 'finance 越权', subject: '测试' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('用例14 admin 角色 POST /admin/adjust → 201；R5 取消免审 → 状态为待审 pending（原"免审批生效"语义更新）', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/adjust', headers: requesterOp(),
      payload: { user_id: targetUser2Id, direction: 'increase', amount: 50, reason: 'admin 正常', subject: '测试' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe('pending');
    expect(res.json().data.approval_level).toBe('level1');
    expect(await balanceOf(targetUser2Id)).toBeCloseTo(50000, 4);   // 待审不生效
  });
});

/* ═══════════ 修复回归：P1-2 事务内原子状态守卫（并发） ═══════════ */

describe('R2 修复回归（P1-2 并发原子守卫）', () => {
  it('P1-2 同记录并发 approve（两个审批人）→ 仅生效一次：一 200 一 409，余额只累加一次、流水一条', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/adjust', headers: requesterOp(),
      payload: { user_id: targetUserId, direction: 'increase', amount: 10000, reason: '并发审批', subject: '补偿' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().data.status).toBe('pending');
    const adjustId = create.json().data.id;
    const before = await balanceOf(targetUserId);

    // 两个不同审批人（均 ≠ 申请人）并发 approve。
    // 竞态结果两种均正确且只生效一次：事务外预检拦截（400，读到已 approved）
    // 或事务内原子守卫拦截（409 ORDER_ALREADY_PROCESSED）。
    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${adjustId}/approve`, headers: approverOp(), payload: {} }),
      app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${adjustId}/approve`, headers: approver2Op(), payload: {} }),
    ]);
    const codes = [r1.statusCode, r2.statusCode].sort();
    expect(codes[0]).toBe(200);
    expect([400, 409]).toContain(codes[1]);

    // 余额只累加一次（10000），流水仅一条 adjustment
    expect(await balanceOf(targetUserId)).toBeCloseTo(before + 10000, 4);
    const txs = await db.select({ id: schema.balanceTransactions.id }).from(schema.balanceTransactions)
      .where(and(eq(schema.balanceTransactions.userId, targetUserId), eq(schema.balanceTransactions.referenceId, String(adjustId))));
    expect(txs.length).toBe(1);

    const [rec] = await db.select({ status: schema.adjustmentRecords.status }).from(schema.adjustmentRecords)
      .where(eq(schema.adjustmentRecords.id, adjustId)).limit(1);
    expect(rec!.status).toBe('approved');
  });

  it('P1-2 已生效调账并发双红冲 → 仅一次生效：一 200 一 409，余额只回补一次', async () => {
    // 准备一条已生效调增记录（R5 语义：先创建 pending → 一级审批生效），余额 +500
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/adjust', headers: requesterOp(),
      payload: { user_id: targetUser2Id, direction: 'increase', amount: 500, reason: '并发红冲准备', subject: '测试' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().data.status).toBe('pending');
    const pendingId = create.json().data.id;
    const approved = await app.inject({
      method: 'POST', url: `/api/v1/admin/adjust/${pendingId}/approve`, headers: approverOp(), payload: {},
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().data.status).toBe('approved');
    const adjustId = pendingId;
    const before = await balanceOf(targetUser2Id);

    // 两个并发 reverse。竞态结果两种均正确且只冲销一次：
    // 事务外预检拦截（400，读到已 reversed / 已红冲）或事务内原子守卫拦截（409）
    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${adjustId}/reverse`, headers: requesterOp(), payload: {} }),
      app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${adjustId}/reverse`, headers: approverOp(), payload: {} }),
    ]);
    const codes = [r1.statusCode, r2.statusCode].sort();
    expect(codes[0]).toBe(200);
    expect([400, 409]).toContain(codes[1]);

    // 余额只扣回一次（-500）；原记录置 reversed；反向记录仅 1 条
    expect(await balanceOf(targetUser2Id)).toBeCloseTo(before - 500, 4);
    const revs = await db.select({ id: schema.adjustmentRecords.id }).from(schema.adjustmentRecords)
      .where(eq(schema.adjustmentRecords.reversedById, adjustId));
    expect(revs.length).toBe(1);
    const [rec] = await db.select({ status: schema.adjustmentRecords.status }).from(schema.adjustmentRecords)
      .where(eq(schema.adjustmentRecords.id, adjustId)).limit(1);
    expect(rec!.status).toBe('reversed');
  });
});

/* ═══════════ R5 tier3 / 白名单免审（ARCH §6.1 用例 7/8） ═══════════ */

/** 读取 PG 权威限额滚动汇总（分；24h 窗口） */
async function readCounter(scope: 'operator' | 'user', uid: number): Promise<number> {
  const [row] = await db.select({ sum: sql<string>`COALESCE(SUM(${schema.creditLimitEvents.amount}), 0)` })
    .from(schema.creditLimitEvents)
    .where(and(
      eq(schema.creditLimitEvents.scope, scope),
      eq(schema.creditLimitEvents.userId, uid),
      sql`${schema.creditLimitEvents.createdAt} > now() - interval '24 hours'`,
    ))
    .limit(1);
  return Math.round(Number(row?.sum ?? 0) * 100);
}

/**
 * ⚠️ 并行隔离 helper：确保 finance_rules.single_review_max=10000（默认阈值），
 * 保留 large_amount 其他字段与 review_exempt 等（不删行，避免破坏并行文件配置）。
 * 无配置行 → 默认即 10000，无需处理。
 */
async function ensureDefaultSingleReviewMax(): Promise<void> {
  const [row] = await db.select({ value: schema.systemConfig.value }).from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, 'finance_rules')).limit(1);
  if (!row) return;
  const v = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  const cur = Number(v?.large_amount?.single_review_max);
  if (Number.isFinite(cur) && cur !== 10000) {
    v.large_amount = { ...(v.large_amount ?? {}), single_review_max: 10000 };
    await db.update(schema.systemConfig).set({ value: v }).where(eq(schema.systemConfig.key, 'finance_rules'));
  }
}

/** 临时覆盖 finance_rules 配置（tier3 调高 hard_limit / 白名单免审开关），结束后恢复 */
async function withFinanceRules(cfg: Record<string, unknown>, fn: () => Promise<void>): Promise<void> {
  const [backupRow] = await db.select({ value: schema.systemConfig.value }).from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, 'finance_rules')).limit(1);
  const backupRaw = backupRow ? (typeof backupRow.value === 'string' ? backupRow.value : JSON.stringify(backupRow.value)) : null;
  await db.insert(schema.systemConfig).values({ key: 'finance_rules', value: JSON.stringify(cfg), description: 'r5r7 adjust test' })
    .onConflictDoUpdate({ target: schema.systemConfig.key, set: { value: JSON.stringify(cfg), description: 'r5r7 adjust test' } });
  resetFinanceRulesCache();
  try {
    await fn();
  } finally {
    if (backupRaw) {
      await db.update(schema.systemConfig).set({ value: JSON.parse(backupRaw) }).where(eq(schema.systemConfig.key, 'finance_rules'));
    } else {
      await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, 'finance_rules'));
    }
    resetFinanceRulesCache();
  }
}

describe('R5 调账 tier3 + 白名单免审', () => {
  it('用例7 调增 >10万 → level3：pending → approve → pending_level2 → review → pending_super → super 终审 → approved', async () => {
    // 单笔 20 万 > 默认 hard_limit（创建预检 429）：临时调高 hard_limit 验证 tier3 链
    await withFinanceRules({
      manual_topup: { max_amount: 1000000 },
      limits: { soft_limit: 50000, hard_limit: 1000000 },
    }, async () => {
      const create = await app.inject({
        method: 'POST', url: '/api/v1/admin/adjust', headers: requesterOp(),
        payload: { user_id: tier3TargetId, direction: 'increase', amount: 200000, reason: '大额调增终审链', subject: '补偿' },
      });
      expect(create.statusCode).toBe(201);
      expect(create.json().data.status).toBe('pending');
      expect(create.json().data.approval_level).toBe('level3');
      expect(create.json().message).toBe('已提交三级审批（super_admin 终审）');
      const id = create.json().data.id;
      const before = await balanceOf(tier3TargetId);

      // 一级 → pending_level2
      const r1 = await app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${id}/approve`, headers: approverOp(), payload: {} });
      expect(r1.statusCode).toBe(200);
      expect(r1.json().data.status).toBe('pending_level2');

      // 二级 → pending_super
      const r2 = await app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${id}/review`, headers: approver2Op(), payload: {} });
      expect(r2.statusCode).toBe(200);
      expect(r2.json().data.status).toBe('pending_super');

      // 非 super_admin 终审 → 403
      const forbidden = await app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${id}/review`, headers: approverOp(), payload: {} });
      expect(forbidden.statusCode).toBe(403);

      // super 终审 → approved + 生效
      const r3 = await app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${id}/review`, headers: superAdminOp(), payload: {} });
      expect(r3.statusCode).toBe(200);
      expect(r3.json().data.status).toBe('approved');
      expect(toNum(r3.json().data.balance_after)).toBeCloseTo(before + 200000, 2);
    });
  });

  it('用例7/8 终审=一级审批人 → 400（职责分离：终审 ≠ 前两级）', async () => {
    await withFinanceRules({ manual_topup: { max_amount: 1000000 }, limits: { soft_limit: 50000, hard_limit: 1000000 } }, async () => {
      const create = await app.inject({
        method: 'POST', url: '/api/v1/admin/adjust', headers: requesterOp(),
        payload: { user_id: tier3TargetId, direction: 'increase', amount: 150000, reason: '终审复用一级', subject: '补偿' },
      });
      const id = create.json().data.id;
      // 一级 = super
      const r1 = await app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${id}/approve`, headers: superAdminOp(), payload: {} });
      expect(r1.statusCode).toBe(200);
      // 二级 = admin
      const r2 = await app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${id}/review`, headers: approverOp(), payload: {} });
      expect(r2.statusCode).toBe(200);
      expect(r2.json().data.status).toBe('pending_super');
      // super 终审（=一级）→ 400
      const r3 = await app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${id}/review`, headers: superAdminOp(), payload: {} });
      expect(r3.statusCode).toBe(400);
      expect(r3.json().message).toContain('一级审批人');
    });
  });

  it('用例7 白名单科目免审（配置开启）→ 提交即生效 approved + 计入限额', async () => {
    await withFinanceRules({
      large_amount: { review_exempt: { enabled: true, max_amount: 1000, subjects: ['赠送', '补偿', '纠错'] } },
      limits: { soft_limit: 50000, hard_limit: 100000 },
    }, async () => {
      // 发起人用 approver（操作人计数干净）；被调用户用 targetUserId（user 计数未被 tier3 污染）
      const before = await readCounter('operator', approverId);
      const create = await app.inject({
        method: 'POST', url: '/api/v1/admin/adjust', headers: approverOp(),
        payload: { user_id: targetUserId, direction: 'increase', amount: 100, reason: '赠送', subject: '赠送' },
      });
      expect(create.statusCode).toBe(201);
      expect(create.json().data.status).toBe('approved');
      expect(create.json().data.approval_level).toBe('none');
      expect(create.json().message).toBe('调账已生效（免审批）');
      // 免审计入限额（op 维度 +100 元 = 10000 分；创建时预占）
      expect(await readCounter('operator', approverId)).toBe(before + 10000);
    });
  });

  it('用例7 白名单免审未命中（非白名单科目）→ 正常待审', async () => {
    await withFinanceRules({
      large_amount: { review_exempt: { enabled: true, max_amount: 1000, subjects: ['赠送', '补偿', '纠错'] } },
      limits: { soft_limit: 50000, hard_limit: 100000 },
    }, async () => {
      const create = await app.inject({
        method: 'POST', url: '/api/v1/admin/adjust', headers: approverOp(),
        payload: { user_id: targetUserId, direction: 'increase', amount: 100, reason: '普通科目', subject: '测试' },
      });
      expect(create.statusCode).toBe(201);
      expect(create.json().data.status).toBe('pending');
      expect(create.json().data.approval_level).toBe('level1');
    });
  });

  it('用例7/8 B4 降级代审：super_admin 自建自审 → 400（无原因）；带 escalation_reason → 通过 + 审计 degraded:true', async () => {
    // super_admin 发起调增（500，level1 待审；targetUserId 用户计数未超限）
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/adjust', headers: superAdminOp(),
      payload: { user_id: targetUserId, direction: 'increase', amount: 500, reason: 'B4 降级代审测试', subject: '补偿' },
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().data.id;

    // 自审无原因 → 400（职责分离，super_admin 不豁免）
    const noReason = await app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${id}/approve`, headers: superAdminOp(), payload: {} });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json().message).toContain('职责分离');

    // 自审带 escalation_reason → 200 + approved（B4 降级代审路径）
    const withReason = await app.inject({
      method: 'POST', url: `/api/v1/admin/adjust/${id}/approve`, headers: superAdminOp(),
      payload: { escalation_reason: '审批人不足，super_admin 代审' },
    });
    expect(withReason.statusCode).toBe(200);
    expect(withReason.json().data.status).toBe('approved');

    // 审计 degraded:true + 原因
    const [audit] = await db.select({ details: schema.auditLogs.details }).from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.action, 'finance.adjust.approve'), eq(schema.auditLogs.resourceId, String(id))))
      .orderBy(desc(schema.auditLogs.id)).limit(1);
    expect(audit).toBeDefined();
    const ad = audit!.details as { degraded?: boolean; escalation_reason?: string | null };
    expect(ad.degraded).toBe(true);
    expect(ad.escalation_reason).toBe('审批人不足，super_admin 代审');
  });
});

/* ═══════════ R6 创建预占 + 红冲不回退（ARCH v1.1 §3.3 / 终裁 B9/B19） ═══════════ */

describe('R6 创建时预占与红冲不回退', () => {
  it('调增发起即预占（op=发起人 + user）；红冲扣钱方向不回退累计', async () => {
    // 调增 5000 发起（发起人 approver——操作人计数干净；创建时预占 op + user）
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/adjust', headers: approverOp(),
      payload: { user_id: targetUser2Id, direction: 'increase', amount: 5000, reason: '预占测试', subject: '补偿' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().data.status).toBe('pending');
    const id = create.json().data.id;

    // 创建时预占：op=approver + user=targetUser2 各 +5000 元（无需生效）
    const opAfterCreate = await readCounter('operator', approverId);
    const userAfterCreate = await readCounter('user', targetUser2Id);
    expect(opAfterCreate).toBeGreaterThanOrEqual(5000_00);

    // 一级审批生效（不产生新计数）
    const approve = await app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${id}/approve`, headers: approver2Op(), payload: {} });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().data.status).toBe('approved');
    expect(await readCounter('operator', approverId)).toBe(opAfterCreate);

    // 红冲扣钱方向（原调增被冲销）→ 不回退累计（B19：无 DECRBY）
    const reverse = await app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${id}/reverse`, headers: requesterOp(), payload: {} });
    expect(reverse.statusCode).toBe(200);
    expect(reverse.json().data.status).toBe('reversed');
    expect(await readCounter('operator', approverId)).toBe(opAfterCreate);
    expect(await readCounter('user', targetUser2Id)).toBe(userAfterCreate);
  });

  it('调减不计入：调减发起不产生事件', async () => {
    const before = await readCounter('user', targetUser2Id);
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/adjust', headers: approverOp(),
      payload: { user_id: targetUser2Id, direction: 'decrease', amount: 1000, reason: '调减不计入', subject: '退款' },
    });
    expect(create.statusCode).toBe(201);
    expect(await readCounter('user', targetUser2Id)).toBe(before);   // 不计入
  });
});

/* ═══════════ R7 资金端点 2FA 挂载（ARCH §6.3 用例 21） ═══════════ */

describe('R7 调账资金端点 2FA 挂载', () => {
  it('用例21 发起/审批/驳回/红冲无 X-Operation-Token → 403（避开 401）', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/adjust', headers: auth(requesterToken),
      payload: { user_id: targetUser2Id, direction: 'increase', amount: 100, reason: '无令牌', subject: '测试' },
    });
    expect(create.statusCode).toBe(403);

    // 直接落一条 pending 调账（绕过创建端点）
    const [rec] = await db.insert(schema.adjustmentRecords).values({
      userId: targetUser2Id, direction: 'increase', amount: '100.00000000', reason: 'x', subject: '测试',
      approvalLevel: 'level1', status: 'pending', balanceBefore: '0.00000000', requestedBy: requesterId,
    }).returning({ id: schema.adjustmentRecords.id });
    expect(rec).toBeDefined();

    const approve = await app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${rec!.id}/approve`, headers: auth(approverToken), payload: {} });
    expect(approve.statusCode).toBe(403);
    const reject = await app.inject({ method: 'POST', url: `/api/v1/admin/adjust/${rec!.id}/reject`, headers: auth(approverToken), payload: { reason: 'x' } });
    expect(reject.statusCode).toBe(403);
  });
});
