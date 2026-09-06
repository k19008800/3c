/**
 * 操作级 2FA 中间件测试 — requireOperation2fa 错误码矩阵（R7，真实 PG）
 *
 * 覆盖 ARCH §6.3 用例 16/17/20：
 *   - 无 X-Operation-Token → 403 OPERATION_2FA_REQUIRED
 *   - 操作者未启用 2FA → 403 OPERATION_2FA_NOT_ENABLED（无论有无令牌，强制策略 B12/Q3）
 *   - 过期令牌 → 403 OPERATION_2FA_EXPIRED；伪造 purpose / 他人令牌 → 403 OPERATION_2FA_INVALID
 *   - 通过 → 注入 request.opToken；只读端点不拦截（中间件仅挂资金写端点）
 *   - 错误码不含 401（防前端 axios 401 拦截器误登出，双签 §10.2-4）
 *
 * @see docs/ARCH-整改R5-R7-资金风控.md §4.4 / §6.3
 * @module middleware/require-operation-2fa.test
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { db, schema } from '../db';
import { inArray } from 'drizzle-orm';
import { generateAccessToken, generate2faTempToken, generateOperationToken } from '../services/auth/jwt';
import { requirePerm } from './require-perm';
import { requireOperation2fa } from './require-operation-2fa';
import { enableTest2fa } from '../routes/test-helpers';
import { getRedis } from '../lib/redis';
import { assertOperationSummary } from '../lib/operation-summary';

process.env.JWT_SECRET = 'test-require-operation-2fa-secret';

const ts = Date.now();

/** ADR-0008 摘要绑定测试摘要：令牌 summaryHash 与 X-Operation-Summary 必须一致 */
const SUMMARY = [{ type: 'test', amount: 100, target: 'op2fa' }];
const OTHER_SUMMARY = [{ type: 'test', amount: 999, target: 'op2fa' }];
const SUMMARY_HASH = assertOperationSummary(SUMMARY);
const opSummaryHeaders = () => ({ 'x-operation-summary': JSON.stringify(SUMMARY) });

let enabledUserId = 0;      // 已启用 2FA 的操作员
let disabledUserId = 0;     // 未启用 2FA 的操作员（DB 角色 customer，JWT role=admin）
let enabledToken = '';
let disabledToken = '';

let app: FastifyInstance;

