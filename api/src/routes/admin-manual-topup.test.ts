/**
 * 人工上账路由集成测试 — POST /admin/manual-topup 创建 + 审核收口 + 权限 + 通知
 *
 * 覆盖 ARCH §8 用例 1–7（真实 PG + Redis，风格对齐 admin-risk-finance.test.ts）：
 *   1. 创建上账成功（method=manual / pending / MT 订单号 / metadata / 审计）
 *   2. 创建参数校验（金额 0/负/超上限、缺 note、evidence_url、用户不存在、frozen 用户）
 *   3. 创建幂等（同 Idempotency-Key 重复提交：L1 缓存回放 200 或 409；杀缓存后 L2 唯一约束 409；仅 1 行）
 *   4. 审核通过-无余额行兜底（R2 自动建户）
 *   5. 审核通过-正常路径（余额累加 + 流水快照 + 重复审核 409）
 *   6. 审核通过-通知触发（R4：notifications 落库 + 审计含通知状态；无模板 no_template / 有模板 SMTP 未配置 skipped）
 *   7. 越权-权限点（R3：finance 可创建/审核；sales/customer 403；未登录 401）
 *
 * R5–R7 扩展（ARCH §6）：
 *   - 创建响应含 approval_level/approval_phase/message 按档位提示（§2.5.1）
 *   - 资金写端点强制操作级 2FA（R7：操作员启用 user_2fa + X-Operation-Token）
 *   - 审核人 ≠ 创建人（R5 职责分离）；多阶段状态机见扩展用例
 *
 * @see docs/ARCH-整改R1-R4-技术方案.md §8 测试清单
 * @see docs/ARCH-整改R5-R7-资金风控.md §6 测试清单
 * @module routes/admin-manual-topup.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt';
import { getRedis } from '../lib/redis';
import { adminFinanceMissingRoutes } from './admin-finance-missing';
import { enableTest2fa, op2faHeaders, clearCreditCounters } from './test-helpers';
import { resetFinanceRulesCache } from '../lib/finance-rules';

// 独立 JWT 密钥（路由内 verifyToken 与测试签发共用同一 process.env 值）
process.env.JWT_SECRET = 'test-admin-manual-topup-secret';

const ts = Date.now();

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

/** 查询用户可用余额（无行返回 0） */
async function balanceOf(userId: number): Promise<number> {
  const [row] = await db.select({ availableBalance: schema.customerBalances.availableBalance })
    .from(schema.customerBalances).where(eq(schema.customerBalances.userId, userId)).limit(1);
  return row ? toNum(row.availableBalance) : 0;
}

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

/**
 * tier3（>¥100,000 单笔）用例的限额配置支架：默认 hard_limit=¥100,000 会在创建预检
 * 拒绝单笔 >10 万（ARCH §3.4 projected > hard → 429），tier3 状态机需将 hard_limit
 * 临时调高（与 manual_topup.max_amount 1,000,000 对齐；运营可配置）后验证审批链，
 * 结束后恢复默认（删除配置行 + 清缓存）。
 */
async function withRaisedHardLimit(fn: () => Promise<void>): Promise<void> {
  const [backupRow] = await db.select({ value: schema.systemConfig.value }).from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, 'finance_rules')).limit(1);
  const backupRaw = backupRow ? (typeof backupRow.value === 'string' ? backupRow.value : JSON.stringify(backupRow.value)) : null;
  const cfg = {
    manual_topup: { max_amount: 1000000 },
    limits: { soft_limit: 50000, hard_limit: 1000000, count_recharge_audit: false, window_hours: 24, timezone: 'Asia/Shanghai' },
  };
  await db.insert(schema.systemConfig).values({ key: 'finance_rules', value: JSON.stringify(cfg), description: 'r5r7 tier3 test' })
    .onConflictDoUpdate({ target: schema.systemConfig.key, set: { value: JSON.stringify(cfg), description: 'r5r7 tier3 test' } });
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

// 测试期间共享的数据库行 id
let adminId = 0;
let admin2Id = 0;      // 二审 / 并发第二审批人（R5 多阶段）
let superAdminId = 0;  // super_admin 终审（R5 tier3）
let financeUserId = 0;   // DB 角色 customer（user_role 枚举无 finance），JWT role='finance'
let salesUserId = 0;
let customerUserId = 0;
let activeUserId = 0;    // active 用户（无余额行，兜底用例）
let balancedUserId = 0;  // active 用户（有余额行，正常路径用例）
let frozenUserId = 0;    // frozen 用户（创建被拒）
let notifUserId = 0;     // 通知用例用户
let limitOpUserId = 0;   // R6 限额用例操作人（9×9999 拆分）
let limitTargetUserId = 0; // R6 限额用例被入账用户
let rejectOpUserId = 0;  // R6 驳回不回退用例操作人（独立，避免 9×9999 累计污染）
let rejectTargetUserId = 0; // R6 驳回不回退用例被入账用户
let stage2UserId = 0;    // R5 双人档用例被入账用户（无余额）
let stage3UserId = 0;    // R5 三人档用例被入账用户（无余额）
let rejectUserId = 0;    // R5 驳回用例被入账用户（独立，避免计数交叉）

let adminToken = '';
let admin2Token = '';
let superAdminToken = '';
let financeToken = '';
let salesToken = '';
let customerToken = '';
let limitOpToken = '';
// R7：操作级 2FA 请求头（操作员已启用 2FA + 签发操作令牌）
let adminOpHeaders: () => Record<string, string> = () => ({});
let admin2OpHeaders: () => Record<string, string> = () => ({});
let superAdminOpHeaders: () => Record<string, string> = () => ({});
let financeOpHeaders: () => Record<string, string> = () => ({});
let limitOpHeaders: () => Record<string, string> = () => ({});
let rejectOpHeaders: () => Record<string, string> = () => ({});

let app: FastifyInstance;

/** 组装仅含本模块路由的最小 Fastify 实例 + 错误处理（AppError.statusCode → HTTP） */
function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  instance.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ code: status, message: err?.message ?? 'Internal Server Error' });
  });
  adminFinanceMissingRoutes(instance);
  return instance;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** 直接落一条人工上账订单（绕过创建端点，测试审核路径） */
