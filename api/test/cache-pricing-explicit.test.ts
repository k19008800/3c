/**
 * 缓存定价与计量 — P0 T1/T2 单元测试（模式开关 + 归一化收敛）
 *
 * P0 范围（docs/P0-缓存定价与缓存计量-开发任务书.md v2.0）：
 * - T1 数据模型与全局配置面：
 *   · getCachePricingMode / invalidateCachePricingCache（ARCH D-13：默认 explicit，Redis 60s + 即时失效）
 *   · admin-settings PUT /api/v1/admin/settings/billing 的 cache_pricing_mode 校验与落库
 *   · 常量（CACHE_PRICING_MODE_CONFIG_KEY / DEFAULT_CACHE_PRICING_MODE）
 * - T2 usage 归一化：
 *   · parseCacheTokens read 优先收敛（D-11：cacheRead + cacheWrite ≤ prompt_tokens）
 *   · Anthropic cache_creation_input_tokens → cacheWriteTokens（D-14）
 *
 * 纯单测风格（mock db / redis / jwt，不依赖真实 PG / Redis）：
 * 参照 test/supplier-ops.test.ts 的 mock 链式 builder 模式。
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
    /** select().from(systemConfig) 的返回值（GET /settings、getCachePricingMode 读取） */
    systemConfigRows: [] as any[],
    /** 非空时 select 抛错（模拟 DB 异常） */
    dbError: null as Error | null,
    /** insert().values().onConflictDoUpdate() 的调用记录（断言 upsert 落库） */
    upserts: [] as Array<{ key: string; value: string }>,
  };

  /** 可 await 的 Drizzle 链式 builder：方法全部返回自身，await 时按表解析结果 */
  function makeChain(resolve: (table: any) => unknown) {
    let table: any;
    const chain: any = {
      from: (t: any) => { table = t; return chain; },
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      groupBy: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      set: () => chain,
      values: (v: any) => { chain.__lastValues = v; return chain; },
      onConflictDoUpdate: (opts: any) => {
        const values = chain.__lastValues ?? {};
        if (values.key !== undefined) {
          dbState.upserts.push({ key: String(values.key), value: String(opts?.set?.value ?? values.value) });
        }
        return chain;
      },
      returning: () => chain,
    };
    chain.then = (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) => {
      if (dbState.dbError) return Promise.reject(dbState.dbError).then(onFulfilled, onRejected);
      const result = table === dbState.schema?.systemConfig ? dbState.systemConfigRows : [];
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };
    return chain;
  }

  const dbMock: any = {
    select: vi.fn(() => makeChain((t: any) => (t === dbState.schema?.systemConfig ? dbState.systemConfigRows : []))),
    update: vi.fn(() => makeChain(() => [])),
    insert: vi.fn(() => makeChain(() => [])),
    delete: vi.fn(() => makeChain(() => [])),
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
  verifyToken: vi.fn(() => ({ userId: 1, email: 'admin@test.com', role: 'admin' })),
}));

vi.mock('../src/lib/redis', () => ({
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => {}),
  cacheDel: vi.fn(async () => {}),
}));

// ─────────────────────────────────────────────
// 被测模块（mock 就绪后 import）
// ─────────────────────────────────────────────

import { cacheGet, cacheDel } from '../src/lib/redis';
import {
  getCachePricingMode,
  invalidateCachePricingCache,
  resolveCachePricing,
  CACHE_PRICING_MODE_CONFIG_KEY,
  DEFAULT_CACHE_PRICING_MODE,
} from '../src/services/billing/cache-discount';
import {
  computeCacheCost,
  computeUsageCost,
  computeStreamCost,
  CACHE_HIT_DISCOUNT,
  STREAM_INCLUDE_USAGE_ENABLED,
} from '../src/services/billing/cache-billing';
import { parseCacheTokens, type CacheTokenInfo } from '../src/services/billing/usage-parser';
import { determineStreamBilling } from '../src/services/billing/settle-stream';
import type { StreamState } from '../src/services/upstream/proxy';
import type { ModelPricing } from '../src/services/billing/pricing';

/** 构造 ModelPricing 测试定价（input=1, output=2 便于心算；D-3：input 即生效输入单价） */
function mp(overrides: Partial<ModelPricing> = {}): ModelPricing {
  return { input: 1, output: 2, cacheDiscountRate: null, cacheReadInputPrice: null, cacheWriteInputPrice: null, ...overrides };
}