function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  // 对齐生产 app.ts setErrorHandler 契约：{ statusCode, code: err.code, message }
  instance.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ statusCode: status, code: err?.code ?? status, message: err?.message ?? 'Internal Server Error' });
  });
  // 资金写端点（挂 2FA）与只读端点（不挂）
  instance.post('/api/v1/admin/test-money', { preHandler: [requirePerm('finance.topup'), requireOperation2fa] }, async (request: any, reply) => {
    return reply.send({ ok: true, opTokenUserId: request.opToken?.userId ?? null });
  });
  instance.get('/api/v1/admin/test-read', { preHandler: [requirePerm('finance.topup')] }, async (_request, reply) => {
    return reply.send({ ok: true });
  });
  return instance;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  const [enabled] = await db.insert(schema.users).values({
    email: `op2fa-en-${ts}@test.com`, passwordHash: 'x', name: 'Op2faEnabled', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  enabledUserId = enabled!.id;

  const [disabled] = await db.insert(schema.users).values({
    email: `op2fa-dis-${ts}@test.com`, passwordHash: 'x', name: 'Op2faDisabled', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  disabledUserId = disabled!.id;

  await enableTest2fa(enabledUserId);   // 仅 enabled 用户启用 2FA

  enabledToken = generateAccessToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin' });
  disabledToken = generateAccessToken({ userId: disabledUserId, email: `op2fa-dis-${ts}@test.com`, role: 'admin' });

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    await db.delete(schema.user2fa).where(inArray(schema.user2fa.userId, [enabledUserId, disabledUserId]));
    await db.delete(schema.users).where(inArray(schema.users.id, [enabledUserId, disabledUserId]));
    const r = getRedis();
    if (r) {
      await r.del(`op2fa:revoked:${enabledUserId}`);
      await r.del(`op2fa:issued_seq:${enabledUserId}`);
    }
  } catch (err) {
    console.error('[require-operation-2fa.test] cleanup failed:', err);
  }
});

describe('requireOperation2fa 中间件矩阵（R7，含二次确认 E30 与失效联动 E27）', () => {
  it('用例18 无 X-Operation-Token → 403 OPERATION_2FA_REQUIRED（非 401）', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/test-money', headers: auth(enabledToken), payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('OPERATION_2FA_REQUIRED');
    expect(res.json().statusCode).toBe(403);
  });

  it('用例18 有令牌缺 X-Operation-Confirm → 403 OPERATION_CONFIRM_REQUIRED（E30 AND）', async () => {
    const token = generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 1, summaryHash: SUMMARY_HASH });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': token, ...opSummaryHeaders() },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('OPERATION_CONFIRM_REQUIRED');
  });

  it('用例19 操作者未启用 2FA → 403 OPERATION_2FA_NOT_ENABLED（无论有无令牌）', async () => {
    const noToken = await app.inject({ method: 'POST', url: '/api/v1/admin/test-money', headers: auth(disabledToken), payload: {} });
    expect(noToken.statusCode).toBe(403);
    expect(noToken.json().code).toBe('OPERATION_2FA_NOT_ENABLED');

    // 即使带了有效令牌（他人签发）也因未启用被拒（强制策略）
    const withToken = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(disabledToken), 'x-operation-token': generateOperationToken({ userId: disabledUserId, email: `op2fa-dis-${ts}@test.com`, role: 'admin', seq: 1, summaryHash: SUMMARY_HASH }), 'x-operation-confirm': 'confirmed', ...opSummaryHeaders() },
      payload: {},
    });
    expect(withToken.statusCode).toBe(403);
    expect(withToken.json().code).toBe('OPERATION_2FA_NOT_ENABLED');
  });

  it('有效令牌 + 确认标记 → 200 + request.opToken 注入（userId 匹配）', async () => {
    const token = generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 1, summaryHash: SUMMARY_HASH });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': token, 'x-operation-confirm': 'confirmed', ...opSummaryHeaders() },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().opTokenUserId).toBe(enabledUserId);
  });

  it('用例22 过期令牌 → 403 OPERATION_2FA_EXPIRED', async () => {
    // expiresIn 负数 → exp 在过去 → TokenExpiredError
    const expired = jwt.sign(
      { userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', purpose: 'operation', seq: 1, summaryHash: SUMMARY_HASH },
      process.env.JWT_SECRET || 'test-require-operation-2fa-secret',
      { expiresIn: -1 },
    );
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': expired, 'x-operation-confirm': 'confirmed', ...opSummaryHeaders() },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('OPERATION_2FA_EXPIRED');
  });

  it('用例22 伪造 purpose（登录 2fa 临时令牌当 op 用）→ 403 OPERATION_2FA_INVALID', async () => {
    const login2faToken = generate2faTempToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin' });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': login2faToken, 'x-operation-confirm': 'confirmed', ...opSummaryHeaders() },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('OPERATION_2FA_INVALID');
  });

  it('用例22 他人 userId 令牌 → 403 OPERATION_2FA_INVALID（不可跨操作者）', async () => {
    const otherToken = generateOperationToken({ userId: 99999999, email: 'other@test.com', role: 'admin', seq: 1, summaryHash: SUMMARY_HASH });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': otherToken, 'x-operation-confirm': 'confirmed', ...opSummaryHeaders() },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('OPERATION_2FA_INVALID');
  });

  it('用例23 E27 失效联动：2FA 禁用（revoked seq ≥ 令牌 seq）→ 403 OPERATION_2FA_EXPIRED', async () => {
    const r = getRedis()!;
    await r.set(`op2fa:revoked:${enabledUserId}`, '3');
    const token = generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 2, summaryHash: SUMMARY_HASH });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': token, 'x-operation-confirm': 'confirmed', ...opSummaryHeaders() },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('OPERATION_2FA_EXPIRED');
    await r.del(`op2fa:revoked:${enabledUserId}`);
  });

  it('用例18 只读端点不拦截（无 op token 仍 200）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/test-read', headers: auth(enabledToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('错误码避开 401：上述全部 403（断言不触发 401 登出拦截）', async () => {
    const noToken = await app.inject({ method: 'POST', url: '/api/v1/admin/test-money', headers: auth(enabledToken), payload: {} });
    const noConfirm = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 1, summaryHash: SUMMARY_HASH }), ...opSummaryHeaders() },
      payload: {},
    });
    expect([noToken.statusCode, noConfirm.statusCode]).not.toContain(401);
  });
});