async function insertManualOrder(userId: number, amount: string, overrides: Record<string, unknown> = {}) {
  const [order] = await db.insert(schema.rechargeOrders).values({
    userId,
    orderNo: `MT-TEST-${ts}-${Math.floor(Math.random() * 100000)}`,
    amount,
    currency: 'CNY',
    method: 'manual',
    status: 'pending',
    note: '测试订单',
    metadata: { source: 'admin-manual-topup' },
    ...overrides,
  }).returning({ id: schema.rechargeOrders.id, orderNo: schema.rechargeOrders.orderNo });
  if (!order) throw new Error('insert manual order failed');
  return order;
}

beforeAll(async () => {
  // 操作员：admin / finance(JWT) / sales / customer
  const [admin] = await db.insert(schema.users).values({
    email: `mt-admin-${ts}@test.com`, passwordHash: 'x', name: 'MTAdmin', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  adminId = admin!.id;

  const [fin] = await db.insert(schema.users).values({
    email: `mt-fin-${ts}@test.com`, passwordHash: 'x', name: 'MTFinance', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  financeUserId = fin!.id;

  const [sales] = await db.insert(schema.users).values({
    email: `mt-sales-${ts}@test.com`, passwordHash: 'x', name: 'MTSales', role: 'sales', status: 'active',
  }).returning({ id: schema.users.id });
  salesUserId = sales!.id;

  const [cust] = await db.insert(schema.users).values({
    email: `mt-cust-${ts}@test.com`, passwordHash: 'x', name: 'MTCustomer', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  customerUserId = cust!.id;

  // 被上账用户
  const [active] = await db.insert(schema.users).values({
    email: `mt-active-${ts}@test.com`, passwordHash: 'x', name: 'MTActive', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  activeUserId = active!.id;

  const [balanced] = await db.insert(schema.users).values({
    email: `mt-balanced-${ts}@test.com`, passwordHash: 'x', name: 'MTBalanced', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  balancedUserId = balanced!.id;
  await db.insert(schema.customerBalances).values({
    userId: balancedUserId, totalBalance: '100', availableBalance: '100', frozenBalance: '0', currency: 'CNY',
  });

  const [frozen] = await db.insert(schema.users).values({
    email: `mt-frozen-${ts}@test.com`, passwordHash: 'x', name: 'MTFrozen', role: 'customer', status: 'frozen',
  }).returning({ id: schema.users.id });
  frozenUserId = frozen!.id;

  const [notif] = await db.insert(schema.users).values({
    email: `mt-notif-${ts}@test.com`, passwordHash: 'x', name: 'MTNotif', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  notifUserId = notif!.id;

  // R5 多阶段 / R6 限额 专用操作员与被入账用户（避免跨用例计数污染）
  const [admin2] = await db.insert(schema.users).values({
    email: `mt-admin2-${ts}@test.com`, passwordHash: 'x', name: 'MTAdmin2', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  admin2Id = admin2!.id;

  const [superAd] = await db.insert(schema.users).values({
    email: `mt-super-${ts}@test.com`, passwordHash: 'x', name: 'MTSuper', role: 'super_admin', status: 'active',
  }).returning({ id: schema.users.id });
  superAdminId = superAd!.id;

  const [limitOp] = await db.insert(schema.users).values({
    email: `mt-limop-${ts}@test.com`, passwordHash: 'x', name: 'MTLimitOp', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  limitOpUserId = limitOp!.id;

  const [limitTgt] = await db.insert(schema.users).values({
    email: `mt-limtgt-${ts}@test.com`, passwordHash: 'x', name: 'MTLimitTarget', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  limitTargetUserId = limitTgt!.id;

  // R5 多阶段用例专用被入账用户（避免与既有用例余额交叉）
  const [stg2] = await db.insert(schema.users).values({
    email: `mt-stg2-${ts}@test.com`, passwordHash: 'x', name: 'MTStage2', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  stage2UserId = stg2!.id;

  const [stg3] = await db.insert(schema.users).values({
    email: `mt-stg3-${ts}@test.com`, passwordHash: 'x', name: 'MTStage3', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  stage3UserId = stg3!.id;

  const [rj] = await db.insert(schema.users).values({
    email: `mt-rj-${ts}@test.com`, passwordHash: 'x', name: 'MTReject', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  rejectUserId = rj!.id;

  // R6 驳回不回退用例独立操作人/用户
  const [rejOp] = await db.insert(schema.users).values({
    email: `mt-rejop-${ts}@test.com`, passwordHash: 'x', name: 'MTRejectOp', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  rejectOpUserId = rejOp!.id;
  const [rejTgt] = await db.insert(schema.users).values({
    email: `mt-rejtgt-${ts}@test.com`, passwordHash: 'x', name: 'MTRejectTarget', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  rejectTargetUserId = rejTgt!.id;

  adminToken = generateAccessToken({ userId: adminId, email: `mt-admin-${ts}@test.com`, role: 'admin' });
  admin2Token = generateAccessToken({ userId: admin2Id, email: `mt-admin2-${ts}@test.com`, role: 'admin' });
  superAdminToken = generateAccessToken({ userId: superAdminId, email: `mt-super-${ts}@test.com`, role: 'super_admin' });
  financeToken = generateAccessToken({ userId: financeUserId, email: `mt-fin-${ts}@test.com`, role: 'finance' });
  salesToken = generateAccessToken({ userId: salesUserId, email: `mt-sales-${ts}@test.com`, role: 'sales' });
  customerToken = generateAccessToken({ userId: customerUserId, email: `mt-cust-${ts}@test.com`, role: 'customer' });
  limitOpToken = generateAccessToken({ userId: limitOpUserId, email: `mt-limop-${ts}@test.com`, role: 'admin' });

  // R7：资金写操作者必须启用 2FA（user_2fa 权威）并持有操作令牌
  await enableTest2fa(adminId);
  await enableTest2fa(admin2Id);
  await enableTest2fa(superAdminId);
  await enableTest2fa(financeUserId);
  await enableTest2fa(limitOpUserId);
  await enableTest2fa(rejectOpUserId);
  adminOpHeaders = () => op2faHeaders(adminToken, adminId, `mt-admin-${ts}@test.com`, 'admin');
  admin2OpHeaders = () => op2faHeaders(admin2Token, admin2Id, `mt-admin2-${ts}@test.com`, 'admin');
  superAdminOpHeaders = () => op2faHeaders(superAdminToken, superAdminId, `mt-super-${ts}@test.com`, 'super_admin');
  financeOpHeaders = () => op2faHeaders(financeToken, financeUserId, `mt-fin-${ts}@test.com`, 'finance');
  limitOpHeaders = () => op2faHeaders(limitOpToken, limitOpUserId, `mt-limop-${ts}@test.com`, 'admin');
  rejectOpHeaders = () => op2faHeaders(generateAccessToken({ userId: rejectOpUserId, email: `mt-rejop-${ts}@test.com`, role: 'admin' }), rejectOpUserId, `mt-rejop-${ts}@test.com`, 'admin');

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    const targetUserIds = [activeUserId, balancedUserId, frozenUserId, notifUserId, adminId, admin2Id, superAdminId, financeUserId, salesUserId, customerUserId, limitOpUserId, limitTargetUserId, stage2UserId, stage3UserId, rejectUserId, rejectOpUserId, rejectTargetUserId].filter((x) => x > 0);
    await db.delete(schema.rechargeOrders).where(inArray(schema.rechargeOrders.userId, targetUserIds));
    await db.delete(schema.balanceTransactions).where(inArray(schema.balanceTransactions.userId, targetUserIds));
    await db.delete(schema.customerBalances).where(inArray(schema.customerBalances.userId, targetUserIds));
    await db.delete(schema.notifications).where(inArray(schema.notifications.userId, targetUserIds));
    await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.userId, targetUserIds));
    await db.delete(schema.emailTemplates).where(eq(schema.emailTemplates.name, 'recharge_success'));
    // R6/R7 清理：限额计数行 + Redis lim:* / op2fa:fail:* 键 + user_2fa（FK 依赖 users）
    await clearCreditCounters(targetUserIds);
    await db.delete(schema.user2fa).where(inArray(schema.user2fa.userId, [adminId, admin2Id, superAdminId, financeUserId, limitOpUserId, rejectOpUserId]));
    await db.delete(schema.users).where(inArray(schema.users.id, targetUserIds));
  } catch (err) {
    console.error('[admin-manual-topup.test] cleanup failed:', err);
  }
});

/* ═══════════ 用例 1：创建上账成功 ═══════════ */

describe('R1 创建上账', () => {
  it('用例1 创建成功 → 201；落库 method=manual/pending、order_no 以 MT 开头、metadata.transfer_no 正确；审计 manual_topup.create', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: financeOpHeaders(),
      payload: {
        user_id: activeUserId,
        amount: 1000.00,
        note: '线下对公转账已到账，凭凭证入账',
        transfer_no: `BANK-${ts}-0001`,
        evidence_remark: '对公回单已核验，金额一致',
      },
    });
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.user_id).toBe(activeUserId);
    expect(data.amount).toBe(1000);
    expect(data.method).toBe('manual');
    expect(data.status).toBe('pending');
    expect(data.status_label).toBe('待审核');
    expect(data.order_no.startsWith('MT')).toBe(true);
    // R5：创建响应含审批档位/阶段 + 按档位提示文案（ARCH §2.5.1）
    expect(data.approval_level).toBe(1);
    expect(data.approval_phase).toBe('level1_pending');
    expect(res.json().message).toBe('上账申请已创建，待一级审批');

    const [order] = await db.select().from(schema.rechargeOrders).where(eq(schema.rechargeOrders.id, data.id)).limit(1);
    expect(order).toBeDefined();
    expect(order!.method).toBe('manual');
    expect(order!.status).toBe('pending');
    expect(toNum(order!.amount)).toBe(1000);
    const meta = order!.metadata as Record<string, unknown>;
    expect(meta.source).toBe('admin-manual-topup');
    expect(meta.created_by).toBe(financeUserId);
    expect(meta.transfer_no).toBe(`BANK-${ts}-0001`);
    expect(meta.evidence_remark).toBe('对公回单已核验，金额一致');
    // R5：metadata.approval 初始化（level=1 / phase=level1_pending / limit_check）
    const approval = meta.approval as Record<string, unknown>;
    expect(approval.level).toBe(1);
    expect(approval.phase).toBe('level1_pending');
    expect(approval.limit_check).toBeDefined();
    expect(meta.approval_level).toBe(1);
    expect(meta.approval_phase).toBe('level1_pending');

    const [audit] = await db.select({ action: schema.auditLogs.action, details: schema.auditLogs.details })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.action, 'manual_topup.create'), eq(schema.auditLogs.resourceId, String(data.id))))
      .limit(1);
    expect(audit).toBeDefined();
    expect(audit!.action).toBe('manual_topup.create');
    const ad = audit!.details as Record<string, unknown>;
    // 审计 details 键对齐 ARCH §3.2：{ userId, amount, order_no, created_by }（camelCase userId）
    expect(ad.userId).toBe(activeUserId);
    expect(ad.amount).toBe(1000);
    expect(ad.order_no).toBe(data.order_no);
  });
});

/* ═══════════ 用例 2：创建参数校验 ═══════════ */

describe('R1 创建参数校验', () => {
  const base = { user_id: 0, amount: 100, note: '原因' };
  it('用例2 amount=0 → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: adminOpHeaders(),
      payload: { ...base, user_id: activeUserId, amount: 0 },
    });
    expect(res.statusCode).toBe(400);
  });
  it('用例2 amount 负数 → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: adminOpHeaders(),
      payload: { ...base, user_id: activeUserId, amount: -5 },
    });
    expect(res.statusCode).toBe(400);
  });
  it('用例2 amount > accepted ADR-0001 上限(50000) → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: adminOpHeaders(),
      payload: { ...base, user_id: activeUserId, amount: 50001 },
    });
    expect(res.statusCode).toBe(400);
  });
  it('用例2 amount=50000（上限边界）→ 201 + approval_level=2', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: adminOpHeaders(),
      payload: { ...base, user_id: activeUserId, amount: 50000 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.approval_level).toBe(2);
    expect(res.json().data.approval_phase).toBe('level1_pending');
  });
  it('用例2 缺 note → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: adminOpHeaders(),
      payload: { user_id: activeUserId, amount: 100 },
    });
    expect(res.statusCode).toBe(400);
  });
  it('用例2 传入 evidence_url → 400（本期不接受凭证上传，R9 开放）', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: adminOpHeaders(),
      payload: { ...base, user_id: activeUserId, evidence_url: 'https://example.com/proof.jpg' },
    });
    expect(res.statusCode).toBe(400);
  });
  it('用例2 用户不存在 → 404', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: adminOpHeaders(),
      payload: { ...base, user_id: 99999999 },
    });
    expect(res.statusCode).toBe(404);
  });
  it('用例2 frozen 用户 → 400（A7 裁决：仅 active 可入账）', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: adminOpHeaders(),
      payload: { ...base, user_id: frozenUserId },
    });
    expect(res.statusCode).toBe(400);
  });
});

