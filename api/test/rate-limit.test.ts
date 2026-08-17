/**
 * 四级限流（P0-2）测试 — effective 纯函数 + enforcer 核心 + 与 @fastify/rate-limit 共存
 *
 * 纯单测风格（对齐 user-groups.test.ts / openai-compat.test.ts）：
 * - mock ../src/db（链式 builder，按表返回行）与 ../src/lib/redis（内存计数）
 * - 不依赖真实 PG / Redis / 网络
 *
 * 覆盖（docs/iteration-plan-v2.md P0-2 测试要求）：
 *  - effective 纯函数：min(例外 ?? 组默认 ?? 平台默认, 硬顶) 各分支
 *  - isExceptionActive：status/period/start/end 区间判定（含过期 range 例外）
 *  - estimateRequestTokens：token 权重粗估
 *  - enforcer：模型超 cap_tpm → 429（截断）；客户例外放宽；过期例外不生效；
 *    分组 QPS/TPM 生效；Redis 不可用/异常 → 静默放行
 *  - 与 @fastify/rate-limit 共存：两者独立计数（fastify Key 60/min 先触发、
 *    enforcer 模型 cap_rpm 先触发，互不覆盖）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  userGroupMemberships,
  userGroups,
  users,
  modelRateLimits,
  quotaExceptionRules,
  systemConfig,
} from '../src/db/schema';
import { RateLimitError } from '../src/lib/errors';
import {
  computeEffectiveLimit,
  computeEffectiveLimits,
  isExceptionActive,
  estimateRequestTokens,
  enforceRateLimit,
  enforceRateLimitPreHandler,
} from '../src/services/rate-limit';

// ============================================================
// Mocks（vi.hoisted 保证 vi.mock factory 可引用）
// ============================================================

const { dbMock, dbState, redisMocks } = vi.hoisted(() => {
  /* ── DB 链式 builder（select/insert/update/delete 均返回可 await 的 chain）── */
  const dbState = {
    schema: null as any,
    rows: new Map<any, any[]>(),
  };

  function makeChain(table: any = null, shape: any = null) {
    const state: any = { table, shape };
    const chain: any = {
      from: (t: any) => { state.table = t; return chain; },
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      groupBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      set: () => chain,
      values: () => chain,
      returning: () => chain,
      onConflictDoNothing: () => chain,
      onConflictDoUpdate: () => chain,
    };
    chain.then = (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) =>
      Promise.resolve(compute(state)).then(onFulfilled, onRejected);
    return chain;
  }

  function compute(state: any): any[] {
    const rows = dbState.rows.get(state.table) ?? [];
    if (state.shape && 'count' in state.shape) return [{ count: rows.length }];
    return rows;
  }

  const dbMock: any = {
    select: vi.fn((shape: any = {}) => makeChain(null, shape)),
    insert: vi.fn((t: any) => makeChain(t)),
    update: vi.fn((t: any) => makeChain(t)),
    delete: vi.fn((t: any) => makeChain(t)),
    transaction: vi.fn((fn: any) => fn(dbMock)),
    execute: vi.fn(async () => []),
  };

  /* ── Redis 内存 mock：multi(incr/incrby/pexpire) → exec 落地到 store ── */
  const store = new Map<string, number>();
  function buildMulti() {
    const ops: Array<{ type: 'incr' | 'incrby' | 'pexpire'; key: string; value?: number }> = [];
    const multi: any = {
      incr: (k: string) => { ops.push({ type: 'incr', key: k }); return multi; },
      incrby: (k: string, v: number) => { ops.push({ type: 'incrby', key: k, value: v }); return multi; },
      pexpire: (k: string) => { ops.push({ type: 'pexpire', key: k }); return multi; },
      exec: async () => {
        const results: Array<[Error | null, number]> = [];
        for (const op of ops) {
          if (op.type === 'incr' || op.type === 'incrby') {
            const cur = store.get(op.key) ?? 0;
            const next = op.type === 'incr' ? cur + 1 : cur + (op.value ?? 0);
            store.set(op.key, next);
            results.push([null, next]);
          } else {
            results.push([null, 1]);
          }
        }
        return results;
      },
    };
    return multi;
  }

  const client: any = { multi: buildMulti };
  const getRedis = vi.fn(() => client);

  const redisMocks = {
    store,
    client,
    getRedis,
    /** 恢复默认内存客户端并清空计数（beforeEach 调用） */
    reset() {
      store.clear();
      client.multi = buildMulti;
      getRedis.mockImplementation(() => client);
    },
  };

  return { dbMock, dbState, redisMocks };
});

