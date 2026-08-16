/**
 * 模型广场自动同步单元测试 — newapi-gap-analysis.md Batch 4 任务 4.2 / Gate 4.2
 *
 * 纯单测风格：mock db（../src/db）、JWT（../src/services/auth/jwt），
 * 不依赖真实 PG / Redis / 网络；fetch 通过注入 fetchImpl 或 stubGlobal 提供。
 *
 * 覆盖：
 *  - service syncSupplierModels：无 active key / 新建 2 模型 / 已有模型更新 /
 *    上游 500 / fetch 抛错 / 新模型自动建 draft 定价 / 供应商不存在 /
 *    inactive 恢复 active + platformModel 对齐 / markMissingInactive / 已有定价不重复建 /
 *    供应商 syncedAt 回写
 *  - service syncAllSuppliers：批量汇总（成功 + 失败）
 *  - 路由：404 / 正常 data 结构 / 401 / 无 active key 400 / 上游 500 502 / sync-all
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { suppliers, supplierKeys, supplierModels, vendorPricing } from '../src/db/schema';

// ─────────────────────────────────────────────
// Mocks（vi.hoisted 保证 vi.mock factory 可引用）
// ─────────────────────────────────────────────

const { dbMock, dbState } = vi.hoisted(() => {
  interface InsertRecord { table: any; values: any; }
  interface UpdateRecord { table: any; set: any; }

  const dbState = {
    /** 真实 schema（由 ../src/db mock factory 注入，用于表识别） */
    schema: null as any,
    /** 表对象 → 行数组（select 结果） */
    rows: new Map<any, any[]>(),
    /** db.insert(...).values(...) 调用记录 */
    inserts: [] as InsertRecord[],
    /** db.update(...).set(...) 调用记录 */
    updates: [] as UpdateRecord[],
    /** 自动递增 id（insert returning 用） */
    nextId: 1,
  };

  /** 可 await 的 Drizzle 链式 builder：SELECT 按表返回行，INSERT/UPDATE 落库并记录 */
  function makeChain(initialTable: any = null) {
    const state: any = { table: initialTable, limit: null, set: null, values: null, returning: false };
    const chain: any = {
      from: (t: any) => { state.table = t; return chain; },
      where: () => chain,
      orderBy: () => chain,
      groupBy: () => chain,
      limit: (n: number) => { state.limit = n; return chain; },
      offset: () => chain,
      set: (v: any) => { state.set = v; return chain; },
      values: (v: any) => { state.values = v; return chain; },
      returning: () => { state.returning = true; return chain; },
      onConflictDoNothing: () => { state.onConflict = true; return chain; },
      onConflictDoUpdate: () => { state.onConflict = true; return chain; },
    };
    chain.then = (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) =>
      Promise.resolve(compute(state)).then(onFulfilled, onRejected);
    return chain;
  }

  function compute(state: any): any[] {
    // INSERT：记录 values；returning → 生成带 id 的行并写回 rows（模拟真实落库）
    if (state.values) {
      dbState.inserts.push({ table: state.table, values: state.values });
      if (state.returning) {
        const row = { id: dbState.nextId++, ...state.values };
        const rows = dbState.rows.get(state.table) ?? [];
        rows.push(row);
        dbState.rows.set(state.table, rows);
        return [row];
      }
      return [];
    }
    // UPDATE：记录 set；returning → 回显 set
    if (state.set) {
      dbState.updates.push({ table: state.table, set: state.set });
      if (state.returning) return [{ id: 1, ...state.set }];
      return [];
    }
    // SELECT：按表返回行（可带 limit）
    const rows = dbState.rows.get(state.table) ?? [];
    return state.limit != null ? rows.slice(0, state.limit) : rows;
  }

  const dbMock: any = {
    select: vi.fn((_shape: any = {}) => makeChain()),
    insert: vi.fn((t: any) => makeChain(t)),
    update: vi.fn((t: any) => makeChain(t)),
    delete: vi.fn((t: any) => makeChain(t)),
    transaction: vi.fn((fn: any) => fn(dbMock)),
    execute: vi.fn(async () => []),
  };

  return { dbMock, dbState };
});

vi.mock('../src/db', async (importOriginal) => {
  const actual = await (importOriginal as () => Promise<typeof import('../src/db')>)();
  dbState.schema = actual.schema; // 保留真实 schema，供 eq()/and() 构建条件
  return { ...actual, db: dbMock };
});

vi.mock('../src/services/auth/jwt', () => ({
  verifyToken: vi.fn(() => ({ userId: 1, email: 'admin@test.com', role: 'admin' })),
}));

import { verifyToken } from '../src/services/auth/jwt';
import {
  syncSupplierModels,
  syncAllSuppliers,
} from '../src/services/model-sync';

