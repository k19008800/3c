/**
 * 用户引导（/me/onboarding/*）+ 销售客户标签（/me/customer-tags）集成测试
 *
 * 真实 PG（threecloud_v3）+ buildApp 全量路由，app.inject 驱动；数据按唯一 email 隔离，
 * afterAll 清理测试用户及其关联数据（system_config 引导/通知 key、users；customer-tags 无落库）。
 *
 * 覆盖：
 *  - A1 引导：GET 默认 not_started；step 保存→in_progress；skip→skipped；complete→completed；
 *    后续 GET 持久化（round-trip）；两用户状态互不干扰（隔离）。
 *  - A2 客户标签：GET 返回 { data: { list: [{id,name,color}] } }（6 个预设）；未登录 401。
 *
 * @see docs/contract-gap-audit-2026-09.md A1/A2
 * @see docs/SPEC-§18-用户端体验增强.md §18.3 用户引导 / docs/SPEC-§11 业务员支撑模块 §11.1 CRM
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-me-onboarding-tags-secret-2026-09',
  PORT: '3038',
};

let app: FastifyInstance;
const ts = Date.now();

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** 注册用户（唯一邮箱）→ { user, accessToken, email } */
async function registerUser(prefix: string) {
  const email = `${prefix}-${ts}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'Test1234!', name: 'Onboarding Tags Test' },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { user: { id: number; email: string }; accessToken: string };
  return { email, user: body.user, accessToken: body.accessToken };
}

/** 清理一个用户的测试数据（system_config 引导 key + users） */
async function cleanupUser(uid: number) {
  if (uid <= 0) return;
  try {
    await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, `onboarding.${uid}`));
    await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, `notify_pref.${uid}.prefs`));
    await db.delete(schema.users).where(eq(schema.users.id, uid));
  } catch {
    /* 忽略 */
  }
}

beforeAll(async () => {
  app = await buildApp({ envOverrides: testEnv });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

/* ═══════════════ A1. /me/onboarding/* ═══════════════ */

describe('POST/GET /api/v1/me/onboarding/*', () => {
  let uidA = 0;
  let tokenA = '';
  let uidB = 0;
  let tokenB = '';

  afterAll(async () => {
    await cleanupUser(uidA);
    await cleanupUser(uidB);
  });

  it('未登录 → 401（四个端点）', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/me/onboarding/status' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/me/onboarding/step', payload: { step: 1 } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/me/onboarding/skip' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/me/onboarding/complete' })).statusCode).toBe(401);
  });

  it('未设置 → GET 默认 not_started / step=1 / completedAt=null', async () => {
    const reg = await registerUser('onb-a');
    uidA = reg.user.id;
    tokenA = reg.accessToken;
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding/status', headers: auth(tokenA) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('not_started');
    expect(body.step).toBe(1);
    expect(body.completedAt).toBeNull();
  });

  it('POST step 保存 → status=in_progress 且 round-trip 持久化', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/onboarding/step',
      headers: auth(tokenA),
      payload: { step: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ok).toBe(true);
    expect(res.json().data.status).toBe('in_progress');

    const got = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding/status', headers: auth(tokenA) });
    expect(got.json().status).toBe('in_progress');
    expect(got.json().step).toBe(3);
    expect(got.json().completedAt).toBeNull();
  });

  it('POST step 非法 step → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/onboarding/step',
      headers: auth(tokenA),
      payload: { step: 0 },
    });
    expect(res.statusCode).toBe(400);
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/me/onboarding/step',
      headers: auth(tokenA),
      payload: { step: 'x' },
    });
    expect(res2.statusCode).toBe(400);
  });

  it('POST skip → status=skipped 且 round-trip 持久化', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/me/onboarding/skip', headers: auth(tokenA) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('skipped');

    const got = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding/status', headers: auth(tokenA) });
    expect(got.json().status).toBe('skipped');
  });

  it('complete（单独用户）→ status=completed 且 round-trip 持久化', async () => {
    const reg = await registerUser('onb-complete');
    const uidC = reg.user.id;
    const tokenC = reg.accessToken;
    try {
      const res = await app.inject({ method: 'POST', url: '/api/v1/me/onboarding/complete', headers: auth(tokenC) });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('completed');

      const got = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding/status', headers: auth(tokenC) });
      expect(got.json().status).toBe('completed');
      expect(got.json().step).toBe(5);
      expect(typeof got.json().completedAt).toBe('string');
    } finally {
      await cleanupUser(uidC);
    }
  });

  it('用户间隔离：B 的引导状态不受 A 影响（B 仍为默认 not_started）', async () => {
    const reg = await registerUser('onb-b');
    uidB = reg.user.id;
    tokenB = reg.accessToken;
    // 此刻 A 为 skipped，B 从未操作 → 默认 not_started
    const b = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding/status', headers: auth(tokenB) });
    expect(b.statusCode).toBe(200);
    expect(b.json().status).toBe('not_started');
    expect(b.json().step).toBe(1);

    // B 走 step → in_progress，A 仍为 skipped
    await app.inject({ method: 'POST', url: '/api/v1/me/onboarding/step', headers: auth(tokenB), payload: { step: 2 } });
    const b2 = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding/status', headers: auth(tokenB) });
    expect(b2.json().status).toBe('in_progress');
    expect(b2.json().step).toBe(2);

    const a = await app.inject({ method: 'GET', url: '/api/v1/me/onboarding/status', headers: auth(tokenA) });
    expect(a.json().status).toBe('skipped');
  });
});

/* ═══════════════ A2. /me/customer-tags ═══════════════ */

describe('GET /api/v1/me/customer-tags', () => {
  let uid = 0;
  let token = '';

  afterAll(async () => {
    await cleanupUser(uid);
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/customer-tags' });
    expect(res.statusCode).toBe(401);
  });

  it('返回 { data: { list: [{id,name,color}] } }，含 SPEC-§11 预设标签', async () => {
    const reg = await registerUser('tags');
    uid = reg.user.id;
    token = reg.accessToken;
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/customer-tags', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.list)).toBe(true);

    const names = body.data.list.map((t: any) => t.name);
    const expectedCommon = ['企业客户', '开发者', '高价值', '需跟进', '流失预警', '已签约'];
    for (const n of expectedCommon) expect(names).toContain(n);

    for (const t of body.data.list) {
      expect(typeof t.id).toBe('number');
      expect(typeof t.name).toBe('string');
      expect(typeof t.color).toBe('string');
    }
  });
});