/**
 * P2-4 IP 黑名单集成测试 — 管理端 CRUD + 网关 onRequest 拦截（真实 PG + Redis）
 *
 * 覆盖（docs/iteration-plan-v2.md P2-4 测试要求）：
 *   1. 单 IP 命中 → 403 IP_BLACKLISTED；CIDR 命中（198.51.100.0/24）→ 403
 *   2. 未封禁 / 已解禁 / 已过期 → 不拦截
 *   3. scope：api 只拦网关不拦 admin；admin 只拦 admin 不拦网关；all 两者都拦
 *   4. 管理端 CRUD + 重复添加 409 + 批量导入（成功/失败计数）
 *   5. 非法 IP 400；非 admin 403
 *   6. CIDR 掩码纯函数单测
 *
 * 注意：测试 IP 一律使用文档保留网段（192.0.2.x / 198.51.100.x / 203.0.113.x），
 * 严禁封禁 127.0.0.1（其他测试文件共用同一 DB 与 app 构建，避免互相干扰）；
 * afterAll 清理本测试插入的黑名单行。
 *
 * @see docs/iteration-plan-v2.md P2-4
 * @see kb/3cloud/admin-security-ip-blacklist.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, inArray, sql, or, ilike } from 'drizzle-orm';
import {
  ipv4ToInt,
  isValidIpOrCidr,
  isValidCidr,
  isValidIpv4,
  cidrContains,
  ipMatches,
} from '../src/services/security/ip-blacklist';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-ip-blacklist-secret-p2-4',
  PORT: '3038',
};

let app: FastifyInstance;
/** 本测试插入的黑名单 id（afterAll 清理） */
const createdIds: number[] = [];

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function registerUser(prefix: string) {
  const email = `${prefix}-${uid()}@test.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'Test1234!', name: 'P2-4 IP Test' },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { user: { id: number }; accessToken: string };
  return { email, user: body.user, accessToken: body.accessToken };
}

async function registerAdmin(prefix: string) {
  const { email, user } = await registerUser(prefix);
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, user.id));
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'Test1234!' } });
  expect(login.statusCode).toBe(200);
  return { email, user, accessToken: (login.json() as { accessToken: string }).accessToken };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** 用指定来源 IP 打网关路径（无 API Key → 未拦截时 401） */
async function gatewayHit(ip: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/chat/completions',
    remoteAddress: ip,
    payload: { model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }] },
  });
}

/** 用指定来源 IP 打管理端点（未拦截时返回 200/401 取决于是否带 token） */
async function adminHit(ip: string, token?: string) {
  return app.inject({
    method: 'GET',
    url: '/api/v1/admin/security/ip-blacklist',
    remoteAddress: ip,
    headers: token ? auth(token) : {},
  });
}

/** 添加黑名单（直接走管理端 API，返回创建的 id） */
async function addBlacklist(adminToken: string, payload: Record<string, unknown>) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/security/ip-blacklist',
    headers: auth(adminToken),
    payload,
  });
  if (res.statusCode === 201) {
    createdIds.push((res.json() as any).data.id);
  }
  return res;
}

beforeAll(async () => {
  app = await buildApp({ envOverrides: testEnv });
  await app.ready();
});

afterAll(async () => {
  // 清理本测试可能留下的黑名单行：先按 id（走 API 创建的），再按文档保留网段
  // 范围（覆盖批量导入直插行，防止遗留 active 行影响后续测试运行）
  if (createdIds.length > 0) {
    try {
      await db.delete(schema.ipBlacklist).where(inArray(schema.ipBlacklist.id, createdIds));
    } catch { /* 清理失败忽略 */ }
  }
  try {
    await db.delete(schema.ipBlacklist).where(or(
      ilike(schema.ipBlacklist.ip, '203.0.113.%'),
      ilike(schema.ipBlacklist.ip, '198.51.100.%'),
      ilike(schema.ipBlacklist.ip, '192.0.2.%'),
    ));
  } catch { /* 清理失败忽略 */ }
  await app.close();
});

describe('ip-blacklist CIDR / IP 纯函数', () => {
  it('ipv4ToInt / isValidIpv4 / isValidCidr / isValidIpOrCidr', () => {
    expect(ipv4ToInt('192.168.1.1')).toBe(0xc0a80101);
    expect(ipv4ToInt('256.1.1.1')).toBeNull();
    expect(ipv4ToInt('1.2.3')).toBeNull();
    expect(ipv4ToInt('01.2.3.4')).toBeNull();
    expect(isValidIpv4('10.0.0.1')).toBe(true);
    expect(isValidCidr('192.168.1.0/24')).toBe(true);
    expect(isValidCidr('192.168.1.0/33')).toBe(false);
    expect(isValidCidr('192.168.1.0/')).toBe(false);
    expect(isValidCidr('not-an-ip/24')).toBe(false);
    expect(isValidIpOrCidr('203.0.113.5')).toBe(true);
    expect(isValidIpOrCidr('198.51.100.0/24')).toBe(true);
    expect(isValidIpOrCidr('2001:db8::1')).toBe(true);
    expect(isValidIpOrCidr('999.1.1.1')).toBe(false);
    expect(isValidIpOrCidr('')).toBe(false);
  });

  it('cidrContains 掩码匹配（含 0.0.0.0/0）', () => {
    expect(cidrContains('192.168.1.0/24', '192.168.1.55')).toBe(true);
    expect(cidrContains('192.168.1.0/24', '192.168.2.55')).toBe(false);
    expect(cidrContains('10.0.0.0/8', '10.9.9.9')).toBe(true);
    expect(cidrContains('10.0.0.0/8', '11.0.0.1')).toBe(false);
    expect(cidrContains('0.0.0.0/0', '8.8.8.8')).toBe(true);
    expect(cidrContains('192.168.1.0/24', 'not-ip')).toBe(false);
  });

  it('ipMatches：single 精确 / cidr 网段', () => {
    expect(ipMatches('203.0.113.9', '203.0.113.9', 'single')).toBe(true);
    expect(ipMatches('203.0.113.10', '203.0.113.9', 'single')).toBe(false);
    expect(ipMatches('198.51.100.7', '198.51.100.0/24', 'cidr')).toBe(true);
    expect(ipMatches('198.51.101.7', '198.51.100.0/24', 'cidr')).toBe(false);
  });
});

describe('ip-blacklist 网关拦截（onRequest hook）', () => {
  it('单 IP scope=api：网关 403；其他 IP 不拦截（401 而非 403）', async () => {
    const admin = await registerAdmin('ip-single-admin');
    const blockedIp = '203.0.113.10';
    const res = await addBlacklist(admin.accessToken, { ip: blockedIp, scope: 'api', reason: 'CC 攻击' });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.type).toBe('single');

    const hit = await gatewayHit(blockedIp);
    expect(hit.statusCode).toBe(403);
    expect(hit.json().code).toBe('IP_BLACKLISTED');

    const other = await gatewayHit('203.0.113.11');
    expect(other.statusCode).not.toBe(403);
    expect(other.statusCode).toBe(401);
  });

  it('CIDR 命中：198.51.100.0/24 拦截网段内 IP，网段外放行', async () => {
    const admin = await registerAdmin('ip-cidr-admin');
    const res = await addBlacklist(admin.accessToken, { ip: '198.51.100.0/24', scope: 'all' });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.type).toBe('cidr');

    expect((await gatewayHit('198.51.100.55')).statusCode).toBe(403);
    expect((await gatewayHit('198.51.100.1')).statusCode).toBe(403);
    // 网段外
    const outside = await gatewayHit('198.51.101.55');
    expect(outside.statusCode).not.toBe(403);
  });

  it('已解禁不拦截；已过期不拦截', async () => {
    const admin = await registerAdmin('ip-inactive-admin');
    // 解禁路径
    const add = await addBlacklist(admin.accessToken, { ip: '203.0.113.20', scope: 'api' });
    const id = add.json().data.id;
    const unblock = await app.inject({
      method: 'POST', url: `/api/v1/admin/security/ip-blacklist/${id}/unblock`, headers: auth(admin.accessToken),
    });
    expect(unblock.statusCode).toBe(200);
    expect((await gatewayHit('203.0.113.20')).statusCode).not.toBe(403);

    // 过期路径（直接插库，expires_at 在过去）
    const [expired] = await db.insert(schema.ipBlacklist).values({
      ip: '203.0.113.30', type: 'single', scope: 'api', status: 'active',
      createdBy: admin.user.id, expiresAt: new Date(Date.now() - 3600_000),
    }).returning({ id: schema.ipBlacklist.id });
    createdIds.push(expired!.id);
    expect((await gatewayHit('203.0.113.30')).statusCode).not.toBe(403);
  });

  it('scope 语义：api 只拦网关不拦 admin；admin 只拦 admin 不拦网关；all 都拦', async () => {
    const admin = await registerAdmin('ip-scope-admin');
    const apiOnlyIp = '203.0.113.40';
    const adminOnlyIp = '203.0.113.41';
    const allIp = '203.0.113.42';

    await addBlacklist(admin.accessToken, { ip: apiOnlyIp, scope: 'api' });
    await addBlacklist(admin.accessToken, { ip: adminOnlyIp, scope: 'admin' });
    await addBlacklist(admin.accessToken, { ip: allIp, scope: 'all' });

    // api scope：网关 403，admin 放行（200）
    expect((await gatewayHit(apiOnlyIp)).statusCode).toBe(403);
    expect((await adminHit(apiOnlyIp, admin.accessToken)).statusCode).toBe(200);
    // admin scope：网关放行（401），admin 403
    expect((await gatewayHit(adminOnlyIp)).statusCode).toBe(401);
    expect((await adminHit(adminOnlyIp)).statusCode).toBe(403);
    // all：两者都 403
    expect((await gatewayHit(allIp)).statusCode).toBe(403);
    expect((await adminHit(allIp)).statusCode).toBe(403);
  });
});

describe('ip-blacklist 管理端 CRUD', () => {
  it('创建 / 列表筛选 / 编辑 / 解禁；重复 active 409；解禁后可重新添加', async () => {
    const admin = await registerAdmin('ip-crud-admin');
    const ip = '192.0.2.55';
    const created = await addBlacklist(admin.accessToken, { ip, scope: 'all', reason: '暴力枚举' });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id;

    // 列表 + ip 关键字筛选
    const list = await app.inject({ method: 'GET', url: `/api/v1/admin/security/ip-blacklist?ip=192.0.2.55`, headers: auth(admin.accessToken) });
    expect(list.statusCode).toBe(200);
    expect((list.json() as any).data.total).toBeGreaterThanOrEqual(1);

    // 重复 active → 409
    const dup = await addBlacklist(admin.accessToken, { ip, scope: 'api' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('DUPLICATE');

    // 编辑 reason / scope
    const put = await app.inject({
      method: 'PUT', url: `/api/v1/admin/security/ip-blacklist/${id}`,
      headers: auth(admin.accessToken), payload: { reason: 'CC 攻击', scope: 'admin' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().data.reason).toBe('CC 攻击');
    expect(put.json().data.scope).toBe('admin');

    // 非法 scope → 400
    const badPut = await app.inject({
      method: 'PUT', url: `/api/v1/admin/security/ip-blacklist/${id}`,
      headers: auth(admin.accessToken), payload: { scope: 'bogus' },
    });
    expect(badPut.statusCode).toBe(400);

    // 解禁
    const unblock = await app.inject({
      method: 'POST', url: `/api/v1/admin/security/ip-blacklist/${id}/unblock`, headers: auth(admin.accessToken),
    });
    expect(unblock.statusCode).toBe(200);
    expect(unblock.json().data.status).toBe('unblocked');
    // 幂等解禁
    const unblockAgain = await app.inject({
      method: 'POST', url: `/api/v1/admin/security/ip-blacklist/${id}/unblock`, headers: auth(admin.accessToken),
    });
    expect(unblockAgain.statusCode).toBe(200);

    // 解禁后重新添加 → 201（不再冲突）
    const reAdd = await addBlacklist(admin.accessToken, { ip, scope: 'api' });
    expect(reAdd.statusCode).toBe(201);
  });

  it('非法 IP → 400', async () => {
    const admin = await registerAdmin('ip-invalid-admin');
    const res = await addBlacklist(admin.accessToken, { ip: '999.1.1.1' });
    expect(res.statusCode).toBe(400);
  });

  it('批量导入：合法成功、非法与重复失败，返回成功/失败数', async () => {
    const admin = await registerAdmin('ip-batch-admin');
    await addBlacklist(admin.accessToken, { ip: '203.0.113.90', scope: 'api' });

    const batch = await app.inject({
      method: 'POST', url: '/api/v1/admin/security/ip-blacklist/batch',
      headers: auth(admin.accessToken),
      payload: {
        items: [
          { ip: '203.0.113.91', scope: 'all', reason: 'r1' },
          { ip: '203.0.113.0/24', scope: 'api', reason: 'r2' },
          { ip: 'not-an-ip', scope: 'api' },
          { ip: '203.0.113.90', scope: 'api' }, // 重复 active → 失败
          { ip: '203.0.113.92', scope: 'admin' },
        ],
      },
    });
    expect(batch.statusCode).toBe(200);
    const data = batch.json().data;
    expect(data.success).toBe(3);
    expect(data.failed).toBe(2);
    expect(data.total).toBe(5);
    expect(data.errors).toHaveLength(2);

    // 批量导入的条目已生效（CIDR 命中）
    expect((await gatewayHit('203.0.113.7')).statusCode).toBe(403);
  });

  it('非 admin 访问 → 403；无 token → 401', async () => {
    const { accessToken } = await registerUser('ip-perm');
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/security/ip-blacklist', headers: auth(accessToken) });
    expect(res.statusCode).toBe(403);
    const noToken = await app.inject({ method: 'GET', url: '/api/v1/admin/security/ip-blacklist' });
    expect(noToken.statusCode).toBe(401);
  });
});
