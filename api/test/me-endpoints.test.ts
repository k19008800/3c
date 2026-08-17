/**
 * P1-1 用户高频端点集成测试 — /me/* + /auth/* 新端点（真实 PG + Redis）
 *
 * 覆盖：
 *   - change-password / change-email（me.ts）
 *   - invoices 列表 + 下载（me.ts）
 *   - tickets 创建/列表/reply/resolve（me.ts）
 *   - api-keys revoke-all（me.ts，验证原 Key 调 /v1/chat/completions → 401）
 *   - redemption/redeem（recharge.ts，campaign_coupon_codes 原子占用 + 余额入账）
 *   - webhooks CRUD + regenerate-secret + test 投递（webhooks.ts）
 *   - auth forgot-password / reset-password / send-email-code（auth.ts，防枚举 + Redis 验证码）
 *
 * 环境：PORT 独立端口 3035（buildApp envOverrides）；数据用唯一 email/code 隔离，
 * 不清理共享库历史数据（与 auth.test.ts 等既有测试一致）。
 *
 * @see docs/iteration-plan-v2.md P1-1
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, sql, desc } from 'drizzle-orm';
import { getRedis } from '../src/lib/redis';
import { campaignCouponCodes } from '../src/db/schema/coupons';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-me-endpoints-secret-p1-1',
  PORT: '3035',
};

let app: FastifyInstance;

/** 注册用户（唯一邮箱），返回 email + accessToken */
async function registerUser(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'Test1234!', name: 'P1-1 Test' },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { user: { id: number; email: string }; accessToken: string };
  return { email, user: body.user, accessToken: body.accessToken };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** 创建可兑换的码：coupon_codes 批次（模板）+ campaign_coupon_codes 单个码 */
