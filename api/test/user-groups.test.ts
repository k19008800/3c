/**
 * 用户分组（Group）单元测试 — newapi-gap-analysis.md Batch 2 任务 2.3 / Gate 2.3
 *
 * 纯单测风格：mock db（../src/db）、Redis（../src/lib/redis）、JWT（../src/services/auth/jwt），
 * 不依赖真实 PG / Redis。
 *
 * 覆盖：
 *  - service：getUserGroup（绑定 / 回退默认组 / 无默认组 / 缓存命中）、
 *    getEffectiveQuotas、isModelAllowedForUser、ensureDefaultGroup
 *  - 管理端路由：创建（201 + 写库 / name 重复 400）、更新（isDefault 复位）、
 *    删除（有成员 400 / 默认组 400 / 正常成功）、设置用户分组（upsert + 缓存清除）
 *  - 用户侧路由：me/group、me/group/models（白名单空 → 全量；非空 → 过滤）、未登录 401
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { userGroups, userGroupMemberships, users, supplierModels } from '../src/db/schema';

// ─────────────────────────────────────────────
// Mocks（vi.hoisted 保证 vi.mock factory 可引用）
// ─────────────────────────────────────────────

const { dbMock, dbState } = vi.hoisted(() => {
  interface InsertRecord {
    table: any;
    values: any;
    onConflict: boolean;
  }
  interface UpdateRecord {
    table: any;
    set: any;
  }
  interface DeleteRecord {
    table: any;
  }

  const dbState = {
    /** 真实 schema（由 ../src/db mock factory 注入，用于表识别） */
    schema: null as any,
    /** 表对象 → 行数组（select 结果） */
    rows: new Map<any, any[]>(),
    /** db.insert(...).values(...) 调用记录 */
    inserts: [] as InsertRecord[],
    /** db.update(...).set(...) 调用记录 */
    updates: [] as UpdateRecord[],
    /** db.delete(...) 调用记录 */
    deletes: [] as DeleteRecord[],
    /** 自动递增 id（insert returning 用） */
    nextId: 1,
  };

  /** 可 await 的 Drizzle 链式 builder：方法全部返回自身，await 时按表解析结果 */
  function makeChain(table: any = null, shape: any = null) {
    const state: any = { table, shape, set: null, values: null, onConflict: false, returning: false };
    const chain: any = {
      from: (t: any) => { state.table = t; return chain; },
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      groupBy: () => chain,
      limit: () => chain,
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
    // insert：记录 values；returning → 生成带 id 的行
    if (state.values) {
      dbState.inserts.push({ table: state.table, values: state.values, onConflict: state.onConflict });
      if (state.returning) return [{ id: dbState.nextId++, ...state.values }];
      return [];
    }
    // update：记录 set；returning → 回显 set
    if (state.set) {
      dbState.updates.push({ table: state.table, set: state.set });
      if (state.returning) return [{ id: 1, ...state.set }];
      return [];
    }
    // count 查询（select shape 含 count 键）→ 返回行数
    const rows = dbState.rows.get(state.table) ?? [];
    if (state.shape && 'count' in state.shape) {
      return [{ count: rows.length }];
    }
    return rows;
  }

  const dbMock: any = {
    select: vi.fn((shape: any = {}) => makeChain(null, shape)),
    insert: vi.fn((t: any) => makeChain(t)),
    update: vi.fn((t: any) => makeChain(t)),
    delete: vi.fn((t: any) => {
      dbState.deletes.push({ table: t });
      return makeChain(t);
    }),
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

vi.mock('../src/lib/redis', () => ({
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => {}),
  cacheDel: vi.fn(async () => {}),
}));

import { verifyToken } from '../src/services/auth/jwt';
import { cacheGet, cacheSet, cacheDel } from '../src/lib/redis';
import {
  getUserGroup,
  getEffectiveQuotas,
  isModelAllowedForUser,
  ensureDefaultGroup,
} from '../src/services/groups';

// ─────────────────────────────────────────────
// Fixtures & test app
// ─────────────────────────────────────────────

/** 分组行夹具（覆盖 service select 全部字段） */
function makeGroup(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: 'default',
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

const GROUP_DEFAULT = makeGroup({ id: 1, name: 'default', isDefault: true });
const GROUP_VIP = makeGroup({
  id: 2,
  name: 'vip',
  description: 'VIP 分组',
  pricingGroup: 'vip',
  isDefault: false,
});

/** 设置某表的查询返回行 */
function setRows(table: any, rows: any[]) {
  dbState.rows.set(table, rows);
}

let adminApp: FastifyInstance;
let meApp: FastifyInstance;

const adminHeaders = { authorization: 'Bearer admin-token' };
const userHeaders = { authorization: 'Bearer user-token' };

beforeAll(async () => {
  const { adminGroupRoutes } = await import('../src/routes/admin-groups');
  const { meRoutes } = await import('../src/routes/me');
  adminApp = Fastify();
  await adminApp.register(adminGroupRoutes);
  await adminApp.ready();
  meApp = Fastify();
  await meApp.register(meRoutes);
  await meApp.ready();
});

afterAll(async () => {
  await adminApp.close();
  await meApp.close();
});

beforeEach(() => {
  dbState.rows = new Map();
  dbState.inserts = [];
  dbState.updates = [];
  dbState.deletes = [];
  dbState.nextId = 1;
  vi.mocked(cacheGet).mockResolvedValue(null);
  vi.mocked(cacheSet).mockResolvedValue(undefined);
  vi.mocked(cacheDel).mockResolvedValue(undefined);
  vi.mocked(verifyToken).mockImplementation(() => ({ userId: 1, email: 'admin@test.com', role: 'admin' }));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ═════════════════════════════════════════════
// 1. getUserGroup
// ═════════════════════════════════════════════

describe('getUserGroup — 用户分组解析', () => {
  it('有绑定 → 返回对应组，并写入缓存 user_group:{userId}（TTL 300s）', async () => {
    setRows(userGroupMemberships, [{ id: 1, userId: 1, groupId: 2, createdAt: new Date() }]);
    setRows(userGroups, [GROUP_VIP]);

    const group = await getUserGroup(1);
    expect(group?.id).toBe(2);
    expect(group?.name).toBe('vip');
    expect(cacheSet).toHaveBeenCalledWith('user_group:1', expect.stringContaining('"name":"vip"'), 300);
  });

  it('无绑定 → 返回 isDefault 组', async () => {
    setRows(userGroupMemberships, []);
    setRows(userGroups, [GROUP_DEFAULT]);

    const group = await getUserGroup(1);
    expect(group).not.toBeNull();
    expect(group!.id).toBe(1);
    expect(group!.isDefault).toBe(true);
  });

  it('无绑定且无 default 组 → null（不写缓存）', async () => {
    setRows(userGroupMemberships, []);
    setRows(userGroups, []);

    const group = await getUserGroup(1);
    expect(group).toBeNull();
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('缓存命中 → 直接返回，不查 DB', async () => {
    vi.mocked(cacheGet).mockResolvedValue(JSON.stringify(GROUP_VIP));

    const group = await getUserGroup(1);
    expect(group?.name).toBe('vip');
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════
// 2. getEffectiveQuotas
// ═════════════════════════════════════════════

describe('getEffectiveQuotas — 生效配额', () => {
  it('绑定组 → 返回组上配置（numeric 转 number）', async () => {
    setRows(userGroupMemberships, [{ id: 1, userId: 1, groupId: 2 }]);
    setRows(userGroups, [makeGroup({
      id: 2, name: 'vip', pricingGroup: 'vip',
      rateLimitQps: 10, rateLimitTpm: 100_000, dailyQuota: '100.50',
      modelWhitelist: ['gpt-4o', 'deepseek-chat'],
    })]);

    const q = await getEffectiveQuotas(1);
    expect(q).toEqual({
      qps: 10,
      tpm: 100_000,
      dailyQuota: 100.5,
      modelWhitelist: ['gpt-4o', 'deepseek-chat'],
      pricingGroup: 'vip',
    });
  });

  it('无绑定且无默认组 → 全 null/空（不限制）', async () => {
    setRows(userGroupMemberships, []);
    setRows(userGroups, []);

    const q = await getEffectiveQuotas(1);
    expect(q).toEqual({ qps: null, tpm: null, dailyQuota: null, modelWhitelist: [], pricingGroup: null });
  });
});

// ═════════════════════════════════════════════
// 3. isModelAllowedForUser
// ═════════════════════════════════════════════

describe('isModelAllowedForUser — 模型白名单', () => {
  it('白名单为空 → 放行', async () => {
    setRows(userGroupMemberships, [{ id: 1, userId: 1, groupId: 2 }]);
    setRows(userGroups, [makeGroup({ id: 2, name: 'vip', modelWhitelist: [] })]);

    expect(await isModelAllowedForUser(1, 'gpt-4o')).toBe(true);
  });

  it('白名单含模型 → 命中放行 / 未命中拒绝', async () => {
    setRows(userGroupMemberships, [{ id: 1, userId: 1, groupId: 2 }]);
    setRows(userGroups, [makeGroup({ id: 2, name: 'vip', modelWhitelist: ['gpt-4o'] })]);

    expect(await isModelAllowedForUser(1, 'gpt-4o')).toBe(true);
    expect(await isModelAllowedForUser(1, 'claude-sonnet-4.6')).toBe(false);
  });
});

// ═════════════════════════════════════════════
// 4. ensureDefaultGroup
// ═════════════════════════════════════════════

describe('ensureDefaultGroup — 默认组保障', () => {
  it('default 组已存在 → 幂等跳过（不写库）', async () => {
    setRows(userGroups, [{ id: 1, name: 'default' }]);

    await ensureDefaultGroup();
    expect(dbState.inserts).toHaveLength(0);
  });

  it('default 组不存在 → 创建 isDefault=true 的 default 组', async () => {
    setRows(userGroups, []);

    await ensureDefaultGroup();
    const insertCall = dbState.inserts.find((i) => i.values?.name === 'default');
    expect(insertCall).toBeDefined();
    expect(insertCall!.values).toMatchObject({ name: 'default', isDefault: true, pricingGroup: 'default' });
  });
});

// ═════════════════════════════════════════════
// 5. 管理端：创建分组
// ═════════════════════════════════════════════

describe('POST /api/v1/admin/groups — 创建分组', () => {
  it('正常 → 201 + 数据写库', async () => {
    setRows(userGroups, []); // name 查重 → 无重复

    const res = await adminApp.inject({
      method: 'POST',
      url: '/api/v1/admin/groups',
      headers: adminHeaders,
      payload: {
        name: 'vip',
        description: 'VIP 分组',
        pricingGroup: 'vip',
        rateLimitQps: 10,
        rateLimitTpm: 100_000,
        dailyQuota: 500,
        modelWhitelist: ['gpt-4o', 'deepseek-chat'],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.name).toBe('vip');
    expect(body.data.modelWhitelist).toEqual(['gpt-4o', 'deepseek-chat']);

    const insertCall = dbState.inserts.find((i) => i.values?.name === 'vip');
    expect(insertCall).toBeDefined();
    expect(insertCall!.values).toMatchObject({
      name: 'vip',
      pricingGroup: 'vip',
      rateLimitQps: 10,
      rateLimitTpm: 100_000,
      dailyQuota: '500',
      modelWhitelist: ['gpt-4o', 'deepseek-chat'],
      isDefault: false,
    });
  });

  it('name 重复 → 400', async () => {
    setRows(userGroups, [{ id: 1, name: 'vip' }]);

    const res = await adminApp.inject({
      method: 'POST',
      url: '/api/v1/admin/groups',
      headers: adminHeaders,
      payload: { name: 'vip' },
    });
    expect(res.statusCode).toBe(400);
    expect(dbState.inserts).toHaveLength(0);
  });

  it('name 缺失 → 400', async () => {
    setRows(userGroups, []);
    const res = await adminApp.inject({
      method: 'POST',
      url: '/api/v1/admin/groups',
      headers: adminHeaders,
      payload: { pricingGroup: 'vip' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ═════════════════════════════════════════════
// 6. 管理端：更新分组
// ═════════════════════════════════════════════

describe('PUT /api/v1/admin/groups/:id — 更新分组', () => {
  it('isDefault 置 true → 其他组 isDefault 被置 false（事务内）', async () => {
    // 注意：mock 不按 where 过滤，目标行放在数组首位
    setRows(userGroups, [GROUP_VIP, GROUP_DEFAULT]);
    setRows(userGroupMemberships, []);

    const res = await adminApp.inject({
      method: 'PUT',
      url: '/api/v1/admin/groups/2',
      headers: adminHeaders,
      payload: { isDefault: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(2);

    // 其他组复位：set.isDefault === false
    const resetUpdate = dbState.updates.find((u) => u.set && u.set.isDefault === false);
    expect(resetUpdate).toBeDefined();
    // 本组置为默认：set.isDefault === true
    const targetUpdate = dbState.updates.find((u) => u.set && u.set.isDefault === true);
    expect(targetUpdate).toBeDefined();
  });

  it('分组不存在 → 404', async () => {
    setRows(userGroups, []);
    const res = await adminApp.inject({
      method: 'PUT',
      url: '/api/v1/admin/groups/999',
      headers: adminHeaders,
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ═════════════════════════════════════════════
// 7. 管理端：删除分组
// ═════════════════════════════════════════════

describe('DELETE /api/v1/admin/groups/:id — 删除分组', () => {
  it('有成员 → 400', async () => {
    setRows(userGroups, [makeGroup({ id: 2, name: 'vip', isDefault: false })]);
    setRows(userGroupMemberships, [{ id: 1, userId: 1, groupId: 2 }]);

    const res = await adminApp.inject({
      method: 'DELETE',
      url: '/api/v1/admin/groups/2',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(400);
    expect(dbState.deletes).toHaveLength(0);
  });

  it('default 组 → 400', async () => {
    setRows(userGroups, [GROUP_DEFAULT]);
    setRows(userGroupMemberships, []);

    const res = await adminApp.inject({
      method: 'DELETE',
      url: '/api/v1/admin/groups/1',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(400);
    expect(dbState.deletes).toHaveLength(0);
  });

  it('正常组 → 删除成功', async () => {
    setRows(userGroups, [makeGroup({ id: 2, name: 'vip', isDefault: false })]);
    setRows(userGroupMemberships, []);

    const res = await adminApp.inject({
      method: 'DELETE',
      url: '/api/v1/admin/groups/2',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ok).toBe(true);
    expect(dbState.deletes.some((d) => d.table === userGroups)).toBe(true);
  });

  it('分组不存在 → 404', async () => {
    setRows(userGroups, []);
    const res = await adminApp.inject({
      method: 'DELETE',
      url: '/api/v1/admin/groups/999',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(404);
  });
});

// ═════════════════════════════════════════════
// 8. 管理端：设置用户分组
// ═════════════════════════════════════════════

describe('PUT /api/v1/admin/users/:userId/group — 设置用户分组', () => {
  it('upsert 写入 memberships + 清除该用户分组缓存', async () => {
    setRows(users, [{ id: 1 }]);
    setRows(userGroups, [makeGroup({ id: 2, name: 'vip', status: 'active' })]);
    setRows(userGroupMemberships, []);

    const res = await adminApp.inject({
      method: 'PUT',
      url: '/api/v1/admin/users/1/group',
      headers: adminHeaders,
      payload: { groupId: 2 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ userId: 1, groupId: 2 });

    // upsert：insert + onConflictDoUpdate（依赖 userId 唯一约束）
    const insertCall = dbState.inserts.find((i) => i.table === userGroupMemberships);
    expect(insertCall).toBeDefined();
    expect(insertCall!.values).toEqual({ userId: 1, groupId: 2 });
    expect(insertCall!.onConflict).toBe(true);

    // 缓存清除
    expect(cacheDel).toHaveBeenCalledWith('user_group:1');
  });

  it('groupId 缺失 → 400', async () => {
    setRows(users, [{ id: 1 }]);
    setRows(userGroups, [makeGroup({ id: 2, name: 'vip', status: 'active' })]);
    const res = await adminApp.inject({
      method: 'PUT',
      url: '/api/v1/admin/users/1/group',
      headers: adminHeaders,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('分组不存在 → 404', async () => {
    setRows(users, [{ id: 1 }]);
    setRows(userGroups, []);
    const res = await adminApp.inject({
      method: 'PUT',
      url: '/api/v1/admin/users/1/group',
      headers: adminHeaders,
      payload: { groupId: 999 },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ═════════════════════════════════════════════
// 9. 用户侧：me/group
// ═════════════════════════════════════════════

describe('GET /api/v1/me/group — 我的分组', () => {
  it('返回当前用户所属分组信息（含限流 / 额度 / 白名单）', async () => {
    setRows(userGroupMemberships, [{ id: 1, userId: 1, groupId: 2, createdAt: new Date() }]);
    setRows(userGroups, [makeGroup({
      id: 2, name: 'vip', description: 'VIP', pricingGroup: 'vip',
      rateLimitQps: 10, rateLimitTpm: 100_000, dailyQuota: '500.00',
      modelWhitelist: ['gpt-4o'],
    })]);

    const res = await meApp.inject({ method: 'GET', url: '/api/v1/me/group', headers: userHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe(2);
    expect(body.data.name).toBe('vip');
    expect(body.data.pricingGroup).toBe('vip');
    expect(body.data.rateLimitQps).toBe(10);
    expect(body.data.dailyQuota).toBe(500);
    expect(body.data.modelWhitelist).toEqual(['gpt-4o']);
  });

  it('未登录访问 me/group → 401', async () => {
    const res = await meApp.inject({ method: 'GET', url: '/api/v1/me/group' });
    expect(res.statusCode).toBe(401);
  });
});

// ═════════════════════════════════════════════
// 10. 用户侧：me/group/models
// ═════════════════════════════════════════════

describe('GET /api/v1/me/group/models — 我的可用模型', () => {
  it('白名单为空 → 返回全量 active 平台模型（去重）', async () => {
    setRows(userGroupMemberships, []);
    setRows(userGroups, [makeGroup({ id: 1, name: 'default', isDefault: true, modelWhitelist: [] })]);
    setRows(supplierModels, [
      { platformModel: 'gpt-4o' },
      { platformModel: 'deepseek-chat' },
      { platformModel: 'gpt-4o' }, // 同模型多供应商 → 去重
    ]);

    const res = await meApp.inject({ method: 'GET', url: '/api/v1/me/group/models', headers: userHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual(['gpt-4o', 'deepseek-chat']);
  });

  it('白名单非空 → 只返回白名单内且存在 active 的模型', async () => {
    setRows(userGroupMemberships, []);
    setRows(userGroups, [makeGroup({
      id: 1, name: 'default', isDefault: true,
      modelWhitelist: ['gpt-4o', 'not-exist-model'],
    })]);
    setRows(supplierModels, [
      { platformModel: 'gpt-4o' },
      { platformModel: 'deepseek-chat' },
    ]);

    const res = await meApp.inject({ method: 'GET', url: '/api/v1/me/group/models', headers: userHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual(['gpt-4o']);
  });

  it('未登录访问 me/group/models → 401', async () => {
    const res = await meApp.inject({ method: 'GET', url: '/api/v1/me/group/models' });
    expect(res.statusCode).toBe(401);
  });
});
