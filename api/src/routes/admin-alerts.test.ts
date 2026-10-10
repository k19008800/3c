/**
 * 告警中心管理路由契约测试 — /admin/alerts/*（PRD §5.4，真实 PG）
 *
 * 零覆盖补测（G6）：仅测代码已实现的端点（ref-5.4 中 resolve / batch-ack /
 * alert-stats / notification-configs 代码未实现，不测）：
 *   - 鉴权：admin/super_admin 可读；规则写操作（POST/PUT/DELETE）仅 super_admin
 *   - 入参校验：metric 不在白名单 → 400；window_sec=10（越界 30–86400）→ 400
 *   - ack 不存在 id → 404
 *   - GET /admin/alerts?status=firing&rule_id=N 仅返回匹配项且 total 计数正确
 *
 * 隔离策略：本文件自建 monitoring_rules（唯一名称）+ 其下 alerts，列表断言按自有
 * rule_id 过滤，不受并行测试数据影响。
 *
 * @module routes/admin-alerts.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { inArray, sql } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt.js';
import { adminAlertsRoutes } from './admin-alerts.js';

/**
 * 测试库引导：monitoring_rules / alerts 在未迁移的旧库上不存在，而路由硬编码使用全局 db。
 * 本文件在 beforeAll 按 Drizzle schema 等价 DDL 建表（IF NOT EXISTS），afterAll 仅在
 * 「表确由本测试创建」时 DROP，避免删除 0048_alert_center 迁移建好的真实表
 * （alert_notifications 有指向 alerts 的外键，直接 DROP 会因依赖失败）。
 */

/** 表在 provision 之前是否不存在（＝应由本测试负责清理）。 */
let provisionedMonitoringRules = false;
let provisionedAlerts = false;

/** 探测表是否不存在，不存在则返回 true。 */
async function tableMissing(table: string): Promise<boolean> {
  const rows = await db.execute(sql`SELECT to_regclass(${table}) IS NULL AS missing`);
  return Boolean((rows as unknown as { missing?: boolean }[])?.[0]?.missing);
}