describe('ISSUE #25 三缺口专项（ADR-0008：summary 绑定 / 一次性消费 / fail-closed）', () => {
  it('summary 绑定①：缺 X-Operation-Summary → 403 OPERATION_2FA_INVALID', async () => {
    const token = generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 1, summaryHash: SUMMARY_HASH });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': token, 'x-operation-confirm': 'confirmed' },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('OPERATION_2FA_INVALID');
  });

  it('summary 绑定②：空摘要（空数组）→ 403 OPERATION_2FA_INVALID', async () => {
    const token = generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 1, summaryHash: SUMMARY_HASH });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': token, 'x-operation-confirm': 'confirmed', 'x-operation-summary': JSON.stringify([]) },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('OPERATION_2FA_INVALID');
  });

  it('summary 绑定③：摘要与令牌 summaryHash 不匹配（内容被篡改）→ 403 OPERATION_2FA_INVALID', async () => {
    const token = generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 1, summaryHash: SUMMARY_HASH });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': token, 'x-operation-confirm': 'confirmed', 'x-operation-summary': JSON.stringify(OTHER_SUMMARY) },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('OPERATION_2FA_INVALID');
  });

  it('summary 绑定④：令牌无 summaryHash（旧格式）→ 403 OPERATION_2FA_INVALID', async () => {
    const legacyToken = generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 1 });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': legacyToken, 'x-operation-confirm': 'confirmed', ...opSummaryHeaders() },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('OPERATION_2FA_INVALID');
  });

  it('一次性消费①：同 token 首次 confirmed → 200，二次 → 403 OPERATION_2FA_REPLAYED', async () => {
    const token = generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 1, summaryHash: SUMMARY_HASH });
    const headers = { ...auth(enabledToken), 'x-operation-token': token, 'x-operation-confirm': 'confirmed', ...opSummaryHeaders() };
    const first = await app.inject({ method: 'POST', url: '/api/v1/admin/test-money', headers, payload: {} });
    expect(first.statusCode).toBe(200);
    const replay = await app.inject({ method: 'POST', url: '/api/v1/admin/test-money', headers, payload: {} });
    expect(replay.statusCode).toBe(403);
    expect(replay.json().code).toBe('OPERATION_2FA_REPLAYED');
  });

  it('一次性消费②：未确认的探测轮不消费令牌，confirmed 轮仍可成功', async () => {
    const token = generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 1, summaryHash: SUMMARY_HASH });
    // 探测轮：带令牌但无 confirm（中间件应放行到 confirm 检查并返回 CONFIRM_REQUIRED，不消费）
    const probe = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': token, ...opSummaryHeaders() },
      payload: {},
    });
    expect(probe.statusCode).toBe(403);
    expect(probe.json().code).toBe('OPERATION_CONFIRM_REQUIRED');
    // 确认轮：同 token 仍可用
    const confirm = await app.inject({
      method: 'POST', url: '/api/v1/admin/test-money',
      headers: { ...auth(enabledToken), 'x-operation-token': token, 'x-operation-confirm': 'confirmed', ...opSummaryHeaders() },
      payload: {},
    });
    expect(confirm.statusCode).toBe(200);
  });

  it('fail-closed①：Redis 不可用 + confirmed → 403 OPERATION_2FA_UNAVAILABLE（不绕过后端校验）', async () => {
    const redisLib = await import('../lib/redis');
    const spy = vi.spyOn(redisLib, 'getRedis').mockReturnValue(null as any);
    try {
      const token = generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 1, summaryHash: SUMMARY_HASH });
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/test-money',
        headers: { ...auth(enabledToken), 'x-operation-token': token, 'x-operation-confirm': 'confirmed', ...opSummaryHeaders() },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('OPERATION_2FA_UNAVAILABLE');
    } finally {
      spy.mockRestore();
    }
  });

  it('fail-closed②：Redis 读取异常（get 抛错）+ confirmed → 403 OPERATION_2FA_UNAVAILABLE', async () => {
    const redisLib = await import('../lib/redis');
    const fake = { get: async () => { throw new Error('redis down'); } } as any;
    const spy = vi.spyOn(redisLib, 'getRedis').mockReturnValue(fake);
    try {
      const token = generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 1, summaryHash: SUMMARY_HASH });
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/test-money',
        headers: { ...auth(enabledToken), 'x-operation-token': token, 'x-operation-confirm': 'confirmed', ...opSummaryHeaders() },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('OPERATION_2FA_UNAVAILABLE');
    } finally {
      spy.mockRestore();
    }
  });

  it('fail-closed③：Redis 不可用 + 非 confirmed → 放行到二次确认检查（OPERATION_CONFIRM_REQUIRED，非静默放行）', async () => {
    const redisLib = await import('../lib/redis');
    const spy = vi.spyOn(redisLib, 'getRedis').mockReturnValue(null as any);
    try {
      const token = generateOperationToken({ userId: enabledUserId, email: `op2fa-en-${ts}@test.com`, role: 'admin', seq: 1, summaryHash: SUMMARY_HASH });
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/test-money',
        headers: { ...auth(enabledToken), 'x-operation-token': token, ...opSummaryHeaders() },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('OPERATION_CONFIRM_REQUIRED');
    } finally {
      spy.mockRestore();
    }
  });
});
