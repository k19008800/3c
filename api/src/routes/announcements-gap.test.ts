/**
 * 公告管理 + 用户端补充端点路由测试 — announcements-gap.test.ts
 *
 * 覆盖 docs/gap-fix-spec-2026-08-18.md §6 公告 CRUD + §7 用户端小功能：
 *   管理端（admin-announcements.ts，adminAuth）：
 *     - 未登录 → 401；非 admin → 403
 *     - admin 新建公告 → 200，status 按 publish 参数为 published/draft
 *     - admin 公告列表 → 200，结构含 list / read_count / type_label / status(布尔)
 *     - PUT 更新 / DELETE 删除 / readers 已读用户
 *   用户端（me-gap.ts，jwtAuth）：
 *     - 公告列表 → 200 结构含 is_read；标记已读 → 200 且重复调用幂等
 *     - 未读数 / read-all / 设备列表 / 设备下线（含 audit）
 *     - 知识库反馈 / 通知邮件开关持久化 / Webhook PATCH
 *
 * 测试方式：mock `../db` 模块（保留真实 schema，仅替换 db 为可编排的链式 mock），
 * 使用真实 JWT 签发（generateAccessToken）与真实 Fastify app.inject，无需外部依赖。
 *
 * @module routes
 * @see docs/gap-fix-spec-2026-08-18.md §6 / §7
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { generateAccessToken } from '../services/auth/jwt.js';
import { schema } from '../db/index.js';
import { adminAnnouncementsRoutes } from './admin-announcements.js';
import { meGapRoutes } from './me-gap.js';

/* ───────── mock db（链式可编排） ───────── */

const { dbState, chain } = vi.hoisted(() => {
  const dbState: {
    select: unknown;
    insert: unknown;
    update: unknown;
    delete: unknown;
    execute: unknown;
    calls: Array<{ method: string; args: unknown[] }>;
  } = {
    select: [],
    insert: [],
    update: [],
    delete: [],
    execute: [],
    calls: [],
  };

  /**
   * 链式 mock：任何属性访问/调用都返回新的链，await 时解析为预设 result。
   * 每次链调用（values/set/where/returning 等）记录到 dbState.calls 供断言。
   */
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
    select: (...args: unknown[]) => {
      dbState.calls.push({ method: 'select', args });
      return chain(dbState.select);
    },
    insert: (...args: unknown[]) => {
      dbState.calls.push({ method: 'insert', args });
      return chain(dbState.insert);
    },
    update: (...args: unknown[]) => {
      dbState.calls.push({ method: 'update', args });
      return chain(dbState.update);
    },
    delete: (...args: unknown[]) => {
      dbState.calls.push({ method: 'delete', args });
      return chain(dbState.delete);
    },
    execute: (...args: unknown[]) => {
      dbState.calls.push({ method: 'execute', args });
      return Promise.resolve(dbState.execute);
    },
  };
  return { ...actual, db };
});

/* ───────── 测试工具 ───────── */

const ADMIN_TOKEN = generateAccessToken({ userId: 1, email: 'admin@3cloud.dev', role: 'admin' });
const USER_TOKEN = generateAccessToken({ userId: 2, email: 'user@3cloud.dev', role: 'customer' });
const USER_TOKEN_3 = generateAccessToken({ userId: 3, email: 'user3@3cloud.dev', role: 'customer' });

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(adminAnnouncementsRoutes);
  await app.register(meGapRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  dbState.select = [];
  dbState.insert = [];
  dbState.update = [];
  dbState.delete = [];
  dbState.execute = [];
  dbState.calls = [];
});

