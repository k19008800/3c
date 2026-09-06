/**
 * 管理端工单管理 + 审计日志 路由集成测试 — 真实 PG 冒烟
 *
 * 依赖本地 PG（threecloud_v3，与 pre-consume.test.ts 同风格）；用最小 Fastify 实例
 * 仅注册 adminTicketsRoutes，通过 app.inject 直呼路由，避免启动完整 app。
 * 每个用例使用独立用户/工单（时间戳命名），afterAll 精确清理测试数据。
 *
 * 覆盖任务要求：
 *   ☐ 未登录访问工单列表 → 401
 *   ☐ 非 admin（role=customer）→ 403
 *   ☐ admin 获取工单列表 → 200 且返回 { data: { list, stats, avg_response_seconds, avg_resolve_seconds } }
 *   ☐ admin 创建回复 → metadata.replies 增加一条 is_staff=true
 *   ☐ admin 修改状态 → status 更新且写 audit_logs
 *   ☐ 审计日志列表 → 200 且 list 元素含 operator/action/target/detail/ip
 * 另附：详情 / 备注 / 分配 / 统计 / 404 正向冒烟（gap-fix-spec 要求每个端点至少 1 正向 case）。
 *
 * @see docs/gap-fix-spec-2026-08-18.md §1/§2（测试要求：每个路由文件必须带 .test.ts）
 * @module routes/admin-tickets
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, inArray, gte } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { generateAccessToken } from '../services/auth/jwt.js';
import { adminTicketsRoutes } from './admin-tickets.js';

/** 生成唯一后缀（邮箱 / 标题用） */
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type UserInsert = typeof schema.users.$inferInsert;
type TicketInsert = typeof schema.tickets.$inferInsert;

let app: FastifyInstance;
let adminToken: string;
let customerToken: string;
let ownerId: number;
let ownerEmail: string;
let ownerName: string;

/** 本文件创建的用户 / 工单 id（afterAll 精确清理） */
const createdUserIds: number[] = [];
const createdTicketIds: number[] = [];
/** 清理审计日志的起点：只删本测试产生的 ticket.* 记录 */
const testStart = new Date();

/** 创建测试用户（默认 customer） */
async function createUser(overrides: Partial<UserInsert> = {}) {
  const email = `tickets-test-${uid()}@test.com`;
  const name = `用户${uid().slice(0, 6)}`;
  const [user] = await db
    .insert(schema.users)
    .values({
      email,
      passwordHash: bcrypt.hashSync('Test1234!', 10),
      name,
      role: 'customer',
      status: 'active',
      ...overrides,
    })
    .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role });
  createdUserIds.push(user!.id);
  return user!;
}

/** 创建测试工单（默认 open / billing / normal） */
async function createTicket(userId: number, overrides: Partial<TicketInsert> = {}) {
  const [t] = await db
    .insert(schema.tickets)
    .values({
      userId,
      type: 'billing',
      title: `测试工单-${uid()}`,
      content: '测试工单内容',
      status: 'open',
      priority: 'normal',
      metadata: { replies: [] },
      ...overrides,
    })
    .returning({ id: schema.tickets.id });
  createdTicketIds.push(t!.id);
  return t!.id;
}

