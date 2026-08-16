/**
 * GitHub OAuth 第三方登录单元测试
 *
 * 纯单测风格：mock db（../src/db）与 fetch（注入 fetchImpl / stubGlobal），
 * 不依赖真实 PG / Redis / 网络。
 *
 * 覆盖（对应 newapi-gap-analysis.md Batch 2 任务 2.1 测试要求）：
 *  - getGitHubOAuthUrl 格式（client_id / redirect_uri / state / scope）
 *  - exchangeGitHubCode 正常 / GitHub 返回 error → AppError / 网络错误 → 502
 *  - fetchGitHubUser 正常解析（openId/email/name/avatarUrl）+ 回落逻辑
 *  - 回调：已有绑定 → 直接签发 JWT（不新建用户）
 *  - 回调：无绑定但同 email → 创建绑定 + 签发 JWT
 *  - 回调：无绑定无用户 → 自动注册（随机不可登录密码）+ 创建绑定 + 签发 JWT
 *  - 回调：code 无效 → 400
 *  - 回调：DB 插入失败 → AppError 500
 *  - 路由级：OAuth 未配置 → /url 503；配置齐全 → 200 { url }；回调 200/400/503
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
    /** select().from(users) 的返回值 */
    users: [] as any[],
    /** select().from(userOauthBindings) 的返回值 */
    bindings: [] as any[],
    /** insert 到 users 的值（断言自动注册用） */
    insertedUsers: [] as any[],
    /** insert 到 userOauthBindings 的值（断言绑定创建用） */
    insertedBindings: [] as any[],
    /** 置 true 时 insert 抛错（模拟 DB 写入失败） */
    failInsert: false,
    insertError: new Error('db connection lost'),
    /** 自增主键（模拟 returning id） */
    nextUserId: 1,
  };

  /** select().from(table).where().limit() 可 await 链 */
  function makeSelectChain() {
    let table: any;
    const chain: any = {
      from: (t: any) => { table = t; return chain; },
      where: () => chain,
      limit: () => chain,
      orderBy: () => chain,
      offset: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      groupBy: () => chain,
    };
    chain.then = (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) => {
      const result = table === dbState.schema?.users ? dbState.users : dbState.bindings;
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };
    return chain;
  }

  /** insert(table).values().returning() 可 await 链（记录插入值，模拟 returning 行） */
  function makeInsertChain(table: any) {
    let values: any;
    const chain: any = {
      values: (v: any) => {
        if (dbState.failInsert) throw dbState.insertError;
        values = v;
        if (table === dbState.schema?.users) dbState.insertedUsers.push(v);
        else if (table === dbState.schema?.userOauthBindings) dbState.insertedBindings.push(v);
        return chain;
      },
      returning: () => chain,
      onConflictDoNothing: () => chain,
    };
    chain.then = (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) => {
      let result: unknown = [];
      if (table === dbState.schema?.users && values) {
        result = [{
          id: dbState.nextUserId++,
          email: values.email,
          name: values.name,
          avatarUrl: values.avatarUrl ?? null,
          role: values.role ?? 'customer',
          status: 'active',
          passwordHash: values.passwordHash,
        }];
      }
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };
    return chain;
  }

  /** update/delete 可 await 链（空结果） */
  function makeWriteChain() {
    const chain: any = {
      set: () => chain,
      where: () => chain,
      returning: () => chain,
    };
    chain.then = (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) =>
      Promise.resolve([]).then(onFulfilled, onRejected);
    return chain;
  }

  const dbMock: any = {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn((table: any) => makeInsertChain(table)),
    update: vi.fn(() => makeWriteChain()),
    delete: vi.fn(() => makeWriteChain()),
    transaction: vi.fn(async (fn: any) => fn(dbMock)),
  };

  return { dbMock, dbState };
});

vi.mock('../src/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db')>();
  dbState.schema = actual.schema; // 保留真实 schema，供 eq()/and() 构建条件
  return { ...actual, db: dbMock };
});

import {
  getGitHubOAuthUrl,
  getGitHubOAuthConfig,
  exchangeGitHubCode,
  fetchGitHubUser,
  handleGitHubCallback,
  type GitHubOAuthConfig,
} from '../src/services/auth/oauth';
import { verifyToken } from '../src/services/auth/jwt';

// ─────────────────────────────────────────────
// 夹具
// ─────────────────────────────────────────────

