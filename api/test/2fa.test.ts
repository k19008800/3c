/**
 * 2FA（TOTP + 备用码）单元测试
 *
 * 纯单测风格：mock db（../src/db）、JWT（../src/services/auth/jwt），
 * 不依赖真实 PG / Redis。TOTP 核心（../src/services/auth/totp）使用真实实现。
 *
 * 覆盖（对应 newapi-gap-analysis.md Batch 2 任务 2.2 测试要求）：
 *  - TOTP 核心：generateSecret / generateTOTP+verifyTOTP / 时间窗口容差 / 备用码 / otpauthURL
 *  - 路由：setup 401 / enable 成功与失败 / login 2FA 分支 / verify TOTP 与备用码 / disable
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';

// ─────────────────────────────────────────────
// Mocks（vi.hoisted 保证 vi.mock factory 可引用）
// ─────────────────────────────────────────────

const { dbMock, dbState } = vi.hoisted(() => {
  const dbState: any = {
    /** 真实 schema（由 ../src/db mock factory 注入，用于表识别） */
    schema: null,
    /** 表 → 行 的模拟数据（select 按表返回） */
    rows: new Map<any, any[]>(),
    /** db.insert(...).values(...) 调用记录 */
    inserts: [] as Array<{ table: any; values: any }>,
    /** db.update(...).set(...) 调用记录（断言写回用） */
    updates: [] as Array<{ table: any; set: any }>,
  };

  /** 可 await 的 Drizzle 链式 builder：方法全部返回自身，await 时按方法/表解析结果 */
  function makeChain(method: 'select' | 'update' | 'insert' | 'delete', initialTable?: any) {
    let table: any = initialTable;
    let values: any;
    const chain: any = {
      from: (t: any) => { table = t; return chain; },
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      groupBy: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      set: (v: any) => { dbState.updates.push({ table, set: v }); return chain; },
      values: (v: any) => { values = v; return chain; },
      returning: () => chain,
    };
    chain.then = (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) => {
      let result: unknown;
      if (method === 'select') {
        result = table ? (dbState.rows.get(table) ?? []) : [];
      } else if (method === 'insert') {
        dbState.inserts.push({ table, values });
        const inserted = { id: 1, ...values };
        if (table) {
          const arr = dbState.rows.get(table) ?? [];
          arr.push(inserted);
          dbState.rows.set(table, arr);
        }
        result = [inserted];
      } else {
        result = [];
      }
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };
    return chain;
  }

  const dbMock: any = {
    select: vi.fn(() => makeChain('select')),
    update: vi.fn((table: any) => makeChain('update', table)),
    insert: vi.fn((table: any) => makeChain('insert', table)),
    delete: vi.fn((table: any) => makeChain('delete', table)),
    transaction: vi.fn((fn: any) => fn(dbMock)),
  };

  return { dbMock, dbState };
});

vi.mock('../src/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db')>();
  dbState.schema = actual.schema; // 保留真实 schema，供 eq()/and() 构建条件
  return { ...actual, db: dbMock };
});

