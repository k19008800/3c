/**
 * P2-3 i18n + 博客 API 集成测试
 *
 * 覆盖（docs/iteration-plan-v2.md P2-3 测试要求）：
 * - admin i18n CRUD：新增/更新/删除/筛选 + 同 key+lang 重复 409 + import upsert
 * - admin i18n 权限：无 token → 401、customer → 403
 * - 写操作写 audit_logs
 * - public i18n：?lang=en 返回正确 key→value 映射，只含 active+portal；缺省 lang 返回 zh-CN
 * - public blog：列表只含 published+blog；:slug 详情正确；不存在 404
 *
 * 采用真实本地库（threecloud_v3）+ 唯一数据 + afterAll 清理（对齐 admin-marketplace.test.ts 写法）。
 *
 * @see docs/iteration-plan-v2.md P2-3
 * @module test/i18n-blog
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, like, and, desc } from 'drizzle-orm';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-jwt-secret-i18n-blog',
  PORT: '3042',
};

const ts = Date.now();
const KEY_PREFIX = `test.i18n.${ts}`;
const SLUG_PREFIX = `blog-test-${ts}`;

describe('i18n entries admin CRUD API', () => {
  let app: FastifyInstance;
  let adminToken = '';
  let customerToken = '';
  let adminUserId = 0;
  let createdId = 0;

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    const adminEmail = `admin-i18n-${ts}@test.com`;
    await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: adminEmail, password: 'Admin12345', name: 'Admin I18n' },
    });
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, adminEmail));
    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: 'Admin12345' },
    });
    adminToken = JSON.parse(loginRes.payload).accessToken;
    const [adminRow] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.email, adminEmail));
    adminUserId = adminRow!.id;

    const customerEmail = `cust-i18n-${ts}@test.com`;
    await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: customerEmail, password: 'Cust12345', name: 'Cust I18n' },
    });
    const custRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: customerEmail, password: 'Cust12345' },
    });
    customerToken = JSON.parse(custRes.payload).accessToken;
  });

  afterAll(async () => {
    // 清理测试数据（i18n 条目 / 博客内容 / 审计日志）
    await db.delete(schema.i18nEntries).where(like(schema.i18nEntries.key, `${KEY_PREFIX}%`));
    await db.delete(schema.siteContents).where(like(schema.siteContents.slug, `${SLUG_PREFIX}%`));
    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.userId, adminUserId));
    await app.close();
  });

  it('i18n POST /admin/i18n/entries 新增 → 201 返回条目', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/i18n/entries',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { key: `${KEY_PREFIX}.nav.pricing`, lang: 'zh-CN', value: '定价', scope: 'portal' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.key).toBe(`${KEY_PREFIX}.nav.pricing`);
    expect(body.data.lang).toBe('zh-CN');
    expect(body.data.value).toBe('定价');
    expect(body.data.scope).toBe('portal');
    expect(body.data.status).toBe('active');
    createdId = body.data.id;
  });

  it('i18n 同 key+lang 重复新增 → 409 CONFLICT', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/i18n/entries',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { key: `${KEY_PREFIX}.nav.pricing`, lang: 'zh-CN', value: '定价2' },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.payload).code).toBe(409);
  });

  it('i18n GET 列表：返回刚创建的条目（含分页结构）', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/i18n/entries?key=${KEY_PREFIX}&page=1&pageSize=10`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.total).toBeGreaterThanOrEqual(1);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(10);
    const item = body.data.items.find((it: any) => it.id === createdId);
    expect(item).toBeDefined();
    expect(item.value).toBe('定价');
  });

  it('i18n GET 列表：lang/scope/status 筛选生效', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/i18n/entries?lang=zh-CN&scope=portal&status=active`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.items.every((it: any) => it.lang === 'zh-CN' && it.scope === 'portal' && it.status === 'active')).toBe(true);
  });

  it('i18n PUT /admin/i18n/entries/:id 更新 value/status/scope', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/admin/i18n/entries/${createdId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: '定价（已更新）', status: 'active', scope: 'portal' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.value).toBe('定价（已更新）');
  });

  it('i18n PUT 不存在的 id → 404', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/admin/i18n/entries/99999999`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { value: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('i18n DELETE /admin/i18n/entries/:id → 204 且软删为 disabled', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/admin/i18n/entries/${createdId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(204);
    const [row] = await db.select({ status: schema.i18nEntries.status }).from(schema.i18nEntries)
      .where(eq(schema.i18nEntries.id, createdId)).limit(1);
    expect(row?.status).toBe('disabled');
  });

  it('i18n POST import upsert：新建 + 更新同 key+lang 条目', async () => {
    const importPayload: Record<string, Record<string, string>> = {
      [`${KEY_PREFIX}.import.new`]: { 'zh-CN': '导入新增', en: 'Imported New' },
      [`${KEY_PREFIX}.import.update`]: { 'zh-CN': '导入覆盖前', en: 'Before' },
    };
    // 先建一条，供 import 覆盖
    await app.inject({
      method: 'POST', url: '/api/v1/admin/i18n/entries',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { key: `${KEY_PREFIX}.import.update`, lang: 'zh-CN', value: '原始值', scope: 'portal' },
    });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/i18n/entries/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        [`${KEY_PREFIX}.import.new`]: { 'zh-CN': '导入新增', en: 'Imported New' },
        [`${KEY_PREFIX}.import.update`]: { 'zh-CN': '导入覆盖后', en: 'After' },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.created).toBe(3);   // new.zh-CN + new.en + update.en
    expect(body.data.updated).toBe(1);   // update.zh-CN 被覆盖
    expect(body.data.imported).toBe(4);

    // 验证 update 条目已被覆盖
    const [row] = await db.select({ value: schema.i18nEntries.value }).from(schema.i18nEntries)
      .where(and(
        eq(schema.i18nEntries.key, `${KEY_PREFIX}.import.update`),
        eq(schema.i18nEntries.lang, 'zh-CN'),
      )).limit(1);
    expect(row?.value).toBe('导入覆盖后');
  });

  it('i18n 写操作写入 audit_logs', async () => {
    const logs = await db.select().from(schema.auditLogs)
      .where(and(
        eq(schema.auditLogs.userId, adminUserId),
        eq(schema.auditLogs.resource, 'i18n_entry'),
      ))
      .orderBy(desc(schema.auditLogs.createdAt));
    // create + put + delete + import 至少 4 条
    expect(logs.length).toBeGreaterThanOrEqual(4);
    const actions = new Set(logs.map((l) => l.action));
    expect(actions.has('i18n.create')).toBe(true);
    expect(actions.has('i18n.update')).toBe(true);
    expect(actions.has('i18n.delete')).toBe(true);
    expect(actions.has('i18n.import')).toBe(true);
  });

  it('i18n 无 token → 401；customer token → 403', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/v1/admin/i18n/entries' });
    expect(anon.statusCode).toBe(401);

    const forbidden = await app.inject({
      method: 'GET', url: '/api/v1/admin/i18n/entries',
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});

describe('public i18n API', () => {
  let app: FastifyInstance;
  let adminToken = '';

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    const email = `admin-i18n-pub-${ts}@test.com`;
    await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email, password: 'Admin12345', name: 'Admin Pub' },
    });
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, email));
    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email, password: 'Admin12345' },
    });
    adminToken = JSON.parse(loginRes.payload).accessToken;

    // 预置：portal+active（zh-CN/en）、portal+disabled（zh-CN）、console+active（zh-CN）
    const seeds: Array<Record<string, string>> = [
      { key: `${KEY_PREFIX}.pub.active.zh`, lang: 'zh-CN', value: '公开中文', scope: 'portal' },
      { key: `${KEY_PREFIX}.pub.active.en`, lang: 'en', value: 'Public English', scope: 'portal' },
      { key: `${KEY_PREFIX}.pub.disabled`, lang: 'zh-CN', value: '已下线', scope: 'portal', status: 'disabled' },
      { key: `${KEY_PREFIX}.pub.console`, lang: 'zh-CN', value: '控制台条目', scope: 'console' },
    ];
    for (const s of seeds) {
      await app.inject({
        method: 'POST', url: '/api/v1/admin/i18n/entries',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: s,
      });
    }
  });

  afterAll(async () => {
    await db.delete(schema.i18nEntries).where(like(schema.i18nEntries.key, `${KEY_PREFIX}%`));
    await app.close();
  });

  it('?lang=en 返回正确 key→value 映射，只含 active+portal', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/public/i18n/entries?lang=en` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data[`${KEY_PREFIX}.pub.active.en`]).toBe('Public English');
    expect(body.data[`${KEY_PREFIX}.pub.active.zh`]).toBeUndefined();
    expect(body.data[`${KEY_PREFIX}.pub.disabled`]).toBeUndefined();
    expect(body.data[`${KEY_PREFIX}.pub.console`]).toBeUndefined();
  });

  it('缺省 lang 返回 zh-CN 映射（同样只含 active+portal）', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/public/i18n/entries` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data[`${KEY_PREFIX}.pub.active.zh`]).toBe('公开中文');
    expect(body.data[`${KEY_PREFIX}.pub.disabled`]).toBeUndefined();
    expect(body.data[`${KEY_PREFIX}.pub.console`]).toBeUndefined();
  });

  it('disabled 条目被 PUT 恢复 active 后重新出现在公开映射中', async () => {
    // 找到 disabled 条目 id → PUT active → 公开接口出现
    const list = await app.inject({
      method: 'GET', url: `/api/v1/admin/i18n/entries?key=${KEY_PREFIX}.pub.disabled`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const item = JSON.parse(list.payload).data.items[0];
    expect(item).toBeDefined();
    await app.inject({
      method: 'PUT', url: `/api/v1/admin/i18n/entries/${item.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'active' },
    });
    const res = await app.inject({ method: 'GET', url: `/api/v1/public/i18n/entries?lang=zh-CN` });
    expect(JSON.parse(res.payload).data[`${KEY_PREFIX}.pub.disabled`]).toBe('已下线');
  });
});

describe('public blog API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    // 直接写库预置：published blog ×2、draft blog ×1、published 其他类型 ×1
    await db.insert(schema.siteContents).values([
      { type: 'blog', slug: `${SLUG_PREFIX}-a`, title: `测试文章A-${ts}`, content: '这是 A 的正文\n第二行', status: 'published' },
      { type: 'blog', slug: `${SLUG_PREFIX}-b`, title: `测试文章B-${ts}`, content: '这是 B 的正文', status: 'published' },
      { type: 'blog', slug: `${SLUG_PREFIX}-draft`, title: `草稿-${ts}`, content: '草稿正文', status: 'draft' },
      { type: 'page', slug: `${SLUG_PREFIX}-page`, title: `页面-${ts}`, content: '非博客内容', status: 'published' },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.siteContents).where(like(schema.siteContents.slug, `${SLUG_PREFIX}%`));
    await app.close();
  });

  it('列表只含 published + type=blog 的文章，返回 id/slug/title/updated_at', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/blog' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.total).toBeGreaterThanOrEqual(2);
    const mine = body.data.items.filter((it: any) => it.slug.startsWith(SLUG_PREFIX));
    expect(mine.length).toBe(2);
    for (const it of mine) {
      expect(typeof it.id).toBe('number');
      expect(typeof it.slug).toBe('string');
      expect(typeof it.title).toBe('string');
      expect(it.updated_at).toBeTruthy();
    }
    // 草稿与非博客类型不出现
    expect(body.data.items.some((it: any) => it.slug === `${SLUG_PREFIX}-draft`)).toBe(false);
    expect(body.data.items.some((it: any) => it.slug === `${SLUG_PREFIX}-page`)).toBe(false);
  });

  it(':slug 详情返回 title/content/updated_at', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/public/blog/${SLUG_PREFIX}-a` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.title).toBe(`测试文章A-${ts}`);
    expect(body.data.content).toContain('这是 A 的正文');
    expect(body.data.slug).toBe(`${SLUG_PREFIX}-a`);
  });

  it('草稿文章按 slug 访问 → 404', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/public/blog/${SLUG_PREFIX}-draft` });
    expect(res.statusCode).toBe(404);
  });

  it('不存在的 slug → 404', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/public/blog/${SLUG_PREFIX}-not-exist` });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload).code).toBe(404);
  });

  it('分页参数生效', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/blog?page=1&pageSize=2' });
    const body = JSON.parse(res.payload);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(2);
    expect(body.data.items.length).toBeLessThanOrEqual(2);
  });
});