const CONFIG: GitHubOAuthConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectBase: 'http://localhost:3000',
};

const GITHUB_USER = { id: 12345, login: 'octocat', name: 'Octo Cat', avatar_url: 'https://avatars.example.com/octo.png', email: null };
const GITHUB_EMAILS = [{ email: 'gh@example.com', primary: true, verified: true }];

/** 按 URL 分发响应的 GitHub 出站 mock */
function makeGitHubFetchMock(opts: {
  tokenResponse?: unknown;
  userResponse?: unknown;
  emailsResponse?: unknown;
  userStatus?: number;
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
      return new Response(JSON.stringify(opts.userResponse ?? GITHUB_USER), { status: opts.userStatus ?? 200 });
    }
    return new Response('not found', { status: 404 });
  });
}

/** 完整 GitHub 配置环境变量（路由级测试用） */
function stubGitHubEnv() {
  vi.stubEnv('GITHUB_CLIENT_ID', 'test-client-id');
  vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-client-secret');
  vi.stubEnv('OAUTH_REDIRECT_BASE', 'http://localhost:3000');
}

/** 清空 GitHub 配置环境变量 */
function stubGitHubEnvEmpty() {
  vi.stubEnv('GITHUB_CLIENT_ID', '');
  vi.stubEnv('GITHUB_CLIENT_SECRET', '');
  vi.stubEnv('OAUTH_REDIRECT_BASE', '');
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
  dbState.users = [];
  dbState.bindings = [];
  dbState.insertedUsers = [];
  dbState.insertedBindings = [];
  dbState.failInsert = false;
  dbState.nextUserId = 1;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ═════════════════════════════════════════════
// 1. getGitHubOAuthUrl — URL 格式
// ═════════════════════════════════════════════

describe('getGitHubOAuthUrl', () => {
  it('返回正确格式 URL（含 client_id、redirect_uri、state、scope）', () => {
    const url = getGitHubOAuthUrl('state-abc', CONFIG);

    expect(url.startsWith('https://github.com/login/oauth/authorize?')).toBe(true);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('client_id')).toBe('test-client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/v1/auth/oauth/github/callback');
    expect(parsed.searchParams.get('state')).toBe('state-abc');
    expect(parsed.searchParams.get('scope')).toBe('read:user user:email');
  });
});

describe('getGitHubOAuthConfig', () => {
  it('环境变量齐全 → 返回配置对象', () => {
    const cfg = getGitHubOAuthConfig({ GITHUB_CLIENT_ID: 'a', GITHUB_CLIENT_SECRET: 'b', OAUTH_REDIRECT_BASE: 'c' } as NodeJS.ProcessEnv);
    expect(cfg).toEqual({ clientId: 'a', clientSecret: 'b', redirectBase: 'c' });
  });

  it('任一环境变量缺失 → 返回 null（路由据此 503）', () => {
    const cfg = getGitHubOAuthConfig({ GITHUB_CLIENT_ID: 'a' } as NodeJS.ProcessEnv);
    expect(cfg).toBeNull();
  });
});

// ═════════════════════════════════════════════
// 2. exchangeGitHubCode — code 换 token
// ═════════════════════════════════════════════