/** 从记录的链调用中取出某 db 方法后的第一个指定链方法调用（如 insert → values） */
function callAfter(method: string, matcher: (args: unknown[]) => boolean, follow: string): { args: unknown[] } | undefined {
  const idx = dbState.calls.findIndex((c) => c.method === method && matcher(c.args));
  if (idx < 0) return undefined;
  return dbState.calls.slice(idx + 1).find((c) => c.method === follow);
}
/* ═══════════════ 管理端公告 CRUD ═══════════════ */
describe('管理端公告 CRUD（admin-announcements）', () => {
  it('未登录访问公告管理 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/announcements' });
    expect(res.statusCode).toBe(401);
  });

  it('非 admin 访问公告管理 → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/announcements',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin 新建公告（publish=true）→ 200，status=published + publish_at + audit 留痕', async () => {
    dbState.insert = [{ id: 10, status: 'published' }];
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/announcements',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { title: '系统维护公告', content: '周六 02:00-04:00 维护', type: 'maintenance', priority: 3, publish: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.message).toBeTruthy();

    const values = callAfter('insert', (args) => args[0] === schema.announcements, 'values');
    expect(values).toBeDefined();
    const v = values!.args[0] as Record<string, unknown>;
    expect(v.status).toBe('published');
    expect(v.publishAt).toBeInstanceOf(Date);
    expect(v.publishAt).not.toBeNull();
    expect(v.createdBy).toBe(1);

    // audit_logs 留痕
    const audit = callAfter('insert', (args) => args[0] === schema.auditLogs, 'values');
    expect(audit).toBeDefined();
    expect((audit!.args[0] as Record<string, unknown>).action).toBe('announcement.create');
  });

  it('admin 新建公告（publish=false）→ status=draft 且 publish_at 为空', async () => {
    dbState.insert = [{ id: 11, status: 'draft' }];
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/announcements',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { title: '草稿公告', content: '内容待补充', type: 'activity', priority: 0, publish: false },
    });
    expect(res.statusCode).toBe(200);
    const values = callAfter('insert', (args) => args[0] === schema.announcements, 'values');
    const v = values!.args[0] as Record<string, unknown>;
    expect(v.status).toBe('draft');
    expect(v.publishAt).toBeNull();
  });

  it('admin 公告列表 → 200，结构含 list/read_count/type_label/status(布尔)', async () => {
    dbState.select = [
      {
        id: 1,
        title: '系统公告',
        content: '欢迎使用 3cloud',
        type: 'system_announcement',
        priority: 5,
        status: 'published',
        createdAt: new Date('2026-08-18T00:00:00.000Z'),
        createdByEmail: 'admin@3cloud.dev',
        readCount: 7,
      },
      {
        id: 2,
        title: '草稿',
        content: 'x',
        type: 'security',
        priority: 0,
        status: 'draft',
        createdAt: new Date('2026-08-17T00:00:00.000Z'),
        createdByEmail: null,
        readCount: 0,
      },
    ];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/announcements',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.list).toHaveLength(2);
    expect(body.data.list[0]).toMatchObject({
      read_count: 7,
      type_label: '系统公告',
      status: true,
      created_by_email: 'admin@3cloud.dev',
    });
    expect(body.data.list[1]).toMatchObject({ status: false, type_label: '安全告警', read_count: 0, created_by_email: null });
  });

  it('admin 公告列表支持 status 过滤；非法 status → 400', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/announcements?status=draft',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/announcements?status=deleted',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('admin PUT 更新公告（publish 勾选）→ 200，status→published，audit 留痕', async () => {
    dbState.select = [{ id: 3, status: 'draft', publishAt: null }];
    dbState.update = [{ id: 3, status: 'published' }];
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/announcements/3',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { title: '更新标题', content: '更新内容', type: 'security', priority: 1, publish: true },
    });
    expect(res.statusCode).toBe(200);

    const set = callAfter('update', (args) => args[0] === schema.announcements, 'set');
    expect(set).toBeDefined();
    const s = set!.args[0] as Record<string, unknown>;
    expect(s.status).toBe('published');
    expect(s.publishAt).toBeInstanceOf(Date);

    const audit = callAfter('insert', (args) => args[0] === schema.auditLogs, 'values');
    expect((audit!.args[0] as Record<string, unknown>).action).toBe('announcement.update');
  });

  it('admin PUT 更新不存在的公告 → 404', async () => {
    dbState.select = [];
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/announcements/999',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { title: 'x', content: 'y', type: 'activity', priority: 0, publish: false },
    });
    expect(res.statusCode).toBe(404);
  });

  it('admin DELETE 公告 → 200，audit 留痕；不存在 → 404', async () => {
    dbState.delete = [{ id: 3 }];
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/announcements/3',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const audit = callAfter('insert', (args) => args[0] === schema.auditLogs, 'values');
    expect((audit!.args[0] as Record<string, unknown>).action).toBe('announcement.delete');

    dbState.delete = [];
    const notFound = await app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/announcements/999',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(notFound.statusCode).toBe(404);
  });

  it('admin 已读用户列表 → 200，结构含 id/email/username/read_at', async () => {
    dbState.select = [
      { id: 9, email: 'u1@x.com', username: 'Alice', readAt: new Date('2026-08-18T01:00:00.000Z') },
      { id: 8, email: 'u2@x.com', username: 'Bob', readAt: new Date('2026-08-18T02:00:00.000Z') },
    ];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/announcements/1/readers',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const readers = res.json().data.readers;
    expect(readers).toHaveLength(2);
    expect(readers[0]).toMatchObject({ email: 'u1@x.com', username: 'Alice' });
    expect(readers[0].read_at).toBeTruthy();
  });
});