// ============================================================
// T1 — 模式开关常量
// ============================================================

describe('缓存计费模式常量（D-13）', () => {
  it('配置键为 billing.cache_pricing_mode', () => {
    expect(CACHE_PRICING_MODE_CONFIG_KEY).toBe('billing.cache_pricing_mode');
  });

  it('默认模式为 explicit（存量无显式价模型自动回退折扣率链，行为不变）', () => {
    expect(DEFAULT_CACHE_PRICING_MODE).toBe('explicit');
  });
});

// ============================================================
// T1 — getCachePricingMode（mock db + redis）
// ============================================================

describe('getCachePricingMode（D-13）', () => {
  beforeEach(() => {
    dbState.systemConfigRows = [];
    dbState.dbError = null;
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.clearAllMocks();
  });

  it('无配置记录 → 默认 explicit', async () => {
    dbState.systemConfigRows = [];
    expect(await getCachePricingMode()).toBe('explicit');
  });

  it('DB 配置 discount_rate → 返回 discount_rate', async () => {
    dbState.systemConfigRows = [{ key: CACHE_PRICING_MODE_CONFIG_KEY, value: 'discount_rate' }];
    expect(await getCachePricingMode()).toBe('discount_rate');
  });

  it('Redis 缓存命中 discount_rate → 直接返回（不再查 DB）', async () => {
    vi.mocked(cacheGet).mockResolvedValue('discount_rate');
    dbState.systemConfigRows = []; // 即使 DB 无记录也返回缓存值
    expect(await getCachePricingMode()).toBe('discount_rate');
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('DB 配置非法值（foo）→ 回退默认 explicit', async () => {
    dbState.systemConfigRows = [{ key: CACHE_PRICING_MODE_CONFIG_KEY, value: 'foo' }];
    expect(await getCachePricingMode()).toBe('explicit');
  });

  it('DB 异常 → 默认 explicit（不阻断主链路）', async () => {
    dbState.dbError = new Error('db down');
    expect(await getCachePricingMode()).toBe('explicit');
  });
});

describe('invalidateCachePricingCache（D-13）', () => {
  it('删除模式缓存键 billing:cache_pricing_mode', async () => {
    await invalidateCachePricingCache();
    expect(cacheDel).toHaveBeenCalledWith('billing:cache_pricing_mode');
  });
});

// ============================================================
// T1 — admin-settings PUT /settings/billing 校验（路由级，mock db）
// ============================================================

describe('PUT /api/v1/admin/settings/billing — cache_pricing_mode（T1）', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { adminSettingsRoutes } = await import('../src/routes/admin-settings');
    app = Fastify({ logger: false });
    // 对齐生产 app.ts setErrorHandler 契约：AppError.statusCode → HTTP 状态码
    app.setErrorHandler((err: any, _request, reply) => {
      const status = Number(err?.statusCode) || 500;
      reply.code(status).send({ code: status, message: err?.message ?? 'Internal Server Error' });
    });
    await app.register(adminSettingsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    dbState.systemConfigRows = [];
    dbState.upserts = [];
    dbState.dbError = null;
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const authHeaders = { authorization: 'Bearer test-admin-token' };

  it('合法值 discount_rate → 200 + system_config upsert 落库', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/billing',
      headers: authHeaders,
      payload: { 'billing.cache_pricing_mode': 'discount_rate' },
    });
    expect(res.statusCode).toBe(200);
    expect(dbState.upserts).toContainEqual({ key: 'billing.cache_pricing_mode', value: 'discount_rate' });
  });

  it('合法值 explicit → 200', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/billing',
      headers: authHeaders,
      payload: { 'billing.cache_pricing_mode': 'explicit' },
    });
    expect(res.statusCode).toBe(200);
    expect(dbState.upserts).toContainEqual({ key: 'billing.cache_pricing_mode', value: 'explicit' });
  });

  it('非法值 foo → 400 ValidationError', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/billing',
      headers: authHeaders,
      payload: { 'billing.cache_pricing_mode': 'foo' },
    });
    expect(res.statusCode).toBe(400);
    expect(dbState.upserts).not.toContainEqual({ key: 'billing.cache_pricing_mode', value: 'foo' });
  });

  it('非法值空字符串 → 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/billing',
      headers: authHeaders,
      payload: { 'billing.cache_pricing_mode': '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('无 admin token → 401', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/billing',
      payload: { 'billing.cache_pricing_mode': 'discount_rate' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ============================================================
// T2 — parseCacheTokens 收敛（D-11，纯函数）
// ============================================================

describe('parseCacheTokens — read 优先收敛（D-11）', () => {
  it('read + write 合计 > prompt_tokens → 优先保留 read，write 收敛到 prompt − read', () => {
    // 物理序上 read 更可信（先写入缓存才可能命中读取）；read 价通常更低，保留 read 对用户有利
    const result = parseCacheTokens({
      prompt_tokens: 1000,
      cache_read_input_tokens: 800,
      cache_creation_input_tokens: 600, // 800 + 600 = 1400 > 1000
    });
    expect(result.cacheHitTokens).toBe(800); // read 保留
    expect(result.cacheWriteTokens).toBe(200); // 1000 − 800
    expect(result.cacheMissTokens).toBe(0);
    expect(result.hasCacheInfo).toBe(true);
  });

  it('read 单独超过 prompt_tokens → read 收敛到 prompt，write = 0', () => {
    const result = parseCacheTokens({
      prompt_tokens: 100,
      cache_read_input_tokens: 150,
    });
    expect(result.cacheHitTokens).toBe(100);
    expect(result.cacheWriteTokens).toBe(0);
    expect(result.cacheMissTokens).toBe(0);
  });

  it('DeepSeek hit 超过 prompt_tokens → 收敛到 prompt（回归）', () => {
    const result = parseCacheTokens({
      prompt_tokens: 100,
      prompt_cache_hit_tokens: 150,
      prompt_cache_miss_tokens: 0,
    });
    expect(result.cacheHitTokens).toBe(100);
    expect(result.cacheWriteTokens).toBe(0);
  });

  it('OpenAI cached_tokens 超过 prompt_tokens → 收敛到 prompt', () => {
    const result = parseCacheTokens({
      prompt_tokens: 100,
      prompt_tokens_details: { cached_tokens: 120 },
    });
    expect(result.cacheHitTokens).toBe(100);
    expect(result.cacheMissTokens).toBe(0);
  });

  it('read + write 合计 ≤ prompt_tokens → 原样采信', () => {
    const result = parseCacheTokens({
      prompt_tokens: 1500,
      cache_read_input_tokens: 1200,
      cache_creation_input_tokens: 200,
    });
    expect(result.cacheHitTokens).toBe(1200);
    expect(result.cacheWriteTokens).toBe(200);
    expect(result.cacheMissTokens).toBe(100); // 1500 − 1200 − 200
  });
});

describe('parseCacheTokens — Anthropic creation → cacheWriteTokens（D-14）', () => {
  it('仅 cache_creation → hasCacheInfo=true、cacheWriteTokens 提取', () => {
    const result = parseCacheTokens({
      prompt_tokens: 1000,
      cache_creation_input_tokens: 900,
    });
    expect(result.hasCacheInfo).toBe(true); // 方案 §5 刻意行为变更（旧版 false）
    expect(result.cacheHitTokens).toBe(0);
    expect(result.cacheWriteTokens).toBe(900);
    expect(result.cacheMissTokens).toBe(100);
  });
});

// ============================================================
// T3 — resolveCachePricing（D-10 4 级优先级 / D-3 生效 input / D-4 来源标识）
// ============================================================

describe('resolveCachePricing — 读取价 4 级优先级（D-10）', () => {
  it('级 2 显式读取价优先（source=explicit）', async () => {
    const r = await resolveCachePricing(mp({ cacheReadInputPrice: 0.05 }), { mode: 'explicit', globalRate: 0.2 });
    expect(r.cacheReadPrice).toBe(0.05);
    expect(r.source).toBe('explicit');
  });

  it('显式缺失 → 级 3 模型级折扣率 = 生效 input × rate（source=discount_rate）', async () => {
    const r = await resolveCachePricing(mp({ cacheDiscountRate: 0.5 }), { mode: 'explicit', globalRate: 0.2 });
    expect(r.cacheReadPrice).toBe(1 * 0.5);
    expect(r.source).toBe('discount_rate');
  });

  it('级 3 缺失 → 级 4 全局折扣率 = 生效 input × globalRate（source=global_discount）', async () => {
    const r = await resolveCachePricing(mp(), { mode: 'explicit', globalRate: 0.2 });
    expect(r.cacheReadPrice).toBe(1 * 0.2);
    expect(r.source).toBe('global_discount');
  });

  it('全部缺失 → 级 5 代码兜底 = 生效 input × CACHE_HIT_DISCOUNT（source=fallback）', async () => {
    const r = await resolveCachePricing(mp(), { mode: 'explicit', globalRate: 0 }); // 全局非法 → 兜底
    expect(r.cacheReadPrice).toBe(1 * CACHE_HIT_DISCOUNT);
    expect(r.source).toBe('fallback');
  });

  it('显式读取价为 0（免费读缓存）→ 合法，source=explicit（T6 校验口径 ≥0）', async () => {
    const r = await resolveCachePricing(mp({ cacheReadInputPrice: 0 }), { mode: 'explicit', globalRate: 0.2 });
    expect(r.cacheReadPrice).toBe(0);
    expect(r.source).toBe('explicit');
  });

  it('D-3 生效 input 语义：pricing.input 为折扣后价 → 折扣率回退以生效 input 为基准（非 L1 原始价）', async () => {
    // 模拟 L3 代理折扣后的最终 input=0.0015（input 即请求最终生效输入单价）
    const r = await resolveCachePricing(mp({ input: 0.0015, cacheDiscountRate: 0.1 }), { mode: 'explicit', globalRate: 0.2 });
    expect(r.cacheReadPrice).toBeCloseTo(0.0015 * 0.1, 12); // 级 3 优先于全局
    expect(r.source).toBe('discount_rate');
  });

  it('pricing 为 null → 读取走全局/兜底、写入 = 默认 input 全价', async () => {
    const r = await resolveCachePricing(null, { mode: 'explicit', globalRate: 0.2 });
    expect(r.cacheReadPrice).toBeCloseTo(0.002 * 0.2, 12); // DEFAULT_INPUT_PRICE × 全局折扣率
    expect(r.source).toBe('global_discount');
    expect(r.cacheWritePrice).toBe(0.002); // DEFAULT_INPUT_PRICE 全价
    expect(r.cacheWritePriceSource).toBe('full_price');
  });
});

describe('resolveCachePricing — 写入价（D-3/D-4 + product Q3 裁定）', () => {
  it('显式写入价存在 → 用之，cacheWritePriceSource=explicit（D-4）', async () => {
    const r = await resolveCachePricing(mp({ cacheWriteInputPrice: 0.3 }), { mode: 'explicit', globalRate: 0.2 });
    expect(r.cacheWritePrice).toBe(0.3);
    expect(r.cacheWritePriceSource).toBe('explicit');
  });

  it('写入价缺失 → 生效 input 全价，cacheWritePriceSource=full_price（D-3）', async () => {
    const r = await resolveCachePricing(mp(), { mode: 'explicit', globalRate: 0.2 });
    expect(r.cacheWritePrice).toBe(1);
    expect(r.cacheWritePriceSource).toBe('full_price');
  });

  it('显式写入价 > 输入价 → 无上限校验、按实际值（product Q3 裁定，PRD v1.1 §5.4）', async () => {
    const r = await resolveCachePricing(mp({ input: 1, cacheWriteInputPrice: 3 }), { mode: 'explicit', globalRate: 0.2 });
    expect(r.cacheWritePrice).toBe(3); // 写入溢价合法
    expect(r.cacheWritePriceSource).toBe('explicit');
  });

  it('mode=discount_rate → 读取跳过显式走折扣率链、写入强制 input 全价（与旧版一致，D-13）', async () => {
    const r = await resolveCachePricing(mp({ cacheReadInputPrice: 0.05, cacheWriteInputPrice: 0.3 }), { mode: 'discount_rate', globalRate: 0.2 });
    expect(r.cacheReadPrice).toBe(1 * 0.2); // 跳过显式（级 2），走全局折扣率
    expect(r.source).toBe('global_discount');
    expect(r.cacheWritePrice).toBe(1); // 强制全价，不读显式写入价
    expect(r.cacheWritePriceSource).toBe('full_price');
  });
});

// ============================================================
// T4 — computeCacheCost（显式价公式，D-1/D-3/D-11 + product Q3 裁定）
// ============================================================

describe('computeCacheCost — 显式价公式（方案 §6）', () => {
  const cache = { cacheHitTokens: 1200, cacheWriteTokens: 200, cacheMissTokens: 100, hasCacheInfo: true };

  it('read×读取价 + write×写入价 + miss×输入价 + 输出×输出价（手算对照）', () => {
    const result = computeCacheCost(1500, 100, mp(), cache, 0.5, 0.8);
    // cacheHitCost = 1200/1000×0.5 = 0.6；cacheWriteCost = 200/1000×0.8 = 0.16
    // miss = 100/1000×1 = 0.1；输出 = 100/1000×2 = 0.2 → cost = 1.06
    expect(result.cacheHitCost).toBeCloseTo(0.6, 8);
    expect(result.cacheWriteCost).toBeCloseTo(0.16, 8);
    expect(result.cost).toBeCloseTo(1.06, 8);
    // fullCost = 1500/1000×1 + 0.2 = 1.7 → discount = 0.64
    expect(result.discountAmount).toBeCloseTo(0.64, 8);
    expect(result.cacheHitTokens).toBe(1200);
    expect(result.cacheWriteTokens).toBe(200);
    expect(result.cacheMissTokens).toBe(100);
  });

  it('命中>输入收敛（D-11 双保险）：read+write 超 prompt → read 保留、write 收敛', () => {
    const result = computeCacheCost(100, 0, mp(), { cacheHitTokens: 150, cacheWriteTokens: 50, cacheMissTokens: 0, hasCacheInfo: true }, 0.5, 0.8);
    expect(result.cacheHitTokens).toBe(100);
    expect(result.cacheWriteTokens).toBe(0);
    expect(result.cacheMissTokens).toBe(0);
  });

  it('写入价缺失按全价（cacheWritePrice = 生效 input）', () => {
    const result = computeCacheCost(1500, 0, mp(), cache, 0.5, 1 /* = input 全价 */);
    expect(result.cacheWriteCost).toBeCloseTo((200 / 1000) * 1, 8);
  });

  it('cache_discount 可为负：写入价 > 输入价 → 实际费用 > 全价口径（product Q3 裁定）', () => {
    // writePrice=3 > input=1：write 部分溢价 → discountAmount < 0
    const result = computeCacheCost(1500, 100, mp(), cache, 0.5, 3);
    // cost = 0.6 + 200/1000×3(0.6) + 0.1 + 0.2 = 1.5；fullCost = 1.7 → discount = 0.2（仍为正，写占比小）
    // 增大 write 占比使负折扣显性化：
    const writeHeavy = computeCacheCost(1000, 0, mp(), { cacheHitTokens: 0, cacheWriteTokens: 900, cacheMissTokens: 100, hasCacheInfo: true }, 0.5, 3);
    // cost = 900/1000×3 = 2.7 + 100/1000×1 = 0.1 → 2.8；fullCost = 1.0 → discount = -1.8
    expect(writeHeavy.discountAmount).toBeCloseTo(-1.8, 8);
    expect(writeHeavy.cost).toBeCloseTo(2.8, 8);
    expect(result.discountAmount).toBeGreaterThanOrEqual(0); // 混合场景可正可负，不强制 clamp
  });

  it('无缓存字段 → 全价、cache 字段 0（回归安全）', () => {
    const result = computeCacheCost(1000, 200, mp(), { cacheHitTokens: 0, cacheWriteTokens: 0, cacheMissTokens: 0, hasCacheInfo: false }, 0.5, 1);
    expect(result.cost).toBeCloseTo(1.4, 8); // 1000/1000×1 + 200/1000×2
    expect(result.discountAmount).toBe(0);
    expect(result.cacheHitCost).toBe(0);
    expect(result.cacheWriteCost).toBe(0);
  });

  it('精度（D-1）：金额 8 位小数，对齐 numeric(18,8)/toFixed(8) 写库口径', () => {
    const result = computeCacheCost(1234, 567, mp({ input: 1.5, output: 4.5 }), { cacheHitTokens: 800, cacheWriteTokens: 200, cacheMissTokens: 234, hasCacheInfo: true }, 0.25, 1.2);
    // 手算：hit=800×0.25/1000=0.2；write=200×1.2/1000=0.24；miss=234×1.5/1000=0.351；out=567×4.5/1000=2.5515 → cost=3.3425
    expect(result.cost).toBeCloseTo(3.3425, 8);
    expect(result.cacheHitCost).toBeCloseTo(0.2, 8);
    expect(result.cacheWriteCost).toBeCloseTo(0.24, 8);
    expect(result.cost.toFixed(8)).toMatch(/^\d+\.\d{8}$/); // 8 位小数形态
  });
});

// ============================================================
// T4 — computeUsageCost（统一入口：explicit / discount_rate / 无缓存字段 / null）
// ============================================================

describe('computeUsageCost — explicit 模式端到端（D-13）', () => {
  it('DeepSeek hit+miss → 显式读取价计费（mode 注入避免 DB 依赖）', async () => {
    const usage = { prompt_tokens: 1500, completion_tokens: 100, prompt_cache_hit_tokens: 1000, prompt_cache_miss_tokens: 500 };
    const result = await computeUsageCost(usage, mp({ cacheReadInputPrice: 0.5 }), { mode: 'explicit', globalRate: 0.1 });
    expect(result).not.toBeNull();
    // read=1000×0.5/1000=0.5；miss=500×1/1000=0.5；out=100×2/1000=0.2 → cost=1.2
    expect(result!.cost).toBeCloseTo(1.2, 8);
    expect(result!.cacheHitTokens).toBe(1000);
    expect(result!.cacheWriteTokens).toBe(0);
    expect(result!.cacheWritePriceSource).toBe('full_price'); // 写入价缺失 → 全价兜底
  });

  it('discount_rate 模式与旧版 parseAndDiscount 结果完全一致（R-B5 对照断言）', async () => {
    const usage = { prompt_tokens: 1500, completion_tokens: 100, prompt_cache_hit_tokens: 1000, prompt_cache_miss_tokens: 500 };
    const result = await computeUsageCost(usage, mp(), { mode: 'discount_rate', globalRate: 0.1 });
    // 旧版：1000×1×0.1/1000 + 500×1/1000 + 100×2/1000 = 0.8
    expect(result!.cost).toBeCloseTo(0.8, 8);
    expect(result!.cacheWriteTokens).toBe(0); // discount_rate 模式不落 write 信息（与旧版一致）
    expect(result!.cacheWritePriceSource).toBe('full_price');
  });

  it('usage 无缓存字段 → 返回全价结果（非 null），计费与现状一致', async () => {
    const result = await computeUsageCost({ prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 }, mp(), { mode: 'explicit', globalRate: 0.1 });
    expect(result).not.toBeNull();
    expect(result!.cost).toBeCloseTo(1.4, 8); // 1000/1000×1 + 200/1000×2
    expect(result!.discountAmount).toBe(0);
  });

  it('usage 为 null / 非对象 → 返回 null（调用方走 computeCost 全价/预估路径）', async () => {
    expect(await computeUsageCost(null, mp(), { mode: 'explicit' })).toBeNull();
    expect(await computeUsageCost(undefined, mp(), { mode: 'explicit' })).toBeNull();
    expect(await computeUsageCost('not-an-object', mp(), { mode: 'explicit' })).toBeNull();
  });
});

// ============================================================
// T4 — R-B4 常量 + A9 流式三态（R-B2）
// ============================================================

describe('STREAM_INCLUDE_USAGE_ENABLED（R-B4）', () => {
  it('常量默认开启（P0 硬编码注入，出问题改 false 快速关闭；system_config key 预留注释）', () => {
    expect(STREAM_INCLUDE_USAGE_ENABLED).toBe(true);
  });
});

describe('A9 流式三态（R-B2：末帧 usage 计费 / fallback 全价 / 回滚全额不涉缓存）', () => {
  it('A 正常结束 + 末帧 usage 带缓存字段 → 透传 + 按显式价计费（计费时点 = 末帧 usage）', () => {
    const state: StreamState = {
      lastValidUsage: { prompt_tokens: 1500, completion_tokens: 100, total_tokens: 1600, cacheHitTokens: 1200, cacheWriteTokens: 200, cacheMissTokens: 100 },
      generatedText: 'hello',
      finishReason: 'stop',
      totalChunks: 10,
    };
    const billing = determineStreamBilling(state, false, 100);
    expect(billing.trustUpstream).toBe(true);
    expect(billing.cacheHitTokens).toBe(1200);
    expect(billing.cacheWriteTokens).toBe(200);
    // 真实链路：determineStreamBilling 透传缓存字段 → 路由组装 CacheTokenInfo → computeCacheCost
    const cacheInfo: CacheTokenInfo = {
      cacheHitTokens: billing.cacheHitTokens ?? 0,
      cacheWriteTokens: billing.cacheWriteTokens ?? 0,
      cacheMissTokens: billing.cacheMissTokens ?? 0,
      hasCacheInfo: true,
    };
    // read=1200×0.5/1000 + write=200×0.8/1000 + miss=100×1/1000 + out=100×2/1000 = 0.6+0.16+0.1+0.2
    const result = computeCacheCost(billing.promptTokens, billing.completionTokens, mp(), cacheInfo, 0.5, 0.8);
    expect(result.cost).toBeCloseTo(1.06, 8);
  });

  it('B 中断但末帧有 usage → 采信（同 A，回滚口径 = 按已累计 usage 结算多退少补）', () => {
    const state: StreamState = {
      lastValidUsage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cacheHitTokens: 60 },
      generatedText: 'partial',
      finishReason: 'length',
      totalChunks: 5,
    };
    const billing = determineStreamBilling(state, true, 100);
    expect(billing.trustUpstream).toBe(true);
    expect(billing.cacheHitTokens).toBe(60);
    expect(billing.fallback).toBe(false);
  });

  it('C 中断无 usage 有文本 → fallback 全价（缓存字段 undefined，不参与计费）', () => {
    const state: StreamState = { lastValidUsage: null, generatedText: 'partial text', finishReason: null, totalChunks: 3 };
    const billing = determineStreamBilling(state, true, 100);
    expect(billing.fallback).toBe(true);
    expect(billing.cacheHitTokens).toBeUndefined();
    expect(billing.cacheWriteTokens).toBeUndefined();
    // 组合计费：无缓存信息 → 全价（fullCost 公式）
    const result = computeCacheCost(billing.promptTokens, billing.completionTokens, mp(), null, 0.5, 0.8);
    expect(result.cacheHitCost).toBe(0);
    expect(result.cacheWriteCost).toBe(0);
    expect(result.discountAmount).toBe(0);
    expect(result.cost).toBeCloseTo((billing.promptTokens / 1000) * 1 + (billing.completionTokens / 1000) * 2, 8);
  });
});

// ============================================================
// T5 — computeStreamCost（流式统一入口，A9 计费时点 = 末帧 usage）
// ============================================================

describe('computeStreamCost（T5 流式统一入口）', () => {
  it('A/B 分支（带缓存字段）→ explicit 显式价计费 + 快照价', async () => {
    const billing = {
      promptTokens: 1500,
      completionTokens: 100,
      cacheHitTokens: 1200,
      cacheWriteTokens: 200,
      cacheMissTokens: 100,
    };
    const r = await computeStreamCost(billing, mp({ cacheReadInputPrice: 0.5, cacheWriteInputPrice: 0.8 }), { mode: 'explicit', globalRate: 0.1 });
    // read=1200×0.5/1000 + write=200×0.8/1000 + miss=100×1/1000 + out=100×2/1000 = 1.06
    expect(r.cost).toBeCloseTo(1.06, 8);
    expect(r.cacheHitTokens).toBe(1200);
    expect(r.cacheWriteTokens).toBe(200);
    expect(r.cacheReadPrice).toBe(0.5);
    expect(r.cacheWritePrice).toBe(0.8);
    expect(r.cacheWritePriceSource).toBe('explicit');
  });

  it('C/D fallback（无缓存字段）→ 全价（缓存字段 undefined → cacheInfo=null）', async () => {
    const r = await computeStreamCost({ promptTokens: 100, completionTokens: 50 }, mp(), { mode: 'explicit', globalRate: 0.1 });
    expect(r.cost).toBeCloseTo((100 / 1000) * 1 + (50 / 1000) * 2, 8);
    expect(r.cacheHitCost).toBe(0);
    expect(r.cacheWriteCost).toBe(0);
    expect(r.discountAmount).toBe(0);
  });

  it('discount_rate 模式 → 与旧版金额一致（读取按折扣率、写入按全价）', async () => {
    const billing = { promptTokens: 1500, completionTokens: 100, cacheHitTokens: 1000, cacheWriteTokens: 0, cacheMissTokens: 500 };
    const r = await computeStreamCost(billing, mp(), { mode: 'discount_rate', globalRate: 0.1 });
    // 旧公式：1000×1×0.1/1000 + 500×1/1000 + 100×2/1000 = 0.8
    expect(r.cost).toBeCloseTo(0.8, 8);
    expect(r.cacheWriteTokens).toBe(0);
    expect(r.cacheWritePriceSource).toBe('full_price');
    expect(r.cacheReadPrice).toBeCloseTo(1 * 0.1, 12); // 生效 input × 全局折扣率（快照价）
  });
});