describe('管理端工单管理 + 审计日志', () => {
  beforeAll(async () => {
    const admin = await createUser({ role: 'admin' });
    const customer = await createUser();
    const owner = await createUser();
    ownerId = owner.id;
    ownerEmail = owner.email;
    ownerName = owner.name;

    adminToken = generateAccessToken({ userId: admin.id, email: admin.email, role: admin.role });
    customerToken = generateAccessToken({ userId: customer.id, email: customer.email, role: customer.role });

    app = Fastify();
    await app.register(adminTicketsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    if (createdTicketIds.length > 0) {
      await db.delete(schema.tickets).where(inArray(schema.tickets.id, createdTicketIds)).catch(() => {});
    }
    await db
      .delete(schema.auditLogs)
      .where(
        and(
          gte(schema.auditLogs.createdAt, testStart),
          inArray(schema.auditLogs.action, ['ticket.status', 'ticket.reply', 'ticket.note', 'ticket.assign']),
        ),
      )
      .catch(() => {});
    if (createdUserIds.length > 0) {
      await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds)).catch(() => {});
    }
  });

  it('未登录访问工单列表 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/tickets' });
    expect(res.statusCode).toBe(401);
  });

  it('非 admin（role=customer）访问工单列表 → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin 获取工单列表 → 200 且返回 { data: { list, stats, avg_response_seconds, avg_resolve_seconds } } 结构', async () => {
    const ticketId = await createTicket(ownerId);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/tickets?page_size=50&status=pending',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.list)).toBe(true);
    expect(body.data.stats).toMatchObject({
      pending: expect.any(Number),
      processing: expect.any(Number),
      resolved: expect.any(Number),
      closed: expect.any(Number),
    });
    expect(typeof body.data.avg_response_seconds).toBe('number');
    expect(typeof body.data.avg_resolve_seconds).toBe('number');

    // 字段契约一一对应（AdminTicket）
    const mine = body.data.list.find((t: any) => t.id === ticketId);
    expect(mine).toBeDefined();
    expect(mine.ticket_no).toBe(`TCK${String(ticketId).padStart(6, '0')}`);
    expect(mine.title).toBeTruthy();
    expect(mine.category).toBe('billing');
    expect(mine.category_label).toBeTruthy();
    expect(mine.priority).toBe('normal');
    expect(mine.status).toBe('pending'); // open → pending
    expect(mine.status_label).toBe('待处理');
    expect(mine.email).toBe(ownerEmail);
    expect(mine.username).toBe(ownerName);
    expect(mine.assignee_name).toBeNull();
    expect(mine.created_at).toBeDefined();
  });

  it('admin 创建回复 → metadata.replies 增加一条 is_staff=true（open → in_progress）', async () => {
    const ticketId = await createTicket(ownerId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/tickets/${ticketId}/reply`,
      payload: { content: '客服回复内容' },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('processing');

    const [row] = await db
      .select({ status: schema.tickets.status, metadata: schema.tickets.metadata })
      .from(schema.tickets)
      .where(eq(schema.tickets.id, ticketId))
      .limit(1);
    expect(row!.status).toBe('in_progress');
    const replies = (row!.metadata as any)?.replies ?? [];
    expect(replies.length).toBe(1);
    expect(replies[0]).toMatchObject({ is_staff: true, content: '客服回复内容' });
    expect(replies[0].created_at).toBeDefined();

    // 审计留痕
    const audits = await db
      .select({ id: schema.auditLogs.id })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.resourceId, String(ticketId)), eq(schema.auditLogs.action, 'ticket.reply')));
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it('admin 修改状态 → status 更新且写 audit_logs（resolved 写 resolvedAt + operation_logs）', async () => {
    const ticketId = await createTicket(ownerId, { status: 'in_progress' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/tickets/${ticketId}/status`,
      payload: { status: 'resolved' },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('resolved');

    const [row] = await db
      .select({ status: schema.tickets.status, resolvedAt: schema.tickets.resolvedAt, metadata: schema.tickets.metadata })
      .from(schema.tickets)
      .where(eq(schema.tickets.id, ticketId))
      .limit(1);
    expect(row!.status).toBe('resolved');
    expect(row!.resolvedAt).not.toBeNull();
    const ops = (row!.metadata as any)?.operation_logs ?? [];
    expect(ops.some((o: any) => o.action === 'status')).toBe(true);

    // 审计留痕
    const audits = await db
      .select({ id: schema.auditLogs.id })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.resourceId, String(ticketId)), eq(schema.auditLogs.action, 'ticket.status')));
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it('审计日志列表 → 200 且 list 元素含 operator/action/target/detail/ip', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs?page_size=50',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(Array.isArray(body.data.list)).toBe(true);
    expect(body.data.list.length).toBeGreaterThan(0);
    const first = body.data.list[0];
    expect(first).toHaveProperty('operator');
    expect(first).toHaveProperty('action');
    expect(first).toHaveProperty('target');
    expect(first).toHaveProperty('detail');
    expect(first).toHaveProperty('ip');

    // 前面用例写入的 ticket.* 记录应位于最新一页，operator 可解析为 admin 用户名
    const ours = body.data.list.filter((l: any) => l.action.startsWith('ticket.'));
    expect(ours.length).toBeGreaterThan(0);
    expect(typeof ours[0].operator).toBe('string');
    expect(ours[0].target).toMatch(/^ticket:\d+$/);
  });

  /* ── 附加正向冒烟（gap-fix-spec：每个端点至少 1 正向 case） ── */

  it('GET /api/v1/admin/tickets/:id → 详情契约（ticket 含 description/all_tags、replies、operation_logs、satisfaction）', async () => {
    const ticketId = await createTicket(ownerId);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/tickets/${ticketId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.ticket.id).toBe(ticketId);
    expect(d.ticket.description).toBe('测试工单内容');
    expect(d.ticket.status).toBe('pending');
    expect(d.ticket.status_label).toBe('待处理');
    expect(Array.isArray(d.replies)).toBe(true);
    expect(Array.isArray(d.operation_logs)).toBe(true);
    expect(d.satisfaction).toBeNull();
    expect(Array.isArray(d.all_tags)).toBe(true);
  });

  it('GET /api/v1/admin/tickets/:id 不存在 → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/tickets/99999999',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /:id/note → operation_logs 追加 note 且写 audit_logs', async () => {
    const ticketId = await createTicket(ownerId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/tickets/${ticketId}/note`,
      payload: { note: '内部处理思路' },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    const [row] = await db
      .select({ metadata: schema.tickets.metadata })
      .from(schema.tickets)
      .where(eq(schema.tickets.id, ticketId))
      .limit(1);
    const ops = (row!.metadata as any)?.operation_logs ?? [];
    expect(ops[ops.length - 1]).toMatchObject({ action: 'note', detail: '内部处理思路' });

    const audits = await db
      .select({ id: schema.auditLogs.id })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.resourceId, String(ticketId)), eq(schema.auditLogs.action, 'ticket.note')));
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /:id/assign → assignedTo 更新 + operation_logs + audit_logs', async () => {
    const staff = await createUser({ role: 'admin' });
    const ticketId = await createTicket(ownerId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/tickets/${ticketId}/assign`,
      payload: { assignee_id: staff.id },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.assigned_to).toBe(staff.id);

    const [row] = await db
      .select({ assignedTo: schema.tickets.assignedTo, metadata: schema.tickets.metadata })
      .from(schema.tickets)
      .where(eq(schema.tickets.id, ticketId))
      .limit(1);
    expect(row!.assignedTo).toBe(staff.id);
    const ops = (row!.metadata as any)?.operation_logs ?? [];
    expect(ops[ops.length - 1].action).toBe('assign');

    const audits = await db
      .select({ id: schema.auditLogs.id })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.resourceId, String(ticketId)), eq(schema.auditLogs.action, 'ticket.assign')));
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/admin/tickets/stats → 统计契约（total/resolved/resolve_rate/满意度/分类分布/客服排行）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/tickets/stats',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(typeof d.total).toBe('number');
    expect(typeof d.resolved).toBe('number');
    expect(typeof d.resolve_rate).toBe('number');
    expect(typeof d.avg_response_seconds).toBe('number');
    expect(typeof d.avg_resolve_seconds).toBe('number');
    expect(typeof d.satisfaction).toBe('number');
    expect(Array.isArray(d.category_distribution)).toBe(true);
    expect(Array.isArray(d.staff_ranking)).toBe(true);
  });
});
