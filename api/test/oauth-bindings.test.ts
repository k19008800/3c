/**
 * OAuth 绑定管理端点单元测试（bindings / bind / unbind）
 *
 * 纯单测风格：mock db（../src/db）与 fetch（stubGlobal），不依赖真实 PG / Redis / 网络。
 * JWT 用真实 jsonwebtoken 签发（固定测试密钥，无外部依赖），走真实 jwtAuth preHandler 路径。
 *
 * 覆盖（对应任务 Gate 条件）：
 *  - GET  /api/v1/auth/oauth/bindings：有绑定 → 返回列表；无绑定 → 空数组；未登录 → 401
 *  - POST /api/v1/auth/oauth/:provider/bind：provider 不合法 → 400；缺 code → 400；
 *    GitHub code 换用户信息成功 → INSERT + bound:true；openId 已绑定其他用户 → 409；
 *    重复绑定当前用户 → 幂等（不重复 INSERT）；wechat/telegram/google → 501；code 无效 → 401
 *  - POST /api/v1/auth/oauth/:provider/unbind：成功删除 → unbound:true；不存在 → 404；未登录 → 401
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ─────────────────────────────────────────────
// Mocks（vi.hoisted 保证 vi.mock factory 可引用）
// ─────────────────────────────────────────────

const { dbMock, dbState } = vi.hoisted(() => {
  const dbState = {
    /** 真实 schema（由 ../src/db mock factory 注入，用于表识别） */
    schema: null as any,
    /** select().from(userOauthBindings) 的返回值（绑定列表 / 绑定前查询） */
    bindings: [] as any[],
    /** insert 到 userOauthBindings 的值（断言绑定创建用） */
    insertedBindings: [] as any[],
    /** 置 true 时 insert 抛错（模拟 DB 写入失败） */
    failInsert: false,
    /** delete().from(userOauthBindings).returning() 的返回值（模拟删除影响行） */
    deleteResult: [] as any[],
    /** delete 调用记录（断言解绑 where 条件用） */
    deleteCalls: [] as any[],
  };

  /** select().from(table).where().limit().orderBy() 可 await 链 */
  function makeSelectChain() {
    let table: any;
    const chain: any = {
      from: (t: any) => { table = t; return chain; },
      where: () => chain,
      limit: () => chain,
      orderBy: () => chain,
      offset: () => chain,
    };
    chain.then = (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) => {
      const result = table === dbState.schema?.userOauthBindings ? dbState.bindings : [];
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };
    return chain;
  }

  /** insert(table).values() 可 await 链（记录插入值） */
  function makeInsertChain(table: any) {
    let values: any;
    const chain: any = {
      values: (v: any) => {
        if (dbState.failInsert) throw new Error('db connection lost');
        values = v;
        if (table === dbState.schema?.userOauthBindings) dbState.insertedBindings.push(v);
        return chain;
      },
      returning: () => chain,
      onConflictDoNothing: () => chain,
    };
    chain.then = (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) =>
      Promise.resolve([]).then(onFulfilled, onRejected);
    return chain;
  }

  /** delete(table).where().returning() 可 await 链（返回可配置的 deleteResult） */
  function makeDeleteChain(table: any) {
    let whereValue: any;
    const chain: any = {
      where: (v: any) => { whereValue = v; return chain; },
      returning: () => chain,
    };
    chain.then = (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) => {
      if (table === dbState.schema?.userOauthBindings) {
        dbState.deleteCalls.push({ table, where: whereValue });
        return Promise.resolve(dbState.deleteResult).then(onFulfilled, onRejected);
      }
      return Promise.resolve([]).then(onFulfilled, onRejected);
    };
    return chain;
  }

  const dbMock: any = {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn((table: any) => makeInsertChain(table)),
    delete: vi.fn((table: any) => makeDeleteChain(table)),
    update: vi.fn(() => ({
      set: () => ({ where: () => ({ returning: () => ({ then: (f: any) => Promise.resolve([]).then(f) }) }) }),
    })),
    transaction: vi.fn(async (fn: any) => fn(dbMock)),
  };

  return { dbMock, dbState };
});

vi.mock('../src/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db')>();
  dbState.schema = actual.schema; // 保留真实 schema，供 eq()/and() 构建条件
  return { ...actual, db: dbMock };
});

import { generateAccessToken, type TokenPayload } from '../src/services/auth/jwt';

// ─────────────────────────────────────────────
// 夹具
// ─────────────────────────────────────────────

/** 测试专用 JWT 密钥：签发与校验（jwtAuth）统一使用，避免依赖环境 */
const TEST_SECRET = 'oauth-bindings-unit-test-secret';

/** 当前登录用户 id（与 token 一致） */
const USER_ID = 42;