/* ═══════════ 用例 3：创建幂等 ═══════════ */

describe('R1 创建幂等（Idempotency-Key）', () => {
  const idemKey = `idem-mt-${ts}`;

  it('用例3 首请求 201；同 key 重放 L1 缓存命中 → 200 + X-Idempotent-Replay:true（或 409）；仍仅 1 行', async () => {
    const first = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: { ...adminOpHeaders(), 'idempotency-key': idemKey },
      payload: { user_id: activeUserId, amount: 123.45, note: '幂等测试' },
    });
    expect(first.statusCode).toBe(201);
    const firstId = first.json().data.id;

    const replay = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: { ...adminOpHeaders(), 'idempotency-key': idemKey },
      payload: { user_id: activeUserId, amount: 123.45, note: '幂等测试' },
    });
    // L1 缓存命中 → 回放 200 + 回放头；缓存未命中（Redis 降级）→ 409
    expect([200, 409]).toContain(replay.statusCode);
    if (replay.statusCode === 200) {
      expect(replay.headers['x-idempotent-replay']).toBe('true');
      expect(replay.json().data.id).toBe(firstId);
    }

    const rows = await db.select({ id: schema.rechargeOrders.id }).from(schema.rechargeOrders)
      .where(eq(schema.rechargeOrders.idempotencyKey, idemKey));
    expect(rows.length).toBe(1);
  });

  it('用例3 杀 Redis 缓存后重放 → L2 唯一约束 409，仍仅 1 行', async () => {
    // 清掉 L1 锁与响应缓存，模拟 Redis 缓存失效（崩溃/重启）
    const r = getRedis();
    if (r) {
      await r.del(`idem:${idemKey}`);
      await r.del(`idem:resp:${idemKey}`);
    }

    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: { ...adminOpHeaders(), 'idempotency-key': idemKey },
      payload: { user_id: activeUserId, amount: 123.45, note: '幂等测试' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe(409);

    const rows = await db.select({ id: schema.rechargeOrders.id }).from(schema.rechargeOrders)
      .where(eq(schema.rechargeOrders.idempotencyKey, idemKey));
    expect(rows.length).toBe(1);
  });
});

