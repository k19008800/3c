/**
 * 用户端合规协议确认端点测试 — me-consent.test.ts
 *
 * 覆盖 web-console ConsentBanner（SPEC-§33.1/33.2）依赖的 3 个用户端端点：
 *   GET  /api/v1/me/consent/status    — 状态轮询（none/privacy_pending/tos_pending/both_pending）
 *   POST /api/v1/me/consent/privacy   — 同意隐私政策（幂等 + 审计）
 *   POST /api/v1/me/consent/terms     — 同意服务条款（幂等 + 审计）
 *
 * 测试方式：mock `../db`（保留真实 schema），按表维护「查询结果队列」（每次 from 消费一个）；
 * 真实 JWT（generateAccessToken）+ Fastify app.inject，无需外部依赖。
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { generateAccessToken } from '../services/auth/jwt.js';
import { schema } from '../db/index.js';
import { meGapRoutes } from './me-gap.js';

/* ───────── mock db：按表返回预设行队列 ───────── */

const { dbState, chain } = vi.hoisted(() => {
  const dbState: {
    queues: Map<unknown, unknown[][]>;
    calls: Array<{ method: string; args: unknown[] }>;
    execute: unknown[];
  } = { queues: new Map(), calls: [], execute: [] };

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
      return chain({});
    },
    update: (...args: unknown[]) => {
      dbState.calls.push({ method: 'update', args });
      return chain({});
    },
    delete: (...args: unknown[]) => {
      dbState.calls.push({ method: 'delete', args });
      return chain({});
    },
    execute: (...args: unknown[]) => {
      dbState.calls.push({ method: 'execute', args });
      return Promise.resolve(dbState.execute);
    },
  };
  return { ...actual, db };
});

/* ───────── 工具 ───────── */

const USER_TOKEN = generateAccessToken({ userId: 57, email: '13819008800@163.com', role: 'customer' });
const PRIVACY = { id: 1, key: 'privacy_policy', name: '隐私政策', content: '...', version: 2, updatedAt: new Date('2026-08-19T00:00:00Z') };
const TOS = { id: 2, key: 'terms_of_service', name: '服务条款', content: '...', version: 1, updatedAt: new Date('2026-08-19T00:00:00Z') };

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
  dbState.queues = new Map();
  dbState.calls = [];
  dbState.execute = [];
});

/** 取「insert 某表后的第一个 values 调用」的入参（即写入值） */
function valuesAfterInsert(table: unknown): unknown {
  const idx = dbState.calls.findIndex((c) => c.method === 'insert' && c.args[0] === table);
  if (idx < 0) return undefined;
  const next = dbState.calls.slice(idx + 1).find((c) => c.method === 'values');
  return next?.args[0];
}

/* ═══════════════ 状态轮询 GET /me/consent/status ═══════════════ */

describe('GET /api/v1/me/consent/status', () => {
  it('未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/consent/status' });
    expect(res.statusCode).toBe(401);
  });

  it('无已发布策略 → status=none 且 policy 为 null', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/consent/status',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('none');
    expect(body.data.privacy_policy).toBeNull();
    expect(body.data.terms_of_service).toBeNull();
  });

  it('仅隐私政策未同意 → privacy_pending，返回策略版本信息', async () => {
    dbState.queues.set(schema.consentPolicies, [[PRIVACY], []]);
    dbState.execute = [{ id: 1, pending: true }];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/consent/status',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('privacy_pending');
    expect(body.data.privacy_policy).toMatchObject({ id: 1, version: 2, title: '隐私政策' });
    expect(body.data.terms_of_service).toBeNull();
  });

  it('两条策略均未同意 → both_pending', async () => {
    dbState.queues.set(schema.consentPolicies, [[PRIVACY], [TOS]]);
    dbState.execute = [{ id: 1, pending: true }, { id: 2, pending: true }];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/consent/status',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    const body = res.json();
    expect(body.data.status).toBe('both_pending');
  });

  it('已同意且版本未变（SQL pending=false）→ none', async () => {
    dbState.queues.set(schema.consentPolicies, [[PRIVACY], []]);
    dbState.execute = [{ id: 1, pending: false }];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/consent/status',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    const body = res.json();
    expect(body.data.status).toBe('none');
  });

  it('策略版本升级（SQL pending=true）→ privacy_pending 需重新确认', async () => {
    dbState.queues.set(schema.consentPolicies, [[PRIVACY], []]);
    dbState.execute = [{ id: 1, pending: true }];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/consent/status',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    const body = res.json();
    expect(body.data.status).toBe('privacy_pending');
  });
});

/* ═══════════════ 同意 POST /me/consent/privacy · /me/consent/terms ═══════════════ */

describe('POST /api/v1/me/consent/privacy · /me/consent/terms', () => {
  it('未登录 → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/me/consent/privacy' });
    expect(res.statusCode).toBe(401);
  });

  it('同意隐私政策 → 200，写 consent_logs + audit（consent.agree）', async () => {
    dbState.queues.set(schema.consentPolicies, [[PRIVACY]]);
    dbState.queues.set(schema.consentLogs, [[]]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/consent/privacy',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toMatchObject({ ok: true, policyKey: 'privacy_policy', policyId: 1, version: 2 });

    expect(valuesAfterInsert(schema.consentLogs)).toMatchObject({ userId: 57, policyId: 1, action: 'agree' });
    expect(valuesAfterInsert(schema.auditLogs)).toMatchObject({ action: 'consent.agree', resource: 'consent_policy' });
  });

  it('重复同意 → 每次写入新的 agree 记录（版本升级后重新确认）', async () => {
    dbState.queues.set(schema.consentPolicies, [[TOS]]);
    dbState.queues.set(schema.consentLogs, [[{ id: 10, policyId: 2, createdAt: new Date('2026-08-18T23:00:00Z') }]]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/consent/terms',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ ok: true, policyKey: 'terms_of_service' });
    // 每次同意都落一条新记录（供 status 按时间戳判定重新确认）
    expect(valuesAfterInsert(schema.consentLogs)).toMatchObject({ userId: 57, policyId: 2, action: 'agree' });
    expect(valuesAfterInsert(schema.auditLogs)).toMatchObject({ action: 'consent.agree' });
  });

  it('策略不存在 → 404', async () => {
    dbState.queues.set(schema.consentPolicies, [[]]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/consent/terms',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});
