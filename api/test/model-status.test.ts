/**
 * 模型禁用/启用开关 + selectChannel 过滤 单元测试
 *
 * 对应 newapi-gap-analysis.md Batch 4 任务 4.5：
 * - PATCH /api/v1/admin/models/:id/status — 单个模型禁用/启用
 * - POST /api/v1/admin/suppliers/:id/models/batch-status — 批量禁用/启用
 * - selectChannel 过滤：status='inactive' 的模型不参与路由
 *
 * 纯单测风格：mock db（../src/db）、JWT（../src/services/auth/jwt）、
 * Redis（../src/lib/redis），不依赖真实 PG / Redis / 网络。
 * 参考 api/test/supplier-ops.test.ts 的 mock 写法（可 await 的链式 builder）。
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { PgDialect } from 'drizzle-orm/pg-core';

// ─────────────────────────────────────────────
// Mocks（vi.hoisted 保证 vi.mock factory 可引用）
// ─────────────────────────────────────────────

const { dbMock, dbState } = vi.hoisted(() => {
  const dbState: any = {
    /** 真实 schema（由 ../src/db mock factory 注入，用于表识别） */
    schema: null as any,
    /** select().from(suppliers) 的返回值 */
    suppliers: [] as any[],
    /** select().from(supplierModels) 的返回值 */
    models: [] as any[],
    /** select().from(vendorPricing) 的返回值（selectChannel 候选） */
    routingRows: [] as any[],
    /** select().from(circuitBreakerState) 的返回值 */
    circuitStates: [] as any[],
    /** db.update(...) 的调用记录（断言写回用） */
    updates: [] as Array<{ table: any; set: any }>,
    /** db.select().where(...) 的调用记录（断言 where 条件用） */
    whereCalls: [] as Array<{ table: any; args: any[] }>,
    /** db.update().returning() 的返回值；null 表示返回 []（如 404 场景） */
    updateReturning: null as any[] | null,
  };

  /**
   * 可 await 的 Drizzle 链式 builder：方法全部返回自身，await 时按表解析结果。
   * update 链没有 from()，表通过 initialTable 传入。
   */
  function makeChain(resolve: (table: any) => unknown, initialTable: any = null) {
    let table: any = initialTable;
    const chain: any = {
      from: (t: any) => { table = t; return chain; },
      where: (...args: any[]) => { dbState.whereCalls.push({ table, args }); return chain; },
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

  /** select 结果按 from 的表分发；未知表返回空数组 */
  function resolveSelect(table: any): unknown {
    const s = dbState.schema;
    if (table === s?.suppliers) return dbState.suppliers;
    if (table === s?.supplierModels) return dbState.models;
    if (table === s?.vendorPricing) return dbState.routingRows;
    if (table === s?.circuitBreakerState) return dbState.circuitStates;
    return [];
  }

  const dbMock: any = {
    select: vi.fn(() => makeChain(resolveSelect)),
    update: vi.fn((t: any) => makeChain(() => dbState.updateReturning ?? [], t)),
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

import { selectChannel } from '../src/services/upstream/routing';

// ─────────────────────────────────────────────
// Test app（只注册 supplierRoutes，避免拉起全量路由）
// ─────────────────────────────────────────────

let app: FastifyInstance;

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
  dbState.models = [];
  dbState.routingRows = [];
  dbState.circuitStates = [];
  dbState.updates = [];
  dbState.whereCalls = [];
  dbState.updateReturning = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────
// 工具：把 drizzle and() 节点序列化为可断言的 SQL 字符串 + 参数
// ─────────────────────────────────────────────

const dialect = new PgDialect();

/** 取 selectChannel 查询（from vendorPricing）的 where SQL 与参数 */
function routingWhere(): { sql: string; params: unknown[] } {
  const call = dbState.whereCalls.find((c: any) => c.table === dbState.schema.vendorPricing);
  expect(call, 'selectChannel 应发起 vendorPricing 查询').toBeDefined();
  const query = dialect.sqlToQuery(call!.args[0]);
  return { sql: query.sql, params: query.params as unknown[] };
}

// ═════════════════════════════════════════════
// 1. PATCH /api/v1/admin/models/:id/status — 单个模型禁用/启用
// ═════════════════════════════════════════════

describe('PATCH /api/v1/admin/models/:id/status — 模型禁用/启用开关', () => {
  it('status=inactive → 200 + 模型状态更新为 inactive（写回 updatedAt）', async () => {
    dbState.updateReturning = [{ id: 7, supplierId: 1, modelName: 'gpt-4o', status: 'inactive' }];

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/models/7/status',
      headers: authHeaders,
      payload: { status: 'inactive' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().model.status).toBe('inactive');

    // 断言写回：update supplier_models，set.status='inactive'
    const modelUpdate = dbState.updates.find((u: any) => u.table === dbState.schema.supplierModels);
    expect(modelUpdate).toBeDefined();
    expect(modelUpdate!.set.status).toBe('inactive');
    expect(modelUpdate!.set.updatedAt).toBeInstanceOf(Date);
  });

  it('status=active → 200 + 模型状态恢复为 active', async () => {
    dbState.updateReturning = [{ id: 7, supplierId: 1, modelName: 'gpt-4o', status: 'active' }];

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/models/7/status',
      headers: authHeaders,
      payload: { status: 'active' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().model.status).toBe('active');
  });

  it('模型不存在（update 无返回行）→ 404', async () => {
    dbState.updateReturning = null; // 模拟 DB 无匹配行

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/models/999/status',
      headers: authHeaders,
      payload: { status: 'inactive' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('未登录（无 Authorization）→ 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/models/1/status',
      payload: { status: 'inactive' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('非法 status 值 → 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/models/1/status',
      headers: authHeaders,
      payload: { status: 'deprecated' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ═════════════════════════════════════════════
// 2. POST /api/v1/admin/suppliers/:id/models/batch-status — 批量禁用/启用
// ═════════════════════════════════════════════

describe('POST /api/v1/admin/suppliers/:id/models/batch-status — 批量状态开关', () => {
  it('批量禁用多个模型 → 200 + updated 数量正确（按 supplierId + modelNames 过滤）', async () => {
    dbState.suppliers = [{ id: 1 }];
    dbState.updateReturning = [
      { id: 1, supplierId: 1, modelName: 'gpt-4o', status: 'inactive' },
      { id: 2, supplierId: 1, modelName: 'gpt-4o-mini', status: 'inactive' },
    ];

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/models/batch-status',
      headers: authHeaders,
      payload: { modelNames: ['gpt-4o', 'gpt-4o-mini'], status: 'inactive' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.updated).toBe(2);
    expect(body.status).toBe('inactive');

    // 断言批量更新落到 supplierModels 表
    const modelUpdate = dbState.updates.find((u: any) => u.table === dbState.schema.supplierModels);
    expect(modelUpdate).toBeDefined();
    expect(modelUpdate!.set.status).toBe('inactive');
  });

  it('空 modelNames → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/models/batch-status',
      headers: authHeaders,
      payload: { modelNames: [], status: 'inactive' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('非法 status 值 → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/models/batch-status',
      headers: authHeaders,
      payload: { modelNames: ['gpt-4o'], status: 'deprecated' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('supplier 不存在 → 404', async () => {
    dbState.suppliers = []; // 查无此供应商

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/999/models/batch-status',
      headers: authHeaders,
      payload: { modelNames: ['gpt-4o'], status: 'inactive' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('未登录（无 Authorization）→ 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/suppliers/1/models/batch-status',
      payload: { modelNames: ['gpt-4o'], status: 'inactive' },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ═════════════════════════════════════════════
// 3. selectChannel — 禁用（inactive）模型不参与路由
// ═════════════════════════════════════════════

describe('selectChannel — 模型禁用后自动跳过路由', () => {
  const ACTIVE_CANDIDATE = {
    supplierModelId: 11,
    modelName: 'gpt-4o',
    platformModel: 'gpt-4o',
    supplierModelStatus: 'active',
    supplierId: 1,
    supplierName: 'Test Supplier',
    supplierCode: 'TS',
    supplierBaseUrl: 'https://api.example.com',
    supplierStatus: 'active',
    supplierHealthStatus: null,
    keyId: 21,
    keyValue: 'sk-test-1',
    keyName: 'K1',
    keyStatus: 'active',
    keySelectMode: 'single',
    keyPriority: 10,
    keyCurrentBalance: '100',
  };

  it('查询 where 条件包含 supplierModels.status=active（禁用模型在 SQL 层被排除）', async () => {
    dbState.routingRows = [ACTIVE_CANDIDATE];

    await selectChannel('gpt-4o');

    const { sql, params } = routingWhere();
    expect(sql).toContain('"supplier_models"."status"');
    // active 值以参数（$n）或字面量形式出现在 where 中，二者取其一
    const activeMentioned = sql.includes("'active'") || params.includes('active');
    expect(activeMentioned).toBe(true);
  });

  it('候选模型均为 inactive（DB 按 where 过滤后为空）→ 返回 null', async () => {
    // 模拟真实 DB：where(status='active') 把 inactive 行全部过滤掉 → 无候选
    dbState.routingRows = [];

    const result = await selectChannel('gpt-4o');

    expect(result).toBeNull();
  });

  it('候选模型为 active → 正常选中渠道（返回 supplier + key + modelMapping）', async () => {
    dbState.routingRows = [ACTIVE_CANDIDATE];

    const result = await selectChannel('gpt-4o');

    expect(result).not.toBeNull();
    expect(result!.supplier.id).toBe(1);
    expect(result!.key.keyValue).toBe('sk-test-1');
    expect(result!.modelMapping.status).toBe('active');
  });
});
