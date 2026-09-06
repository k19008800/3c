/**
 * 模型编码生成核心 + 模板配置服务 — B1/B2 单元测试
 *
 * 覆盖（docs/开发任务书-阶段B-后端模型编码规则接口.md §2 B1/B2）：
 * - B1 renderModelCode：默认/自定义模板、model_short 缩写、清洗（空格/中文/./@）、
 *   截断 200、全清洗报错、未知变量/@/空模板报错、冲突序号兜底、{seq} 模板、纯函数无副作用；
 * - B2 模板配置：getModelCodeTemplate（默认/自定义/空值/缓存命中/DB 异常）、
 *   setModelCodeTemplate（合法落库+失效缓存/非法 400 不落库）、validateModelCodeTemplate；
 * - generateModelCodeForSupplierModel：正常流程/供应商非 active/映射非 active/冲突序号兜底。
 *
 * 纯单测风格（mock db / redis，不依赖真实 PG / Redis），
 * 链式 builder 模式参照 test/cache-pricing-explicit.test.ts。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────
// Mocks（vi.hoisted 保证 vi.mock factory 可引用）
// ─────────────────────────────────────────────

const { dbMock, dbState } = vi.hoisted(() => {
  const dbState = {
    /** 真实 schema（由 ../src/db mock factory 注入，用于表识别） */
    schema: null as any,
    /** select().from(systemConfig) 的返回值（getModelCodeTemplate 读取） */
    systemConfigRows: [] as any[],
    /** select().from(supplierModels).limit(1) 的单行查询结果（按 id 查映射） */
    supplierModelRow: null as any,
    /** select().from(suppliers).limit(1) 的单行查询结果 */
    supplierRow: null as any,
    /** select().from(supplierModels)（无 limit）的占用编码查询结果 */
    occupiedRows: [] as any[],
    /** 非空时 select 抛错（模拟 DB 异常） */
    dbError: null as Error | null,
    /** insert().values().onConflictDoUpdate() 的调用记录（断言 upsert 落库） */
    upserts: [] as Array<{ key: string; value: string }>,
    /** update().set() 的调用记录（断言落库 modelCode） */
    updates: [] as Array<{ values: any }>,
  };

  /** 可 await 的 Drizzle select 链式 builder：按 table + 是否 limit 解析结果 */
  function makeSelectChain() {
    let table: any;
    let limited = false;
    const chain: any = {
      from: (t: any) => { table = t; return chain; },
      where: () => chain,
      orderBy: () => chain,
      limit: () => { limited = true; return chain; },
      then: (onFulfilled: (v: unknown) => void, onRejected: (e: unknown) => void) => {
        if (dbState.dbError) return Promise.reject(dbState.dbError).then(onFulfilled, onRejected);
        let result: any[] = [];
        if (table === dbState.schema?.systemConfig) {
          result = dbState.systemConfigRows;
        } else if (table === dbState.schema?.supplierModels) {
          // limit(1) → 单行 id 查询；无 limit → 占用编码查询
          result = limited ? (dbState.supplierModelRow ? [dbState.supplierModelRow] : []) : dbState.occupiedRows;
        } else if (table === dbState.schema?.suppliers) {
          result = dbState.supplierRow ? [dbState.supplierRow] : [];
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

vi.mock('../src/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db')>();
  dbState.schema = actual.schema; // 保留真实 schema，供 eq()/isNotNull() 构建条件
  return { ...actual, db: dbMock };
});

vi.mock('../src/lib/redis', () => ({
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => {}),
  cacheDel: vi.fn(async () => {}),
}));

// ─────────────────────────────────────────────
// 被测模块（mock 就绪后 import）
// ─────────────────────────────────────────────

import { cacheGet, cacheDel } from '../src/lib/redis';
import { ValidationError } from '../src/lib/errors';
import {
  renderModelCode,
  validateModelCodeTemplate,
  getModelCodeTemplate,
  setModelCodeTemplate,
  invalidateModelCodeTemplateCache,
  generateModelCodeForSupplierModel,
  MODEL_CODE_DEFAULT_TEMPLATE,
  MODEL_CODE_ALLOWED_VARS,
  MODEL_CODE_TEMPLATE_CONFIG_KEY,
  type ModelCodeTemplateVars,
} from '../src/services/upstream/model-code';

/** 测试用默认变量集 */
function vars(overrides: Partial<ModelCodeTemplateVars> = {}): ModelCodeTemplateVars {
  return {
    supplierCode: 'vb',
    supplierName: 'Vendor B',
    modelName: 'deepseek-v4-flash',
    platformModel: 'deepseek-v4-flash',
    ...overrides,
  };
}

// ============================================================
// 顶层 describe 命名 model-code，使 `pnpm test -- -t "model-code"` 可命中全部用例
// ============================================================

describe('model-code', () => {
// ============================================================
// B1 — renderModelCode（纯函数）
// ============================================================

describe('B1 renderModelCode — 渲染', () => {
  it('默认模板 {supplier_code}-{model_name} → vb-deepseek-v4-flash（手算：vb + - + deepseek-v4-flash）', () => {
    expect(renderModelCode('{supplier_code}-{model_name}', vars())).toBe('vb-deepseek-v4-flash');
  });

  it('自定义模板 {model_name}-{supplier_code} → 顺序翻转：deepseek-v4-flash-vb', () => {
    expect(renderModelCode('{model_name}-{supplier_code}', vars())).toBe('deepseek-v4-flash-vb');
  });

  it('{platform_model} 变量渲染（字面量 / 被清洗为 -）', () => {
    // {supplier_code}/{platform_model} → '/' 不在 [a-zA-Z0-9_-] → 清洗为 '-'
    expect(renderModelCode('{supplier_code}/{platform_model}', vars())).toBe('vb-deepseek-v4-flash');
  });

  it('{supplier_name} 变量渲染（值中空格被清洗为 -）', () => {
    // supplierName='Vendor B' → 空格清洗为 '-'；字面量 _ 合法保留
    expect(renderModelCode('{supplier_code}_{supplier_name}', vars())).toBe('vb_Vendor-B');
  });
});

describe('B1 renderModelCode — {model_short} 缩写（保留连字符，与旧 slugModelName 不同）', () => {
  it('DeepSeek V4 Flash (Pro) → deepseek-v4（小写/空格转-/括号去除/截断12/保留连字符）', () => {
    // 手算：lowercase → 'deepseek v4 flash (pro)'
    // 非[a-z0-9-]→- → 'deepseek-v4-flash--pro-' → 合并 → 'deepseek-v4-flash-pro-'
    // 首尾去 → 'deepseek-v4-flash-pro' → slice(0,12) → 'deepseek-v4-' → 再去尾- → 'deepseek-v4'
    expect(renderModelCode('{model_short}', vars({ modelName: 'DeepSeek V4 Flash (Pro)' }))).toBe('deepseek-v4');
  });

  it('{model_short} 保留连字符（旧 slugModelName 不含连字符，新版保留）', () => {
    // 旧规则 replace(/[^a-z0-9]/g,'') 会把 '-' 也删掉；新版保留 '-'
    // 'gpt-4o mini' → lowercase → 空格转- → 'gpt-4o-mini'（11 字符，未截断）
    expect(renderModelCode('{model_short}', vars({ modelName: 'gpt-4o mini' }))).toBe('gpt-4o-mini');
  });
});

describe('B1 renderModelCode — 清洗规则（补充1 §2.3）', () => {
  it('变量值含空格/中文/. → 非法字符替换为 -、连续合并、首尾去除', () => {
    // supplierName='  测 试 .vendor  '
    // 每个非[a-zA-Z0-9_-]字符 → '-'：'------vendor--'
    // 连续-合并 → '-vendor-' → 首尾去除 → 'vendor'
    expect(renderModelCode('{supplier_name}', vars({ supplierName: '  测 试 .vendor  ' }))).toBe('vendor');
  });

  it('变量值含 @ → 替换为 -（@ 在模板字面量才拒绝，在变量值中清洗掉）', () => {
    // supplierCode='vb@test' → 'vb-test'（@ → -）
    expect(renderModelCode('{supplier_code}', vars({ supplierCode: 'vb@test' }))).toBe('vb-test');
  });

  it('截断 200 字符：超长变量值 → 结果 ≤ 200', () => {
    const longName = 'a'.repeat(300);
    const out = renderModelCode('{model_name}', vars({ modelName: longName }));
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out).toBe('a'.repeat(200));
  });

  it('全清洗为空 → 抛 ValidationError（提示变量值不可编码）', () => {
    // 全部中文字符 → 每个替换为 - → 合并为空
    expect(() => renderModelCode('{supplier_name}', vars({ supplierName: '测试编码' }))).toThrow(ValidationError);
    expect(() => renderModelCode('{supplier_name}', vars({ supplierName: '测试编码' }))).toThrow(
      '变量值不可编码',
    );
  });
});

describe('B1 renderModelCode — 模板校验', () => {
  it('未知变量 {unknown_var} → 抛 ValidationError', () => {
    expect(() => renderModelCode('{unknown_var}', vars())).toThrow(ValidationError);
    expect(() => renderModelCode('{unknown_var}', vars())).toThrow('未知变量');
  });

  it('模板含 @ → 抛 ValidationError', () => {
    expect(() => renderModelCode('{supplier_code}@{model_name}', vars())).toThrow(ValidationError);
  });

  it('空模板 → 抛 ValidationError', () => {
    expect(() => renderModelCode('', vars())).toThrow(ValidationError);
  });

  it('空白模板 → 抛 ValidationError', () => {
    expect(() => renderModelCode('   ', vars())).toThrow(ValidationError);
  });
});

describe('B1 renderModelCode — 冲突序号兜底', () => {
  it('occupied 含 base → 追加 -2', () => {
    const occupied = new Set(['vb-m']);
    expect(renderModelCode('{supplier_code}-{model_name}', vars({ modelName: 'm' }), occupied)).toBe('vb-m-2');
  });

  it('occupied 含 base 与 -2 → 追加 -3', () => {
    const occupied = new Set(['vb-m', 'vb-m-2']);
    expect(renderModelCode('{supplier_code}-{model_name}', vars({ modelName: 'm' }), occupied)).toBe('vb-m-3');
  });

  it('模板含 {seq}：seq=1 被占用 → seq=2', () => {
    const occupied = new Set(['vb-m-1']);
    expect(
      renderModelCode('{supplier_code}-{model_name}-{seq}', vars({ modelName: 'm' }), occupied),
    ).toBe('vb-m-2');
  });

  it('模板含 {seq}：seq=1 未占用 → 返回 seq=1 结果', () => {
    const occupied = new Set(['other']);
    expect(
      renderModelCode('{supplier_code}-{model_name}-{seq}', vars({ modelName: 'm' }), occupied),
    ).toBe('vb-m-1');
  });

  it('无 occupied 集合 → 直接返回 base（不追加序号）', () => {
    expect(renderModelCode('{supplier_code}-{model_name}', vars())).toBe('vb-deepseek-v4-flash');
  });
});

describe('B1 renderModelCode — 纯函数无副作用', () => {
  it('同输入多次调用结果一致', () => {
    const tpl = '{supplier_code}-{model_name}';
    const v = vars();
    const a = renderModelCode(tpl, v);
    const b = renderModelCode(tpl, v);
    expect(a).toBe(b);
  });

  it('白名单常量包含全部 6 个变量', () => {
    expect([...MODEL_CODE_ALLOWED_VARS].sort()).toEqual(
      ['supplier_code', 'supplier_name', 'model_name', 'model_short', 'platform_model', 'seq'].sort(),
    );
  });

  it('默认模板常量为 {supplier_code}-{model_name}', () => {
    expect(MODEL_CODE_DEFAULT_TEMPLATE).toBe('{supplier_code}-{model_name}');
  });
});

// ============================================================
// B2 — validateModelCodeTemplate（纯校验）
// ============================================================

describe('B2 validateModelCodeTemplate', () => {
  it('合法模板 → 不抛错', () => {
    expect(() => validateModelCodeTemplate('{supplier_code}-{model_name}')).not.toThrow();
    expect(() => validateModelCodeTemplate('{model_name}-{supplier_code}-{seq}')).not.toThrow();
  });

  it('空模板 → 抛 ValidationError("模板不能为空")', () => {
    expect(() => validateModelCodeTemplate('')).toThrow('模板不能为空');
    expect(() => validateModelCodeTemplate('   ')).toThrow('模板不能为空');
  });

  it('含 @ → 抛 ValidationError("模板不得包含 @")', () => {
    expect(() => validateModelCodeTemplate('{supplier_code}@{model_name}')).toThrow('模板不得包含 @');
  });

  it('未知变量 → 抛 ValidationError(`未知变量: {var}`)', () => {
    expect(() => validateModelCodeTemplate('{unknown_var}')).toThrow('未知变量: {unknown_var}');
  });

  it('字面量含普通字符（如 / .）→ 允许（渲染时清洗）', () => {
    expect(() => validateModelCodeTemplate('{supplier_code}/{model_name}.v2')).not.toThrow();
  });
});

// ============================================================
// B2 — getModelCodeTemplate（mock db + redis）
// ============================================================

describe('B2 getModelCodeTemplate', () => {
  beforeEach(() => {
    dbState.systemConfigRows = [];
    dbState.dbError = null;
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.clearAllMocks();
  });

  it('无配置记录 → 返回默认模板 {supplier_code}-{model_name}', async () => {
    dbState.systemConfigRows = [];
    expect(await getModelCodeTemplate()).toBe(MODEL_CODE_DEFAULT_TEMPLATE);
  });

  it('DB 有自定义模板 → 返回该模板', async () => {
    dbState.systemConfigRows = [{ key: MODEL_CODE_TEMPLATE_CONFIG_KEY, value: '{model_name}-{supplier_code}' }];
    expect(await getModelCodeTemplate()).toBe('{model_name}-{supplier_code}');
  });

  it('DB 返回空字符串 value → 回退默认模板', async () => {
    dbState.systemConfigRows = [{ key: MODEL_CODE_TEMPLATE_CONFIG_KEY, value: '' }];
    expect(await getModelCodeTemplate()).toBe(MODEL_CODE_DEFAULT_TEMPLATE);
  });

  it('Redis 缓存命中 → 直接返回，不再查 DB', async () => {
    vi.mocked(cacheGet).mockResolvedValue('{cached-template}');
    dbState.systemConfigRows = [];
    expect(await getModelCodeTemplate()).toBe('{cached-template}');
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('DB 异常 → 返回默认模板（不抛错，不污染缓存）', async () => {
    dbState.dbError = new Error('db down');
    expect(await getModelCodeTemplate()).toBe(MODEL_CODE_DEFAULT_TEMPLATE);
  });
});

describe('B2 invalidateModelCodeTemplateCache', () => {
  it('调用 cacheDel 失效模板缓存', async () => {
    await invalidateModelCodeTemplateCache();
    expect(cacheDel).toHaveBeenCalledWith('model_code:template');
  });
});

// ============================================================
// B2 — setModelCodeTemplate（mock db + redis）
// ============================================================

describe('B2 setModelCodeTemplate', () => {
  beforeEach(() => {
    dbState.upserts = [];
    dbState.dbError = null;
    vi.clearAllMocks();
  });

  it('合法模板 → upsert 落库 + cacheDel 失效缓存', async () => {
    await setModelCodeTemplate('{model_name}-{supplier_code}');
    expect(dbState.upserts).toContainEqual({
      key: MODEL_CODE_TEMPLATE_CONFIG_KEY,
      value: '{model_name}-{supplier_code}',
    });
    expect(cacheDel).toHaveBeenCalledWith('model_code:template');
  });

  it('未知变量 → 抛 ValidationError（不落库）', async () => {
    await expect(setModelCodeTemplate('{unknown_var}')).rejects.toThrow(ValidationError);
    expect(dbState.upserts).toHaveLength(0);
  });

  it('含 @ → 抛 ValidationError（不落库）', async () => {
    await expect(setModelCodeTemplate('{supplier_code}@{model_name}')).rejects.toThrow(ValidationError);
    expect(dbState.upserts).toHaveLength(0);
  });

  it('空模板 → 抛 ValidationError（不落库）', async () => {
    await expect(setModelCodeTemplate('')).rejects.toThrow(ValidationError);
    expect(dbState.upserts).toHaveLength(0);
  });
});

// ============================================================
// B1 — generateModelCodeForSupplierModel（mock db）
// ============================================================

describe('B1 generateModelCodeForSupplierModel', () => {
  const activeRow = {
    id: 1,
    supplierId: 10,
    modelName: 'deepseek-v4-flash',
    platformModel: 'deepseek-v4-flash',
    status: 'active',
    modelCode: null,
  };
  const activeSupplier = { id: 10, code: 'vb', name: 'Vendor B', status: 'active' };

  beforeEach(() => {
    dbState.systemConfigRows = []; // 默认模板
    dbState.supplierModelRow = activeRow;
    dbState.supplierRow = activeSupplier;
    dbState.occupiedRows = [];
    dbState.updates = [];
    dbState.dbError = null;
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.clearAllMocks();
  });

  it('正常流程：查映射+供应商 → 默认模板 → 渲染 → update 落库 → 返回编码', async () => {
    const code = await generateModelCodeForSupplierModel(1);
    // 默认模板 {supplier_code}-{model_name} = 'vb-deepseek-v4-flash'
    expect(code).toBe('vb-deepseek-v4-flash');
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].values.modelCode).toBe('vb-deepseek-v4-flash');
  });

  it('供应商非 active（maintenance）→ 抛 ValidationError', async () => {
    dbState.supplierRow = { ...activeSupplier, status: 'maintenance' };
    await expect(generateModelCodeForSupplierModel(1)).rejects.toThrow(ValidationError);
    await expect(generateModelCodeForSupplierModel(1)).rejects.toThrow('供应商非 active');
    expect(dbState.updates).toHaveLength(0);
  });

  it('模型映射非 active（inactive）→ 抛 ValidationError', async () => {
    dbState.supplierModelRow = { ...activeRow, status: 'inactive' };
    await expect(generateModelCodeForSupplierModel(1)).rejects.toThrow(ValidationError);
    await expect(generateModelCodeForSupplierModel(1)).rejects.toThrow('模型映射非 active');
    expect(dbState.updates).toHaveLength(0);
  });

  it('冲突时序号兜底：occupied 含 base → 生成 -2', async () => {
    dbState.occupiedRows = [{ code: 'vb-deepseek-v4-flash' }];
    const code = await generateModelCodeForSupplierModel(1);
    expect(code).toBe('vb-deepseek-v4-flash-2');
    expect(dbState.updates[0].values.modelCode).toBe('vb-deepseek-v4-flash-2');
  });

  it('使用 DB 配置的自定义模板生成', async () => {
    dbState.systemConfigRows = [{ key: MODEL_CODE_TEMPLATE_CONFIG_KEY, value: '{model_name}-{supplier_code}' }];
    const code = await generateModelCodeForSupplierModel(1);
    expect(code).toBe('deepseek-v4-flash-vb');
  });

  it('映射行不存在 → 抛 ValidationError', async () => {
    dbState.supplierModelRow = null;
    await expect(generateModelCodeForSupplierModel(999)).rejects.toThrow(ValidationError);
  });
});
});