// ─────────────────────────────────────────────
// Fixtures & test app
// ─────────────────────────────────────────────

const SUPPLIER = {
  id: 1,
  name: 'Test Supplier',
  code: 'test',
  baseUrl: 'https://api.example.com/',
  apiType: 'openai',
  status: 'active',
  healthStatus: 'unknown',
  healthLastCheck: null,
  description: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const ACTIVE_KEY = {
  id: 10,
  supplierId: 1,
  keyValue: 'sk-test-1',
  name: 'K1',
  status: 'active',
  selectMode: 'single',
  priority: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

/** 设置某表的查询返回行 */
function setRows(table: any, rows: any[]) {
  dbState.rows.set(table, rows);
}

/** 标准 200 模型列表响应（OpenAI 格式） */
function modelsResponse(ids: string[], status = 200) {
  return new Response(JSON.stringify({
    object: 'list',
    data: ids.map((id) => ({ id, object: 'model', owned_by: 'vendor' })),
  }), { status });
}

let app: FastifyInstance;
let fetchMock: ReturnType<typeof vi.fn>;

const adminHeaders = { authorization: 'Bearer admin-token' };

beforeAll(async () => {
  const { adminModelSyncRoutes } = await import('../src/routes/admin-model-sync');
  app = Fastify();
  await app.register(adminModelSyncRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  dbState.rows = new Map();
  dbState.inserts = [];
  dbState.updates = [];
  dbState.nextId = 1;
  vi.mocked(verifyToken).mockImplementation(() => ({ userId: 1, email: 'admin@test.com', role: 'admin' }));
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ═════════════════════════════════════════════
// 1. syncSupplierModels — 基础分支
// ═════════════════════════════════════════════

describe('syncSupplierModels — 基础分支', () => {
  it('无 active key → 返回 error 不抛异常（不打上游）', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, []); // 无 active key

    const result = await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(result.error).toBe('no active key');
    expect(result.synced).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('供应商不存在 → 返回 error 不抛异常', async () => {
    setRows(suppliers, []);

    const result = await syncSupplierModels(999, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(result.error).toBe('supplier not found');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('上游返回 2 个模型 → 创建 2 条记录 + synced=2', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    fetchMock.mockResolvedValue(modelsResponse(['gpt-4o', 'deepseek-chat']));

    const result = await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(result).toMatchObject({ synced: 2, created: 2, updated: 0, failed: 0 });
    expect(result.models).toEqual(['gpt-4o', 'deepseek-chat']);

    // 请求 URL / 鉴权头 / 方法正确
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer sk-test-1' },
      }),
    );

    // 落库断言：两条 supplier_models（modelName=platformModel=id, status=active, syncedAt 已填）
    const modelInserts = dbState.inserts.filter((r) => r.table === supplierModels);
    expect(modelInserts).toHaveLength(2);
    expect(modelInserts[0]!.values).toMatchObject({
      supplierId: 1, modelName: 'gpt-4o', platformModel: 'gpt-4o', status: 'active',
    });
    expect(modelInserts[0]!.values.syncedAt).toBeInstanceOf(Date);
    expect(modelInserts[1]!.values).toMatchObject({ modelName: 'deepseek-chat', platformModel: 'deepseek-chat' });

    // rows 也真实写入了 2 行
    expect(dbState.rows.get(supplierModels)?.length).toBe(2);
  });

  it('已有模型 → 更新而非重复创建（updated 计数 + 刷新 syncedAt）', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    setRows(supplierModels, [{
      id: 5,
      supplierId: 1,
      modelName: 'gpt-4o',
      platformModel: 'gpt-4o',
      inputPrice: '0',
      outputPrice: '0',
      status: 'active',
      syncedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }]);
    fetchMock.mockResolvedValue(modelsResponse(['gpt-4o']));

    const result = await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(result).toMatchObject({ synced: 1, created: 0, updated: 1, failed: 0, models: ['gpt-4o'] });

    // 没有重复 INSERT supplier_models
    const modelInserts = dbState.inserts.filter((r) => r.table === supplierModels);
    expect(modelInserts).toHaveLength(0);

    // 走 UPDATE 且刷新了 syncedAt
    const modelUpdate = dbState.updates.find((u) => u.table === supplierModels);
    expect(modelUpdate).toBeDefined();
    expect(modelUpdate!.set.syncedAt).toBeInstanceOf(Date);

    // 已有模型不建定价
    const pricingInserts = dbState.inserts.filter((r) => r.table === vendorPricing);
    expect(pricingInserts).toHaveLength(0);
  });

  it('上游 500 → 返回 error upstream http 500（不落库）', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    fetchMock.mockResolvedValue(new Response('upstream exploded', { status: 500 }));

    const result = await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(result.error).toBe('upstream http 500');
    expect(result.synced).toBe(0);
    expect(dbState.inserts).toHaveLength(0);
    expect(dbState.updates).toHaveLength(0);
  });

  it('fetch 抛错（网络错误）→ 返回 error 信息（不抛异常）', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const result = await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(result.error).toContain('fetch failed');
    expect(result.synced).toBe(0);
  });

  it('响应体不是合法 JSON → 返回 error invalid upstream response', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    fetchMock.mockResolvedValue(new Response('not-json', { status: 200 }));

    const result = await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(result.error).toBe('invalid upstream response');
  });
});