vi.mock('../src/services/auth/jwt', () => ({
  generateTokenPair: vi.fn(() => ({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', expiresIn: 900 })),
  verifyToken: vi.fn(() => ({ userId: 1, email: 'test@example.com', role: 'customer' })),
  generate2faTempToken: vi.fn(() => 'mock-temp-token'),
  verify2faTempToken: vi.fn(() => ({ purpose: '2fa', userId: 1, email: 'test@example.com', role: 'customer' })),
  createSession: vi.fn(async () => {}),
  invalidateSession: vi.fn(async () => {}),
  refreshAccessToken: vi.fn(async () => null),
}));

// TOTP 核心使用真实实现
import {
  generateSecret,
  generateTOTP,
  verifyTOTP,
  generateBackupCodes,
  verifyBackupCode,
  otpauthURL,
} from '../src/services/auth/totp';

// JWT mock（vi.mock 替换后的实现）
import {
  verifyToken,
  verify2faTempToken,
  generate2faTempToken,
  generateTokenPair,
  createSession,
} from '../src/services/auth/jwt';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const AUTH_HEADERS = { authorization: 'Bearer test-access-token' };
/** 固定测试 secret（16 字符 base32，非随机，便于两端复用） */
const TEST_SECRET = 'JBSWY3DPEHPK3PXP';

/** 向模拟库写入一个 users 行 */
function seedUser(overrides: Record<string, unknown> = {}) {
  const user = {
    id: 1,
    email: 'test@example.com',
    passwordHash: bcrypt.hashSync('password123', 10),
    name: 'Test User',
    role: 'customer',
    status: 'active',
    twoFactorEnabled: '0',
    lastLoginAt: null,
    lastLoginIp: null,
    ...overrides,
  };
  dbState.rows.set(dbState.schema.users, [user]);
  return user;
}

/** 向模拟库写入一个 user_2fa 行 */
function seedUser2fa(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 1,
    userId: 1,
    totpSecret: TEST_SECRET,
    totpEnabled: true,
    backupCodes: [] as string[],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  dbState.rows.set(dbState.schema.user2fa, [row]);
  return row;
}

let app: FastifyInstance;

beforeAll(async () => {
  const { twoFactorRoutes } = await import('../src/routes/2fa');
  const { authRoutes } = await import('../src/routes/auth');
  app = Fastify();
  await app.register(twoFactorRoutes);
  await app.register(authRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  dbState.rows.clear();
  dbState.inserts = [];
  dbState.updates = [];
  vi.mocked(verifyToken).mockImplementation(() => ({ userId: 1, email: 'test@example.com', role: 'customer' }));
  vi.mocked(verify2faTempToken).mockImplementation(() => ({ purpose: '2fa', userId: 1, email: 'test@example.com', role: 'customer' }));
  vi.mocked(generate2faTempToken).mockImplementation(() => 'mock-temp-token');
  vi.mocked(generateTokenPair).mockImplementation(() => ({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', expiresIn: 900 }));
  vi.mocked(createSession).mockImplementation(async () => {});
});

// ════════════════════════════════════════════
// Part 1: TOTP 核心（纯函数，无 mock）
// ════════════════════════════════════════════

describe('totp service', () => {
  it('generateSecret 返回 base32 字符串（长度合理）', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBe(32); // 20 字节 → 32 字符
    expect(generateSecret()).not.toBe(secret); // 每次生成不同
  });

  it('generateTOTP + verifyTOTP 循环：正确码通过、错误码不通过', () => {
    const secret = generateSecret();
    const code = generateTOTP(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTOTP(secret, code)).toBe(true);
    expect(verifyTOTP(secret, '000000')).toBe(false);
    expect(verifyTOTP(secret, '12345')).toBe(false); // 非 6 位数字
  });

  it('verifyTOTP 时间窗口容差：±1 窗口内有效', () => {
    const secret = generateSecret();
    const current = generateTOTP(secret);
    const prev = generateTOTP(secret, { window: -1 }); // 上一窗口
    const next = generateTOTP(secret, { window: 1 });  // 下一窗口

    expect(verifyTOTP(secret, current)).toBe(true);
    expect(verifyTOTP(secret, prev)).toBe(true);
    expect(verifyTOTP(secret, next)).toBe(true);

    // 收紧到 0 窗口（仅当前）后，前后窗口不再有效
    expect(verifyTOTP(secret, prev, { window: 0 })).toBe(false);
    expect(verifyTOTP(secret, next, { window: 0 })).toBe(false);
  });

  it('generateBackupCodes 返回 count 个明文 + 同数量哈希', () => {
    const { codes, hashes } = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(hashes).toHaveLength(10);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
    for (const hash of hashes) {
      expect(hash.startsWith('$2')).toBe(true); // bcrypt 哈希
    }
    expect(new Set(codes).size).toBe(10); // 明文唯一

    const small = generateBackupCodes(3);
    expect(small.codes).toHaveLength(3);
    expect(small.hashes).toHaveLength(3);
  });

  it('verifyBackupCode：正确码通过、错误码不通过', async () => {
    const { codes, hashes } = generateBackupCodes(3);
    expect(await verifyBackupCode(hashes[0]!, codes[0]!)).toBe(true);
    expect(await verifyBackupCode(hashes[0]!, codes[1]!)).toBe(false);
    expect(await verifyBackupCode(hashes[0]!, 'ZZZZ-ZZZZ-ZZZZ')).toBe(false);
    // 大小写 / 分隔符无关（规范化后比对）
    expect(await verifyBackupCode(hashes[0]!, codes[0]!.toLowerCase())).toBe(true);
    expect(await verifyBackupCode(hashes[0]!, codes[0]!.replace(/-/g, ''))).toBe(true);
  });

  it('otpauthURL 格式包含 otpauth://totp/ 和 secret 和 issuer=3cloud', () => {
    const secret = generateSecret();
    const url = otpauthURL(secret, 'test@example.com');
    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain(secret);
    expect(url).toContain('issuer=3cloud');
    expect(url).toContain('3cloud:');
  });
});

// ════════════════════════════════════════════
// Part 2: 2FA 路由（mock db + jwt）
// ════════════════════════════════════════════

describe('2FA routes', () => {
  it('setup：未登录 → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/2fa/setup' });
    expect(res.statusCode).toBe(401);
  });

  it('setup：登录后返回 secret + otpauthUrl + 10 个备用码（不立即启用）', async () => {
    seedUser();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/setup',
      headers: AUTH_HEADERS,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(body.otpauthUrl).toContain('otpauth://totp/');
    expect(body.otpauthUrl).toContain(body.secret);
    expect(body.backupCodes).toHaveLength(10);
    // 不立即启用：未写 user_2fa
    expect(dbState.inserts).toHaveLength(0);
    expect(dbState.rows.get(dbState.schema.user2fa) ?? []).toHaveLength(0);
  });

  it('enable：token 正确 → user_2fa 写入 + users.twoFactorEnabled=1', async () => {
    seedUser();
    const setupRes = await app.inject({ method: 'POST', url: '/api/v1/auth/2fa/setup', headers: AUTH_HEADERS });
    expect(setupRes.statusCode).toBe(200);
    const { secret } = setupRes.json();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/enable',
      headers: AUTH_HEADERS,
      payload: { token: generateTOTP(secret) },
    });
    expect(res.statusCode).toBe(200);

    // user_2fa insert：totpEnabled=true + 备用码哈希落库
    const insert = dbState.inserts.find((i) => i.table === dbState.schema.user2fa);
    expect(insert).toBeDefined();
    expect(insert!.values.totpEnabled).toBe(true);
    expect(insert!.values.backupCodes).toHaveLength(10);
    // users 同步 twoFactorEnabled='1'
    const userUpdate = dbState.updates.find((u) => u.table === dbState.schema.users);
    expect(userUpdate).toBeDefined();
    expect(userUpdate!.set.twoFactorEnabled).toBe('1');
  });

  it('enable：token 错误 → 400', async () => {
    seedUser();
    const setupRes = await app.inject({ method: 'POST', url: '/api/v1/auth/2fa/setup', headers: AUTH_HEADERS });
    expect(setupRes.statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/enable',
      headers: AUTH_HEADERS,
      payload: { token: '000000' },
    });
    expect(res.statusCode).toBe(400);
    // 校验失败不落库
    expect(dbState.inserts).toHaveLength(0);
    expect(dbState.updates).toHaveLength(0);
  });

  it('enable：重复启用 → 409', async () => {
    seedUser();
    seedUser2fa({ totpEnabled: true }); // 已启用
    const setupRes = await app.inject({ method: 'POST', url: '/api/v1/auth/2fa/setup', headers: AUTH_HEADERS });
    const { secret } = setupRes.json();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/enable',
      headers: AUTH_HEADERS,
      payload: { token: generateTOTP(secret) },
    });
    expect(res.statusCode).toBe(409);
  });

  it('login：启用 2FA 用户 → 返回 twoFactorRequired=true + tempToken（无正式 JWT）', async () => {
    seedUser({ twoFactorEnabled: '1' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@example.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.twoFactorRequired).toBe(true);
    expect(body.tempToken).toBe('mock-temp-token');
    expect(body.accessToken).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
    expect(generate2faTempToken).toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled(); // 第二步确认前不建会话
  });

  it('login：未启用 2FA → 行为不变直接发 JWT', async () => {
    seedUser({ twoFactorEnabled: '0' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@example.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBe('mock-access-token');
    expect(body.refreshToken).toBe('mock-refresh-token');
    expect(body.twoFactorRequired).toBeUndefined();
    expect(createSession).toHaveBeenCalled();
  });

  it('verify：正确 TOTP → 发正式 JWT', async () => {
    seedUser();
    seedUser2fa({ totpSecret: TEST_SECRET, totpEnabled: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { tempToken: 'mock-temp-token', token: generateTOTP(TEST_SECRET) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBe('mock-access-token');
    expect(body.refreshToken).toBe('mock-refresh-token');
    expect(createSession).toHaveBeenCalledWith(1, 'mock-access-token', 'mock-refresh-token', expect.any(String));
  });

  it('verify：错误 TOTP → 401', async () => {
    seedUser();
    seedUser2fa({ totpSecret: TEST_SECRET, totpEnabled: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { tempToken: 'mock-temp-token', token: '000000' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('verify：tempToken 无效 → 401', async () => {
    seedUser();
    seedUser2fa();
    vi.mocked(verify2faTempToken).mockReturnValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { tempToken: 'bad-temp-token', token: generateTOTP(TEST_SECRET) },
    });
    expect(res.statusCode).toBe(401);
  });

  it('verify：未启用 2FA 却调用 → 400', async () => {
    seedUser();
    // 不写 user_2fa 行

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { tempToken: 'mock-temp-token', token: generateTOTP(TEST_SECRET) },
    });
    expect(res.statusCode).toBe(400);
  });

  it('verify：正确备用码 → 发 JWT 且该备用码被移除', async () => {
    seedUser();
    const { codes, hashes } = generateBackupCodes(3);
    seedUser2fa({ totpSecret: TEST_SECRET, totpEnabled: true, backupCodes: hashes });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { tempToken: 'mock-temp-token', backupCode: codes[1] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBe('mock-access-token');

    // user_2fa 更新：backupCodes 移除已使用的哈希（保留其余）
    const twoFaUpdate = dbState.updates.find((u) => u.table === dbState.schema.user2fa && u.set.backupCodes);
    expect(twoFaUpdate).toBeDefined();
    expect(twoFaUpdate!.set.backupCodes).toEqual([hashes[0], hashes[2]]);
    expect(twoFaUpdate!.set.backupCodes).not.toContain(hashes[1]);
  });

  it('verify：错误备用码 → 401', async () => {
    seedUser();
    const { hashes } = generateBackupCodes(2);
    seedUser2fa({ totpSecret: TEST_SECRET, totpEnabled: true, backupCodes: hashes });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/verify',
      payload: { tempToken: 'mock-temp-token', backupCode: 'ZZZZ-ZZZZ-ZZZZ' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('disable：正确 TOTP → 关闭 2FA', async () => {
    seedUser();
    seedUser2fa({ totpSecret: TEST_SECRET, totpEnabled: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/disable',
      headers: AUTH_HEADERS,
      payload: { token: generateTOTP(TEST_SECRET) },
    });
    expect(res.statusCode).toBe(200);

    // user_2fa.totpEnabled=false
    const twoFaUpdate = dbState.updates.find((u) => u.table === dbState.schema.user2fa);
    expect(twoFaUpdate).toBeDefined();
    expect(twoFaUpdate!.set.totpEnabled).toBe(false);
    // users.twoFactorEnabled='0'
    const userUpdate = dbState.updates.find((u) => u.table === dbState.schema.users);
    expect(userUpdate).toBeDefined();
    expect(userUpdate!.set.twoFactorEnabled).toBe('0');
  });

  it('disable：正确备用码 → 关闭 2FA', async () => {
    seedUser();
    const { codes, hashes } = generateBackupCodes(2);
    seedUser2fa({ totpSecret: TEST_SECRET, totpEnabled: true, backupCodes: hashes });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/disable',
      headers: AUTH_HEADERS,
      payload: { backupCode: codes[0] },
    });
    expect(res.statusCode).toBe(200);
    const twoFaUpdate = dbState.updates.find((u) => u.table === dbState.schema.user2fa);
    expect(twoFaUpdate).toBeDefined();
    expect(twoFaUpdate!.set.totpEnabled).toBe(false);
  });

  it('disable：错误 TOTP → 400', async () => {
    seedUser();
    seedUser2fa({ totpSecret: TEST_SECRET, totpEnabled: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/disable',
      headers: AUTH_HEADERS,
      payload: { token: '000000' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('disable：未启用 2FA → 400', async () => {
    seedUser();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/2fa/disable',
      headers: AUTH_HEADERS,
      payload: { token: generateTOTP(TEST_SECRET) },
    });
    expect(res.statusCode).toBe(400);
  });
});