async function createRedeemableCode(faceValue = '50.00', batchOverrides: Record<string, unknown> = {}) {
  const [batch] = await db.insert(schema.couponCodes).values({
    batchCode: `BT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    batchName: 'P1-1 test batch',
    couponType: 'fixed_amount',
    faceValue,
    totalCount: 10,
    usedCount: 0,
    maxPerUser: 1,
    status: 'active',
    ...batchOverrides,
  }).returning({ id: schema.couponCodes.id });
  const code = `RDM${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
  const [ccc] = await db.insert(campaignCouponCodes).values({
    campaignId: batch!.id,
    code,
    status: 'unused',
  }).returning({ id: campaignCouponCodes.id });
  return { batch: batch!, code, cccId: ccc!.id };
}

beforeAll(async () => {
  // campaign_coupon_codes 在 schema 中已声明但迁移未建表（P1-1 上下文），测试前置补建（幂等）
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS campaign_coupon_codes (
      id serial PRIMARY KEY,
      campaign_id integer NOT NULL,
      code varchar(50) NOT NULL UNIQUE,
      status varchar(20) NOT NULL DEFAULT 'unused',
      used_by integer,
      used_at timestamp,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  app = await buildApp({ envOverrides: testEnv });
  await app.ready();
});

afterAll(async () => {
  // 清理本测试写入的 Redis 验证码键（best-effort）
  try {
    const r = getRedis();
    if (r) {
      const keys = await r.keys('email-code:*');
      if (keys.length > 0) await r.del(...keys);
    }
  } catch {
    /* 清理失败忽略 */
  }
  await app.close();
});

// ═══════════════════════════════════════════════════════════
// change-password
// ═══════════════════════════════════════════════════════════
describe('POST /api/v1/me/change-password', () => {
  it('正确旧密码 → 200，新密码可登录、旧密码失效', async () => {
    const { email, accessToken } = await registerUser('cp-ok');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/change-password',
      headers: auth(accessToken),
      payload: { oldPassword: 'Test1234!', newPassword: 'NewPass123!' },
    });
    expect(res.statusCode).toBe(200);

    const loginNew = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'NewPass123!' },
    });
    expect(loginNew.statusCode).toBe(200);

    const loginOld = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'Test1234!' },
    });
    expect(loginOld.statusCode).toBe(401);
  });

  it('错误旧密码 → 401', async () => {
    const { accessToken } = await registerUser('cp-wrong');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/change-password',
      headers: auth(accessToken),
      payload: { oldPassword: 'WrongOld1!', newPassword: 'NewPass123!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('新密码过短 → 400', async () => {
    const { accessToken } = await registerUser('cp-short');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/change-password',
      headers: auth(accessToken),
      payload: { oldPassword: 'Test1234!', newPassword: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/change-password',
      payload: { oldPassword: 'Test1234!', newPassword: 'NewPass123!' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
// change-email
// ═══════════════════════════════════════════════════════════
describe('POST /api/v1/me/change-email', () => {
  it('成功 → 200，且 /me 返回新邮箱', async () => {
    const { accessToken } = await registerUser('ce-ok');
    const newEmail = `ce-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/change-email',
      headers: auth(accessToken),
      payload: { newEmail },
    });
    expect(res.statusCode).toBe(200);

    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: auth(accessToken) });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe(newEmail);
  });

  it('重复邮箱 → 409', async () => {
    const a = await registerUser('ce-a');
    const b = await registerUser('ce-b');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/change-email',
      headers: auth(a.accessToken),
      payload: { newEmail: b.email },
    });
    expect(res.statusCode).toBe(409);
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/change-email',
      payload: { newEmail: 'nobody@test.com' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
// invoices
// ═══════════════════════════════════════════════════════════
describe('GET /api/v1/me/invoices (+download)', () => {
  it('列表 200 且只含本人发票', async () => {
    const a = await registerUser('inv-a');
    const b = await registerUser('inv-b');
    const now = new Date();

    const [ia1, ia2] = await Promise.all([
      db.insert(schema.invoices).values({
        userId: a.user.id, invoiceNo: `INV-A-${Date.now()}-1`, amount: '100.00', tax: '6.00',
        status: 'issued', title: 'A-1', taxId: 'TAXA1', recipient: 'A Recipient', issuedAt: now,
      }).returning(),
      db.insert(schema.invoices).values({
        userId: a.user.id, invoiceNo: `INV-A-${Date.now()}-2`, amount: '200.00', tax: '12.00',
        status: 'issued', title: 'A-2', taxId: 'TAXA2', recipient: 'A Recipient', issuedAt: now,
      }).returning(),
    ]);
    await db.insert(schema.invoices).values({
      userId: b.user.id, invoiceNo: `INV-B-${Date.now()}`, amount: '300.00', tax: '18.00',
      status: 'issued', title: 'B-1', taxId: 'TAXB1', recipient: 'B Recipient', issuedAt: now,
    }).returning();

    const res = await app.inject({ method: 'GET', url: '/api/v1/me/invoices', headers: auth(a.accessToken) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.list.length).toBe(2);
    const ids = body.data.list.map((i: any) => i.id).sort();
    expect(ids).toEqual([ia1![0]!.id, ia2![0]!.id].sort((x, y) => x - y));
    expect(body.data.pagination.total).toBe(2);
  });

  it('下载本人发票 → 200 + Content-Disposition 附件名', async () => {
    const a = await registerUser('inv-dl');
    const [inv] = await db.insert(schema.invoices).values({
      userId: a.user.id, invoiceNo: `INV-DL-${Date.now()}`, amount: '66.00', tax: '3.96',
      status: 'issued', title: 'DL', taxId: 'TAXDL', recipient: 'DL Recipient', issuedAt: new Date(),
    }).returning();

    const res = await app.inject({
      method: 'GET', url: `/api/v1/me/invoices/${inv!.id}/download`, headers: auth(a.accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment; filename="invoice-');
    const body = res.json();
    expect(body.invoice_no).toBe(inv!.invoiceNo);
    expect(body.amount).toBe(66);
  });

  it('下载他人发票 → 404（越权）', async () => {
    const a = await registerUser('inv-own');
    const b = await registerUser('inv-other');
    const [inv] = await db.insert(schema.invoices).values({
      userId: b.user.id, invoiceNo: `INV-O-${Date.now()}`, amount: '1.00', tax: '0.06',
      status: 'issued', title: 'O', taxId: 'TAXO', recipient: 'O Recipient', issuedAt: new Date(),
    }).returning();

    const res = await app.inject({
      method: 'GET', url: `/api/v1/me/invoices/${inv!.id}/download`, headers: auth(a.accessToken),
    });
    expect(res.statusCode).toBe(404);
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/invoices' });
    expect(res.statusCode).toBe(401);
  });

  it('下载未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/invoices/1/download' });
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
// redemption / redeem
// ═══════════════════════════════════════════════════════════
describe('POST /api/v1/me/redemption/redeem', () => {
  it('成功兑换：余额增加 face_value，码被占用（used_by/status=used）', async () => {
    const u = await registerUser('rd-ok');
    const { code } = await createRedeemableCode('50.00');

    const before = await app.inject({ method: 'GET', url: '/api/v1/me/balance', headers: auth(u.accessToken) });
    const beforeBal = before.json().data.balance;

    const res = await app.inject({
      method: 'POST', url: '/api/v1/me/redemption/redeem', headers: auth(u.accessToken), payload: { code },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.amount).toBe(50);
    expect(res.json().data.balance_after).toBe(beforeBal + 50);

    // 原子占用落库
    const [row] = await db.select().from(campaignCouponCodes).where(eq(campaignCouponCodes.code, code)).limit(1);
    expect(row!.status).toBe('used');
    expect(row!.usedBy).toBe(u.user.id);
    expect(row!.usedAt).not.toBeNull();
  });

  it('重复兑换同一码 → 409', async () => {
    const u = await registerUser('rd-dupe');
    const { code } = await createRedeemableCode('10.00');

    const first = await app.inject({
      method: 'POST', url: '/api/v1/me/redemption/redeem', headers: auth(u.accessToken), payload: { code },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST', url: '/api/v1/me/redemption/redeem', headers: auth(u.accessToken), payload: { code },
    });
    expect(second.statusCode).toBe(409);
  });

  it('不存在的码 → 404', async () => {
    const u = await registerUser('rd-miss');
    const res = await app.inject({
      method: 'POST', url: '/api/v1/me/redemption/redeem', headers: auth(u.accessToken),
      payload: { code: 'RDM-DOES-NOT-EXIST-12345' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('批次停用 → 400', async () => {
    const u = await registerUser('rd-off');
    const { code } = await createRedeemableCode('10.00', { status: 'disabled' });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/me/redemption/redeem', headers: auth(u.accessToken), payload: { code },
    });
    expect(res.statusCode).toBe(400);
  });

  it('批次过期（valid_to 已过）→ 400', async () => {
    const u = await registerUser('rd-exp');
    const { code } = await createRedeemableCode('10.00', { validTo: new Date(Date.now() - 60_000) });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/me/redemption/redeem', headers: auth(u.accessToken), payload: { code },
    });
    expect(res.statusCode).toBe(400);
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/me/redemption/redeem', payload: { code: 'ANY-CODE' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
// tickets
// ═══════════════════════════════════════════════════════════
describe('POST /api/v1/me/tickets (+list/reply/resolve)', () => {
  it('创建 → 201，列表 → 200 且包含新建工单', async () => {
    const u = await registerUser('tk-create');
    const create = await app.inject({
      method: 'POST', url: '/api/v1/me/tickets', headers: auth(u.accessToken),
      payload: { type: 'general', title: 'P1-1 测试工单', content: '工单内容' },
    });
    expect(create.statusCode).toBe(201);
    const ticketId = create.json().data.id;

    const list = await app.inject({ method: 'GET', url: '/api/v1/me/tickets', headers: auth(u.accessToken) });
    expect(list.statusCode).toBe(200);
    const items = list.json().data.list;
    expect(items.some((t: any) => t.id === ticketId)).toBe(true);
    expect(items[0]!.status).toBe('open');
  });

  it('reply → 200：回复追加且 waiting_customer → open', async () => {
    const u = await registerUser('tk-reply');
    const create = await app.inject({
      method: 'POST', url: '/api/v1/me/tickets', headers: auth(u.accessToken),
      payload: { type: 'billing', title: '回复测试', content: '原文' },
    });
    const ticketId = create.json().data.id;

    // 模拟管理端已回复并置为 waiting_customer
    await db.update(schema.tickets).set({ status: 'waiting_customer', updatedAt: new Date() })
      .where(eq(schema.tickets.id, ticketId));

    const res = await app.inject({
      method: 'POST', url: `/api/v1/me/tickets/${ticketId}/reply`, headers: auth(u.accessToken),
      payload: { content: '用户补充回复' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.status).toBe('open');
    expect(body.replies.length).toBe(1);
    expect(body.replies[0]!.content).toBe('用户补充回复');
  });

  it('resolve → 200：本人工单状态转 resolved + resolved_at', async () => {
    const u = await registerUser('tk-resolve');
    const create = await app.inject({
      method: 'POST', url: '/api/v1/me/tickets', headers: auth(u.accessToken),
      payload: { type: 'general', title: '解决测试', content: '内容' },
    });
    const ticketId = create.json().data.id;

    const res = await app.inject({
      method: 'POST', url: `/api/v1/me/tickets/${ticketId}/resolve`, headers: auth(u.accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('resolved');
    expect(res.json().data.resolved_at).not.toBeNull();
  });

  it('操作他人工单（reply/resolve）→ 404（越权）', async () => {
    const a = await registerUser('tk-a');
    const b = await registerUser('tk-b');
    const create = await app.inject({
      method: 'POST', url: '/api/v1/me/tickets', headers: auth(b.accessToken),
      payload: { type: 'general', title: '他人工单', content: '内容' },
    });
    const ticketId = create.json().data.id;

    const reply = await app.inject({
      method: 'POST', url: `/api/v1/me/tickets/${ticketId}/reply`, headers: auth(a.accessToken),
      payload: { content: '越权回复' },
    });
    expect(reply.statusCode).toBe(404);

    const resolve = await app.inject({
      method: 'POST', url: `/api/v1/me/tickets/${ticketId}/resolve`, headers: auth(a.accessToken),
    });
    expect(resolve.statusCode).toBe(404);
  });

  it('未登录 → 401（创建 + 列表）', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/v1/me/tickets', payload: { type: 'general', title: 'x', content: 'y' },
    });
    expect(create.statusCode).toBe(401);
    const list = await app.inject({ method: 'GET', url: '/api/v1/me/tickets' });
    expect(list.statusCode).toBe(401);
  });

  it('reply 未登录 → 401', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/me/tickets/1/reply', payload: { content: 'x' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('resolve 未登录 → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/me/tickets/1/resolve' });
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
// webhooks
// ═══════════════════════════════════════════════════════════
describe('/api/v1/me/webhooks CRUD', () => {
  it('创建 → 201 返回 {webhook, secret}；列表不返回 secret', async () => {
    const u = await registerUser('wh-create');
    const create = await app.inject({
      method: 'POST', url: '/api/v1/me/webhooks', headers: auth(u.accessToken),
      payload: {
        name: '余额预警',
        url: 'https://example.com/hook',
        events: ['balance.low', 'budget.exceeded'],
        balanceThreshold: 20,
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json();
    expect(created.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(created.webhook.name).toBe('余额预警');
    expect(created.webhook.events).toEqual(['balance.low', 'budget.exceeded']);
    expect(created.webhook.balance_threshold).toBe(20);
    expect(created.webhook.secret).toBeUndefined();

    const list = await app.inject({ method: 'GET', url: '/api/v1/me/webhooks', headers: auth(u.accessToken) });
    expect(list.statusCode).toBe(200);
    const listBody = list.json();
    expect(listBody.total).toBeGreaterThanOrEqual(1);
    const item = listBody.webhooks.find((w: any) => w.id === created.webhook.id);
    expect(item).toBeDefined();
    expect(item.secret).toBeUndefined();
  });

  it('URL 非 http(s) → 400', async () => {
    const u = await registerUser('wh-url');
    const res = await app.inject({
      method: 'POST', url: '/api/v1/me/webhooks', headers: auth(u.accessToken),
      payload: { name: 'x', url: 'ftp://example.com', events: ['balance.low'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT 更新 → 200（name/url/events/阈值），不改变 secret', async () => {
    const u = await registerUser('wh-put');
    const create = await app.inject({
      method: 'POST', url: '/api/v1/me/webhooks', headers: auth(u.accessToken),
      payload: { name: '旧名', url: 'https://example.com/a', events: ['balance.low'] },
    });
    const id = create.json().webhook.id;

    const res = await app.inject({
      method: 'PUT', url: `/api/v1/me/webhooks/${id}`, headers: auth(u.accessToken),
      payload: { name: '新名', url: 'https://example.com/b', events: ['call.failure_rate'], usageSpikeMultiplier: 5 },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().webhook;
    expect(updated.name).toBe('新名');
    expect(updated.url).toBe('https://example.com/b');
    expect(updated.events).toEqual(['call.failure_rate']);
    expect(updated.usage_spike_multiplier).toBe(5);
    expect(updated.secret).toBeUndefined();
  });

  it('regenerate-secret → 200 返回新值且与旧值不同', async () => {
    const u = await registerUser('wh-sec');
    const create = await app.inject({
      method: 'POST', url: '/api/v1/me/webhooks', headers: auth(u.accessToken),
      payload: { name: 'x', url: 'https://example.com/h', events: ['balance.low'] },
    });
    const id = create.json().webhook.id;
    const oldSecret = create.json().secret;

    const res = await app.inject({
      method: 'POST', url: `/api/v1/me/webhooks/${id}/regenerate-secret`, headers: auth(u.accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().secret).toMatch(/^[0-9a-f]{64}$/);
    expect(res.json().secret).not.toBe(oldSecret);
  });

  it('test 投递：目标不可达 → {ok:false} 且 HTTP 200（不 500）', async () => {
    const u = await registerUser('wh-test');
    const create = await app.inject({
      method: 'POST', url: '/api/v1/me/webhooks', headers: auth(u.accessToken),
      payload: { name: 'x', url: 'http://127.0.0.1:1/3cloud-test', events: ['balance.low'] },
    });
    const id = create.json().webhook.id;

    const res = await app.inject({
      method: 'POST', url: `/api/v1/me/webhooks/${id}/test`, headers: auth(u.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  it('DELETE → 200，删除后列表不含该 webhook', async () => {
    const u = await registerUser('wh-del');
    const create = await app.inject({
      method: 'POST', url: '/api/v1/me/webhooks', headers: auth(u.accessToken),
      payload: { name: 'x', url: 'https://example.com/d', events: ['balance.low'] },
    });
    const id = create.json().webhook.id;

    const del = await app.inject({ method: 'DELETE', url: `/api/v1/me/webhooks/${id}`, headers: auth(u.accessToken) });
    expect(del.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: '/api/v1/me/webhooks', headers: auth(u.accessToken) });
    expect(list.json().webhooks.some((w: any) => w.id === id)).toBe(false);
  });

  it('操作他人 webhook（PUT/regenerate/test/GET 单条）→ 404（越权）', async () => {
    const a = await registerUser('wh-a');
    const b = await registerUser('wh-b');
    const create = await app.inject({
      method: 'POST', url: '/api/v1/me/webhooks', headers: auth(b.accessToken),
      payload: { name: 'b-hook', url: 'https://example.com/b', events: ['balance.low'] },
    });
    const id = create.json().webhook.id;

    const put = await app.inject({
      method: 'PUT', url: `/api/v1/me/webhooks/${id}`, headers: auth(a.accessToken),
      payload: { name: 'hijack' },
    });
    expect(put.statusCode).toBe(404);

    const regen = await app.inject({
      method: 'POST', url: `/api/v1/me/webhooks/${id}/regenerate-secret`, headers: auth(a.accessToken),
    });
    expect(regen.statusCode).toBe(404);

    const test = await app.inject({
      method: 'POST', url: `/api/v1/me/webhooks/${id}/test`, headers: auth(a.accessToken),
    });
    expect(test.statusCode).toBe(404);

    const del = await app.inject({ method: 'DELETE', url: `/api/v1/me/webhooks/${id}`, headers: auth(a.accessToken) });
    expect(del.statusCode).toBe(404);
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/webhooks' });
    expect(res.statusCode).toBe(401);
  });

  it('CRUD/regenerate/test 未登录 → 401', async () => {
    const post = await app.inject({
      method: 'POST', url: '/api/v1/me/webhooks',
      payload: { name: 'x', url: 'https://example.com/x', events: ['balance.low'] },
    });
    expect(post.statusCode).toBe(401);
    const put = await app.inject({ method: 'PUT', url: '/api/v1/me/webhooks/1', payload: { name: 'x' } });
    expect(put.statusCode).toBe(401);
    const del = await app.inject({ method: 'DELETE', url: '/api/v1/me/webhooks/1' });
    expect(del.statusCode).toBe(401);
    const regen = await app.inject({ method: 'POST', url: '/api/v1/me/webhooks/1/regenerate-secret' });
    expect(regen.statusCode).toBe(401);
    const test = await app.inject({ method: 'POST', url: '/api/v1/me/webhooks/1/test' });
    expect(test.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
// api-keys revoke-all
// ═══════════════════════════════════════════════════════════
describe('POST /api/v1/me/api-keys/revoke-all', () => {
  it('200 后原 Key 调 /v1/chat/completions → 401', async () => {
    const u = await registerUser('rk-all');
    const created = await app.inject({
      method: 'POST', url: '/api/v1/me/api-keys', headers: auth(u.accessToken),
      payload: { name: 'revoke-all-key' },
    });
    expect(created.statusCode).toBe(201);
    const rawKey = created.json().key as string;

    // 吊销前：Key 有效（非 401，正常走 mock 回退 200）
    const before = await app.inject({
      method: 'POST', url: '/v1/chat/completions',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { model: `me-test-${Date.now()}`, messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(before.statusCode).not.toBe(401);

    const revoke = await app.inject({
      method: 'POST', url: '/api/v1/me/api-keys/revoke-all', headers: auth(u.accessToken),
    });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().data.revoked).toBeGreaterThanOrEqual(1);

    const after = await app.inject({
      method: 'POST', url: '/v1/chat/completions',
      headers: { authorization: `Bearer ${rawKey}` },
      payload: { model: `me-test-${Date.now()}`, messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(after.statusCode).toBe(401);
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/me/api-keys/revoke-all' });
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
// auth forgot-password / reset-password
// ═══════════════════════════════════════════════════════════
describe('POST /api/v1/auth/forgot-password', () => {
  it('存在邮箱 → 200 统一文案，且 email_logs 落库令牌', async () => {
    const { email } = await registerUser('fp-exist');
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/forgot-password', payload: { email },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('重置邮件');

    const logs = await db.select({ content: schema.emailLogs.content })
      .from(schema.emailLogs)
      .where(eq(schema.emailLogs.toAddress, email))
      .orderBy(desc(schema.emailLogs.createdAt))
      .limit(1);
    expect(logs.length).toBe(1);
    expect(logs[0]!.content).toMatch(/[0-9a-f]{64}/);
  });

  it('不存在邮箱 → 200 且返回同一统一文案（防枚举）', async () => {
    const missing = `fp-missing-${Date.now()}@test.com`;
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/forgot-password', payload: { email: missing },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('重置邮件');
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  /** 走 forgot-password 发邮件 → 从 email_logs 提取 64hex 令牌 */
  async function getTokenFor(email: string): Promise<string> {
    await app.inject({ method: 'POST', url: '/api/v1/auth/forgot-password', payload: { email } });
    const logs = await db.select({ content: schema.emailLogs.content })
      .from(schema.emailLogs)
      .where(eq(schema.emailLogs.toAddress, email))
      .orderBy(desc(schema.emailLogs.createdAt))
      .limit(1);
    const m = logs[0]!.content!.match(/[0-9a-f]{64}/);
    expect(m).not.toBeNull();
    return m![0]!;
  }

  it('正确 token → 200，新密码可登录', async () => {
    const { email } = await registerUser('rp-ok');
    const token = await getTokenFor(email);

    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/reset-password',
      payload: { email, token, newPassword: 'ResetPass123!' },
    });
    expect(res.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'ResetPass123!' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('错误 token → 400', async () => {
    const { email } = await registerUser('rp-wrong');
    await getTokenFor(email);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/reset-password',
      payload: { email, token: 'f'.repeat(64), newPassword: 'ResetPass123!' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('过期 token（email_logs 中 10 分钟前）→ 400', async () => {
    const { email } = await registerUser('rp-exp');
    const token = 'a'.repeat(64);
    // 直接写入 11 分钟前的 email_logs（模拟过期令牌）
    await db.insert(schema.emailLogs).values({
      toAddress: email,
      subject: '【3Cloud】重置密码',
      content: `<p>重置令牌：<code>${token}</code></p>`,
      status: 'skipped',
      createdAt: new Date(Date.now() - 11 * 60 * 1000),
    });

    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/reset-password',
      payload: { email, token, newPassword: 'ResetPass123!' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('新密码过短 → 400', async () => {
    const { email } = await registerUser('rp-short');
    const token = await getTokenFor(email);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/reset-password',
      payload: { email, token, newPassword: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════
// auth send-email-code
// ═══════════════════════════════════════════════════════════
describe('POST /api/v1/auth/send-email-code', () => {
  it('200 统一文案，且 Redis 中可查到 6 位验证码', async () => {
    const email = `ec-${Date.now()}@test.com`;
    const purpose = 'verify_email';
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/send-email-code', payload: { email, purpose },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBeTruthy();

    const r = getRedis();
    expect(r).not.toBeNull();
    const stored = await r!.get(`email-code:${email}:${purpose}`);
    expect(stored).toMatch(/^\d{6}$/);
  });

  it('非法 purpose → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/send-email-code',
      payload: { email: 'ec-bad@test.com', purpose: 'hack' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('非法邮箱 → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/send-email-code',
      payload: { email: 'not-an-email', purpose: 'verify_email' },
    });
    expect(res.statusCode).toBe(400);
  });
});