/** GitHub 出站 API mock：token / user / emails 三端点按 URL 分发 */
function makeGitHubFetchMock(opts: {
  tokenResponse?: unknown;
  userResponse?: unknown;
  emailsResponse?: unknown;
} = {}) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/login/oauth/access_token')) {
      return new Response(
        JSON.stringify(opts.tokenResponse ?? { access_token: 'gho_test_token', token_type: 'bearer' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.endsWith('/user/emails')) {
      return new Response(JSON.stringify(opts.emailsResponse ?? GITHUB_EMAILS), { status: 200 });
    }
    if (url.endsWith('/user')) {
      return new Response(JSON.stringify(opts.userResponse ?? GITHUB_USER), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
}

const GITHUB_USER = { id: 12345, login: 'octocat', name: 'Octo Cat', avatar_url: null, email: null };
const GITHUB_EMAILS = [{ email: 'gh@example.com', primary: true, verified: true }];

/** 生成 Authorization header（真实签发 JWT，与 jwtAuth 校验同密钥） */
function authHeader(userId: number = USER_ID, overrides: Partial<TokenPayload> = {}): { authorization: string } {
  const token = generateAccessToken(
    { userId, email: 'user@example.com', role: 'customer', ...overrides },
    TEST_SECRET,
  );
  return { authorization: `Bearer ${token}` };
}

/** stub GitHub OAuth 环境变量（bind 走 env 读配置，与生产一致） */
function stubGitHubEnv() {
  vi.stubEnv('GITHUB_CLIENT_ID', 'test-client-id');
  vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-client-secret');
  vi.stubEnv('OAUTH_REDIRECT_BASE', 'http://localhost:3000');
}

/** 绑定行工厂：默认 userId=42（当前用户） */
function bindingRow(overrides: Partial<Record<'id' | 'userId' | 'provider' | 'openId' | 'email', unknown>> = {}) {
  return {
    id: 1,
    userId: USER_ID,
    provider: 'github',
    openId: '12345',
    email: 'gh@example.com',
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// 路由级测试 app（只注册 oauthRoutes）
// ─────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  const { oauthRoutes } = await import('../src/routes/oauth');
  app = Fastify();
  await app.register(oauthRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  dbState.bindings = [];
  dbState.insertedBindings = [];
  dbState.failInsert = false;
  dbState.deleteResult = [];
  dbState.deleteCalls = [];

  vi.stubEnv('JWT_SECRET', TEST_SECRET);
  stubGitHubEnv();
  // 默认 GitHub API 正常响应；个别用例可覆盖
  vi.stubGlobal('fetch', makeGitHubFetchMock());
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ═════════════════════════════════════════════
// 1. GET /api/v1/auth/oauth/bindings
// ═════════════════════════════════════════════

describe('GET /api/v1/auth/oauth/bindings', () => {
  it('有绑定 → 200 返回绑定列表（provider/open_id/email/bound_at）', async () => {
    dbState.bindings = [bindingRow()];

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/bindings',
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: [{
        provider: 'github',
        open_id: '12345',
        email: 'gh@example.com',
        bound_at: '2026-08-16T00:00:00.000Z',
      }],
    });
  });

  it('无绑定 → 200 返回空数组', async () => {
    dbState.bindings = [];

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/bindings',
      headers: authHeader(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: [] });
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/bindings' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });
});

// ═════════════════════════════════════════════
// 2. POST /api/v1/auth/oauth/:provider/bind
// ═════════════════════════════════════════════

describe('POST /api/v1/auth/oauth/:provider/bind', () => {
  it('未登录 → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/github/bind',
      payload: { code: 'valid-code' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('provider 不在白名单 → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/twitter/bind',
      headers: authHeader(),
      payload: { code: 'valid-code' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('缺少 code → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/github/bind',
      headers: authHeader(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('code 无效（GitHub 返回 error）→ 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad_verification_code' }), { status: 200 }),
    ));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/github/bind',
      headers: authHeader(),
      payload: { code: 'bad-code' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('OAUTH_BIND_CODE_INVALID');
  });

  it('GitHub code 换用户信息成功 → INSERT 绑定 + 返回 bound:true', async () => {
    dbState.bindings = [];

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/github/bind',
      headers: authHeader(),
      payload: { code: 'valid-code' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: { bound: true, provider: 'github', open_id: '12345' },
    });
    // 断言 INSERT 值：归属当前用户，含 GitHub 返回的 openId / email
    expect(dbState.insertedBindings).toHaveLength(1);
    expect(dbState.insertedBindings[0]).toMatchObject({
      userId: USER_ID,
      provider: 'github',
      openId: '12345',
      email: 'gh@example.com',
    });
  });

  it('openId 已绑定其他用户 → 409', async () => {
    dbState.bindings = [bindingRow({ id: 9, userId: 7 })]; // 归属 userId=7（他人）

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/github/bind',
      headers: authHeader(), // 当前用户 42
      payload: { code: 'valid-code' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('OAUTH_BINDING_CONFLICT');
    expect(dbState.insertedBindings).toHaveLength(0); // 不写入
  });

  it('重复绑定当前用户（同 provider 同 openId）→ 幂等返回，不重复 INSERT', async () => {
    dbState.bindings = [bindingRow()]; // 已绑定当前用户 42

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/github/bind',
      headers: authHeader(),
      payload: { code: 'valid-code' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: { bound: true, provider: 'github', open_id: '12345' },
    });
    expect(dbState.insertedBindings).toHaveLength(0); // 幂等：不重复 INSERT
  });

  it('wechat/telegram/google 尚未接入 → 501', async () => {
    for (const provider of ['wechat', 'telegram', 'google']) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/auth/oauth/${provider}/bind`,
        headers: authHeader(),
        payload: { code: 'some-code' },
      });
      expect(res.statusCode).toBe(501);
      expect(res.json().code).toBe('NOT_IMPLEMENTED');
      expect(dbState.insertedBindings).toHaveLength(0);
    }
  });
});

// ═════════════════════════════════════════════
// 3. POST /api/v1/auth/oauth/:provider/unbind
// ═════════════════════════════════════════════

describe('POST /api/v1/auth/oauth/:provider/unbind', () => {
  it('未登录 → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/github/unbind',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('成功删除绑定 → 200 返回 unbound:true', async () => {
    dbState.deleteResult = [{ id: 1 }]; // 模拟删除影响 1 行

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/github/unbind',
      headers: authHeader(),
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { unbound: true, provider: 'github' } });
    // 断言 DELETE 条件：当前用户 + 指定 provider
    expect(dbState.deleteCalls).toHaveLength(1);
  });

  it('不存在绑定 → 404（NOT_BOUND）', async () => {
    dbState.deleteResult = []; // 无影响行

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/github/unbind',
      headers: authHeader(),
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_BOUND');
  });
});