describe('exchangeGitHubCode', () => {
  it('正常：mock fetch 返回 access_token → 解析出 token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'gho_abc123', token_type: 'bearer' }), { status: 200 }),
    );

    const token = await exchangeGitHubCode('valid-code', {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(token).toBe('gho_abc123');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(JSON.parse(String(init.body))).toMatchObject({
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      code: 'valid-code',
    });
  });

  it('GitHub 返回 error（code 无效）→ 抛 AppError 400', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' }),
        { status: 200 },
      ),
    );

    await expect(exchangeGitHubCode('bad-code', {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toMatchObject({ statusCode: 400, code: 'OAUTH_CODE_INVALID' });
  });

  it('网络错误（fetch 抛错）→ 抛 AppError 502', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(exchangeGitHubCode('valid-code', {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toMatchObject({ statusCode: 502, code: 'OAUTH_UPSTREAM_ERROR' });
  });

  it('配置缺失 → 抛 AppError 503', async () => {
    stubGitHubEnvEmpty();
    await expect(exchangeGitHubCode('code', {})).rejects.toMatchObject({ statusCode: 503, code: 'OAUTH_NOT_CONFIGURED' });
  });
});

// ═════════════════════════════════════════════
// 3. fetchGitHubUser — 拉取用户信息
// ═════════════════════════════════════════════

describe('fetchGitHubUser', () => {
  it('正常：mock 返回 user + emails → 解析出 openId/email/name/avatarUrl', async () => {
    const fetchImpl = makeGitHubFetchMock();

    const user = await fetchGitHubUser('gho_abc123', { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(user).toEqual({
      openId: '12345',
      email: 'gh@example.com',
      name: 'Octo Cat',
      avatarUrl: 'https://avatars.example.com/octo.png',
    });
    // 两个请求都带 Bearer token
    const urls = fetchImpl.mock.calls.map((c) => c[0] as string);
    expect(urls).toContain('https://api.github.com/user');
    expect(urls).toContain('https://api.github.com/user/emails');
    for (const call of fetchImpl.mock.calls) {
      const init = call[1]!;
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gho_abc123');
    }
  });

  it('name 为空 → 回落 login', async () => {
    const fetchImpl = makeGitHubFetchMock({
      userResponse: { id: 999, login: 'nobody', name: null, avatar_url: null, email: null },
      emailsResponse: [], // 用户未授权邮箱 → email 为 null
    });

    const user = await fetchGitHubUser('gho_abc123', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(user).toEqual({ openId: '999', email: null, name: 'nobody', avatarUrl: null });
  });

  it('GitHub 用户接口非 2xx → 抛 AppError 502', async () => {
    const fetchImpl = makeGitHubFetchMock({ userStatus: 401 });

    await expect(fetchGitHubUser('gho_bad', { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toMatchObject({ statusCode: 502, code: 'OAUTH_UPSTREAM_ERROR' });
  });
});

// ═════════════════════════════════════════════
// 4. handleGitHubCallback — 回调编排（service 级）
// ═════════════════════════════════════════════

describe('handleGitHubCallback', () => {
  it('已有绑定 → 直接签发 JWT（不新建用户、不新建绑定）', async () => {
    dbState.users = [{
      id: 42, email: 'gh@example.com', name: 'Octo Cat', role: 'customer',
      status: 'active', passwordHash: 'existing-hash', avatarUrl: null,
    }];
    dbState.bindings = [{ id: 1, userId: 42, provider: 'github', openId: '12345', email: 'gh@example.com' }];

    const result = await handleGitHubCallback('valid-code', {
      config: CONFIG,
      fetchImpl: makeGitHubFetchMock() as unknown as typeof fetch,
    });

    expect(result.tokens.accessToken).toBeTruthy();
    expect(verifyToken(result.tokens.accessToken)?.userId).toBe(42);
    expect(result.user).toEqual({ id: 42, email: 'gh@example.com', name: 'Octo Cat', avatarUrl: null });
    expect(dbState.insertedUsers).toHaveLength(0);   // 不新建用户
    expect(dbState.insertedBindings).toHaveLength(0); // 不新建绑定
  });

  it('无绑定但同 email 用户存在 → 创建绑定 + 签发 JWT（不新建用户）', async () => {
    dbState.users = [{
      id: 7, email: 'gh@example.com', name: 'Existing User', role: 'customer',
      status: 'active', passwordHash: 'existing-hash', avatarUrl: null,
    }];
    dbState.bindings = [];

    const result = await handleGitHubCallback('valid-code', {
      config: CONFIG,
      fetchImpl: makeGitHubFetchMock() as unknown as typeof fetch,
    });

    expect(result.user.id).toBe(7);
    expect(result.tokens.accessToken).toBeTruthy();
    expect(verifyToken(result.tokens.accessToken)?.userId).toBe(7);
    expect(dbState.insertedUsers).toHaveLength(0); // 不新建用户
    expect(dbState.insertedBindings).toHaveLength(1);
    expect(dbState.insertedBindings[0]).toMatchObject({
      userId: 7, provider: 'github', openId: '12345', email: 'gh@example.com',
    });
  });

  it('无绑定无用户 → 自动注册（随机不可登录密码）+ 创建绑定 + 签发 JWT', async () => {
    dbState.users = [];
    dbState.bindings = [];

    const result = await handleGitHubCallback('valid-code', {
      config: CONFIG,
      fetchImpl: makeGitHubFetchMock() as unknown as typeof fetch,
    });

    // 自动注册：email 用 GitHub 邮箱，name 用 GitHub 用户名
    expect(dbState.insertedUsers).toHaveLength(1);
    const inserted = dbState.insertedUsers[0]!;
    expect(inserted.email).toBe('gh@example.com');
    expect(inserted.name).toBe('Octo Cat');
    // passwordHash 非空且 ≠ 明文原密码：随机 bcrypt 哈希（$2 前缀），不可密码登录
    expect(inserted.passwordHash).toBeTruthy();
    expect(inserted.passwordHash.startsWith('$2')).toBe(true);
    expect(inserted.role).toBe('customer');
    expect(inserted.avatarUrl).toBe('https://avatars.example.com/octo.png');

    // 创建绑定 + 签发 JWT
    expect(dbState.insertedBindings).toHaveLength(1);
    expect(dbState.insertedBindings[0]).toMatchObject({
      userId: result.user.id, provider: 'github', openId: '12345', email: 'gh@example.com',
    });
    expect(result.user.id).toBe(1);
    expect(result.tokens.accessToken).toBeTruthy();
    expect(verifyToken(result.tokens.accessToken)?.userId).toBe(1);
  });

  it('无邮箱的 GitHub 用户自动注册 → 用合成邮箱兜底', async () => {
    dbState.users = [];
    dbState.bindings = [];
    const fetchImpl = makeGitHubFetchMock({
      userResponse: { id: 88888, login: 'no-mail', name: 'No Mail', avatar_url: null, email: null },
      emailsResponse: [],
    });

    const result = await handleGitHubCallback('valid-code', {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(dbState.insertedUsers[0]!.email).toBe('github-88888@oauth.local');
    expect(result.user.email).toBe('github-88888@oauth.local');
  });

  it('code 无效（GitHub 返回 error）→ 抛 AppError 400', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad_verification_code' }), { status: 200 }),
    );

    await expect(handleGitHubCallback('bad-code', {
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toMatchObject({ statusCode: 400, code: 'OAUTH_CODE_INVALID' });
  });

  it('数据库插入失败 → 抛 AppError 500', async () => {
    dbState.users = [];
    dbState.bindings = [];
    dbState.failInsert = true;

    await expect(handleGitHubCallback('valid-code', {
      config: CONFIG,
      fetchImpl: makeGitHubFetchMock() as unknown as typeof fetch,
    })).rejects.toMatchObject({ statusCode: 500, code: 'OAUTH_DB_ERROR' });
  });
});

// ═════════════════════════════════════════════
// 5. 路由级 — GET /api/v1/auth/oauth/github/url
// ═════════════════════════════════════════════

describe('GET /api/v1/auth/oauth/github/url', () => {
  it('OAuth 未配置（环境变量缺失）→ 503', async () => {
    stubGitHubEnvEmpty();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/github/url' });
    expect(res.statusCode).toBe(503);
  });

  it('配置齐全 → 200 返回 { url }（含授权地址）', async () => {
    stubGitHubEnv();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/github/url' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.url).toContain('https://github.com/login/oauth/authorize?');
    expect(body.url).toContain('client_id=test-client-id');
    expect(body.url).toContain('state=');
  });
});

// ═════════════════════════════════════════════
// 6. 路由级 — GET /api/v1/auth/oauth/github/callback
// ═════════════════════════════════════════════

describe('GET /api/v1/auth/oauth/github/callback', () => {
  it('OAuth 未配置 → 503', async () => {
    stubGitHubEnvEmpty();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/github/callback?code=abc' });
    expect(res.statusCode).toBe(503);
  });

  it('缺少 code → 400', async () => {
    stubGitHubEnv();
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/github/callback' });
    expect(res.statusCode).toBe(400);
  });

  it('code 无效（GitHub 返回 error）→ 400', async () => {
    stubGitHubEnv();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad_verification_code' }), { status: 200 }),
    ));

    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/github/callback?code=bad-code' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('OAUTH_CODE_INVALID');
  });

  it('正常（自动注册路径）→ 200 + token + user 摘要', async () => {
    stubGitHubEnv();
    dbState.users = [];
    dbState.bindings = [];
    vi.stubGlobal('fetch', makeGitHubFetchMock());

    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/oauth/github/callback?code=valid-code' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user).toMatchObject({ id: 1, email: 'gh@example.com', name: 'Octo Cat' });
    expect(dbState.insertedBindings).toHaveLength(1); // 自动注册路径创建了绑定
  });
});
