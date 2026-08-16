/**
 * 供应商运维端点单元测试 — 渠道连通性测试 + 上游余额查询
 *
 * 纯单测风格：mock db（../src/db）、JWT（../src/services/auth/jwt）、
 * Redis（../src/lib/redis）、fetch（vi.stubGlobal / 注入 fetchImpl），
 * 不依赖真实 PG / Redis / 网络。
 *
 * 覆盖（对应 newapi-gap-analysis.md Batch 1 任务 1.1/1.2 测试要求）：
 *  - 连通性：404 / 无 active key / 200→healthy / 500→unhealthy / 网络错误
 *  - 余额：OpenAI usage 解析 / 404 unsupported 降级 / 多 Key 混合 / 缓存命中不打上游
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
    /** select().from(suppliers) 的返回值 */
    suppliers: [] as any[],
    /** select().from(supplierKeys) 的返回值 */
    keys: [] as any[],
    /** db.update(...).set(...) 的调用记录（断言写回用） */
    updates: [] as Array<{ table: any; set: any }>,
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
      set: (v: any) => { dbState.updates.push({ table, set: v }); return chain; },
      values: () => chain,
      returning: () => chain,
    };
    chain.then = (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) =>
      Promise.resolve(resolve(table)).then(onFulfilled, onRejected);
    return chain;
  }

  const dbMock: any = {
    select: vi.fn(() =>
      makeChain((t: any) =>
        t === dbState.schema?.suppliers ? dbState.suppliers : dbState.keys,
      ),
    ),
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
}));

import { verifyToken } from '../src/services/auth/jwt';
import {
  testSupplierConnection,
  queryKeyBalance,
  querySupplierBalances,
} from '../src/services/supplier-ops';

// ─────────────────────────────────────────────
// Test app（只注册 supplierRoutes，避免拉起全量路由）
// ─────────────────────────────────────────────

let app: FastifyInstance;
let fetchMock: ReturnType<typeof vi.fn>;

const authHeaders = { authorization: 'Bearer test-admin-token' };

beforeAll(async () => {
  const { supplierRoutes } = await import('../src/routes/suppliers');
  app = Fastify();
  await app.register(supplierRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  dbState.suppliers = [];
  dbState.keys = [];
  dbState.updates = [];
  vi.mocked(verifyToken).mockImplementation(() => ({ userId: 1, email: 'admin@test.com', role: 'admin' }));
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ═════════════════════════════════════════════
// 1. 渠道连通性测试（路由级）
// ═════════════════════════════════════════════

describe('POST /api/v1/admin/suppliers/:id/test — 渠道连通性测试', () => {
  const SUPPLIER = { id: 1, name: 'Test Supplier', baseUrl: 'https://api.example.com' };
  const ACTIVE_KEY = { id: 10, supplierId: 1, keyValue: 'sk-test-1', name: 'K1', status: 'active' };

  it('supplier 不存在 → 404', async () => {
    dbState.suppliers = []; // 查无此供应商
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/999/test',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supplier 无 active key → ok:false + reason（不抛异常，不报 500）', async () => {
    dbState.suppliers = [SUPPLIER];
    dbState.keys = []; // 无 active key
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/test',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetch 返回 200 → ok:true + latencyMs 存在 + healthStatus 更新为 healthy', async () => {
    dbState.suppliers = [SUPPLIER];
    dbState.keys = [ACTIVE_KEY];
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/test',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.latencyMs).toBe('number');
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);

    const healthUpdate = dbState.updates.find((u) => u.set && u.set.healthStatus === 'healthy');
    expect(healthUpdate).toBeDefined();
  });

  it('fetch 返回 500 → ok:false + status=500 + healthStatus 更新为 unhealthy', async () => {
    dbState.suppliers = [SUPPLIER];
    dbState.keys = [ACTIVE_KEY];
    fetchMock.mockResolvedValue(new Response('upstream exploded', { status: 500 }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/test',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.status).toBe(500);
    expect(body.error).toBeDefined();

    const healthUpdate = dbState.updates.find((u) => u.set && u.set.healthStatus === 'unhealthy');
    expect(healthUpdate).toBeDefined();
  });

  it('fetch 抛错（网络错误）→ ok:false + error 存在', async () => {
    dbState.suppliers = [SUPPLIER];
    dbState.keys = [ACTIVE_KEY];
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/test',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.status).toBeUndefined();
  });
});

// ═════════════════════════════════════════════
// 2. testSupplierConnection 直接单测（纯函数）
// ═════════════════════════════════════════════

describe('testSupplierConnection — 连通性探测纯函数', () => {
  it('200 → ok:true + latencyMs + 请求 URL 规整（去掉末尾斜杠）', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const result = await testSupplierConnection(
      { baseUrl: 'https://api.example.com/' },
      'sk-test-1',
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(typeof result.latencyMs).toBe('number');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer sk-test-1' },
      }),
    );
  });

  it('非 200 → ok:false + status + error 截断前 200 字符', async () => {
    const longBody = 'x'.repeat(500);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(longBody, { status: 500 }));
    const result = await testSupplierConnection(
      { baseUrl: 'https://api.example.com' },
      'sk-test-1',
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeLessThanOrEqual(200);
  });

  it('fetch 抛错 → ok:false + error 信息', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network unreachable'));
    const result = await testSupplierConnection(
      { baseUrl: 'https://api.example.com' },
      'sk-test-1',
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('network unreachable');
  });
});

// ═════════════════════════════════════════════
// 3. queryKeyBalance 单测（单 Key 余额解析）
// ═════════════════════════════════════════════

describe('queryKeyBalance — 单 Key 余额查询', () => {
  it('OpenAI 格式 total_used → 解析出 balance 数值 + USD', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ object: 'billing_usage', total_used: 12.34, total_available: 100 }), { status: 200 }),
    );
    const result = await queryKeyBalance(
      'https://api.example.com',
      'sk-test-1',
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.unsupported).toBe(false);
    expect(result.balance).toBe(12.34);
    expect(result.currency).toBe('USD');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/v1/dashboard/billing/usage',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('国产接口 total_usage（人民币分）→ 折算 CNY 元', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ total_usage: 5000 }), { status: 200 }),
    );
    const result = await queryKeyBalance('https://api.example.com', 'sk-test-1', fetchImpl as unknown as typeof fetch);
    expect(result.balance).toBe(50); // 5000 分 = ¥50
    expect(result.currency).toBe('CNY');
  });

  it('200 但字段无法解析 → balance null + error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ foo: 'bar' }), { status: 200 }),
    );
    const result = await queryKeyBalance('https://api.example.com', 'sk-test-1', fetchImpl as unknown as typeof fetch);
    expect(result.balance).toBeNull();
    expect(result.currency).toBeNull();
    expect(result.error).toBeDefined();
  });
});

