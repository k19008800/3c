/**
 * 用户预算设置端点契约测试 — me-budget.test.ts（PRD-§20.1.1）
 *
 * 覆盖「GET/PUT /api/v1/me/budget」外部契约（零覆盖补齐）：
 *   - 未带 token GET → 401（jwtAuth preHandler 生效，路由不裸奔）
 *   - 从未设置预算的用户 GET → 默认值（daily/monthlyLimitCents=null、
 *     alertThreshold=80、hardBlock=true）且含 usage.todayCents/monthCents
 *   - PUT dailyLimitCents=-1 → 400（限额不得为负）
 *   - PUT alertThreshold=150 → 400（阈值必须 1-100 整数）
 *   - PUT {} 空 patch → 400（不得写入空 upsert 行）
 *   - 合法 PUT 回显新值 + insert 携带 patch；随后 GET 读到新值（upsert 回读）
 *
 * 测试方式：mock `../db`（importOriginal 保留真实 schema），按表维护
 * select 行队列；JWT 用真实 generateAccessToken（verifyToken 真实验证）；
 * Fastify app.inject 端到端走 preHandler + handler。
 *
 * @module routes
 * @see services/billing/budget.ts
 */
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { generateAccessToken } from '../services/auth/jwt.js';

/* ───────── mock db：按表返回预设行队列 + 受控 insert/execute 结果 ───────── */

const { dbState, chain } = vi.hoisted(() => {
  const dbState: {
    queues: Map<unknown, unknown[][]>;
    calls: Array<{ method: string; args: unknown[] }>;
    executeRows: unknown[];
    insertResult: unknown;
  } = { queues: new Map(), calls: [], executeRows: [], insertResult: [] };

  // 任意方法调用都返回同一个 Promise（drizzle 链式调用 .values().onConflictDoUpdate().returning()）
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

  return { dbState, chain };
});

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/index.js')>();
  const db = {
    select: () => ({
      from: (table: unknown) => {
        dbState.calls.push({ method: 'from', args: [table] });
        const q = dbState.queues.get(table);
        const res = q && q.length ? q.shift() : [];
        return chain(res);
      },
    }),
    insert: (...args: unknown[]) => {
      dbState.calls.push({ method: 'insert', args });
      return chain(dbState.insertResult);
    },
    execute: (...args: unknown[]) => {
      dbState.calls.push({ method: 'execute', args });
      return Promise.resolve(dbState.executeRows);
    },
  };
  return { ...actual, db };
});

/* ───────── 真实 schema / 路由 / JWT ───────── */

import { schema } from '../db/index.js';
import { meBudgetRoutes } from './me-budget.js';

const TOKEN = generateAccessToken({ userId: 42, email: 'budget-tester@example.com', role: 'customer' });
const AUTH = { authorization: `Bearer ${TOKEN}` };
const URL = '/api/v1/me/budget';

let app: FastifyInstance;

beforeEach(async () => {
  dbState.queues.clear();
  dbState.calls.length = 0;
  // usage 聚合：今日 0.50 元 = 50 分，本月 2.00 元 = 200 分
  dbState.executeRows = [{ today_cost: '0.50', month_cost: '2.00' }];
  dbState.insertResult = [];

  app = Fastify();
  await app.register(meBudgetRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

// ═══════════════ PRD-§20.1.1 契约 ═══════════════

it('未带 token GET → 401（jwtAuth preHandler 生效）', async () => {
  const res = await app.inject({ method: 'GET', url: URL });
  expect(res.statusCode).toBe(401);
});

it('从未设置预算的用户 GET → 默认值（不限额/告警80%/硬阻断开）且含今日本月用量', async () => {
  // select 队列：user_budget_settings 无记录
  dbState.queues.set(schema.userBudgetSettings, []);

  const res = await app.inject({ method: 'GET', url: URL, headers: AUTH });
  expect(res.statusCode).toBe(200);

  const d = res.json().data;
  // 默认设置
  expect(d.dailyLimitCents).toBeNull();
  expect(d.monthlyLimitCents).toBeNull();
  expect(d.alertThreshold).toBe(80);
  expect(d.hardBlock).toBe(true);
  // 用量快照（分）
  expect(d.usage.todayCents).toBe(50);
  expect(d.usage.monthCents).toBe(200);
});

it('PUT dailyLimitCents=-1 → 400（限额不得为负）', async () => {
  const res = await app.inject({ method: 'PUT', url: URL, headers: AUTH, payload: { dailyLimitCents: -1 } });
  expect(res.statusCode).toBe(400);
  // 被拒不得写库
  expect(dbState.calls.some((c) => c.method === 'insert')).toBe(false);
});

it('PUT alertThreshold=150 → 400（阈值必须 1-100 整数）', async () => {
  const res = await app.inject({ method: 'PUT', url: URL, headers: AUTH, payload: { alertThreshold: 150 } });
  expect(res.statusCode).toBe(400);
  expect(dbState.calls.some((c) => c.method === 'insert')).toBe(false);
});

it('PUT {} 空 patch → 400（不得写入空 upsert 行）', async () => {
  const res = await app.inject({ method: 'PUT', url: URL, headers: AUTH, payload: {} });
  expect(res.statusCode).toBe(400);
  expect(dbState.calls.some((c) => c.method === 'insert')).toBe(false);
});

it('合法 PUT → 回显新值且 insert 携带 patch；随后 GET 读到新值（upsert 回读）', async () => {
  const updatedRow = {
    id: 9,
    userId: 42,
    dailyLimitCents: 500,
    monthlyLimitCents: null,
    alertThreshold: 90,
    hardBlock: false,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-03T00:00:00Z'),
  };
  dbState.insertResult = [updatedRow];

  // PUT 部分更新
  const putRes = await app.inject({
    method: 'PUT',
    url: URL,
    headers: AUTH,
    payload: { dailyLimitCents: 500, alertThreshold: 90, hardBlock: false },
  });
  expect(putRes.statusCode).toBe(200);
  const putData = putRes.json().data;
  expect(putData.dailyLimitCents).toBe(500);
  expect(putData.alertThreshold).toBe(90);
  expect(putData.hardBlock).toBe(false);

  // insert 确以 patch 写库（upsert）
  const valuesCall = dbState.calls.find((c) => c.method === 'values');
  expect(valuesCall).toBeDefined();
  expect((valuesCall!.args[0] as Record<string, unknown>).dailyLimitCents).toBe(500);
  expect((valuesCall!.args[0] as Record<string, unknown>).hardBlock).toBe(false);

  // GET 回读新值（队列 = 批次数组，每批即 rows 数组）
  dbState.queues.set(schema.userBudgetSettings, [[updatedRow]]);
  const getRes = await app.inject({ method: 'GET', url: URL, headers: AUTH });
  expect(getRes.statusCode).toBe(200);
  const getData = getRes.json().data;
  expect(getData.dailyLimitCents).toBe(500);
  expect(getData.monthlyLimitCents).toBeNull();
  expect(getData.alertThreshold).toBe(90);
  expect(getData.hardBlock).toBe(false);
  expect(getData.usage.todayCents).toBe(50);
});