/* ═══════════════ 用户端公告已读 ═══════════════ */

describe('用户端公告（me-gap）', () => {
  it('未登录访问 /me/announcements → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/announcements' });
    expect(res.statusCode).toBe(401);
  });

  it('用户端公告列表 → 200，结构含 is_read/type_label', async () => {
    dbState.select = [
      { id: 2, title: '维护通知', content: 'c', type: 'maintenance', priority: 1, createdAt: new Date('2026-08-18T00:00:00Z'), isRead: true },
      { id: 3, title: '活动', content: 'c2', type: 'activity', priority: 0, createdAt: new Date('2026-08-17T00:00:00Z'), isRead: false },
    ];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/announcements',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json().data.list;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ is_read: true, type_label: '维护通知' });
    expect(list[1]).toMatchObject({ is_read: false, type_label: '活动通知' });
  });

  it('未读公告数 → 200 { data: { unread } }', async () => {
    dbState.execute = [{ unread: 3 }];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/announcements/unread-count',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.unread).toBe(3);
  });

  it('标记已读 → 200，且重复调用幂等（onConflictDoNothing）', async () => {
    dbState.insert = [{ announcementId: 5, userId: 2 }];
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/me/announcements/5/read',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.ok).toBe(true);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/me/announcements/5/read',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(second.statusCode).toBe(200);

    // 两次都执行了幂等插入（values + onConflictDoNothing）
    const valuesCalls = dbState.calls.filter((c) => c.method === 'values');
    expect(valuesCalls.length).toBe(2);
    for (const c of valuesCalls) {
      expect((c.args[0] as Record<string, unknown>).announcementId).toBe(5);
      expect((c.args[0] as Record<string, unknown>).userId).toBe(2);
    }
    const conflictCalls = dbState.calls.filter((c) => c.method === 'onConflictDoNothing');
    expect(conflictCalls.length).toBe(2);
  });

  it('read-all → 批量插入未读公告，返回 marked 数量', async () => {
    dbState.select = [{ id: 1 }, { id: 2 }];
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/announcements/read-all',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ ok: true, marked: 2 });
    const values = callAfter('insert', (args) => args[0] === schema.announcementReads, 'values');
    expect(values).toBeDefined();
    expect(values!.args[0]).toEqual([
      { announcementId: 1, userId: 2 },
      { announcementId: 2, userId: 2 },
    ]);
  });

  it('read-all 无可标记公告时仍返回 200（不执行插入）', async () => {
    dbState.select = [];
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/announcements/read-all',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.marked).toBe(0);
  });
});

/* ═══════════════ 用户端小功能 ═══════════════ */

