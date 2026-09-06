/**
 * 模型编码管理路由 — B3/B5 单元测试（mock db/redis/jwt，不依赖真实 PG/Redis）
 *
 * 覆盖（docs/开发任务书-阶段B-后端模型编码规则接口.md §2 B3/B5）：
 * - GET  /admin/model-codes：列表字段完整（display_name/pricing_group/prices）、
 *   筛选（model_name 模糊 / supplier_id）、分页（page/page_size）、vendor_pricing 聚合
 * - PUT  /admin/model-codes/:id/status：合法启停、非法 status 400、行不存在 404、无 token 401、customer 403
 * - POST /admin/model-codes/:id/regenerate：返回 old_code/new_code、行不存在 404
 * - GET  /admin/model-code-rules：template/default_template/allowed_vars（配置空 → template ''）
 * - PUT  /admin/model-code-rules：非空合法保存+缓存失效、非法模板 400 不落库、空串恢复默认
 * - POST /admin/model-code-rules/preview：真实映射渲染、无数据占位 placeholder、空模板用默认、非法模板 400
 *
 * 纯单测风格（vi.mock db/redis/jwt + 独立 Fastify 实例 + app.inject），
 * 链式 builder 模式参照 test/model-code.test.ts。
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors.js';

// ─────────────────────────────────────────────
// Mocks（vi.hoisted 保证 vi.mock factory 可引用）
// ─────────────────────────────────────────────

const { dbMock, dbState } = vi.hoisted(() => {
  const dbState = {
    schema: null as any,
    /** GET 列表主查询（innerJoin + offset） */
    listRows: [] as any[],
    /** count 查询（innerJoin 无 limit） */
    countRows: [] as any[],
    /** preview 查询（innerJoin + limit 3） */
    previewRows: [] as any[],
    /** vendor_pricing 查询 */
    vpRows: [] as any[],
    /** system_config 查询（limit 1） */
    configRows: [] as any[],
    /** supplier_models 单行查询（limit 1：status/regenerate/generate 前查行） */
    supplierModelRow: null as any,
    /** suppliers 单行查询（limit 1） */
    supplierRow: null as any,
    /** supplier_models 占用编码查询（无 limit） */
    occupiedRows: [] as any[],
    /** 非空时 select 抛错（模拟 DB 异常） */
    dbError: null as Error | null,
    /** system_config upsert 调用记录 */
    upserts: [] as Array<{ key: string; value: string }>,
    /** supplier_models update 调用记录 */
    updates: [] as Array<{ values: any }>,
  };

  /** 可 await 的 Drizzle select 链式 builder：按表/join/limit 组合解析结果 */
  function makeSelectChain() {
    let table: any;
    let joined = false;
    let limited = false;
    let limitCount = 0;
    let hasOffset = false;
    const chain: any = {
      from: (t: any) => { table = t; return chain; },
      innerJoin: () => { joined = true; return chain; },
      where: () => chain,
      orderBy: () => chain,
      limit: (n?: number) => { limited = true; limitCount = Number(n ?? 0); return chain; },
      offset: () => { hasOffset = true; return chain; },
      then: (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) => {
        if (dbState.dbError) return Promise.reject(dbState.dbError).then(onFulfilled, onRejected);
        let result: any[] = [];
        if (table === dbState.schema?.systemConfig) {
          result = dbState.configRows;
        } else if (table === dbState.schema?.vendorPricing) {
          result = dbState.vpRows;
        } else if (table === dbState.schema?.suppliers) {
          result = dbState.supplierRow ? [dbState.supplierRow] : [];
        } else if (table === dbState.schema?.supplierModels) {
          if (joined) {
            // innerJoin：offset → 列表主查询；limit 3 → preview；无 limit → count
            result = hasOffset ? dbState.listRows : limited && limitCount === 3 ? dbState.previewRows : dbState.countRows;
          } else {
            // 无 join：limit(1) → 单行查询；无 limit → 占用编码查询
            result = limited ? (dbState.supplierModelRow ? [dbState.supplierModelRow] : []) : dbState.occupiedRows;
          }
        }
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  /** 可 await 的 Drizzle 写操作链式 builder（insert/update/delete） */
  function makeMutationChain() {
    let lastSet: any;
    let lastValues: any;
    const chain: any = {
      set: (v: any) => { lastSet = v; return chain; },
      values: (v: any) => { lastValues = v; return chain; },
      where: () => chain,
      onConflictDoUpdate: (opts: any) => {
        if (lastValues && lastValues.key !== undefined) {
          dbState.upserts.push({
            key: String(lastValues.key),
            value: String(opts?.set?.value ?? lastValues.value),
          });
        }
        return chain;
      },
      returning: () => chain,
      then: (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) => {
        if (lastSet) dbState.updates.push({ values: lastSet });
        return Promise.resolve([]).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  const dbMock: any = {
    select: vi.fn(() => makeSelectChain()),
    update: vi.fn(() => makeMutationChain()),
    insert: vi.fn(() => makeMutationChain()),
    delete: vi.fn(() => makeMutationChain()),
    transaction: vi.fn((fn: any) => fn(dbMock)),
  };

  return { dbMock, dbState };
});

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/index.js')>();
  dbState.schema = actual.schema; // 保留真实 schema，供 eq()/ilike()/inArray() 构建条件
  return { ...actual, db: dbMock };
});

vi.mock('../lib/redis', () => ({
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => {}),
  cacheDel: vi.fn(async () => {}),
}));

vi.mock('../services/auth/jwt.js', () => ({
  verifyToken: vi.fn(() => ({ role: 'admin' })),
}));

// ─────────────────────────────────────────────
// 被测模块（mock 就绪后 import）
// ─────────────────────────────────────────────

import { adminModelCodesRoutes } from './admin-model-codes.js';
import { verifyToken } from '../services/auth/jwt.js';
import { cacheDel } from '../lib/redis.js';

const ADMIN_TOKEN = 'Bearer admin-token';
const authHeaders = { authorization: ADMIN_TOKEN };

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify();
  // 与 app.ts setErrorHandler 一致的错误映射（AppError → statusCode）
  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        statusCode: err.statusCode,
        code: err.code,
        error: err.name,
        message: err.message,
        ...(err.context && Object.keys(err.context).length > 0 ? { details: err.context } : {}),
      });
    }
    return reply.send(err);
  });
  await app.register(adminModelCodesRoutes);
  await app.ready();
  return app;
}

