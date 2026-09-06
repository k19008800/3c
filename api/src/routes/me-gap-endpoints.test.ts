/**
 * me-gap 补齐端点集成测试 — chat/history (C) + preferences/notifications (E) + login-history (D)
 *
 * 真实 PG（threecloud_v3）+ buildApp 全量路由，app.inject 驱动；数据按唯一 email 隔离，
 * afterAll 清理测试用户及其关联数据（chat_conversations / chat_messages / system_config / login_history）。
 *
 * @see docs/implementation-spec-me-endpoints.md C / D / E
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, inArray } from 'drizzle-orm';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-me-gap-endpoints-secret-2026-08',
  PORT: '3037',
};

let app: FastifyInstance;
const ts = Date.now();
let createdConversationIds: number[] = [];

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** 注册用户（唯一邮箱）→ { user, accessToken, email } */
async function registerUser(prefix: string) {
  const email = `${prefix}-${ts}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'Test1234!', name: 'MeGap Test' },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { user: { id: number; email: string }; accessToken: string };
  return { email, user: body.user, accessToken: body.accessToken };
}

beforeAll(async () => {
  app = await buildApp({ envOverrides: testEnv });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    // 通过本次测试创建的会话 id 清理其消息，再清会话
    if (createdConversationIds.length > 0) {
      await db.delete(schema.chatMessages).where(inArray(schema.chatMessages.conversationId, createdConversationIds));
    }
  } catch {
    /* 忽略 */
  }
});

/* ═══════════════ C. GET /api/v1/me/chat/history ═══════════════ */

describe('GET /api/v1/me/chat/history', () => {
  let uid = 0;
  let token = '';
  let convId = 0;

  afterAll(async () => {
    if (uid > 0) {
      try {
        await db.delete(schema.chatConversations).where(eq(schema.chatConversations.userId, uid));
        await db.delete(schema.loginHistory).where(eq(schema.loginHistory.userId, uid));
        await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, `notify_pref.${uid}.prefs`));
        await db.delete(schema.users).where(eq(schema.users.id, uid));
      } catch {
        /* 忽略 */
      }
    }
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/chat/history' });
    expect(res.statusCode).toBe(401);
  });

  it('返回该用户会话 + msg_count；空会话消息数 0；无会话 → 空列表', async () => {
    const reg = await registerUser('chat');
    uid = reg.user.id;
    token = reg.accessToken;

    // 无会话 → 空列表
    const empty = await app.inject({ method: 'GET', url: '/api/v1/me/chat/history', headers: auth(token) });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().data.list).toEqual([]);

    // 建一个会话 + 2 条消息
    const [conv] = await db.insert(schema.chatConversations).values({
      userId: uid,
      status: 'closed',
    }).returning({ id: schema.chatConversations.id });
    convId = conv!.id;
    createdConversationIds.push(convId);
    await db.insert(schema.chatMessages).values({ conversationId: convId, role: 'user', content: '你好' });
    await db.insert(schema.chatMessages).values({ conversationId: convId, role: 'staff', content: '您好，有什么可以帮您？' });
    const dbCount = await db.select({ c: schema.chatMessages.id })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.conversationId, convId));
    expect(dbCount).toHaveLength(2); // 前置：确认真实写入 2 条消息

    const res = await app.inject({ method: 'GET', url: '/api/v1/me/chat/history', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const list = res.json().data.list;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ session_id: convId, status: 'closed', msg_count: 2 });
    expect(typeof list[0].created_at).toBe('string');
  });

  it('仅返回当前用户会话（跨用户隔离）', async () => {
    const other = await registerUser('chat-other');
    const otherId = other.user.id;
    const [conv] = await db.insert(schema.chatConversations).values({
      userId: otherId, status: 'active',
    }).returning({ id: schema.chatConversations.id });
    createdConversationIds.push(conv!.id);
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/me/chat/history', headers: auth(token) });
      const list = res.json().data.list;
      // 不含 他人 会话（其 session_id 不在清单中）
      expect(list.some((r: any) => r.session_id === conv!.id)).toBe(false);
    } finally {
      await db.delete(schema.chatConversations).where(eq(schema.chatConversations.id, conv!.id));
      await db.delete(schema.loginHistory).where(eq(schema.loginHistory.userId, otherId));
      await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, `notify_pref.${otherId}.prefs`));
      await db.delete(schema.users).where(eq(schema.users.id, otherId));
      createdConversationIds = createdConversationIds.filter((x) => x !== conv!.id);
    }
  });
});

/* ═══════════════ E. preferences/notifications ═══════════════ */

const DEFAULTS = {
  emailEnabled: true,
  emailFrequency: 'realtime',
  emailDigestTime: '09:00',
  balanceLowThreshold: 10,
};

describe('GET/PUT/POST /api/v1/me/preferences/notifications', () => {
  let uidA = 0;
  let tokenA = '';
  let uidB = 0;
  let tokenB = '';

  afterAll(async () => {
    for (const uid of [uidA, uidB]) {
      if (uid > 0) {
        try {
          await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, `notify_pref.${uid}.prefs`));
          await db.delete(schema.loginHistory).where(eq(schema.loginHistory.userId, uid));
          await db.delete(schema.chatConversations).where(eq(schema.chatConversations.userId, uid));
          await db.delete(schema.users).where(eq(schema.users.id, uid));
        } catch {
          /* 忽略 */
        }
      }
    }
  });

  it('未登录 → 401（三个端点）', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/me/preferences/notifications' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PUT', url: '/api/v1/me/preferences/notifications', payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/me/preferences/notifications/reset' })).statusCode).toBe(401);
  });

  it('未设置 → GET 返回默认值', async () => {
    const reg = await registerUser('prefs-a');
    uidA = reg.user.id;
    tokenA = reg.accessToken;
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/preferences/notifications', headers: auth(tokenA) });
    expect(res.statusCode).toBe(200);
    const p = res.json().data;
    expect(p).toMatchObject(DEFAULTS);
    expect(p.inAppPreferences.login_anomaly).toBe(true);
    expect(Object.keys(p.inAppPreferences)).toHaveLength(14);
    expect(p.emailPreferences).toMatchObject({ recharge_success: true, '2fa_changed': true });
  });

  it('PUT 非法 emailFrequency → 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/preferences/notifications',
      headers: auth(tokenA),
      payload: { emailFrequency: 'bogus' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT 持久化 + 裁剪：阈值 <1 强制 >=1，login_anomaly/2fa_changed 强制 true', async () => {
    const payload = {
      emailEnabled: false,
      emailFrequency: 'daily',
      emailDigestTime: '14:30',
      inAppPreferences: { recharge_success: false, login_anomaly: false, '2fa_changed': false },
      emailPreferences: { consumption_notify: false, balance_low: false },
      balanceLowThreshold: 0,
    };
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/preferences/notifications',
      headers: auth(tokenA),
      payload,
    });
    expect(res.statusCode).toBe(200);
    const p = res.json().data;
    expect(p.emailEnabled).toBe(false);
    expect(p.emailFrequency).toBe('daily');
    expect(p.emailDigestTime).toBe('14:30');
    expect(p.balanceLowThreshold).toBe(1); // 0 被裁剪至 >=1
    expect(p.inAppPreferences.login_anomaly).toBe(true); // 强制
    expect(p.inAppPreferences['2fa_changed']).toBe(true); // 强制
    expect(p.inAppPreferences.recharge_success).toBe(false); // 尊重用户选择
    expect(p.emailPreferences.consumption_notify).toBe(false);

    // GET 返回持久化结果
    const got = await app.inject({ method: 'GET', url: '/api/v1/me/preferences/notifications', headers: auth(tokenA) });
    expect(got.statusCode).toBe(200);
    expect(got.json().data).toMatchObject({ balanceLowThreshold: 1, emailFrequency: 'daily' });
  });

  it('reset → 恢复默认值', async () => {
    // 先 PUT 一个非默认值
    await app.inject({
      method: 'PUT',
      url: '/api/v1/me/preferences/notifications',
      headers: auth(tokenA),
      payload: { emailFrequency: 'off', balanceLowThreshold: 99, emailEnabled: false },
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/me/preferences/notifications/reset', headers: auth(tokenA) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject(DEFAULTS);
    const got = await app.inject({ method: 'GET', url: '/api/v1/me/preferences/notifications', headers: auth(tokenA) });
    expect(got.json().data).toMatchObject(DEFAULTS);
  });

  it('用户间隔离：B 读取不到 A 的偏好', async () => {
    const reg = await registerUser('prefs-b');
    uidB = reg.user.id;
    tokenB = reg.accessToken;
    // A 已重置为默认，而 B 尚未设置 → 两者都返回默认；改 A 为 off 后 B 仍为默认
    await app.inject({
      method: 'PUT',
      url: '/api/v1/me/preferences/notifications',
      headers: auth(tokenA),
      payload: { emailFrequency: 'off', balanceLowThreshold: 5, emailEnabled: false },
    });
    const b = await app.inject({ method: 'GET', url: '/api/v1/me/preferences/notifications', headers: auth(tokenB) });
    expect(b.statusCode).toBe(200);
    expect(b.json().data).toMatchObject(DEFAULTS); // B 未设置 → 默认，不受 A 影响
  });
});

/* ═══════════════ D. login-history ═══════════════ */

describe('GET /api/v1/me/login-history（含登录写入）', () => {
  let uid = 0;
  let token = '';

  afterAll(async () => {
    if (uid > 0) {
      try {
        await db.delete(schema.loginHistory).where(eq(schema.loginHistory.userId, uid));
        await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, `notify_pref.${uid}.prefs`));
        await db.delete(schema.chatConversations).where(eq(schema.chatConversations.userId, uid));
        await db.delete(schema.users).where(eq(schema.users.id, uid));
      } catch {
        /* 忽略 */
      }
    }
  });

  it('成功登录经 auth 流程写入 login_history，读端点按用户过滤并返回 records', async () => {
    const reg = await registerUser('login');
    uid = reg.user.id;
    token = reg.accessToken;
    const email = reg.email;

    // 成功登录 → 应写入 success=true
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'Test1234!' },
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' },
    });
    expect(ok.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: '/api/v1/me/login-history?page_size=50', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const recs = res.json().data.records;
    expect(Array.isArray(recs)).toBe(true);
    const okRec = recs.find((r: any) => r.success === true);
    expect(okRec).toBeDefined();
    expect(typeof okRec.login_at).toBe('string');
    // 尽力解析 UA
    expect(okRec.browser).toBe('Chrome');
    expect(okRec.os).toBe('Windows');
    expect(okRec.device_info).toBeDefined();
  });

  it('密码错误写入 success=false 记录', async () => {
    const reg2 = await registerUser('login-fail');
    const uid2 = reg2.user.id;
    const email2 = reg2.email;
    try {
      const fail = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: email2, password: 'WrongPass123!' },
      });
      expect(fail.statusCode).toBe(401);
      const t2 = reg2.accessToken;
      const res = await app.inject({ method: 'GET', url: '/api/v1/me/login-history?page_size=50', headers: auth(t2) });
      const recs = res.json().data.records;
      expect(recs.some((r: any) => r.success === false)).toBe(true);
    } finally {
      await db.delete(schema.loginHistory).where(eq(schema.loginHistory.userId, uid2));
      await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, `notify_pref.${uid2}.prefs`));
      await db.delete(schema.chatConversations).where(eq(schema.chatConversations.userId, uid2));
      await db.delete(schema.users).where(eq(schema.users.id, uid2));
    }
  });

  it('跨用户隔离：A 的端点只返回 A 自己的记录，不含他人的登录', async () => {
    // 让 other 用户发生一次成功登录（DB 里会产生属于 other 的 login_history 记录）
    const other = await registerUser('login-other');
    const otherId = other.user.id;
    await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: other.email, password: 'Test1234!' } });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/me/login-history?page_size=100', headers: auth(token) });
      const recs = res.json().data.records;
      // DB 中 A 的记录数 == 端点返回数（逐一对应，无越权）
      const dbUid = await db.select({ id: schema.loginHistory.id }).from(schema.loginHistory).where(eq(schema.loginHistory.userId, uid));
      const dbOther = await db.select({ id: schema.loginHistory.id }).from(schema.loginHistory).where(eq(schema.loginHistory.userId, otherId));
      expect(recs).toHaveLength(dbUid.length);
      expect(dbOther.length).toBeGreaterThanOrEqual(1); // other 确有记录，但不会出现在 A 的响应里
    } finally {
      await db.delete(schema.loginHistory).where(eq(schema.loginHistory.userId, otherId));
      await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, `notify_pref.${otherId}.prefs`));
      await db.delete(schema.chatConversations).where(eq(schema.chatConversations.userId, otherId));
      await db.delete(schema.users).where(eq(schema.users.id, otherId));
    }
  });
});