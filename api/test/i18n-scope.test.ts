/**
 * Gate-1 i18n scope 扩展 + /me/settings 集成测试（真实本地库 threecloud_v3）
 *
 * 覆盖（docs/多语言i18n改造方案.md §2.3 / §2.4 + 任务书 T2/T3）：
 *   - public i18n：不传 scope → 只回 portal（向后兼容）
 *   - public i18n：`scope=console,common` → 返回两 scope 并集
 *   - public i18n：响应含 `lang`（归一化后的规范值）+ `scope` 数组
 *   - public i18n：lang 归一（zh_cn→zh-CN）；动态 scope(error) 默认排除
 *   - /me/settings：PUT 合法 language 成功、非法 language → 400
 *   - /me/settings：GET 回写正确
 *
 * 环境：沿用 i18n-blog.test.ts 写法（buildApp envOverrides + 唯一数据 + afterAll 清理）。
 *
 * @see docs/多语言i18n改造方案.md §2.3 / §2.4
 * @module test/i18n-scope
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, like } from 'drizzle-orm';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-i18n-scope-secret-gate1',
  PORT: '3043',
};

const ts = Date.now();
const KEY_PREFIX = `test.scope.${ts}`;

describe('public i18n scope 扩展（Gate-1 T2）', () => {
  let app: FastifyInstance;
  let adminToken = '';

  const K_PPORTAL = `${KEY_PREFIX}.p`;
  const K_CONSOL = `${KEY_PREFIX}.c`;
  const K_COMMON = `${KEY_PREFIX}.m`;
  const K_DISABLED = `${KEY_PREFIX}.d`;
  const K_ERROR = `${KEY_PREFIX}.e`;

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    const adminEmail = `admin-scope-${ts}@test.com`;
    await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: adminEmail, password: 'Admin12345', name: 'Scope Admin' },
    });
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, adminEmail));
    const login = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: 'Admin12345' },
    });
    adminToken = JSON.parse(login.payload).accessToken;

    // 预置各类 scope 条目（active），含 disabled 与 error 动态 scope 各一条
    const seed = (key: string, lang: string, value: string, scope: string, status = 'active') =>
      app.inject({
        method: 'POST', url: '/api/v1/admin/i18n/entries',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { key, lang, value, scope, status },
      });
    await seed(K_PPORTAL, 'zh-CN', '门户中文', 'portal');
    await seed(K_PPORTAL, 'en', 'Portal English', 'portal');
    await seed(K_PPORTAL, 'ja-JP', 'ポータル日本語', 'portal');
    await seed(K_CONSOL, 'zh-CN', '控制台条目', 'console');
    await seed(K_COMMON, 'zh-CN', '通用条目', 'common');
    await seed(K_DISABLED, 'zh-CN', '已下线条目', 'portal', 'disabled');
    await seed(K_ERROR, 'zh-CN', '错误动态条目', 'error');
  });

  afterAll(async () => {
    await db.delete(schema.i18nEntries).where(like(schema.i18nEntries.key, `${KEY_PREFIX}%`));
    await app.close();
  });

  it('不传 scope → 只回 portal（向后兼容），含 lang/scope 元信息', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/i18n/entries' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data[K_PPORTAL]).toBe('门户中文');
    expect(body.data[K_CONSOL]).toBeUndefined();
    expect(body.data[K_COMMON]).toBeUndefined();
    // disabled 与 error 动态 scope 默认排除
    expect(body.data[K_DISABLED]).toBeUndefined();
    expect(body.data[K_ERROR]).toBeUndefined();
    // 元信息
    expect(body.lang).toBe('zh-CN');
    expect(body.scope).toEqual(['portal']);
  });

  it('scope=console,common → 返回两 scope 并集，不含 portal', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/i18n/entries?scope=console,common' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data[K_CONSOL]).toBe('控制台条目');
    expect(body.data[K_COMMON]).toBe('通用条目');
    expect(body.data[K_PPORTAL]).toBeUndefined();
    expect(body.scope).toEqual(['console', 'common']);
  });

  it('重复 query scope（数组）同样生效', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/i18n/entries?scope=console&scope=common' });
    const body = JSON.parse(res.payload);
    expect(body.data[K_CONSOL]).toBe('控制台条目');
    expect(body.data[K_COMMON]).toBe('通用条目');
  });

  it('lang 归一化后返回规范值（zh_cn→zh-CN，en→en）', async () => {
    const zh = await app.inject({ method: 'GET', url: `/api/v1/public/i18n/entries?lang=zh_cn` });
    expect(JSON.parse(zh.payload).lang).toBe('zh-CN');
    expect(JSON.parse(zh.payload).data[K_PPORTAL]).toBe('门户中文');

    const en = await app.inject({ method: 'GET', url: `/api/v1/public/i18n/entries?lang=en_US` });
    expect(JSON.parse(en.payload).lang).toBe('en');
    expect(JSON.parse(en.payload).data[K_PPORTAL]).toBe('Portal English');
  });

  it('ja-JP 条目可拉取，lang 归一返回 ja-JP', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/public/i18n/entries?lang=JA_JP` });
    const body = JSON.parse(res.payload);
    expect(body.lang).toBe('ja-JP');
    expect(body.data[K_PPORTAL]).toBe('ポータル日本語');
  });

  it('只显式请求 error 动态 scope 时才返回', async () => {
    const hidden = await app.inject({ method: 'GET', url: '/api/v1/public/i18n/entries' });
    expect(JSON.parse(hidden.payload).data[K_ERROR]).toBeUndefined();

    const explicit = await app.inject({ method: 'GET', url: '/api/v1/public/i18n/entries?scope=error' });
    const body = JSON.parse(explicit.payload);
    expect(body.data[K_ERROR]).toBe('错误动态条目');
    expect(body.scope).toEqual(['error']);
  });
});

describe('GET/PUT /me/settings（Gate-1 T3）', () => {
  let app: FastifyInstance;
  let token = '';

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();
    const email = `me-settings-${ts}@test.com`;
    const reg = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email, password: 'Test1234!', name: 'Settings User' },
    });
    token = JSON.parse(reg.payload).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /me/settings 缺省返回 zh-CN', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/me/settings',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.language).toBe('zh-CN');
  });

  it('PUT /me/settings 合法 language → 200，返回归一化值并回写正确', async () => {
    // 用非规范形 en_us 提交 → 归一为 en 落库
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/me/settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { language: 'en_us' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.language).toBe('en');

    // 回读确认
    const read = await app.inject({
      method: 'GET', url: '/api/v1/me/settings',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(JSON.parse(read.payload).data.language).toBe('en');
  });

  it('PUT /me/settings 非法 language → 400', async () => {
    const bad = await app.inject({
      method: 'PUT', url: '/api/v1/me/settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { language: 'fr' },
    });
    expect(bad.statusCode).toBe(400);

    const empty = await app.inject({
      method: 'PUT', url: '/api/v1/me/settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { language: '' },
    });
    expect(empty.statusCode).toBe(400);
  });

  it('未认证访问 /me/settings → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/settings' });
    expect(res.statusCode).toBe(401);
  });
});