// ═════════════════════════════════════════════
// 4. querySupplierBalances 单测（聚合 + 缓存编排）
// ═════════════════════════════════════════════

describe('querySupplierBalances — 供应商余额聚合', () => {
  const SUPPLIER = { baseUrl: 'https://api.example.com' };
  const KEYS = [
    { id: 1, name: 'K1', keyValue: 'sk-1' },
    { id: 2, name: 'K2', keyValue: 'sk-2' },
  ];

  it('fetch 404（供应商不支持）→ 整个供应商 ok:false + reason=unsupported（不 500）', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));
    const result = await querySupplierBalances(SUPPLIER, [KEYS[0]!], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unsupported');
    expect(result.keys).toBeUndefined();
  });

  it('多条 key 混合成功/失败 → 返回 keys 数组各带状态', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ total_used: 8.5 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    const result = await querySupplierBalances(SUPPLIER, KEYS, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(result.keys).toHaveLength(2);
    expect(result.keys![0]).toMatchObject({ keyId: 1, keyName: 'K1', balance: 8.5, currency: 'USD' });
    expect(result.keys![1]).toMatchObject({ keyId: 2, keyName: 'K2', balance: null });
    expect(result.keys![1]!.error).toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('Redis 缓存命中 → 不重复发 fetch（验证 fetch 调用次数 = 0）', async () => {
    const fetchImpl = vi.fn();
    const cacheGet = vi.fn().mockResolvedValue(JSON.stringify({ balance: 42, currency: 'USD' }));
    const cacheSet = vi.fn();
    const result = await querySupplierBalances(SUPPLIER, KEYS, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheGet,
      cacheSet,
    });
    expect(result.ok).toBe(true);
    expect(result.keys![0]).toMatchObject({ keyId: 1, balance: 42, currency: 'USD' });
    expect(result.keys![1]).toMatchObject({ keyId: 2, balance: 42, currency: 'USD' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(cacheGet).toHaveBeenCalledWith('supplier_balance:1');
    expect(cacheGet).toHaveBeenCalledWith('supplier_balance:2');
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('成功查询后写回缓存（key 格式 supplier_balance:{keyId}，TTL 600s）', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ total_used: 3.14 }), { status: 200 }));
    const cacheSet = vi.fn();
    const result = await querySupplierBalances(SUPPLIER, [KEYS[0]!], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheSet,
    });
    expect(result.ok).toBe(true);
    expect(cacheSet).toHaveBeenCalledWith(
      'supplier_balance:1',
      expect.stringContaining('3.14'),
      600,
    );
  });
});

// ═════════════════════════════════════════════
// 5. 余额查询路由级（写回 currentBalance / 降级响应）
// ═════════════════════════════════════════════

describe('GET /api/v1/admin/suppliers/:id/balance — 余额查询路由', () => {
  const SUPPLIER = { id: 1, name: 'Test Supplier', baseUrl: 'https://api.example.com' };

  it('supplier 不存在 → 404', async () => {
    dbState.suppliers = [];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/suppliers/999/balance',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(404);
  });

  it('全部 key unsupported → ok:false + reason=unsupported，不写回 currentBalance', async () => {
    dbState.suppliers = [SUPPLIER];
    dbState.keys = [{ id: 10, supplierId: 1, keyValue: 'sk-1', name: 'K1', status: 'active' }];
    fetchMock.mockResolvedValue(new Response('Not Found', { status: 404 }));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/suppliers/1/balance',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('unsupported');

    const balanceUpdate = dbState.updates.find((u) => u.set && 'currentBalance' in u.set);
    expect(balanceUpdate).toBeUndefined();
  });

  it('查询成功 → keys 带余额 + 写回 supplier_keys.currentBalance', async () => {
    dbState.suppliers = [SUPPLIER];
    dbState.keys = [{ id: 10, supplierId: 1, keyValue: 'sk-1', name: 'K1', status: 'active' }];
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ total_used: 9.99 }), { status: 200 }));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/suppliers/1/balance',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).toMatchObject({ keyId: 10, balance: 9.99, currency: 'USD' });

    const balanceUpdate = dbState.updates.find((u) => u.set && 'currentBalance' in u.set);
    expect(balanceUpdate?.set.currentBalance).toBe('9.99');
  });
});