// ═════════════════════════════════════════════
// 2. syncSupplierModels — 定价自动填充
// ═════════════════════════════════════════════

describe('syncSupplierModels — 定价自动填充', () => {
  it('新模型自动创建一条 draft 定价（0 价占位，default 分组）', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    setRows(vendorPricing, []); // 无任何定价记录
    fetchMock.mockResolvedValue(modelsResponse(['gpt-4o']));

    const result = await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(result).toMatchObject({ created: 1, synced: 1 });

    const pricingInserts = dbState.inserts.filter((r) => r.table === vendorPricing);
    expect(pricingInserts).toHaveLength(1);
    expect(pricingInserts[0]!.values).toMatchObject({
      supplierModelId: 1, // 新建模型的 id（nextId 从 1 开始）
      pricingGroup: 'default',
      inputPrice: '0',
      outputPrice: '0',
      status: 'draft',
    });
  });

  it('已有定价记录 → 不重复创建定价', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    setRows(vendorPricing, [{ id: 99, supplierModelId: 1, pricingGroup: 'default', status: 'draft' }]);
    fetchMock.mockResolvedValue(modelsResponse(['gpt-4o']));

    await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });

    const pricingInserts = dbState.inserts.filter((r) => r.table === vendorPricing);
    expect(pricingInserts).toHaveLength(0);
  });

  it('定价创建失败 → 静默跳过，模型同步仍成功', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    fetchMock.mockResolvedValue(modelsResponse(['gpt-4o']));

    // 让 vendorPricing 的 insert 抛错（模拟 DB 异常）
    const realInsert = dbMock.insert;
    dbMock.insert.mockImplementationOnce((t: any) => {
      if (t === vendorPricing) {
        const failingChain: any = { then: () => Promise.reject(new Error('pricing insert failed')) };
        return failingChain;
      }
      return realInsert(t);
    });

    const result = await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(result).toMatchObject({ created: 1, synced: 1, failed: 0 });
  });
});

// ═════════════════════════════════════════════
// 3. syncSupplierModels — 更新细节 & markMissingInactive
// ═════════════════════════════════════════════

describe('syncSupplierModels — 更新细节 / markMissingInactive', () => {
  it('已有 inactive 模型 → 恢复 active + platformModel 对齐上游 id', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    setRows(supplierModels, [{
      id: 5,
      supplierId: 1,
      modelName: 'gpt-4o',
      platformModel: 'gpt-4o-2024-05-13', // 旧平台名，与上游不一致
      status: 'inactive',                 // 已停用，应恢复
      syncedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }]);
    fetchMock.mockResolvedValue(modelsResponse(['gpt-4o']));

    const result = await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(result).toMatchObject({ updated: 1, created: 0 });

    const modelUpdate = dbState.updates.find((u) => u.table === supplierModels);
    expect(modelUpdate!.set).toMatchObject({
      platformModel: 'gpt-4o',
      status: 'active',
    });
  });

  it('markMissingInactive=false（默认）→ 不标记上游已下架的模型', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    setRows(supplierModels, [{
      id: 5,
      supplierId: 1,
      modelName: 'old-model',
      platformModel: 'old-model',
      status: 'active',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }]);
    fetchMock.mockResolvedValue(modelsResponse(['gpt-4o']));

    await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });

    // 只有对 gpt-4o 的 upsert 更新，没有对 old-model 的 inactive 标记
    const inactiveUpdate = dbState.updates.find((u) => u.set && u.set.status === 'inactive');
    expect(inactiveUpdate).toBeUndefined();
  });

  it('markMissingInactive=true → 把上游已下架的现有模型标记为 inactive', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    setRows(supplierModels, [{
      id: 5,
      supplierId: 1,
      modelName: 'old-model',
      platformModel: 'old-model',
      status: 'active',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }]);
    fetchMock.mockResolvedValue(modelsResponse(['gpt-4o']));

    await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch }, { markMissingInactive: true });

    const inactiveUpdate = dbState.updates.find((u) => u.table === supplierModels && u.set.status === 'inactive');
    expect(inactiveUpdate).toBeDefined();
  });

  it('供应商含 syncedAt 字段 → 同步后回写供应商 syncedAt', async () => {
    setRows(suppliers, [{ ...SUPPLIER, syncedAt: null, lastSyncAt: null }]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    fetchMock.mockResolvedValue(modelsResponse(['gpt-4o']));

    await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });

    const supplierUpdate = dbState.updates.find((u) => u.table === suppliers);
    expect(supplierUpdate).toBeDefined();
    expect(supplierUpdate!.set.syncedAt).toBeInstanceOf(Date);
    expect(supplierUpdate!.set.lastSyncAt).toBeInstanceOf(Date);
  });

  it('供应商无 syncedAt 字段（当前表结构）→ 不回写供应商，不报错', async () => {
    setRows(suppliers, [SUPPLIER]); // 真实 schema 行不含 syncedAt
    setRows(supplierKeys, [ACTIVE_KEY]);
    fetchMock.mockResolvedValue(modelsResponse(['gpt-4o']));

    const result = await syncSupplierModels(1, { db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(result.error).toBeUndefined();
    const supplierUpdate = dbState.updates.find((u) => u.table === suppliers);
    expect(supplierUpdate).toBeUndefined();
  });
});

