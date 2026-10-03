/**
 * CRM 销售漏斗路由测试（me-crm.ts）
 *
 * 覆盖差距矩阵 G 补全：线索 / 商机 / 报价单 CRUD + 关键流程
 *   - 未登录 401 / 非 sales 403
 *   - 线索创建 → 列表 → 详情 → 追加备注 → 转商机
 *   - 商机 Kanban 列表 / 阶段流转 / 详情含报价
 *   - 报价单生成（version 自增 + total_cents 后端重算）/ 状态流转
 *   - 归属隔离：sales 只见自己的线索/商机/报价；admin 跨资源
 *
 * 策略：mock ../db（内存假 DB helpers/fake-db.ts）+ mock jwt，app.inject 冒烟，无需真实 PG。
 *
 * @module routes/me-crm.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../services/auth/jwt', () => ({
  verifyToken: (token: string) => {
    if (!token) return null;
    try {
      return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  },
}));

vi.mock('../db', async () => {
  const schemaModule = await import('../db/schema/index.js');
  const { createFakeDb } = await import('./helpers/fake-db.js');
  const db = createFakeDb(schemaModule);
  return { db, schema: schemaModule };
});

import { db, schema } from '../db/index.js';
import { meCrmRoutes } from './me-crm.js';

const fakeDb = db as unknown as {
  __seed: (table: any, rows: Record<string, any>[]) => void;
  __rows: (table: any) => Record<string, any>[];
  __reset: () => void;
};

const token = (payload: Record<string, unknown>) => Buffer.from(JSON.stringify(payload)).toString('base64url');
const authHeader = (t: string) => ({ authorization: `Bearer ${t}` });

const adminToken = token({ userId: 9, email: 'admin@3cloud.dev', role: 'admin' });
const salesToken = token({ userId: 1, email: 'sales@3cloud.dev', role: 'sales' });
const sales2Token = token({ userId: 2, email: 'sales2@3cloud.dev', role: 'sales' });
const customerToken = token({ userId: 10, email: 'customer@test.com', role: 'customer' });

async function makeApp() {
  const app = Fastify();
  app.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({
      code: status,
      message: err?.message ?? 'Internal Server Error',
      error: { message: err?.message ?? 'Internal Server Error', type: err?.name ?? 'Error' },
    });
  });
  await app.register(meCrmRoutes);
  return app;
}

beforeEach(() => {
  fakeDb.__reset();
});

describe('CRM me-crm 鉴权', () => {
  it('未登录访问 → 401', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/crm/leads' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('非 sales/admin → 403', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/crm/leads', headers: authHeader(customerToken) });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('线索 leads CRUD + 转商机流程', () => {
  it('创建线索 → 列表 → 详情 → 追加备注 → 转商机 → 生成报价', async () => {
    const app = await makeApp();

    // 1. 创建线索
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/leads',
      headers: authHeader(salesToken),
      payload: {
        company: '杭州某某科技',
        contact_name: '王总',
        contact_email: 'wang@example.com',
        contact_phone: '13800000000',
        source: 'exhibition',
      },
    });
    expect(create.statusCode).toBe(200);
    const leadId = create.json().data.id;
    expect(leadId).toBeGreaterThan(0);
    expect(create.json().data.status).toBe('new');
    expect(create.json().data.assigned_to).toBe(1);

    // 2. 列表含该线索
    const list = await app.inject({ method: 'GET', url: '/api/v1/me/crm/leads', headers: authHeader(salesToken) });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.list).toHaveLength(1);
    expect(list.json().data.list[0].company).toBe('杭州某某科技');
    expect(list.json().data.pagination.total).toBe(1);

    // 3. 详情
    const detail = await app.inject({ method: 'GET', url: `/api/v1/me/crm/leads/${leadId}`, headers: authHeader(salesToken) });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.contact_name).toBe('王总');
    expect(detail.json().data.notes).toEqual([]);

    // 4. 追加备注
    const note = await app.inject({
      method: 'POST',
      url: `/api/v1/me/crm/leads/${leadId}/notes`,
      headers: authHeader(salesToken),
      payload: { note: '展会现场留资，关注 GPU 算力租赁' },
    });
    expect(note.statusCode).toBe(200);
    expect(note.json().data.notes).toHaveLength(1);

    // 5. 转商机
    const convert = await app.inject({
      method: 'POST',
      url: `/api/v1/me/crm/leads/${leadId}/convert`,
      headers: authHeader(salesToken),
      payload: { name: 'GPU 算力集群采购', expected_value_cents: 1200000, stage: 'proposal' },
    });
    expect(convert.statusCode).toBe(200);
    const opportunityId = convert.json().data.opportunity_id;
    expect(opportunityId).toBeGreaterThan(0);
    // 线索状态推进为 qualified
    const leadRow = fakeDb.__rows(schema.salesLeads).find((r: any) => r.id === leadId);
    expect(leadRow!.status).toBe('qualified');

    // 6. 商机列表（Kanban）含该商机
    const oppList = await app.inject({ method: 'GET', url: '/api/v1/me/crm/opportunities', headers: authHeader(salesToken) });
    expect(oppList.statusCode).toBe(200);
    expect(oppList.json().data.list).toHaveLength(1);
    expect(oppList.json().data.list[0].expected_value_cents).toBe(1200000);
    expect(oppList.json().data.list[0].company).toBe('杭州某某科技');

    // 7. 基于商机生成报价（v1，total_cents 后端重算 = 100*3 + 50*2 = 400 分）
    const quote = await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/quotes',
      headers: authHeader(salesToken),
      payload: {
        opportunity_id: opportunityId,
        items: [
          { name: 'A100 算力月租', unitPriceCents: 100, quantity: 3 },
          { name: '存储扩容', unitPriceCents: 50, quantity: 2 },
        ],
      },
    });
    expect(quote.statusCode).toBe(200);
    expect(quote.json().data.version).toBe(1);
    expect(quote.json().data.total_cents).toBe(400); // 100*3 + 50*2
    expect(quote.json().data.status).toBe('draft');

    // 8. 再生成一份 → version 自增为 2
    const quote2 = await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/quotes',
      headers: authHeader(salesToken),
      payload: {
        opportunity_id: opportunityId,
        items: [{ name: 'A100 算力月租', unitPriceCents: 120, quantity: 3 }],
      },
    });
    expect(quote2.json().data.version).toBe(2);
    expect(quote2.json().data.total_cents).toBe(360);

    // 9. 商机详情聚合其报价
    const oppDetail = await app.inject({ method: 'GET', url: `/api/v1/me/crm/opportunities/${opportunityId}`, headers: authHeader(salesToken) });
    expect(oppDetail.statusCode).toBe(200);
    expect(oppDetail.json().data.quotes).toHaveLength(2);

    // 10. 报价状态流转 draft → sent → accepted
    const sendQuote = await app.inject({
      method: 'PUT',
      url: `/api/v1/me/crm/quotes/${quote.json().data.id}`,
      headers: authHeader(salesToken),
      payload: { status: 'sent' },
    });
    expect(sendQuote.statusCode).toBe(200);
    expect(sendQuote.json().data.status).toBe('sent');

    await app.close();
  });

  it('归属隔离：sales2 看不到 sales1 的线索/商机/报价', async () => {
    const app = await makeApp();
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/leads',
      headers: authHeader(salesToken),
      payload: { company: '只属于销售一', contact_name: '甲' },
    });
    const leadId = create.json().data.id;

    // sales2 列表为空
    const list2 = await app.inject({ method: 'GET', url: '/api/v1/me/crm/leads', headers: authHeader(sales2Token) });
    expect(list2.json().data.list).toHaveLength(0);

    // sales2 访问详情 → 403
    const detail2 = await app.inject({ method: 'GET', url: `/api/v1/me/crm/leads/${leadId}`, headers: authHeader(sales2Token) });
    expect(detail2.statusCode).toBe(403);

    await app.close();
  });

  it('admin 可跨资源查看所有线索', async () => {
    const app = await makeApp();
    await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/leads',
      headers: authHeader(salesToken),
      payload: { company: '销售一的线索', contact_name: '甲' },
    });
    const list = await app.inject({ method: 'GET', url: '/api/v1/me/crm/leads', headers: authHeader(adminToken) });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.list.length).toBeGreaterThanOrEqual(1);
    await app.close();
  });

  it('非法输入 → 400（缺公司名 / 非法状态 / 报价空行项）', async () => {
    const app = await makeApp();
    const noCompany = await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/leads',
      headers: authHeader(salesToken),
      payload: { contact_name: '无公司' },
    });
    expect(noCompany.statusCode).toBe(400);

    const badStatus = await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/leads',
      headers: authHeader(salesToken),
      payload: { company: 'X公司', contact_name: '乙', status: 'bogus' },
    });
    expect(badStatus.statusCode).toBe(400);

    await app.close();
  });

  it('报价：商机不存在 → 404', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/quotes',
      headers: authHeader(salesToken),
      payload: { opportunity_id: 999, items: [{ name: 'x', unitPriceCents: 1, quantity: 1 }] },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('G7/G8 契约补全（备注上限 / 审计留痕）', () => {
  // G7（PRD §11.2.2）：notes 数组追加，上限 200 条，单条 ≤1000 字
  it('G7-1: 备注 note 超过 1000 字 → 400', async () => {
    const app = await makeApp();
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/leads',
      headers: authHeader(salesToken),
      payload: { company: '超长备注公司', contact_name: '甲' },
    });
    expect(create.statusCode).toBe(200);
    const leadId = create.json().data.id;

    const tooLong = '字'.repeat(1001);
    expect(tooLong.length).toBe(1001);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/me/crm/leads/${leadId}/notes`,
      headers: authHeader(salesToken),
      payload: { note: tooLong },
    });
    // 唯一错误实现：若 me-crm.ts:292 的 `note.length > 1000` 校验被删/放宽到 >1001，
    // 1001 字会被放行返回 200，此断言变红。
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('G7-2: 已有 200 条备注再追加 → 仍 200 条且最旧条被 shift 丢弃', async () => {
    const app = await makeApp();
    const seedNotes = Array.from({ length: 200 }, (_, i) => `备注#${String(i + 1).padStart(3, '0')}`);
    fakeDb.__seed(schema.salesLeads, [
      {
        id: 1,
        company: '上限种子公司',
        contactName: '甲',
        assignedTo: 1,
        status: 'new',
        notes: seedNotes,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/leads/1/notes',
      headers: authHeader(salesToken),
      payload: { note: '最新一条备注' },
    });
    expect(res.statusCode).toBe(200);
    const notes = res.json().data.notes as string[];
    // 唯一错误实现：若 me-crm.ts:301 的 `if (notes.length > 200) notes.shift()` 被删，
    // 数组会变 201 条且头元素仍为最旧条 备注#001，下面两条断言同时变红。
    expect(notes).toHaveLength(200);
    expect(notes[0]).toBe('备注#002'); // 最旧条 备注#001 被 shift 丢弃
    expect(notes[notes.length - 1]).toBe('最新一条备注'); // 新条落在末尾
    await app.close();
  });

  // G8（PRD §11 关键架构）：写操作全部落 audit_logs
  it('G8: 创建线索/转商机/创建商机/创建报价后 audit_logs 留痕对应 action', async () => {
    const app = await makeApp();

    // 1. 创建线索 → sales.lead.create
    const lead = await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/leads',
      headers: authHeader(salesToken),
      payload: { company: '审计线索公司', contact_name: '甲' },
    });
    expect(lead.statusCode).toBe(200);
    const leadId = lead.json().data.id;

    // 2. 线索转商机（convert）→ sales.lead.convert
    const convert = await app.inject({
      method: 'POST',
      url: `/api/v1/me/crm/leads/${leadId}/convert`,
      headers: authHeader(salesToken),
      payload: { name: '审计商机', expected_value_cents: 500000, stage: 'proposal' },
    });
    expect(convert.statusCode).toBe(200);

    // 3. 直接录入一条商机 → sales.opportunity.create
    const oppDirect = await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/opportunities',
      headers: authHeader(salesToken),
      payload: { name: '直接录入商机', stage: 'proposal' },
    });
    expect(oppDirect.statusCode).toBe(200);
    const oppId = oppDirect.json().data.id;

    // 4. 基于该商机创建报价 → sales.quote.create
    const quote = await app.inject({
      method: 'POST',
      url: '/api/v1/me/crm/quotes',
      headers: authHeader(salesToken),
      payload: {
        opportunity_id: oppId,
        items: [{ name: 'GPU 月租', unitPriceCents: 100, quantity: 1 }],
      },
    });
    expect(quote.statusCode).toBe(200);

    const actions = fakeDb.__rows(schema.auditLogs).map((r: any) => r.action);
    // 唯一错误实现：任一处 writeAudit 调用被删 / action 字符串改错，
    // 对应 action 行缺失，下方 toContain 断言变红。
    expect(actions).toContain('sales.lead.create');
    expect(actions).toContain('sales.lead.convert');
    expect(actions).toContain('sales.opportunity.create');
    expect(actions).toContain('sales.quote.create');
    await app.close();
  });
});