/* ═══════════ 用例 4/5/6：审核通过 ═══════════ */

describe('R2/R4 审核通过', () => {
  it('用例4 审核通过-无余额行兜底 → 200；customer_balances 自动建行且余额=amount；流水 1 条 type=recharge', async () => {
    const order = await insertManualOrder(activeUserId, '88.00');
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${order.id}/review`, headers: adminOpHeaders(),
      payload: { action: 'approve', note: '审核通过' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('approved');
    expect(toNum(res.json().data.balance_after)).toBeCloseTo(88, 2);

    const [bal] = await db.select({
      availableBalance: schema.customerBalances.availableBalance,
      totalBalance: schema.customerBalances.totalBalance,
    }).from(schema.customerBalances).where(eq(schema.customerBalances.userId, activeUserId)).limit(1);
    expect(bal).toBeDefined();
    expect(toNum(bal!.availableBalance)).toBeCloseTo(88, 4);
    expect(toNum(bal!.totalBalance)).toBeCloseTo(88, 4);

    const txs = await db.select({ type: schema.balanceTransactions.type, balanceAfter: schema.balanceTransactions.balanceAfter })
      .from(schema.balanceTransactions)
      .where(and(eq(schema.balanceTransactions.userId, activeUserId), eq(schema.balanceTransactions.referenceId, String(order.id))));
    expect(txs.length).toBe(1);
    expect(txs[0]!.type).toBe('recharge');
    expect(toNum(txs[0]!.balanceAfter)).toBeCloseTo(88, 4);
  });

  it('用例5 审核通过-正常路径 → 余额+amount、流水快照正确；重复 approve → 409', async () => {
    const order = await insertManualOrder(balancedUserId, '50.00');
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${order.id}/review`, headers: adminOpHeaders(),
      payload: { action: 'approve' },
    });
    expect(res.statusCode).toBe(200);
    expect(toNum(res.json().data.balance_after)).toBeCloseTo(150, 2);

    const [bal] = await db.select({ availableBalance: schema.customerBalances.availableBalance })
      .from(schema.customerBalances).where(eq(schema.customerBalances.userId, balancedUserId)).limit(1);
    expect(toNum(bal!.availableBalance)).toBeCloseTo(150, 4);

    // 审核人落库（裁决 A8：metadata.reviewer_id）
    const [orderRow] = await db.select({ metadata: schema.rechargeOrders.metadata }).from(schema.rechargeOrders).where(eq(schema.rechargeOrders.id, order.id)).limit(1);
    const meta = orderRow!.metadata as Record<string, unknown>;
    expect(meta.reviewer_id).toBe(adminId);

    // 重复审核 → 409 ORDER_ALREADY_PROCESSED
    const dup = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${order.id}/review`, headers: adminOpHeaders(),
      payload: { action: 'approve' },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('用例6 审核通过-通知触发 → notifications 落库 type=recharge_success；审计含 notification 状态（无模板 → no_template）', async () => {
    const order = await insertManualOrder(notifUserId, '66.00');
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${order.id}/review`, headers: adminOpHeaders(),
      payload: { action: 'approve', note: '通知测试' },
    });
    expect(res.statusCode).toBe(200);

    const [ntf] = await db.select({ type: schema.notifications.type, title: schema.notifications.title, content: schema.notifications.content, metadata: schema.notifications.metadata })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, notifUserId), eq(schema.notifications.type, 'recharge_success')))
      .orderBy(desc(schema.notifications.id)).limit(1);
    expect(ntf).toBeDefined();
    expect(ntf!.type).toBe('recharge_success');
    expect(ntf!.title).toBe('充值到账通知');
    expect(ntf!.content).toContain('66.00');
    const nmeta = ntf!.metadata as Record<string, unknown>;
    expect(nmeta.orderId).toBe(order.id);

    // 本期无 recharge_success 模板 → 纯站内信 email='no_template'（ARCH §9.2 风险缓解）
    const [audit] = await db.select({ details: schema.auditLogs.details })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.action, 'manual_topup.approve'), eq(schema.auditLogs.resourceId, String(order.id))))
      .limit(1);
    expect(audit).toBeDefined();
    const ad = audit!.details as { notification?: { in_app: boolean; email: string } };
    expect(ad.notification).toBeDefined();
    expect(ad.notification!.in_app).toBe(true);
    expect(ad.notification!.email).toBe('no_template');
  });

  it('用例6 有模板 + SMTP 未配置 → email=skipped 且不报错', async () => {
    await db.insert(schema.emailTemplates).values({
      name: 'recharge_success',
      subjectZh: '充值到账 {{amount}}',
      bodyHtmlZh: '<p>到账 {{amount}}，余额 {{balance_after}}</p>',
    });

    const order = await insertManualOrder(notifUserId, '77.00');
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${order.id}/review`, headers: adminOpHeaders(),
      payload: { action: 'approve' },
    });
    expect(res.statusCode).toBe(200);

    const [audit] = await db.select({ details: schema.auditLogs.details })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.action, 'manual_topup.approve'), eq(schema.auditLogs.resourceId, String(order.id))))
      .limit(1);
    const ad = audit!.details as { notification?: { in_app: boolean; email: string } };
    expect(ad.notification!.in_app).toBe(true);
    expect(ad.notification!.email).toBe('skipped');
  });
});

/* ═══════════ 修复回归：P1-1 转账单号唯一 + P2-1 驳回原因必填 ═══════════ */

describe('R1 修复回归（P1-1 单号唯一 / P2-1 驳回原因必填）', () => {
  it('P1-1 同 transfer_no 跨不同 Idempotency-Key 重复创建 → 409 TRANSFER_NO_DUPLICATE；不同单号可创建 201', async () => {
    const dupNo = `BANK-${ts}-uniq-dup`;
    const first = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: { ...adminOpHeaders(), 'idempotency-key': `idem-tn-${ts}-1` },
      payload: { user_id: activeUserId, amount: 10, note: '单号唯一测试', transfer_no: dupNo },
    });
    expect(first.statusCode).toBe(201);

    // 同单号 + 不同幂等键 → 409（防重复入账第一道闸）
    const dup = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: { ...adminOpHeaders(), 'idempotency-key': `idem-tn-${ts}-2` },
      payload: { user_id: activeUserId, amount: 20, note: '重复单号', transfer_no: dupNo },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toContain('该转账单号已存在上账记录');

    // 不同单号 → 201
    const other = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: { ...adminOpHeaders(), 'idempotency-key': `idem-tn-${ts}-3` },
      payload: { user_id: activeUserId, amount: 30, note: '不同单号', transfer_no: `BANK-${ts}-uniq-ok` },
    });
    expect(other.statusCode).toBe(201);

    // 同单号跨 key 仅 1 行
    const rows = await db.select({ id: schema.rechargeOrders.id }).from(schema.rechargeOrders)
      .where(sql`${schema.rechargeOrders.metadata}->>'transfer_no' = ${dupNo}`);
    expect(rows.length).toBe(1);
  });

  it('P2-1/D-02 reject 无驳回原因 → 400；有原因 → 200 且 failed + 原 note 保留 + 驳回原因写 metadata.review_note', async () => {
    const order = await insertManualOrder(activeUserId, '9.00');

    const noReason = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${order.id}/review`, headers: adminOpHeaders(),
      payload: { action: 'reject' },
    });
    expect(noReason.statusCode).toBe(400);

    const rejected = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${order.id}/review`, headers: adminOpHeaders(),
      payload: { action: 'reject', note: '凭证金额与流水不符' },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().data.status).toBe('rejected');

    const [row] = await db.select({ status: schema.rechargeOrders.status, note: schema.rechargeOrders.note, metadata: schema.rechargeOrders.metadata })
      .from(schema.rechargeOrders).where(eq(schema.rechargeOrders.id, order.id)).limit(1);
    expect(row!.status).toBe('failed');
    // D-02：原入账原因 note 保留不被覆盖/清空；驳回原因独立存 metadata.review_note
    expect(row!.note).toBe('测试订单');
    const meta = row!.metadata as Record<string, unknown>;
    expect(meta.review_note).toBe('凭证金额与流水不符');
  });
});

/* ═══════════ D1 补充裁决：用户搜索端点 ═══════════ */

describe('D1 用户搜索端点 /admin/manual-topup/users', () => {
  it('D1 finance 角色搜索 → 200：邮箱模糊命中 / 用户ID 精确命中 / 无结果空列表；字段齐全无敏感字段', async () => {
    // 邮箱模糊命中
    const byEmail = await app.inject({
      method: 'GET', url: `/api/v1/admin/manual-topup/users?search=${encodeURIComponent(`mt-active-${ts}`)}`, headers: auth(financeToken),
    });
    expect(byEmail.statusCode).toBe(200);
    const hit = byEmail.json().data.list.find((u: any) => u.id === activeUserId);
    expect(hit).toBeDefined();
    expect(hit.email).toBe(`mt-active-${ts}@test.com`);
    expect(hit.status).toBe('active');
    expect(typeof hit.name).toBe('string');
    expect(typeof hit.available_balance).toBe('number');
    expect(hit.available_balance).toBeGreaterThanOrEqual(0);

    // 用户 ID 精确命中
    const byId = await app.inject({
      method: 'GET', url: `/api/v1/admin/manual-topup/users?search=${activeUserId}`, headers: auth(financeToken),
    });
    expect(byId.statusCode).toBe(200);
    expect(byId.json().data.list.some((u: any) => u.id === activeUserId)).toBe(true);

    // 无结果 → 200 空列表（搜索端点不退化全量列表）
    const none = await app.inject({
      method: 'GET', url: `/api/v1/admin/manual-topup/users?search=${encodeURIComponent('no-such-user-xyz-404')}`, headers: auth(financeToken),
    });
    expect(none.statusCode).toBe(200);
    expect(none.json().data.list).toEqual([]);
  });

  it('D1 sales 角色访问用户搜索 → 403 FORBIDDEN（不放开 /admin/customers 的全量列表口径）', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/manual-topup/users?search=mt', headers: auth(salesToken),
    });
    expect(res.statusCode).toBe(403);
  });
});

/* ═══════════ 用例 7：越权-权限点 ═══════════ */

describe('R3 权限点鉴权', () => {
  it('用例7 finance 角色可创建（201）与审核（200）', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: financeOpHeaders(),
      payload: { user_id: activeUserId, amount: 10, note: 'finance 创建' },
    });
    expect(create.statusCode).toBe(201);

    const order = await insertManualOrder(activeUserId, '10.00');
    const review = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${order.id}/review`, headers: financeOpHeaders(),
      payload: { action: 'approve' },
    });
    expect(review.statusCode).toBe(200);
  });

  it('用例7 sales 角色创建 → 403 FORBIDDEN', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: auth(salesToken),
      payload: { user_id: activeUserId, amount: 10, note: 'sales 越权' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('用例7 customer 角色访问列表 → 403 FORBIDDEN', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/manual-topup', headers: auth(customerToken) });
    expect(res.statusCode).toBe(403);
  });

  it('用例7 未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/manual-topup' });
    expect(res.statusCode).toBe(401);
  });
});