// ═════════════════════════════════════════════
// 4. syncAllSuppliers — 批量汇总
// ═════════════════════════════════════════════

describe('syncAllSuppliers — 批量同步汇总', () => {
  it('成功与失败混合 → 汇总计数正确（单供应商失败不影响其他）', async () => {
    setRows(suppliers, [
      { ...SUPPLIER, id: 1, name: 'S1' },
      { ...SUPPLIER, id: 2, name: 'S2' },
    ]);
    setRows(supplierKeys, [ACTIVE_KEY]); // select limit(1) 取到同一把 key，两次同步行为由 fetch mock 区分
    fetchMock
      .mockResolvedValueOnce(modelsResponse(['gpt-4o']))
      .mockRejectedValueOnce(new Error('boom'));

    const result = await syncAllSuppliers({ db: dbMock, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(result).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(result.results[0]).toMatchObject({ supplierId: 1, name: 'S1' });
    expect(result.results[0]!.result).toMatchObject({ created: 1, synced: 1 });
    expect(result.results[1]).toMatchObject({ supplierId: 2, name: 'S2', error: 'boom' });
  });
});

// ═════════════════════════════════════════════
// 5. 路由 — POST /api/v1/admin/suppliers/:id/sync-models
// ═════════════════════════════════════════════

describe('POST /api/v1/admin/suppliers/:id/sync-models — 路由', () => {
  it('供应商不存在 → 404', async () => {
    setRows(suppliers, []); // 查无此供应商
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/999/sync-models',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('正常同步 → 200 + data 结构（synced/created/updated/failed/models）', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    fetchMock.mockResolvedValue(modelsResponse(['gpt-4o', 'deepseek-chat']));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/sync-models',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toMatchObject({ synced: 2, created: 2, updated: 0, failed: 0 });
    expect(body.data.models).toEqual(['gpt-4o', 'deepseek-chat']);
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/sync-models',
      // 无 Authorization 头
    });
    expect(res.statusCode).toBe(401);
  });

  it('非 admin 角色 → 403', async () => {
    vi.mocked(verifyToken).mockImplementation(() => ({ userId: 2, email: 'user@test.com', role: 'customer' }));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/sync-models',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(403);
  });

  it('供应商无 active key → 400（业务配置错误，不报 500）', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, []);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/sync-models',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe(400);
    expect(body.message).toBe('no active key');
  });

  it('上游 500 → 502（上游不可用）', async () => {
    setRows(suppliers, [SUPPLIER]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/sync-models',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().message).toBe('upstream http 500');
  });

  it('路径参数非法 → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/abc/sync-models',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ═════════════════════════════════════════════
// 6. 路由 — POST /api/v1/admin/suppliers/sync-all
// ═════════════════════════════════════════════

describe('POST /api/v1/admin/suppliers/sync-all — 批量同步路由', () => {
  it('正常批量同步 → 200 + data.total/succeeded/failed/results', async () => {
    setRows(suppliers, [{ ...SUPPLIER, id: 1, name: 'S1' }]);
    setRows(supplierKeys, [ACTIVE_KEY]);
    fetchMock.mockResolvedValue(modelsResponse(['gpt-4o']));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/sync-all',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toMatchObject({ total: 1, succeeded: 1, failed: 0 });
    expect(body.data.results[0].result).toMatchObject({ created: 1 });
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/sync-all',
    });
    expect(res.statusCode).toBe(401);
  });
});
