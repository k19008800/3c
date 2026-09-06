/**
 * requirePerm 权限点中间件测试 — hasPerm 权限矩阵 + 中间件行为（纯单元，无 DB）
 *
 * 覆盖 ARCH §8 用例 13：
 *   - hasPerm：super_admin('*') 全放行；admin 有 finance.topup/finance.adjust；
 *     finance 有 finance.topup 无 finance.adjust；sales 全无
 *   - 中间件：无 token 401、坏 token 401、无权限 403、有权限放行且注入 userContext
 *
 * @see docs/ARCH-整改R1-R4-技术方案.md §5 requirePerm / §8 用例 13
 * @module middleware/require-perm.test
 */

import { describe, it, expect } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { requirePerm } from './require-perm.js';
import { hasPerm } from '../lib/permissions.js';
import { generateAccessToken } from '../services/auth/jwt.js';

// 独立 JWT 密钥（中间件 verifyToken 与测试签发共用同一 process.env 值）
process.env.JWT_SECRET = 'test-require-perm-secret';

const ts = Date.now();

/* ═══════════ hasPerm 权限矩阵 ═══════════ */

describe('hasPerm 权限矩阵', () => {
  it('super_admin（* 通配）→ 全部已定义权限点放行', () => {
    expect(hasPerm('super_admin', 'finance.topup')).toBe(true);
    expect(hasPerm('super_admin', 'finance.adjust')).toBe(true);
    expect(hasPerm('super_admin', 'finance.invoice')).toBe(true);
    expect(hasPerm('super_admin', 'sys.audit')).toBe(true);
    // 未定义权限点不在权限树内（effectivePerms 展开 '*' 为已定义集合）→ false
    expect(hasPerm('super_admin', 'any.not.defined.perm')).toBe(false);
  });

  it('admin → 有 finance.topup、finance.adjust 与对账差异处理权限', () => {
    expect(hasPerm('admin', 'finance.topup')).toBe(true);
    expect(hasPerm('admin', 'finance.adjust')).toBe(true);
    expect(hasPerm('admin', 'finance.reconciliation')).toBe(true);
    expect(hasPerm('admin', 'FINANCE_RECON_APPROVE')).toBe(true);
    expect(hasPerm('agent', 'FINANCE_RECON_APPROVE')).toBe(false);
  });

  it('finance → 有 finance.topup/对账差异处理，无 finance.adjust（A5 裁决）', () => {
    expect(hasPerm('finance', 'finance.topup')).toBe(true);
    expect(hasPerm('finance', 'finance.reconciliation')).toBe(true);
    expect(hasPerm('finance', 'FINANCE_RECON_APPROVE')).toBe(true);
    expect(hasPerm('finance', 'finance.adjust')).toBe(false);
  });

  it('D-5 定稿：finance 有 supplier.pricing（可配模型售价含缓存价），sales/agent 无', () => {
    expect(hasPerm('finance', 'supplier.pricing')).toBe(true);   // finance 以上可配缓存售价
    expect(hasPerm('admin', 'supplier.pricing')).toBe(true);
    expect(hasPerm('super_admin', 'supplier.pricing')).toBe(true);
    expect(hasPerm('sales', 'supplier.pricing')).toBe(false);    // ops 无权限
    expect(hasPerm('agent', 'supplier.pricing')).toBe(false);
    expect(hasPerm('customer', 'supplier.pricing')).toBe(false);
  });

  it('sales / 未定义角色 → 全无', () => {
    expect(hasPerm('sales', 'finance.topup')).toBe(false);
    expect(hasPerm('sales', 'finance.adjust')).toBe(false);
    expect(hasPerm('unknown_role', 'finance.topup')).toBe(false);
  });
});

/* ═══════════ requirePerm 中间件行为 ═══════════ */

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ code: status, message: err?.message ?? 'Internal Server Error' });
  });
  app.get('/test/topup', { preHandler: [requirePerm('finance.topup')] }, async (request: any) => {
    return { ok: true, userContext: request.userContext };
  });
  app.post('/test/adjust', { preHandler: [requirePerm('finance.adjust')] }, async (request: any) => {
    return { ok: true, userContext: request.userContext };
  });
  await app.ready();
  return app;
}

describe('requirePerm 中间件', () => {
  it('无 token → 401 UNAUTHORIZED', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/test/topup' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('坏 token → 401 UNAUTHORIZED', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/test/topup', headers: { authorization: 'Bearer not-a-jwt' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('无权限（sales 访问 finance.topup）→ 403 FORBIDDEN', async () => {
    const app = await buildApp();
    const token = generateAccessToken({ userId: 1, email: `rp-sales-${ts}@test.com`, role: 'sales' });
    const res = await app.inject({ method: 'GET', url: '/test/topup', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('finance 有 topup 无 adjust：topup 放行 / adjust 403', async () => {
    const app = await buildApp();
    const token = generateAccessToken({ userId: 2, email: `rp-fin-${ts}@test.com`, role: 'finance' });
    const res1 = await app.inject({ method: 'GET', url: '/test/topup', headers: { authorization: `Bearer ${token}` } });
    expect(res1.statusCode).toBe(200);
    const res2 = await app.inject({ method: 'POST', url: '/test/adjust', headers: { authorization: `Bearer ${token}` } });
    expect(res2.statusCode).toBe(403);
    await app.close();
  });

  it('有权限 → 放行且注入 userContext（role/userId）', async () => {
    const app = await buildApp();
    const token = generateAccessToken({ userId: 3, email: `rp-admin-${ts}@test.com`, role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/test/topup', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().userContext.role).toBe('admin');
    expect(res.json().userContext.userId).toBe(3);
    await app.close();
  });
});