/* ═══════════ R5 分级审批（ARCH §6.1 用例 3/4/5/8） ═══════════ */

describe('R5 人工上账分级审批', () => {
  beforeAll(async () => {
    // ⚠️ 并行隔离：finance_rules 为跨测试进程共享表。分级断言依赖默认 single_review_max=10000；
    // 只修正该字段（保留 review_exempt 等其他字段），避免删行破坏并行文件（如 admin-adjust
    // 白名单免审用例）正在使用的配置。无配置行 → 默认即 10000，无需处理。
    await ensureDefaultSingleReviewMax();
    resetFinanceRulesCache();
  });

  it('用例3 单审档（≤1万）：创建 approval_level=1 → 他人审核 → paid + 入账 + 通知', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: financeOpHeaders(),
      payload: { user_id: stage2UserId, amount: 9999, note: '单审档' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().data.approval_level).toBe(1);
    expect(create.json().message).toBe('上账申请已创建，待一级审批');
    const id = create.json().data.id;

    const review = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: adminOpHeaders(),
      payload: { action: 'approve' },
    });
    expect(review.statusCode).toBe(200);
    expect(review.json().data.status).toBe('approved');
    expect(toNum(review.json().data.balance_after)).toBeCloseTo(9999, 2);
    // 入账 + 通知（recharge_success）
    const [ntf] = await db.select({ type: schema.notifications.type }).from(schema.notifications)
      .where(and(eq(schema.notifications.userId, stage2UserId), eq(schema.notifications.type, 'recharge_success')))
      .limit(1);
    expect(ntf).toBeDefined();
  });

  it('用例3 创建人自审 → 400 VALIDATION_ERROR（职责分离，B3）', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: financeOpHeaders(),
      payload: { user_id: stage3UserId, amount: 100, note: '自审拦截' },
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().data.id;
    const selfReview = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: financeOpHeaders(),
      payload: { action: 'approve' },
    });
    expect(selfReview.statusCode).toBe(400);
    expect(selfReview.json().message).toContain('创建人');
  });

  it('用例8 B4 降级代审：super_admin 自建自审 → 400（无原因）；带 escalation_reason → 通过 + 审计 degraded:true', async () => {
    // super_admin 创建人工上账（500，tier1；rejectUserId 用户计数干净）
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: superAdminOpHeaders(),
      payload: { user_id: rejectUserId, amount: 500, note: 'B4 降级代审测试' },
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().data.id;

    // 自审无原因 → 400
    const noReason = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: superAdminOpHeaders(),
      payload: { action: 'approve' },
    });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json().message).toContain('职责分离');

    // 自审带 escalation_reason → 200 + paid（B4 降级代审路径）
    const withReason = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: superAdminOpHeaders(),
      payload: { action: 'approve', escalation_reason: '审批人不足，super_admin 代审' },
    });
    expect(withReason.statusCode).toBe(200);
    expect(withReason.json().data.status).toBe('approved');

    // 审计 degraded:true + 原因
    const [audit] = await db.select({ details: schema.auditLogs.details }).from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.action, 'manual_topup.approve'), eq(schema.auditLogs.resourceId, String(id))))
      .orderBy(desc(schema.auditLogs.id)).limit(1);
    expect(audit).toBeDefined();
    const ad = audit!.details as { degraded?: boolean; escalation_reason?: string | null };
    expect(ad.degraded).toBe(true);
    expect(ad.escalation_reason).toBe('审批人不足，super_admin 代审');
  });

  it('用例4 双人档（>1万 ≤10万）：一审 → 仍 pending + phase=level2_pending + 列表审批字段；二审 → paid', async () => {
    // ⚠️ 并行兜底：本用例断言依赖默认 single_review_max=10000（20000 > 10000 → level2）。
    // 只修正该字段（保留 review_exempt 等其他字段），避免删行破坏并行文件正在使用的配置。
    await ensureDefaultSingleReviewMax();
    resetFinanceRulesCache();

    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: financeOpHeaders(),
      payload: { user_id: stage2UserId, amount: 20000, note: '双人档' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().data.approval_level).toBe(2);
    expect(create.json().message).toBe('上账申请已创建，已进入双人审批');
    const id = create.json().data.id;
    const before = await balanceOf(stage2UserId);

    // 一审（≠ 创建人 finance）
    const r1 = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: adminOpHeaders(),
      payload: { action: 'approve' },
    });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().data.status).toBe('pending');
    expect(r1.json().data.approval_phase).toBe('level2_pending');
    expect(r1.json().message).toBe('一级审批通过，等待二级审批');
    // 未入账：余额不变
    expect(await balanceOf(stage2UserId)).toBe(before);

    // 列表审批字段（ARCH §2.5.4）
    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/manual-topup?status=pending', headers: auth(adminToken) });
    const item = list.json().data.list.find((o: any) => o.id === id);
    expect(item).toBeDefined();
    expect(item.approval_level).toBe(2);
    expect(item.approval_phase).toBe('level2_pending');
    expect(item.first_reviewer_id).toBe(adminId);

    // 二审（≠ 一审 admin）→ paid
    const r2 = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: admin2OpHeaders(),
      payload: { action: 'approve' },
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().data.status).toBe('approved');
    expect(r2.json().data.approval_phase).toBe('approved');
    expect(toNum(r2.json().data.balance_after)).toBeCloseTo(before + 20000, 2);
  });

  it('用例4/8 二审=一审 → 400；一审=创建人 → 400（职责分离矩阵）', async () => {
    // 一审=创建人
    const c1 = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: financeOpHeaders(),
      payload: { user_id: stage3UserId, amount: 15000, note: '一审自审' },
    });
    const id1 = c1.json().data.id;
    const selfReview = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${id1}/review`, headers: financeOpHeaders(),
      payload: { action: 'approve' },
    });
    expect(selfReview.statusCode).toBe(400);
    expect(selfReview.json().message).toContain('创建人');

    // 一审通过后同一人二审 → 400
    const r1 = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${id1}/review`, headers: adminOpHeaders(),
      payload: { action: 'approve' },
    });
    expect(r1.statusCode).toBe(200);
    const r2same = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${id1}/review`, headers: adminOpHeaders(),
      payload: { action: 'approve' },
    });
    expect(r2same.statusCode).toBe(400);
    expect(r2same.json().message).toContain('一级审批人');
  });

  it('用例4 并发双一审 → 409 且仅一次推进（阶段守卫 0 行回滚）', async () => {
    // 用单审档（≤¥10,000）确保"两次请求都是对同一审批阶段的重复审批"：
    // 并发时守卫只放行一次（一 200 一 409）；若用双人档（>1万），串行执行时第二个
    // 请求会变成"合法二审"（也 200），断言对执行时序敏感（负载高时偶发 200+200）。
    const c = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: financeOpHeaders(),
      payload: { user_id: stage2UserId, amount: 9999, note: '并发一审' },
    });
    const id = c.json().data.id;
    const [ra, rb] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: adminOpHeaders(), payload: { action: 'approve' } }),
      app.inject({ method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: admin2OpHeaders(), payload: { action: 'approve' } }),
    ]);
    const codes = [ra.statusCode, rb.statusCode].sort();
    expect(codes[0]).toBe(200);
    expect(codes[1]).toBe(409);
  });

  it('用例5 三人档（>10万）：一审→二审→super 终审 → paid；非 super_admin 终审 → 403；终审=一审 → 400', async () => {
    // 单笔 >¥100,000 超过默认 hard_limit（创建预检 429）：临时调高 hard_limit 验证 tier3 审批链
    await withRaisedHardLimit(async () => {
      const c = await app.inject({
        method: 'POST', url: '/api/v1/admin/manual-topup', headers: financeOpHeaders(),
        payload: { user_id: stage3UserId, amount: 200000, note: '三人档' },
      });
      expect(c.statusCode).toBe(201);
      expect(c.json().data.approval_level).toBe(3);
      expect(c.json().message).toBe('上账申请已创建，已进入多级审批（super_admin 终审）');
      const id = c.json().data.id;
      const before = await balanceOf(stage3UserId);

      const r1 = await app.inject({ method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: adminOpHeaders(), payload: { action: 'approve' } });
      expect(r1.statusCode).toBe(200);
      expect(r1.json().data.approval_phase).toBe('level2_pending');

      const r2 = await app.inject({ method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: admin2OpHeaders(), payload: { action: 'approve' } });
      expect(r2.statusCode).toBe(200);
      expect(r2.json().data.approval_phase).toBe('super_pending');
      expect(r2.json().message).toBe('二级审批通过，等待终审');

      // 非 super_admin 终审 → 403 FORBIDDEN（finance / admin 均拒）
      const f1 = await app.inject({ method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: financeOpHeaders(), payload: { action: 'approve' } });
      expect(f1.statusCode).toBe(403);
      const f2 = await app.inject({ method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: adminOpHeaders(), payload: { action: 'approve' } });
      expect(f2.statusCode).toBe(403);

      // super 终审 → paid
      const r3 = await app.inject({ method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: superAdminOpHeaders(), payload: { action: 'approve' } });
      expect(r3.statusCode).toBe(200);
      expect(r3.json().data.status).toBe('approved');
      expect(toNum(r3.json().data.balance_after)).toBeCloseTo(before + 200000, 2);
    });
  });

  it('用例5/8 终审=一审（前序审批人）→ 400 VALIDATION_ERROR', async () => {
    await withRaisedHardLimit(async () => {
      const c = await app.inject({
        method: 'POST', url: '/api/v1/admin/manual-topup', headers: financeOpHeaders(),
        payload: { user_id: stage3UserId, amount: 150000, note: '终审复用一审' },
      });
      const id = c.json().data.id;
      // super 一审
      const r1 = await app.inject({ method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: superAdminOpHeaders(), payload: { action: 'approve' } });
      expect(r1.statusCode).toBe(200);
      // admin 二审
      const r2 = await app.inject({ method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: adminOpHeaders(), payload: { action: 'approve' } });
      expect(r2.statusCode).toBe(200);
      // super 终审（=一审）→ 400
      const r3 = await app.inject({ method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: superAdminOpHeaders(), payload: { action: 'approve' } });
      expect(r3.statusCode).toBe(400);
      expect(r3.json().message).toContain('前两级审批人');
    });
  });

  it('用例3 任意阶段 reject → failed（驳回原因落 metadata.review_note）', async () => {
    // 创建人用 admin（其操作人计数未被大额用例污染；finance 在 tier3 用例已累计）
    const c = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: adminOpHeaders(),
      payload: { user_id: rejectUserId, amount: 20000, note: '驳回测试' },
    });
    expect(c.statusCode).toBe(201);
    const id = c.json().data.id;
    await app.inject({ method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: admin2OpHeaders(), payload: { action: 'approve' } });
    const reject = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: financeOpHeaders(),
      payload: { action: 'reject', note: '资金核实不通过' },
    });
    expect(reject.statusCode).toBe(200);
    expect(reject.json().data.status).toBe('rejected');
    const [row] = await db.select({ status: schema.rechargeOrders.status, metadata: schema.rechargeOrders.metadata })
      .from(schema.rechargeOrders).where(eq(schema.rechargeOrders.id, id)).limit(1);
    expect(row!.status).toBe('failed');
    const meta = row!.metadata as Record<string, unknown>;
    expect(meta.review_note).toBe('资金核实不通过');
  });
});

/* ═══════════ R6 限额（ARCH §6.2 用例 9/10/12/15） ═══════════ */

describe('R6 拆分规避与限额（终裁：创建时预占 + 不回退）', () => {
  /** 创建订单（终裁：创建时预占，无需审批即计入累计） */
  async function createOnly(amount: number) {
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: limitOpHeaders(),
      payload: { user_id: limitTargetUserId, amount, note: '限额拆分' },
    });
    return create;
  }

  it('用例9+10 9×¥9,999 拆分：前 5 笔 tier1；第 6 笔起 projected>soft → approval_level≥2 + limit_escalated；累计超 hard → 429 拒创建', async () => {
    // 1-5 笔：tier1（创建时预占，op=limitOp / user=limitTarget 各 +9999）
    for (let i = 0; i < 5; i++) {
      const c = await createOnly(9999);
      expect(c.statusCode).toBe(201);
      expect(c.json().data.approval_level).toBe(1);
    }

    // 第 6 笔：projected = 49995 + 9999 = 59994 > soft 50000 → 升级 level2 + limit_escalated
    const c6 = await createOnly(9999);
    expect(c6.statusCode).toBe(201);
    expect(c6.json().data.approval_level).toBe(2);
    const [o6] = await db.select({ metadata: schema.rechargeOrders.metadata }).from(schema.rechargeOrders).where(eq(schema.rechargeOrders.id, c6.json().data.id)).limit(1);
    const meta6 = (o6!.metadata as any) as Record<string, unknown>;
    expect(meta6.limit_escalated).toBe(true);
    const approval6 = (meta6.approval as any) as { limit_check: { escalated: boolean } };
    expect(approval6.limit_check.escalated).toBe(true);

    // 7-10 笔（projected 持续超 soft）→ level2
    for (let i = 7; i <= 10; i++) {
      const c = await createOnly(9999);
      expect(c.statusCode).toBe(201);
      expect(c.json().data.approval_level).toBe(2);
    }

    // 第 11 笔：projected = 99990 + 9999 = 109989 > hard 100000 → 429，单据不创建
    const c11 = await createOnly(9999);
    expect(c11.statusCode).toBe(429);
    expect(c11.json().message).toContain('限额');
  });

  it('用例15 驳回不回退：创建预占 → 驳回 → 累计不变（B19，无 DECRBY）', async () => {
    const before = await readCounter('operator', rejectOpUserId);
    const c = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: rejectOpHeaders(),
      payload: { user_id: rejectTargetUserId, amount: 1000, note: '驳回不回退' },
    });
    expect(c.statusCode).toBe(201);
    const afterCreate = await readCounter('operator', rejectOpUserId);
    expect(afterCreate).toBe(before + 1000_00);   // 创建时预占
    const id = c.json().data.id;
    await app.inject({ method: 'POST', url: `/api/v1/admin/manual-topup/${id}/review`, headers: adminOpHeaders(), payload: { action: 'reject', note: '驳回' } });
    const afterReject = await readCounter('operator', rejectOpUserId);
    expect(afterReject).toBe(afterCreate);        // 驳回不回退累计
  });
});

/* ═══════════ R7 操作级 2FA 挂载回归（ARCH §6.3 用例 21） ═══════════ */

describe('R7 资金端点 2FA 挂载', () => {
  it('用例21 创建/审核/驳回无 X-Operation-Token → 403（避开 401）', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/manual-topup', headers: auth(adminToken),
      payload: { user_id: activeUserId, amount: 100, note: '无令牌' },
    });
    expect(create.statusCode).toBe(403);

    const order = await insertManualOrder(activeUserId, '10.00');
    const review = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${order.id}/review`, headers: auth(adminToken),
      payload: { action: 'approve' },
    });
    expect(review.statusCode).toBe(403);
    const reject = await app.inject({
      method: 'POST', url: `/api/v1/admin/manual-topup/${order.id}/review`, headers: auth(adminToken),
      payload: { action: 'reject', note: '无令牌驳回' },
    });
    expect(reject.statusCode).toBe(403);
  });
});