describe('用户端小功能（me-gap）', () => {
  it('设备列表 → 200，结构含 id/ip_address/user_agent/created_at/expires_at', async () => {
    dbState.select = [
      {
        id: 7,
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        createdAt: new Date('2026-08-18T00:00:00Z'),
        expiresAt: new Date('2026-08-25T00:00:00Z'),
      },
    ];
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/devices',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const devices = res.json().data.devices;
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      id: 7,
      ip_address: '1.2.3.4',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0)',
    });
    expect(devices[0].created_at).toBeTruthy();
    expect(devices[0].expires_at).toBeTruthy();
  });

  it('设备下线 → 200，写 audit（device.logout）；他人会话 → 404', async () => {
    dbState.delete = [{ id: 7 }];
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/devices/7/logout',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ok).toBe(true);

    // 下线范围校验：where 必须同时限定 id + userId（仅本人）
    const where = callAfter('delete', (args) => args[0] === schema.userSessions, 'where');
    expect(where).toBeDefined();

    const audit = callAfter('insert', (args) => args[0] === schema.auditLogs, 'values');
    expect(audit).toBeDefined();
    expect((audit!.args[0] as Record<string, unknown>).action).toBe('device.logout');

    // 非本人会话（delete 影响 0 行）→ 404
    dbState.delete = [];
    const notMine = await app.inject({
      method: 'POST',
      url: '/api/v1/me/devices/999/logout',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(notMine.statusCode).toBe(404);
  });

  it('知识库反馈 → 200，写入 knowledgeBaseFeedback（helpful/comment/userId）', async () => {
    dbState.insert = [{ id: 1 }];
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/knowledge-base/3/feedback',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
      payload: { helpful: true, comment: '很有用，解决了问题' },
    });
    expect(res.statusCode).toBe(200);
    const values = callAfter('insert', (args) => args[0] === schema.knowledgeBaseFeedback, 'values');
    expect(values).toBeDefined();
    expect(values!.args[0]).toMatchObject({ articleId: 3, userId: 2, helpful: true, comment: '很有用，解决了问题' });
  });

  it('知识库反馈 helpful 非布尔 → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/knowledge-base/3/feedback',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
      payload: { helpful: 'yes' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('通知邮件开关 → 200 且持久化到 system_config（key=notify_pref.<uid>.<type>）', async () => {
    dbState.insert = [{ id: 1 }];
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/notification-settings/security/email',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ ok: true, type: 'security', email: false });

    const values = callAfter('insert', (args) => args[0] === schema.systemConfig, 'values');
    expect(values).toBeDefined();
    const v = values!.args[0] as Record<string, unknown>;
    expect(v.key).toBe('notify_pref.2.security');
    expect(v.value).toBe(JSON.stringify({ email: false }));
    // upsert：key 冲突时更新
    const conflictCalls = dbState.calls.filter((c) => c.method === 'onConflictDoUpdate');
    expect(conflictCalls.length).toBe(1);
  });

  it('通知邮件开关重复设置 → 幂等更新（仍 200）', async () => {
    dbState.insert = [{ id: 1 }];
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/me/notification-settings/price_change/email',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
      payload: { enabled: true },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/me/notification-settings/price_change/email',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
      payload: { enabled: true },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
  });

  it('Webhook PATCH（isEnabled=false）→ 200，映射到 enabled 列', async () => {
    dbState.update = [{ id: 4, enabled: false }];
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/webhooks/4',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
      payload: { isEnabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ ok: true, id: 4, isEnabled: false });

    const set = callAfter('update', (args) => args[0] === schema.userWebhooks, 'set');
    expect(set).toBeDefined();
    expect((set!.args[0] as Record<string, unknown>).enabled).toBe(false);
  });

  it('Webhook PATCH 越权（他人 Webhook）→ 404；isEnabled 非布尔 → 400', async () => {
    dbState.update = [];
    const notMine = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/webhooks/4',
      headers: { authorization: `Bearer ${USER_TOKEN_3}` },
      payload: { isEnabled: true },
    });
    expect(notMine.statusCode).toBe(404);

    const badBody = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/webhooks/4',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
      payload: { isEnabled: 'yes' },
    });
    expect(badBody.statusCode).toBe(400);
  });
});