describe('admin-model-codes 路由（B3）', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    dbState.listRows = [];
    dbState.countRows = [];
    dbState.previewRows = [];
    dbState.vpRows = [];
    dbState.configRows = [];
    dbState.supplierModelRow = null;
    dbState.supplierRow = null;
    dbState.occupiedRows = [];
    dbState.dbError = null;
    dbState.upserts = [];
    dbState.updates = [];
    vi.mocked(verifyToken).mockClear();
    vi.mocked(verifyToken).mockReturnValue({ role: 'admin' } as any);
    vi.mocked(cacheDel).mockClear();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /admin/model-codes', () => {
    it('列表：同模型多供应商并排，display_name/pricing_group/prices 完整', async () => {
      app = await buildTestApp();
      dbState.listRows = [
        { id: 11, modelCode: 'va-deepseek-v4-flash', modelName: 'deepseek-v4-flash', platformModel: 'deepseek-v4-flash', status: 'active', inputPrice: '0.80', outputPrice: '2.40', supplierId: 1, supplierCode: 'va', supplierName: '供应商A' },
        { id: 12, modelCode: 'vb-deepseek-v4-flash', modelName: 'deepseek-v4-flash', platformModel: 'deepseek-v4-flash', status: 'active', inputPrice: '0.90', outputPrice: '2.60', supplierId: 2, supplierCode: 'vb', supplierName: '供应商B' },
      ];
      dbState.countRows = [{ count: 2 }];
      dbState.vpRows = [
        { supplierModelId: 11, pricingGroup: 'default', inputPrice: '0.80', outputPrice: '2.40', cacheReadInputPrice: '0.08', cacheWriteInputPrice: null },
        { supplierModelId: 11, pricingGroup: 'enterprise', inputPrice: '0.60', outputPrice: '2.00', cacheReadInputPrice: null, cacheWriteInputPrice: null },
        { supplierModelId: 12, pricingGroup: 'default', inputPrice: '0.90', outputPrice: '2.60', cacheReadInputPrice: null, cacheWriteInputPrice: null },
      ];

      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/model-codes', headers: authHeaders });
      expect(res.statusCode).toBe(200);
      const { list, pagination } = res.json().data;
      expect(list).toHaveLength(2);
      expect(list[0]).toMatchObject({
        model_code: 'va-deepseek-v4-flash',
        display_name: 'deepseek-v4-flash（供应商A）',
        supplier_code: 'va',
        pricing_group: 'enterprise',
        prices: { input: '0.80', output: '2.40', cache_read_input: '0.08', cache_write_input: null },
      });
      expect(list[1].pricing_group).toBe('default');
      expect(pagination).toEqual({ page: 1, pageSize: 20, total: 2 });
    });

    it('筛选：model_name 模糊 + supplier_id 精确，分页生效', async () => {
      app = await buildTestApp();
      dbState.listRows = [{ id: 11, modelCode: 'va-deepseek-v4-flash', modelName: 'deepseek-v4-flash', platformModel: 'deepseek-v4-flash', status: 'active', inputPrice: '0.80', outputPrice: '2.40', supplierId: 1, supplierCode: 'va', supplierName: '供应商A' }];
      dbState.countRows = [{ count: 1 }];
      dbState.vpRows = [];

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/model-codes?model_name=flash&supplier_id=1&page=2&page_size=10',
        headers: authHeaders,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.pagination).toEqual({ page: 2, pageSize: 10, total: 1 });
    });

    it('supplier_id 非法 → 400', async () => {
      app = await buildTestApp();
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/model-codes?supplier_id=abc', headers: authHeaders });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    });

    it('无 token → 401；customer 角色 → 403', async () => {
      app = await buildTestApp();
      const noToken = await app.inject({ method: 'GET', url: '/api/v1/admin/model-codes' });
      expect(noToken.statusCode).toBe(401);

      vi.mocked(verifyToken).mockReturnValueOnce({ role: 'customer' } as any);
      const customer = await app.inject({ method: 'GET', url: '/api/v1/admin/model-codes', headers: authHeaders });
      expect(customer.statusCode).toBe(403);
    });
  });

  describe('PUT /admin/model-codes/:id/status', () => {
    it('合法 status：active → disabled 落库', async () => {
      app = await buildTestApp();
      dbState.supplierModelRow = { id: 11 };
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/model-codes/11/status', headers: authHeaders,
        payload: { status: 'inactive' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ id: 11, status: 'inactive' });
      expect(dbState.updates[0]?.values?.status).toBe('inactive');
    });

    it('非法 status → 400', async () => {
      app = await buildTestApp();
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/model-codes/11/status', headers: authHeaders,
        payload: { status: 'paused' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('行不存在 → 404', async () => {
      app = await buildTestApp();
      dbState.supplierModelRow = null;
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/model-codes/999/status', headers: authHeaders,
        payload: { status: 'active' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /admin/model-codes/:id/regenerate', () => {
    it('返回 old_code/new_code（按默认模板 厂商+模型 渲染）', async () => {
      app = await buildTestApp();
      dbState.supplierModelRow = { id: 12, supplierId: 2, modelName: 'deepseek-v4-flash', platformModel: 'deepseek-v4-flash', status: 'active', modelCode: 'old-code' };
      dbState.supplierRow = { id: 2, code: 'vb', name: '供应商B', status: 'active' };
      dbState.occupiedRows = [{ code: 'old-code' }]; // 旧值占用 → 强制新编码，防复用
      dbState.configRows = []; // 无配置 → 默认模板 {supplier_code}-{model_name}

      const res = await app.inject({ method: 'POST', url: '/api/v1/admin/model-codes/12/regenerate', headers: authHeaders });
      expect(res.statusCode).toBe(200);
      const { old_code, new_code } = res.json().data;
      expect(old_code).toBe('old-code');
      expect(new_code).toBe('vb-deepseek-v4-flash');
      expect(dbState.updates[0]?.values?.modelCode).toBe('vb-deepseek-v4-flash');
    });

    it('行不存在 → 404', async () => {
      app = await buildTestApp();
      dbState.supplierModelRow = null;
      const res = await app.inject({ method: 'POST', url: '/api/v1/admin/model-codes/999/regenerate', headers: authHeaders });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET/PUT /admin/model-code-rules', () => {
    it('GET：无配置 → template 空串 + 默认模板 + 白名单', async () => {
      app = await buildTestApp();
      dbState.configRows = [];
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/model-code-rules', headers: authHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        template: '',
        default_template: '{supplier_code}-{model_name}',
      });
      expect(res.json().data.allowed_vars).toContain('model_name');
      expect(res.json().data.allowed_vars).toContain('seq');
    });

    it('GET：已有配置 → 返回配置值', async () => {
      app = await buildTestApp();
      dbState.configRows = [{ value: '{model_name}-{supplier_code}' }];
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/model-code-rules', headers: authHeaders });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.template).toBe('{model_name}-{supplier_code}');
    });

    it('PUT：非空合法模板 → 保存 + 失效缓存', async () => {
      app = await buildTestApp();
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/model-code-rules', headers: authHeaders,
        payload: { template: '{model_name}-{supplier_code}' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.template).toBe('{model_name}-{supplier_code}');
      expect(dbState.upserts.some((u) => u.key === 'model_code.template' && u.value === '{model_name}-{supplier_code}')).toBe(true);
      expect(cacheDel).toHaveBeenCalled();
    });

    it('PUT：非法模板（未知变量）→ 400 不落库', async () => {
      app = await buildTestApp();
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/model-code-rules', headers: authHeaders,
        payload: { template: '{unknown}-x' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
      expect(dbState.upserts).toHaveLength(0);
    });

    it('PUT：空串 → 恢复默认（存空配置）', async () => {
      app = await buildTestApp();
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/model-code-rules', headers: authHeaders,
        payload: { template: '' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.template).toBe('');
      expect(dbState.upserts.some((u) => u.key === 'model_code.template' && u.value === '')).toBe(true);
      expect(cacheDel).toHaveBeenCalled();
    });
  });

  describe('POST /admin/model-code-rules/preview', () => {
    it('有真实映射 → 按模板渲染示例（placeholder=false）', async () => {
      app = await buildTestApp();
      dbState.previewRows = [
        { supplierCode: 'vb', supplierName: '供应商B', modelName: 'deepseek-v4-flash', platformModel: 'deepseek-v4-flash', status: 'active' },
      ];
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/model-code-rules/preview', headers: authHeaders,
        payload: { template: '{supplier_code}-{model_name}' },
      });
      expect(res.statusCode).toBe(200);
      const { preview } = res.json().data;
      expect(preview).toHaveLength(1);
      expect(preview[0]).toMatchObject({ supplier_code: 'vb', model_name: 'deepseek-v4-flash', rendered_code: 'vb-deepseek-v4-flash', placeholder: false });
    });

    it('无数据 → 占位示例并标注 placeholder=true', async () => {
      app = await buildTestApp();
      dbState.previewRows = [];
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/model-code-rules/preview', headers: authHeaders,
        payload: { template: '{supplier_code}-{model_name}' },
      });
      expect(res.statusCode).toBe(200);
      const { preview } = res.json().data;
      expect(preview).toHaveLength(1);
      expect(preview[0].placeholder).toBe(true);
      expect(preview[0].rendered_code).toContain('vendor_a');
    });

    it('空模板 → 用默认模板渲染', async () => {
      app = await buildTestApp();
      dbState.previewRows = [
        { supplierCode: 'vb', supplierName: '供应商B', modelName: 'deepseek-v4-flash', platformModel: 'deepseek-v4-flash', status: 'active' },
      ];
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/model-code-rules/preview', headers: authHeaders,
        payload: { template: '' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.preview[0].rendered_code).toBe('vb-deepseek-v4-flash');
    });

    it('非法模板 → 400', async () => {
      app = await buildTestApp();
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/model-code-rules/preview', headers: authHeaders,
        payload: { template: '{unknown}-x' },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