async function provisionTables(): Promise<void> {
  provisionedMonitoringRules = await tableMissing('monitoring_rules');
  await db.execute(sql`CREATE TABLE IF NOT EXISTS monitoring_rules (
    id serial PRIMARY KEY,
    name varchar(100) NOT NULL,
    metric varchar(50) NOT NULL,
    threshold double precision NOT NULL,
    window_sec integer NOT NULL DEFAULT 300,
    channel_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  provisionedAlerts = await tableMissing('alerts');
  await db.execute(sql`CREATE TABLE IF NOT EXISTS alerts (
    id serial PRIMARY KEY,
    rule_id integer NOT NULL REFERENCES monitoring_rules(id),
    status varchar(20) NOT NULL DEFAULT 'firing',
    metric_value double precision NOT NULL,
    threshold double precision NOT NULL,
    message text NOT NULL,
    fired_at timestamptz NOT NULL DEFAULT now(),
    acknowledged_at timestamptz,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
}

async function deprovisionTables(): Promise<void> {
  // 只清理本测试亲手创建的表；若表来自 0048 迁移则保留（alert_notifications 依赖它）。
  if (provisionedAlerts) await db.execute(sql`DROP TABLE IF EXISTS alerts`);
  if (provisionedMonitoringRules) await db.execute(sql`DROP TABLE IF EXISTS monitoring_rules`);
}

process.env.JWT_SECRET = 'test-admin-alerts-secret';

const ts = Date.now();

let adminId = 0;
let superAdminId = 0;
let adminToken = '';
let superAdminToken = '';

let mineRuleId = 0;   // 本文件主探针规则：2 firing + 1 acknowledged
let otherRuleId = 0;  // 对照规则：1 firing（验证 rule_id 过滤隔离）

let app: FastifyInstance;

function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  instance.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ code: status, message: err?.message ?? 'Internal Server Error' });
  });
  adminAlertsRoutes(instance);
  return instance;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  await provisionTables();
  const [admin] = await db.insert(schema.users).values({
    email: `alerts-admin-${ts}@test.com`, passwordHash: 'x', name: 'AlertsAdmin', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  adminId = admin!.id;

  const [superAd] = await db.insert(schema.users).values({
    email: `alerts-super-${ts}@test.com`, passwordHash: 'x', name: 'AlertsSuper', role: 'super_admin', status: 'active',
  }).returning({ id: schema.users.id });
  superAdminId = superAd!.id;

  adminToken = generateAccessToken({ userId: adminId, email: `alerts-admin-${ts}@test.com`, role: 'admin' });
  superAdminToken = generateAccessToken({ userId: superAdminId, email: `alerts-super-${ts}@test.com`, role: 'super_admin' });

  // 自建规则（直接落库，不依赖 POST 201 链路）
  const [mine] = await db.insert(schema.monitoringRules).values({
    name: `__probe_mine_${ts}`, metric: 'error_rate', threshold: 5, windowSec: 300, channelIds: [], enabled: true,
  }).returning({ id: schema.monitoringRules.id });
  mineRuleId = mine!.id;

  const [other] = await db.insert(schema.monitoringRules).values({
    name: `__probe_other_${ts}`, metric: 'qps', threshold: 100, windowSec: 300, channelIds: [], enabled: true,
  }).returning({ id: schema.monitoringRules.id });
  otherRuleId = other!.id;

  // mineRule：2 firing + 1 acknowledged；otherRule：1 firing
  await db.insert(schema.alerts).values([
    { ruleId: mineRuleId, status: 'firing', metricValue: 7.2, threshold: 5, message: 'probe firing 1' },
    { ruleId: mineRuleId, status: 'firing', metricValue: 8.1, threshold: 5, message: 'probe firing 2' },
    { ruleId: mineRuleId, status: 'acknowledged', metricValue: 6.0, threshold: 5, message: 'probe acked' },
    { ruleId: otherRuleId, status: 'firing', metricValue: 200, threshold: 100, message: 'other firing' },
  ]);

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    await db.delete(schema.alerts).where(inArray(schema.alerts.ruleId, [mineRuleId, otherRuleId]));
    await db.delete(schema.monitoringRules).where(inArray(schema.monitoringRules.id, [mineRuleId, otherRuleId]));
    await db.delete(schema.users).where(inArray(schema.users.id, [adminId, superAdminId]));
  } catch (err) {
    console.error('[admin-alerts.test] cleanup failed:', err);
  } finally {
    // 净影响归零：删除本文件自建的两张表
    await deprovisionTables();
  }
});

describe('鉴权：写规则仅 super_admin（PRD §5.4）', () => {
  it('无 token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/alerts' });
    expect(res.statusCode).toBe(401);
  });

  it('admin（非 super_admin）POST/PUT/DELETE 规则 → 403', async () => {
    const post = await app.inject({
      method: 'POST', url: '/api/v1/admin/alerts/rules', headers: auth(adminToken),
      payload: { name: 'x', metric: 'qps', threshold: 1 },
    });
    expect(post.statusCode).toBe(403);

    const put = await app.inject({
      method: 'PUT', url: `/api/v1/admin/alerts/rules/${mineRuleId}`, headers: auth(adminToken),
      payload: { enabled: false },
    });
    expect(put.statusCode).toBe(403);

    const del = await app.inject({
      method: 'DELETE', url: `/api/v1/admin/alerts/rules/${mineRuleId}`, headers: auth(adminToken),
    });
    expect(del.statusCode).toBe(403);
  });
});

describe('规则入参校验（super_admin 视角）', () => {
  it('metric 不在白名单 → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/alerts/rules', headers: auth(superAdminToken),
      payload: { name: 'bad metric', metric: 'totally_unknown', threshold: 1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('window_sec=10（越界 30–86400）→ 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/alerts/rules', headers: auth(superAdminToken),
      payload: { name: 'bad window', metric: 'qps', threshold: 1, window_sec: 10 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('告警事件：ack 与列表筛选', () => {
  it('ack 不存在 id → 404', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/alerts/999999/ack', headers: auth(adminToken), payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET ?status=firing&rule_id=mine 仅返回匹配项且 total=2', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/alerts?status=firing&rule_id=${mineRuleId}`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.total).toBe(2);          // mineRule 的 2 条 firing（不含 otherRule firing / acknowledged）
    expect(data.items.length).toBe(2);
    for (const it of data.items) {
      expect(it.status).toBe('firing');
      expect(Number(it.ruleId)).toBe(mineRuleId);
    }
  });
});