vi.mock('../src/db', async (importOriginal) => {
  const actual = await (importOriginal as () => Promise<typeof import('../src/db')>)();
  dbState.schema = actual.schema; // 保留真实 schema，供 eq()/and() 构建条件
  return { ...actual, db: dbMock };
});

vi.mock('../src/lib/redis', () => ({
  getRedis: redisMocks.getRedis,
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => {}),
  cacheDel: vi.fn(async () => {}),
}));

// ============================================================
// Fixtures
// ============================================================

/** 分组行夹具（覆盖 groups.getUserGroup select 全部字段） */
function makeGroup(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: 'group',
    description: null,
    pricingGroup: null,
    rateLimitQps: null,
    rateLimitTpm: null,
    dailyQuota: null,
    modelWhitelist: [],
    isDefault: false,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const PERSONAL_CONFIG = [
  { key: 'personal_rpm', value: '60' },
  { key: 'personal_tpm', value: '200000' },
];

/** 设置某表的查询返回行（mock 不按 where 过滤，行序即返回序） */
function setRows(table: any, rows: any[]) {
  dbState.rows.set(table, rows);
}

/** Redis store 中按前缀求和（窗口桶可能跨分钟，需聚合） */
function sumByPrefix(prefix: string): number {
  let sum = 0;
  for (const [k, v] of redisMocks.store) {
    if (k.startsWith(prefix)) sum += v;
  }
  return sum;
}

/** 相对今天的日期字符串（YYYY-MM-DD），用于构造过期/未来的 range 例外 */
function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

beforeEach(() => {
  dbState.rows = new Map();
  redisMocks.reset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// 1. effective 纯函数
// ============================================================

describe('computeEffectiveLimit — min(例外 ?? 组默认 ?? 平台默认, 硬顶)', () => {
  it('有例外 → 例外生效（min(例外, 硬顶)）', () => {
    expect(computeEffectiveLimit({ hardCap: 100, groupDefault: 5, exception: 10, platformDefault: 60 })).toBe(10);
  });

  it('无例外 → 回退组默认', () => {
    expect(computeEffectiveLimit({ hardCap: 100, groupDefault: 5, exception: null, platformDefault: 60 })).toBe(5);
  });

  it('无例外且组默认空 → 回退平台默认', () => {
    expect(computeEffectiveLimit({ hardCap: 100, groupDefault: null, exception: null, platformDefault: 60 })).toBe(60);
  });

  it('硬顶为空 → 取基础值', () => {
    expect(computeEffectiveLimit({ hardCap: null, groupDefault: 5, exception: 10, platformDefault: 60 })).toBe(10);
  });

  it('硬顶截断：例外高于硬顶 → 取硬顶', () => {
    expect(computeEffectiveLimit({ hardCap: 3, groupDefault: 5, exception: 10, platformDefault: 60 })).toBe(3);
  });

  it('仅有硬顶 → 取硬顶', () => {
    expect(computeEffectiveLimit({ hardCap: 42, groupDefault: null, exception: null, platformDefault: null })).toBe(42);
  });

  it('全空 → null（不限制）', () => {
    expect(computeEffectiveLimit({ hardCap: null, groupDefault: null, exception: null, platformDefault: null })).toBeNull();
  });
});

describe('computeEffectiveLimits — RPM/TPM 双维度独立计算', () => {
  it('rpm/tpm 分别套用 min(例外 ?? 组默认 ?? 平台默认, 硬顶)', () => {
    const r = computeEffectiveLimits({
      capRpm: 100, capTpm: 50,
      groupQps: 10, groupTpm: 20,
      exceptionRpm: null, exceptionTpm: null,
      platformRpm: 60, platformTpm: 200000,
    });
    expect(r).toEqual({ rpm: 10, tpm: 20 });
  });

  it('例外交替生效：RPM 走例外、TPM 走硬顶截断', () => {
    const r = computeEffectiveLimits({
      capRpm: 100, capTpm: 30,
      groupQps: null, groupTpm: null,
      exceptionRpm: 200, exceptionTpm: null,
      platformRpm: 60, platformTpm: 200000,
    });
    expect(r).toEqual({ rpm: 100, tpm: 30 });
  });
});

// ============================================================
// 2. isExceptionActive
// ============================================================

describe('isExceptionActive — 例外有效性（仅 active + forever / range 区间内）', () => {
  const NOW = new Date('2026-08-17T12:00:00');

  it('status=active + period=forever → 生效', () => {
    expect(isExceptionActive({ status: 'active', period: 'forever', startDate: null, endDate: null }, NOW)).toBe(true);
  });

  it('status=stopped → 不生效', () => {
    expect(isExceptionActive({ status: 'stopped', period: 'forever', startDate: null, endDate: null }, NOW)).toBe(false);
  });

  it('range 且 now 在 [start, end] 区间内 → 生效（end 按当天 23:59:59.999）', () => {
    expect(isExceptionActive({ status: 'active', period: 'range', startDate: '2026-08-17', endDate: '2026-08-17' }, NOW)).toBe(true);
    expect(isExceptionActive({ status: 'active', period: 'range', startDate: '2026-08-10', endDate: '2026-08-17' }, NOW)).toBe(true);
  });

  it('过期的 range 例外（end_date 已过）→ 不生效', () => {
    expect(isExceptionActive({ status: 'active', period: 'range', startDate: '2026-08-01', endDate: '2026-08-16' }, NOW)).toBe(false);
  });

  it('range 且 start_date 未到 → 不生效', () => {
    expect(isExceptionActive({ status: 'active', period: 'range', startDate: '2026-08-18', endDate: '2026-08-30' }, NOW)).toBe(false);
  });

  it('range 缺起止日期 / 未知 period → 不生效', () => {
    expect(isExceptionActive({ status: 'active', period: 'range', startDate: null, endDate: '2026-08-17' }, NOW)).toBe(false);
    expect(isExceptionActive({ status: 'active', period: 'monthly', startDate: null, endDate: null }, NOW)).toBe(false);
  });
});

// ============================================================
// 3. estimateRequestTokens
// ============================================================

describe('estimateRequestTokens — token 权重粗估', () => {
  it('按 4 字符 ≈ 1 token 估算，且叠加 max_tokens 输出上限', () => {
    const body = { model: 'gpt-4o', messages: [{ role: 'user', content: 'A'.repeat(120) }], max_tokens: 100 };
    const chars = 'gpt-4o' + 'user' + 'A'.repeat(120);
    expect(estimateRequestTokens(body)).toBe(Math.ceil(chars.length / 4) + 100);
  });

  it('非法/空 body → 至少 1', () => {
    expect(estimateRequestTokens(null)).toBe(1);
    expect(estimateRequestTokens(42)).toBe(1);
    expect(estimateRequestTokens({})).toBe(1);
  });
});

// ============================================================
// 4. enforcer 核心（mock DB + Redis）
// ============================================================

describe('enforceRateLimit — 模型超 cap_tpm → 429（截断）', () => {
  it('两次请求累计 token 超硬顶 → 第二次抛 RateLimitError', async () => {
    setRows(userGroupMemberships, []);
    setRows(userGroups, []);
    setRows(users, [{ id: 10, customerType: 'personal' }]);
    setRows(modelRateLimits, [{ capRpm: null, capTpm: 30 }]);
    setRows(quotaExceptionRules, []);
    setRows(systemConfig, PERSONAL_CONFIG);

    const ctx = { userId: 10, model: 'm-cap-tpm', tokens: 30 };
    await expect(enforceRateLimit(ctx)).resolves.toBeUndefined(); // 30 ≤ 30 放行
    await expect(enforceRateLimit(ctx)).rejects.toThrow(RateLimitError); // 60 > 30 截断
    await expect(enforceRateLimit(ctx)).rejects.toMatchObject({ statusCode: 429 });
  });
});

describe('enforceRateLimit — 客户例外生效（模型级上限放宽）', () => {
  it('例外客户（无 qps 分组）3 次放行；无例外客户（qps=1 分组）第 2 次 429', async () => {
    // U4：无 qps 分组 + 例外 rpm=10 + 硬顶 100 → effective = min(10, 100) = 10
    setRows(userGroupMemberships, [{ id: 1, userId: 4, groupId: 2, createdAt: new Date() }]);
    setRows(userGroups, [makeGroup({ id: 2, name: 'noqps' })]);
    setRows(users, [{ id: 4, customerType: 'personal' }]);
    setRows(modelRateLimits, [{ capRpm: 100, capTpm: null }]);
    setRows(quotaExceptionRules, [{
      rpm: 10, tpm: null, period: 'forever', startDate: null, endDate: null, status: 'active',
    }]);
    setRows(systemConfig, PERSONAL_CONFIG);

    const ctx4 = { userId: 4, model: 'm-ex', tokens: 1 };
    await expect(enforceRateLimit(ctx4)).resolves.toBeUndefined();
    await expect(enforceRateLimit(ctx4)).resolves.toBeUndefined();
    await expect(enforceRateLimit(ctx4)).resolves.toBeUndefined(); // 3 次都放行（10 > 3）

    // U5：同一模型、无例外、qps=1 分组 → effective = min(1, 100) = 1 → 第 2 次超限
    setRows(userGroupMemberships, [{ id: 2, userId: 5, groupId: 3, createdAt: new Date() }]);
    setRows(userGroups, [makeGroup({ id: 3, name: 'qps1', rateLimitQps: 1 })]);
    setRows(users, [{ id: 5, customerType: 'personal' }]);
    setRows(quotaExceptionRules, []);

    const ctx5 = { userId: 5, model: 'm-ex', tokens: 1 };
    await expect(enforceRateLimit(ctx5)).resolves.toBeUndefined();
    await expect(enforceRateLimit(ctx5)).rejects.toThrow(RateLimitError);
  });
});

describe('enforceRateLimit — 过期的 range 例外不生效', () => {
  it('过期例外（end_date 已过）→ 不参与生效值；active forever 例外正常生效', async () => {
    // U6：无分组 + 过期 range 例外 tpm=10 + 硬顶 100000 → effective = 100000（例外被忽略）
    setRows(userGroupMemberships, []);
    setRows(userGroups, []);
    setRows(users, [{ id: 6, customerType: 'personal' }]);
    setRows(modelRateLimits, [{ capRpm: null, capTpm: 100000 }]);
    setRows(quotaExceptionRules, [{
      rpm: null, tpm: 10, period: 'range',
      startDate: dateOffset(-10), endDate: dateOffset(-1), status: 'active',
    }]);
    setRows(systemConfig, PERSONAL_CONFIG);

    const ctx6 = { userId: 6, model: 'm-exp', tokens: 4 };
    await expect(enforceRateLimit(ctx6)).resolves.toBeUndefined(); // 4 ≤ 100000
    await expect(enforceRateLimit(ctx6)).resolves.toBeUndefined(); // 8 ≤ 100000
    // 若过期例外生效（tpm=10），第 3 次累计 12 > 10 早已 429；此处应放行
    await expect(enforceRateLimit(ctx6)).resolves.toBeUndefined();

    // 对照组 U7：同一模型，active forever 例外 tpm=10 → effective = 10 → 第 3 次超限
    setRows(users, [{ id: 7, customerType: 'personal' }]);
    setRows(quotaExceptionRules, [{
      rpm: null, tpm: 10, period: 'forever', startDate: null, endDate: null, status: 'active',
    }]);

    const ctx7 = { userId: 7, model: 'm-exp', tokens: 4 };
    await expect(enforceRateLimit(ctx7)).resolves.toBeUndefined(); // 4 ≤ 10
    await expect(enforceRateLimit(ctx7)).resolves.toBeUndefined(); // 8 ≤ 10
    await expect(enforceRateLimit(ctx7)).rejects.toThrow(RateLimitError); // 12 > 10
  });

  it('status=stopped 的例外 → 不生效（同上，走平台默认）', async () => {
    setRows(userGroupMemberships, []);
    setRows(userGroups, []);
    setRows(users, [{ id: 11, customerType: 'personal' }]);
    setRows(modelRateLimits, [{ capRpm: null, capTpm: 100000 }]);
    setRows(quotaExceptionRules, [{
      rpm: null, tpm: 10, period: 'forever', startDate: null, endDate: null, status: 'stopped',
    }]);
    setRows(systemConfig, PERSONAL_CONFIG);

    const ctx = { userId: 11, model: 'm-stopped', tokens: 4 };
    await expect(enforceRateLimit(ctx)).resolves.toBeUndefined();
    await expect(enforceRateLimit(ctx)).resolves.toBeUndefined();
    await expect(enforceRateLimit(ctx)).resolves.toBeUndefined(); // 例外停用 → 12 ≤ 100000 放行
  });
});

describe('enforceRateLimit — 分组 QPS / TPM 生效', () => {
  it('分组 QPS：per-user 计数，跨模型也累计（换模型第 2 次仍 429）', async () => {
    setRows(userGroupMemberships, [{ id: 1, userId: 8, groupId: 3, createdAt: new Date() }]);
    setRows(userGroups, [makeGroup({ id: 3, name: 'qps1', rateLimitQps: 1 })]);
    setRows(users, [{ id: 8, customerType: 'personal' }]);
    setRows(modelRateLimits, []);
    setRows(quotaExceptionRules, []);
    setRows(systemConfig, PERSONAL_CONFIG);

    const ctxA = { userId: 8, model: 'm-a', tokens: 1 };
    const ctxB = { userId: 8, model: 'm-b', tokens: 1 };
    await expect(enforceRateLimit(ctxA)).resolves.toBeUndefined(); // QPS 1
    // 换模型：模型级计数独立（m-b 计数 1 ≤ 1），但 per-user QPS 累计 2 > 1 → 429
    await expect(enforceRateLimit(ctxB)).rejects.toThrow(RateLimitError);
  });

  it('分组 TPM：per-user token 累计超限 → 429', async () => {
    setRows(userGroupMemberships, [{ id: 1, userId: 9, groupId: 4, createdAt: new Date() }]);
    setRows(userGroups, [makeGroup({ id: 4, name: 'tpm', rateLimitQps: null, rateLimitTpm: 50 })]);
    setRows(users, [{ id: 9, customerType: 'personal' }]);
    setRows(modelRateLimits, []);
    setRows(quotaExceptionRules, []);
    setRows(systemConfig, PERSONAL_CONFIG);

    const ctx = { userId: 9, model: 'm', tokens: 30 };
    await expect(enforceRateLimit(ctx)).resolves.toBeUndefined(); // 30 ≤ 50
    await expect(enforceRateLimit(ctx)).rejects.toThrow(RateLimitError); // 60 > 50
  });
});

describe('enforceRateLimit — Redis 降级（fail-open）', () => {
  it('Redis 不可用（getRedis → null）→ 静默放行，即使配置了严格限额', async () => {
    setRows(userGroupMemberships, [{ id: 1, userId: 1, groupId: 3, createdAt: new Date() }]);
    setRows(userGroups, [makeGroup({ id: 3, name: 'qps1', rateLimitQps: 1 })]);
    setRows(users, [{ id: 1, customerType: 'personal' }]);
    setRows(modelRateLimits, [{ capRpm: 1, capTpm: null }]);
    setRows(quotaExceptionRules, []);
    setRows(systemConfig, PERSONAL_CONFIG);

    redisMocks.getRedis.mockReturnValue(null);
    const ctx = { userId: 1, model: 'm', tokens: 1 };
    await expect(enforceRateLimit(ctx)).resolves.toBeUndefined();
    await expect(enforceRateLimit(ctx)).resolves.toBeUndefined(); // 多次都不阻断
  });

  it('Redis 命令异常（multi.exec 抛错）→ 静默放行', async () => {
    setRows(userGroupMemberships, []);
    setRows(userGroups, []);
    setRows(users, [{ id: 2, customerType: 'personal' }]);
    setRows(modelRateLimits, [{ capRpm: 1, capTpm: null }]);
    setRows(quotaExceptionRules, []);
    setRows(systemConfig, PERSONAL_CONFIG);

    // 让 multi().exec() 直接抛错，模拟 Redis 故障
    const brokenMulti: any = {
      incr: () => brokenMulti,
      incrby: () => brokenMulti,
      pexpire: () => brokenMulti,
      exec: vi.fn(async () => { throw new Error('redis connection lost'); }),
    };
    redisMocks.client.multi = vi.fn(() => brokenMulti);

    const ctx = { userId: 2, model: 'm', tokens: 1 };
    await expect(enforceRateLimit(ctx)).resolves.toBeUndefined();
    await expect(enforceRateLimit(ctx)).resolves.toBeUndefined();
  });

  it('缺 userId / 缺 model → 跳过（不查询、不计数）', async () => {
    setRows(userGroupMemberships, []);
    setRows(userGroups, []);
    await expect(enforceRateLimit({ userId: 0, model: 'm', tokens: 1 })).resolves.toBeUndefined();
    await expect(enforceRateLimit({ userId: 1, model: '', tokens: 1 })).resolves.toBeUndefined();
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});

// ============================================================
// 5. 与 @fastify/rate-limit 共存（最小 Fastify 网关）
// ============================================================

describe('与 @fastify/rate-limit 共存 — 两者独立计数，不互相覆盖', () => {
  /** 最小网关：全局 600/min + 路由 Key 60/min + [apiKeyAuth, enforceRateLimitPreHandler] */
  async function buildGateway(userId: number): Promise<FastifyInstance> {
    const app = Fastify();
    await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
    app.post('/v1/chat/completions', {
      preHandler: [
        // 模拟 apiKeyAuth：直接注入鉴权上下文（绕过真实 DB 校验）
        async (request: any) => {
          request.apiKeyContext = { userId, apiKeyId: userId * 10, keyHash: `kh-${userId}` };
        },
        enforceRateLimitPreHandler,
      ],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
          keyGenerator: (req: any) => req.apiKeyContext?.keyHash || req.ip,
        },
      },
    }, async () => ({ ok: true }));
    await app.ready();
    return app;
  }

  it('Key 超 RPM → 429（fastify 层先触发；enforcer 企业默认 300 独立计数不冲突）', async () => {
    // 企业用户：平台默认 300 RPM → enforcer 61 次不超限；fastify Key 60/min → 第 61 次 429
    setRows(userGroupMemberships, []);
    setRows(userGroups, []);
    setRows(users, [{ id: 1, customerType: 'enterprise' }]);
    setRows(modelRateLimits, []);
    setRows(quotaExceptionRules, []);
    setRows(systemConfig, [
      { key: 'enterprise_rpm', value: '300' },
      { key: 'enterprise_tpm', value: '1000000' },
    ]);

    const app = await buildGateway(1);
    try {
      let last: any;
      for (let i = 0; i < 61; i++) {
        last = await app.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          headers: { authorization: 'Bearer sk-key-rpm' },
          payload: { model: 'm-key-rpm', messages: [{ role: 'user', content: 'hi' }] },
        });
      }
      expect(last.statusCode).toBe(429);
      // fastify 默认 429 格式：{ statusCode, error: 'Too Many Requests', message }
      expect(last.json().error).toBe('Too Many Requests');
      // enforcer 独立计数：fastify 的 onRequest 门在 preHandler 之前，第 61 次未进入 enforcer，
      // 因此 enforcer 恰好计入前 60 次（企业 300 未超限 → 未拦截）——两层互不覆盖
      expect(sumByPrefix('rl:rpm:u1:mm-key-rpm:')).toBe(60);
    } finally {
      await app.close();
    }
  });

  it('模型 cap_rpm 超限 → 429（enforcer 层先触发；fastify Key 60/min 未到）', async () => {
    // 个人用户 + cap_rpm=5 → effective = min(60, 5) = 5 → 第 6 次 enforcer 429
    setRows(userGroupMemberships, []);
    setRows(userGroups, []);
    setRows(users, [{ id: 2, customerType: 'personal' }]);
    setRows(modelRateLimits, [{ capRpm: 5, capTpm: null }]);
    setRows(quotaExceptionRules, []);
    setRows(systemConfig, PERSONAL_CONFIG);

    const app = await buildGateway(2);
    try {
      let last: any;
      for (let i = 0; i < 6; i++) {
        last = await app.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          headers: { authorization: 'Bearer sk-cap-rpm' },
          payload: { model: 'm-cap-rpm', messages: [{ role: 'user', content: 'hi' }] },
        });
        if (i < 5) expect(last.statusCode).not.toBe(429);
      }
      expect(last.statusCode).toBe(429);
      // enforcer 统一 429 格式：{ error: { type: 'rate_limit_error', code: 429 } }
      expect(last.json().error?.type).toBe('rate_limit_error');
      expect(last.json().error?.code).toBe(429);
    } finally {
      await app.close();
    }
  });
});
