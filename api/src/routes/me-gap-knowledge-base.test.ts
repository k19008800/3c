/**
 * 帮助中心知识库用户端端点单测（R3-USER-DRILL-002）
 *
 * 覆盖 me-gap.ts 新增：
 *   GET /api/v1/me/knowledge-base            — 已发布文章列表（search + 反馈计数聚合）
 *   GET /api/v1/me/knowledge-base/categories — 已发布文章分类聚合
 *
 * 测试方式：mock `../db`（保留真实 schema），select 结果按调用顺序从队列消费，
 * 使用真实 JWT（generateAccessToken）与真实 Fastify app.inject。
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { generateAccessToken } from '../services/auth/jwt';
import { schema } from '../db';
import { meGapRoutes } from './me-gap';

/* ───────── mock db（select 按队列消费，支持多 select 端点） ───────── */

const dbState = vi.hoisted(() => ({
  selectQueue: [] as unknown[],
  select: [] as unknown[],
  insert: [] as unknown[],
  calls: [] as Array<{ method: string; args: unknown[] }>,
}));

const chain = (result: unknown): any => {
  const fn: any = (..._args: unknown[]) => chain(result);
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === 'then') {
        return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(onFulfilled, onRejected);
      }
      if (prop === 'catch') {
        return (onRejected?: (e: unknown) => unknown) => Promise.resolve(result).catch(onRejected);
      }
      return (...args: unknown[]) => {
        dbState.calls.push({ method: String(prop), args });
        return chain(result);
      };
    },
    apply() {
      return chain(result);
    },
  });
};

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db')>();
  const db = {
    select: (...args: unknown[]) => {
      dbState.calls.push({ method: 'select', args });
      const result = dbState.selectQueue.length > 0 ? dbState.selectQueue.shift()! : dbState.select;
      return chain(result);
    },
    insert: (...args: unknown[]) => {
      dbState.calls.push({ method: 'insert', args });
      return chain(dbState.insert);
    },
  };
  return { ...actual, db };
});

/* ───────── 测试工具 ───────── */

const USER_TOKEN = generateAccessToken({ userId: 2, email: 'user@3cloud.dev', role: 'customer' });

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(meGapRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.select = [];
  dbState.insert = [];
  dbState.calls = [];
});

/** 循环引用安全的深度遍历：args 树中是否存在目标字符串（drizzle SQL 对象含循环引用） */
function containsNeedle(v: unknown, needle: string, seen = new Set<unknown>()): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.includes(needle);
  if (typeof v !== 'object') return false;
  if (seen.has(v)) return false;
  seen.add(v);
  if (Array.isArray(v)) return v.some((x) => containsNeedle(x, needle, seen));
  for (const key of Object.keys(v as object)) {
    if (containsNeedle((v as Record<string, unknown>)[key], needle, seen)) return true;
  }
  return false;
}

/** 断言某次 select 后的 where 调用参数包含关键字 */
function whereArgsContain(needle: string): boolean {
  return dbState.calls.some((c) => c.method === 'where' && c.args.some((a) => containsNeedle(a, needle)));
}

/* ═══════════════ 帮助中心知识库 ═══════════════ */

describe('帮助中心知识库（me-gap）', () => {
  it('未登录访问 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/knowledge-base' });
    expect(res.statusCode).toBe(401);
    const res2 = await app.inject({ method: 'GET', url: '/api/v1/me/knowledge-base/categories' });
    expect(res2.statusCode).toBe(401);
  });

  it('文章列表 → 200，仅 published 过滤，结构与前端字段对齐（含反馈计数默认 0）', async () => {
    dbState.selectQueue = [
      [{ id: 1, title: '如何充值', category: '充值', content: '全文内容…', updatedAt: new Date('2026-08-18T00:00:00Z') }],
      [], // 反馈聚合：无反馈
    ];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/knowledge-base',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json().data.list;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 1,
      title: '如何充值',
      category: '充值',
      content: '全文内容…',
      tags: null,
      view_count: 0,
      helpful_count: 0,
      unhelpful_count: 0,
    });
    // published 过滤已下发到 where
    expect(whereArgsContain('published')).toBe(true);
  });

  it('文章列表携带 search → 模糊查询下发（title/category/content）', async () => {
    dbState.selectQueue = [[], []];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/knowledge-base?search=充值&limit=10',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(whereArgsContain('%充值%')).toBe(true);
  });

  it('文章列表反馈计数聚合 → helpful_count/unhelpful_count 正确', async () => {
    dbState.selectQueue = [
      [
        { id: 1, title: 'A', category: 'c', content: 'x', updatedAt: new Date() },
        { id: 2, title: 'B', category: 'c', content: 'y', updatedAt: new Date() },
      ],
      [
        { articleId: 1, helpful: true, cnt: 2 },
        { articleId: 1, helpful: false, cnt: 1 },
      ],
    ];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/knowledge-base',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json().data.list;
    expect(list[0]).toMatchObject({ id: 1, helpful_count: 2, unhelpful_count: 1 });
    expect(list[1]).toMatchObject({ id: 2, helpful_count: 0, unhelpful_count: 0 });
  });

  it('分类列表 → 200，{id, name, count} 结构，仅 published', async () => {
    dbState.select = [
      { category: '充值', cnt: 3 },
      { category: '通用', cnt: 1 },
    ];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/knowledge-base/categories',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.list).toEqual([
      { id: '充值', name: '充值', count: 3 },
      { id: '通用', name: '通用', count: 1 },
    ]);
    expect(whereArgsContain('published')).toBe(true);
  });

  it('空库 → 200 空数组（不 404）', async () => {
    dbState.selectQueue = [[], []];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/knowledge-base',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.list).toEqual([]);

    dbState.select = [];
    const res2 = await app.inject({
      method: 'GET',
      url: '/api/v1/me/knowledge-base/categories',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().data.list).toEqual([]);
  });
});
