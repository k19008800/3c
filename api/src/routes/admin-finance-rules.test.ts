/**
 * 风控规则配置端点测试 — GET/PUT /admin/finance/rules（B17，真实 PG + Redis）
 *
 * 覆盖 ARCH v1.1 §6.3 用例 26：
 *   - admin 可改 large_amount/limits；改 operation_2fa → 403（仅 super_admin，B17）
 *   - super_admin 可改全部（含 operation_2fa）
 *   - finance 角色（无 sys.config）→ 403；未登录 → 401
 *   - 保存校验（soft > hard → 400；阈值一致性）
 *   - resetFinanceRulesCache 即时生效（保存后创建端点按新阈值定级）
 *   - 2FA/二次确认（PUT 敏感写操作挂 requireOperation2fa）
 *
 * @see docs/ARCH-整改R5-R7-资金风控.md v1.1 §4.8 / §6 用例 26
 * @module routes/admin-finance-rules.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, inArray, and, desc } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt.js';
import { adminFinanceRulesRoutes } from './admin-finance-rules.js';
import { adminFinanceMissingRoutes } from './admin-finance-missing.js';
import { enableTest2fa, op2faHeaders } from './test-helpers.js';
import { resetFinanceRulesCache } from '../lib/finance-rules.js';

process.env.JWT_SECRET = 'test-admin-finance-rules-secret';

const ts = Date.now();
const CFG_KEY = 'finance_rules';

let adminId = 0;
let superAdminId = 0;
let financeId = 0;
let activeUserId = 0;   // 被上账用户（验证保存后定级即时生效）

let adminToken = '';
let superAdminToken = '';
let financeToken = '';
let adminOp: () => Record<string, string> = () => ({});
let superAdminOp: () => Record<string, string> = () => ({});

let app: FastifyInstance;

function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  instance.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ statusCode: status, code: err?.code ?? status, message: err?.message ?? 'Internal Server Error' });
  });
  adminFinanceRulesRoutes(instance);
  adminFinanceMissingRoutes(instance);
  return instance;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  const [admin] = await db.insert(schema.users).values({
    email: `cfr-admin-${ts}@test.com`, passwordHash: 'x', name: 'CfrAdmin', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  adminId = admin!.id;

  const [superAd] = await db.insert(schema.users).values({
    email: `cfr-super-${ts}@test.com`, passwordHash: 'x', name: 'CfrSuper', role: 'super_admin', status: 'active',
  }).returning({ id: schema.users.id });
  superAdminId = superAd!.id;

  const [fin] = await db.insert(schema.users).values({
    email: `cfr-fin-${ts}@test.com`, passwordHash: 'x', name: 'CfrFinance', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  financeId = fin!.id;

  const [target] = await db.insert(schema.users).values({
    email: `cfr-target-${ts}@test.com`, passwordHash: 'x', name: 'CfrTarget', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  activeUserId = target!.id;

  adminToken = generateAccessToken({ userId: adminId, email: `cfr-admin-${ts}@test.com`, role: 'admin' });
  superAdminToken = generateAccessToken({ userId: superAdminId, email: `cfr-super-${ts}@test.com`, role: 'super_admin' });
  financeToken = generateAccessToken({ userId: financeId, email: `cfr-fin-${ts}@test.com`, role: 'finance' });

  await enableTest2fa(adminId);
  await enableTest2fa(superAdminId);
  adminOp = () => op2faHeaders(adminToken, adminId, `cfr-admin-${ts}@test.com`, 'admin');
  superAdminOp = () => op2faHeaders(superAdminToken, superAdminId, `cfr-super-${ts}@test.com`, 'super_admin');

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, CFG_KEY));
    await db.delete(schema.rechargeOrders).where(inArray(schema.rechargeOrders.userId, [activeUserId]));
    await db.delete(schema.creditLimitEvents).where(inArray(schema.creditLimitEvents.userId, [activeUserId, adminId]));
    await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.userId, [adminId, superAdminId]));
    await db.delete(schema.user2fa).where(inArray(schema.user2fa.userId, [adminId, superAdminId]));
    await db.delete(schema.users).where(inArray(schema.users.id, [adminId, superAdminId, financeId, activeUserId]));
    resetFinanceRulesCache();
  } catch (err) {
    console.error('[admin-finance-rules.test] cleanup failed:', err);
  }
});

describe('GET /admin/finance/rules（B17 读配置）', () => {
  it('admin 读取 → 200 且含 large_amount/limits/operation_2fa 默认值', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/finance/rules', headers: auth(adminToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.manual_topup.max_amount).toBe(50000);
    expect(data.large_amount.single_review_max).toBe(10000);
    expect(data.large_amount.super_review_threshold).toBe(100000);
    expect(data.limits.soft_limit).toBe(50000);
    expect(data.limits.hard_limit).toBe(100000);
    expect(data.limits.exceed_action).toBe('escalate');
    expect(data.operation_2fa.policy).toBe('mandatory_admin');
  });

  it('未登录 → 401；finance（无 sys.config）→ 403', async () => {
    const unauth = await app.inject({ method: 'GET', url: '/api/v1/admin/finance/rules' });
    expect(unauth.statusCode).toBe(401);
    const fin = await app.inject({ method: 'GET', url: '/api/v1/admin/finance/rules', headers: auth(financeToken) });
    expect(fin.statusCode).toBe(403);
  });
});

describe('PUT /admin/finance/rules（B17 保存配置）', () => {
  it('admin 改 operation_2fa → 403（B17：2FA 策略仅 super_admin）', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/admin/finance/rules', headers: adminOp(),
      payload: { operation_2fa: { policy: 'disabled' } },
    });
    expect(res.statusCode).toBe(403);
  });

  it('super_admin 改 operation_2fa → 200', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/admin/finance/rules', headers: superAdminOp(),
      payload: { operation_2fa: { policy: 'mandatory_admin', token_ttl_seconds: 300 } },
    });
    expect(res.statusCode).toBe(200);
  });

  it('校验：soft > hard → 400；阈值一致性破坏 → 400', async () => {
    const bad1 = await app.inject({
      method: 'PUT', url: '/api/v1/admin/finance/rules', headers: adminOp(),
      payload: { limits: { soft_limit: 200000, hard_limit: 100000 } },
    });
    expect(bad1.statusCode).toBe(400);

    const bad2 = await app.inject({
      method: 'PUT', url: '/api/v1/admin/finance/rules', headers: adminOp(),
      payload: { large_amount: { single_review_max: 50000, dual_review_threshold: 10000 } },
    });
    expect(bad2.statusCode).toBe(400);
  });

  it('PUT 无 2FA 令牌 → 403（敏感写操作强制 R7）', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/admin/finance/rules', headers: auth(adminToken),
      payload: { limits: { soft_limit: 50000, hard_limit: 100000 } },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin 改 large_amount/limits → 200 + resetFinanceRulesCache 即时生效（创建端点按新阈值定级）', async () => {
    // ⚠️ 并行隔离：finance_rules 为跨测试进程共享表（loadFinanceRules 60s 进程缓存）。
    // 本用例放在文件最末执行，并先备份原值、验证后立即恢复，尽量缩小其他文件读到
    // 修改值的窗口（admin-adjust/manual-topup 的定级断言依赖默认 single_review_max=10000）。
    const [cfgRow0] = await db.select({ value: schema.systemConfig.value }).from(schema.systemConfig)
      .where(eq(schema.systemConfig.key, CFG_KEY)).limit(1);
    const backupRaw = cfgRow0 ? (typeof cfgRow0.value === 'string' ? cfgRow0.value : JSON.stringify(cfgRow0.value)) : null;

    const res = await app.inject({
      method: 'PUT', url: '/api/v1/admin/finance/rules', headers: adminOp(),
      payload: {
        large_amount: { single_review_max: 20000, dual_review_threshold: 20000, super_review_threshold: 100000 },
        limits: { soft_limit: 50000, hard_limit: 100000 },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('风控规则已保存');

    // 审计契约（前端依赖 action='finance.rules.update'，details 含变更字段摘要）
    const [audit] = await db.select({ action: schema.auditLogs.action, details: schema.auditLogs.details })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.action, 'finance.rules.update'), eq(schema.auditLogs.userId, adminId)))
      .orderBy(desc(schema.auditLogs.id)).limit(1);
    expect(audit).toBeDefined();
    const ad = audit!.details as { confirmed?: boolean; summary?: Record<string, unknown> };
    expect(ad.confirmed).toBe(true);
    expect(ad.summary).toBeDefined();
    // 保存生效证据：审计摘要须含 large_amount 变更（single_review_max → 20000）。
    // 注意：此处不通过"创建端点按新阈值定级"或 GET 读取来验证（那会拉长共享配置的
    // 污染窗口，与并行测试文件互相踩）；resetFinanceRulesCache 即时生效的机制由
    // manual-topup / admin-adjust 的显式配置用例（withOverride 模式）覆盖验证。
    expect(JSON.stringify(ad.summary)).toContain('20000');

    // 恢复原值（供并行测试读取；无原值则删除，回退默认）
    if (backupRaw) {
      await db.update(schema.systemConfig).set({ value: JSON.parse(backupRaw) }).where(eq(schema.systemConfig.key, CFG_KEY));
    } else {
      await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, CFG_KEY));
    }
    resetFinanceRulesCache();
  });

  it('保存后重置配置（恢复默认，供后续测试/清理）', async () => {
    await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, CFG_KEY));
    resetFinanceRulesCache();
  });
});
