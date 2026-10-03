/**
 * CRM 销售漏斗端点 — /api/v1/me/crm/*（sales / admin / super_admin）
 *
 * 对齐 SPEC-§11.2 线索管理 / §11.4 商机与报价管理（差距矩阵 G 补全）：
 *   - CRUD /me/crm/leads                 线索（new/contacted/qualified/lost）
 *   - POST /me/crm/leads/:id/notes       追加线索备注
 *   - POST /me/crm/leads/:id/convert     线索 → 商机（写入 sales_opportunities）
 *   - CRUD /me/crm/opportunities         商机（proposal/negotiation/closed_won/closed_lost）
 *   - CRUD /me/crm/quotes                报价单（draft/sent/accepted/rejected）
 *
 * 归属模型：
 *   - leads.assigned_to = 业务员 users.id；sales 只见 assigned_to=自己，admin 见全部。
 *   - opportunities/quotes.sales_user_id = 业务员 users.id（冗余自线索，便于直接查"我的"）。
 *
 * 鉴权：jwtAuth + role ∈ {sales, admin, super_admin}。写操作写 audit_logs 留痕。
 * 金额一律 integer(分)；与 me-sales.ts 保持响应 snake_case 契约。
 *
 * @module routes/me-crm
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt.js';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors.js';

/* ───────── 鉴权（与 me-sales.ts 同一套，独立定义避免跨文件耦合） ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

/** 业务员角色校验：sales/admin/super_admin 均可访问 */
async function requireSales(request: any): Promise<{ userId: number; role: string; isAdmin: boolean }> {
  const ctx = request.userContext as { userId: number; role: string };
  if (!ctx?.userId) throw new UnauthorizedError('Missing user');
  const role = ctx.role;
  if (role !== 'sales' && role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('仅业务员/管理员可访问');
  }
  return { userId: ctx.userId, role, isAdmin: role === 'admin' || role === 'super_admin' };
}

/* ───────── 白名单 ───────── */

const LEAD_STATUSES = new Set(['new', 'contacted', 'qualified', 'lost']);
const OPP_STAGES = new Set(['proposal', 'negotiation', 'closed_won', 'closed_lost']);
const QUOTE_STATUSES = new Set(['draft', 'sent', 'accepted', 'rejected']);

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

/** 写审计日志（与 me-sales.writeAudit 同构） */
async function writeAudit(request: any, action: string, resource: string, resourceId: string | null, details: unknown) {
  const ctx = request.userContext ?? {};
  await db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource,
    resourceId,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
    createdAt: new Date(),
  });
}

/** 行项合计校验 + 汇总 total_cents；非法行项抛 ValidationError */
function summarizeItems(items: any[]): number {
  let total = 0;
  for (const it of items) {
    const unit = Number(it?.unitPriceCents ?? 0);
    const qty = Number(it?.quantity ?? 0);
    if (!Number.isFinite(unit) || !Number.isFinite(qty) || unit < 0 || qty < 0) {
      throw new ValidationError('报价行项 unitPriceCents/quantity 必须为非负数字');
    }
    const subtotal = Number(it?.subtotalCents);
    // 后端以 unit*qty 为准重算小计，避免前端篡改
    const recomputed = Math.round(unit * qty);
    total += recomputed;
    it.subtotalCents = Number.isFinite(subtotal) && subtotal >= 0 ? Math.round(subtotal) : recomputed;
  }
  return total;
}

export async function meCrmRoutes(app: FastifyInstance) {
  /* ═══════════ 1. 线索 leads ═══════════ */

  /**
   * GET /api/v1/me/crm/leads?status=&keyword=&page=&page_size=
   * sales 只见 assigned_to=自己；admin 见全部。返回 { list, pagination }。
   */
  app.get('/api/v1/me/crm/leads', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const status = String(q.status ?? '').trim();
    const keyword = String(q.keyword ?? q.search ?? '').trim().toLowerCase();
    const page = parsePositiveInt(q.page, 1);
    const pageSize = parsePositiveInt(q.page_size ?? q.pageSize, 20, 100);

    const conds = me.isAdmin ? [] : [eq(schema.salesLeads.assignedTo, me.userId)];
    if (status && LEAD_STATUSES.has(status)) conds.push(eq(schema.salesLeads.status, status));

    const rows = await db
      .select()
      .from(schema.salesLeads)
      .where(conds.length === 1 ? conds[0] : conds.length > 1 ? and(...conds) : undefined)
      .orderBy(desc(schema.salesLeads.createdAt));

    let list = rows.map((r) => ({
      id: r.id,
      company: r.company,
      contact_name: r.contactName,
      contact_email: r.contactEmail,
      contact_phone: r.contactPhone,
      source: r.source,
      status: r.status,
      assigned_to: r.assignedTo,
      notes: r.notes ?? [],
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    }));

    if (keyword) {
      list = list.filter(
        (l) =>
          (l.company ?? '').toLowerCase().includes(keyword) ||
          (l.contact_name ?? '').toLowerCase().includes(keyword) ||
          (l.contact_email ?? '').toLowerCase().includes(keyword),
      );
    }

    const total = list.length;
    const paged = list.slice((page - 1) * pageSize, page * pageSize);
    return reply.send({ data: { list: paged, pagination: { page, pageSize, total } } });
  });

  /** POST /api/v1/me/crm/leads — 录入线索；assignedTo 默认当前业务员（admin 可显式指定） */
  app.post('/api/v1/me/crm/leads', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const body = (request.body ?? {}) as Record<string, unknown>;

    const company = String(body.company ?? '').trim();
    const contactName = String(body.contact_name ?? body.contactName ?? '').trim();
    if (!company) throw new ValidationError('公司名称（company）不能为空');
    if (!contactName) throw new ValidationError('联系人姓名（contact_name）不能为空');

    const contactEmail = String(body.contact_email ?? body.contactEmail ?? '').trim() || null;
    const contactPhone = String(body.contact_phone ?? body.contactPhone ?? '').trim() || null;
    const source = String(body.source ?? 'other').trim() || 'other';
    const status = String(body.status ?? 'new').trim();
    if (!LEAD_STATUSES.has(status)) throw new ValidationError('status 仅支持：new/contacted/qualified/lost');

    // sales 只能把线索归给自己；admin 可指定 assigned_to（不传则归自己）
    let assignedTo = me.userId;
    if (me.isAdmin && body.assigned_to != null && String(body.assigned_to).trim() !== '') {
      const aid = Number(body.assigned_to);
      if (!Number.isInteger(aid) || aid <= 0) throw new ValidationError('assigned_to 非法');
      assignedTo = aid;
    }

    const [created] = await db
      .insert(schema.salesLeads)
      .values({
        company,
        contactName,
        contactEmail,
        contactPhone,
        source,
        status,
        assignedTo,
        notes: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!created) throw new ValidationError('线索创建失败');

    await writeAudit(request, 'sales.lead.create', 'sales_lead', String(created.id), { company, assignedTo });
    return reply.send({
      data: {
        id: created.id,
        company: created.company,
        contact_name: created.contactName,
        status: created.status,
        assigned_to: created.assignedTo,
      },
    });
  });

  /** GET /api/v1/me/crm/leads/:id — 线索详情 */
  app.get('/api/v1/me/crm/leads/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法线索 ID');

    const rows = await db.select().from(schema.salesLeads).where(eq(schema.salesLeads.id, id)).limit(1);
    const lead = rows[0];
    if (!lead) throw new NotFoundError('线索', id);
    if (!me.isAdmin && lead.assignedTo !== me.userId) throw new ForbiddenError('无权操作该线索（非归属线索）');

    return reply.send({
      data: {
        id: lead.id,
        company: lead.company,
        contact_name: lead.contactName,
        contact_email: lead.contactEmail,
        contact_phone: lead.contactPhone,
        source: lead.source,
        status: lead.status,
        assigned_to: lead.assignedTo,
        notes: lead.notes ?? [],
        created_at: lead.createdAt,
        updated_at: lead.updatedAt,
      },
    });
  });

  /** PUT /api/v1/me/crm/leads/:id — 更新线索字段/状态 */
  app.put('/api/v1/me/crm/leads/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法线索 ID');

    const existing = await db.select().from(schema.salesLeads).where(eq(schema.salesLeads.id, id)).limit(1);
    const lead = existing[0];
    if (!lead) throw new NotFoundError('线索', id);
    if (!me.isAdmin && lead.assignedTo !== me.userId) throw new ForbiddenError('无权操作该线索（非归属线索）');

    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, any> = { updatedAt: new Date() };
    if (body.company != null) {
      const v = String(body.company).trim();
      if (!v) throw new ValidationError('公司名称不能为空');
      patch.company = v;
    }
    if (body.contact_name != null || body.contactName != null) {
      const v = String(body.contact_name ?? body.contactName).trim();
      if (!v) throw new ValidationError('联系人姓名不能为空');
      patch.contactName = v;
    }
    if (body.contact_email != null) patch.contactEmail = String(body.contact_email).trim() || null;
    if (body.contact_phone != null) patch.contactPhone = String(body.contact_phone).trim() || null;
    if (body.source != null) patch.source = String(body.source).trim() || 'other';
    if (body.status != null) {
      const status = String(body.status).trim();
      if (!LEAD_STATUSES.has(status)) throw new ValidationError('status 仅支持：new/contacted/qualified/lost');
      patch.status = status;
    }

    const [updated] = await db.update(schema.salesLeads).set(patch).where(eq(schema.salesLeads.id, id)).returning();
    await writeAudit(request, 'sales.lead.update', 'sales_lead', String(id), patch);
    return reply.send({ data: { ok: true, lead_id: id, status: updated?.status ?? lead.status } });
  });

  /** DELETE /api/v1/me/crm/leads/:id — 删除线索（仅归属人/admin） */
  app.delete('/api/v1/me/crm/leads/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法线索 ID');

    const existing = await db.select().from(schema.salesLeads).where(eq(schema.salesLeads.id, id)).limit(1);
    const lead = existing[0];
    if (!lead) throw new NotFoundError('线索', id);
    if (!me.isAdmin && lead.assignedTo !== me.userId) throw new ForbiddenError('无权删除该线索');

    await db.delete(schema.salesLeads).where(eq(schema.salesLeads.id, id));
    await writeAudit(request, 'sales.lead.delete', 'sales_lead', String(id), { company: lead.company });
    return reply.send({ data: { ok: true } });
  });

  /** POST /api/v1/me/crm/leads/:id/notes — 追加一条备注（push 进 notes 数组，上限 200 条） */
  app.post('/api/v1/me/crm/leads/:id/notes', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法线索 ID');
    const body = (request.body ?? {}) as Record<string, unknown>;
    const note = String(body.note ?? body.content ?? '').trim();
    if (!note) throw new ValidationError('备注内容（note）不能为空');
    if (note.length > 1000) throw new ValidationError('备注过长（上限 1000 字符）');

    const existing = await db.select().from(schema.salesLeads).where(eq(schema.salesLeads.id, id)).limit(1);
    const lead = existing[0];
    if (!lead) throw new NotFoundError('线索', id);
    if (!me.isAdmin && lead.assignedTo !== me.userId) throw new ForbiddenError('无权操作该线索');

    const notes = Array.isArray(lead.notes) ? [...(lead.notes as string[])] : [];
    notes.push(note);
    if (notes.length > 200) notes.shift();

    await db.update(schema.salesLeads).set({ notes, updatedAt: new Date() }).where(eq(schema.salesLeads.id, id));
    await writeAudit(request, 'sales.lead.note', 'sales_lead', String(id), { noteLen: note.length });
    return reply.send({ data: { ok: true, notes } });
  });

  /**
   * POST /api/v1/me/crm/leads/:id/convert — 线索转商机
   *
   * body: { name?, expected_value_cents?, stage?, expected_close_date? }
   * 转换后线索状态自动置为 qualified；写入 sales_opportunities（sales_user_id=线索归属人）。
   */
  app.post('/api/v1/me/crm/leads/:id/convert', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法线索 ID');
    const body = (request.body ?? {}) as Record<string, unknown>;

    const existing = await db.select().from(schema.salesLeads).where(eq(schema.salesLeads.id, id)).limit(1);
    const lead = existing[0];
    if (!lead) throw new NotFoundError('线索', id);
    if (!me.isAdmin && lead.assignedTo !== me.userId) throw new ForbiddenError('无权操作该线索');

    const name = String(body.name ?? `${lead.company} 商机`).trim();
    const expectedValueCents = Math.max(0, Math.round(Number(body.expected_value_cents ?? body.expectedValueCents ?? 0)));
    const stage = String(body.stage ?? 'proposal').trim();
    if (!OPP_STAGES.has(stage)) throw new ValidationError('stage 仅支持：proposal/negotiation/closed_won/closed_lost');
    const closeRaw = body.expected_close_date ?? body.expectedCloseDate;
    const expectedCloseDate = closeRaw ? new Date(String(closeRaw)) : null;
    if (expectedCloseDate && Number.isNaN(expectedCloseDate.getTime())) throw new ValidationError('expected_close_date 日期非法');

    const salesUserId = lead.assignedTo ?? me.userId;
    const [opp] = await db
      .insert(schema.salesOpportunities)
      .values({
        leadId: lead.id,
        salesUserId,
        name,
        expectedValueCents,
        stage,
        expectedCloseDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // 线索状态推进为 qualified（已转换为意向客户）
    await db.update(schema.salesLeads).set({ status: 'qualified', updatedAt: new Date() }).where(eq(schema.salesLeads.id, id));

    await writeAudit(request, 'sales.lead.convert', 'sales_lead', String(id), { opportunityId: opp?.id });
    return reply.send({
      data: {
        ok: true,
        opportunity_id: opp?.id,
        lead_id: lead.id,
        stage: opp?.stage ?? stage,
      },
    });
  });

  /* ═══════════ 2. 商机 opportunities ═══════════ */

  /** GET /api/v1/me/crm/opportunities?stage= — 我的商机（Kanban 按 stage 分组由前端做） */
  app.get('/api/v1/me/crm/opportunities', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const stage = String(q.stage ?? '').trim();

    const conds = me.isAdmin ? [] : [eq(schema.salesOpportunities.salesUserId, me.userId)];
    if (stage && OPP_STAGES.has(stage)) conds.push(eq(schema.salesOpportunities.stage, stage));

    const rows = await db
      .select()
      .from(schema.salesOpportunities)
      .where(conds.length === 1 ? conds[0] : conds.length > 1 ? and(...conds) : undefined)
      .orderBy(desc(schema.salesOpportunities.createdAt));

    // 附带线索公司名（二次查询，避免 join 在 fake-db 下的不确定性）
    const leadIds = [...new Set(rows.map((r) => r.leadId).filter((v): v is number => v != null))];
    const leadRows = leadIds.length
      ? await db.select({ id: schema.salesLeads.id, company: schema.salesLeads.company }).from(schema.salesLeads)
      : [];
    const leadCompany = new Map(leadRows.map((l) => [l.id, l.company]));

    const list = rows.map((r) => ({
      id: r.id,
      lead_id: r.leadId,
      company: r.leadId != null ? leadCompany.get(r.leadId) ?? null : null,
      sales_user_id: r.salesUserId,
      name: r.name,
      expected_value_cents: r.expectedValueCents,
      stage: r.stage,
      expected_close_date: r.expectedCloseDate,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    }));

    return reply.send({ data: { list } });
  });

  /** POST /api/v1/me/crm/opportunities — 直接录入商机（也可走 leads/:id/convert） */
  app.post('/api/v1/me/crm/opportunities', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const body = (request.body ?? {}) as Record<string, unknown>;

    const name = String(body.name ?? '').trim();
    if (!name) throw new ValidationError('商机名称（name）不能为空');
    const expectedValueCents = Math.max(0, Math.round(Number(body.expected_value_cents ?? body.expectedValueCents ?? 0)));
    const stage = String(body.stage ?? 'proposal').trim();
    if (!OPP_STAGES.has(stage)) throw new ValidationError('stage 仅支持：proposal/negotiation/closed_won/closed_lost');
    const closeRaw = body.expected_close_date ?? body.expectedCloseDate;
    const expectedCloseDate = closeRaw ? new Date(String(closeRaw)) : null;
    if (expectedCloseDate && Number.isNaN(expectedCloseDate.getTime())) throw new ValidationError('expected_close_date 日期非法');
    const leadId = body.lead_id != null && String(body.lead_id).trim() !== '' ? Number(body.lead_id) : null;
    if (leadId != null && (!Number.isInteger(leadId) || leadId <= 0)) throw new ValidationError('lead_id 非法');

    const [created] = await db
      .insert(schema.salesOpportunities)
      .values({
        leadId,
        salesUserId: me.userId,
        name,
        expectedValueCents,
        stage,
        expectedCloseDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!created) throw new ValidationError('商机创建失败');

    await writeAudit(request, 'sales.opportunity.create', 'sales_opportunity', String(created.id), { name, stage });
    return reply.send({
      data: {
        id: created.id,
        lead_id: created.leadId,
        name: created.name,
        stage: created.stage,
        expected_value_cents: created.expectedValueCents,
      },
    });
  });

  /** GET /api/v1/me/crm/opportunities/:id — 商机详情（含其报价单列表） */
  app.get('/api/v1/me/crm/opportunities/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法商机 ID');

    const rows = await db.select().from(schema.salesOpportunities).where(eq(schema.salesOpportunities.id, id)).limit(1);
    const opp = rows[0];
    if (!opp) throw new NotFoundError('商机', id);
    if (!me.isAdmin && opp.salesUserId !== me.userId) throw new ForbiddenError('无权操作该商机');

    const quoteRows = await db
      .select()
      .from(schema.salesQuotes)
      .where(eq(schema.salesQuotes.opportunityId, id))
      .orderBy(desc(schema.salesQuotes.version));
    const quotes = quoteRows.map((q) => ({
      id: q.id,
      version: q.version,
      items: q.items ?? [],
      total_cents: q.totalCents,
      valid_until: q.validUntil,
      status: q.status,
      created_at: q.createdAt,
    }));

    return reply.send({
      data: {
        id: opp.id,
        lead_id: opp.leadId,
        sales_user_id: opp.salesUserId,
        name: opp.name,
        expected_value_cents: opp.expectedValueCents,
        stage: opp.stage,
        expected_close_date: opp.expectedCloseDate,
        created_at: opp.createdAt,
        quotes,
      },
    });
  });

  /** PUT /api/v1/me/crm/opportunities/:id — 更新商机（阶段/名称/预估额/预计成交日） */
  app.put('/api/v1/me/crm/opportunities/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法商机 ID');

    const existing = await db.select().from(schema.salesOpportunities).where(eq(schema.salesOpportunities.id, id)).limit(1);
    const opp = existing[0];
    if (!opp) throw new NotFoundError('商机', id);
    if (!me.isAdmin && opp.salesUserId !== me.userId) throw new ForbiddenError('无权操作该商机');

    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, any> = { updatedAt: new Date() };
    if (body.name != null) {
      const v = String(body.name).trim();
      if (!v) throw new ValidationError('商机名称不能为空');
      patch.name = v;
    }
    if (body.expected_value_cents != null || body.expectedValueCents != null) {
      patch.expectedValueCents = Math.max(0, Math.round(Number(body.expected_value_cents ?? body.expectedValueCents)));
    }
    if (body.stage != null) {
      const stage = String(body.stage).trim();
      if (!OPP_STAGES.has(stage)) throw new ValidationError('stage 仅支持：proposal/negotiation/closed_won/closed_lost');
      patch.stage = stage;
    }
    if (body.expected_close_date != null || body.expectedCloseDate != null) {
      const raw = body.expected_close_date ?? body.expectedCloseDate;
      patch.expectedCloseDate = raw ? new Date(String(raw)) : null;
      if (patch.expectedCloseDate && Number.isNaN(patch.expectedCloseDate.getTime())) throw new ValidationError('expected_close_date 日期非法');
    }

    const [updated] = await db.update(schema.salesOpportunities).set(patch).where(eq(schema.salesOpportunities.id, id)).returning();
    await writeAudit(request, 'sales.opportunity.update', 'sales_opportunity', String(id), patch);
    return reply.send({ data: { ok: true, opportunity_id: id, stage: updated?.stage ?? opp.stage } });
  });

  /** DELETE /api/v1/me/crm/opportunities/:id — 删除商机（仅归属人/admin） */
  app.delete('/api/v1/me/crm/opportunities/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法商机 ID');

    const existing = await db.select().from(schema.salesOpportunities).where(eq(schema.salesOpportunities.id, id)).limit(1);
    const opp = existing[0];
    if (!opp) throw new NotFoundError('商机', id);
    if (!me.isAdmin && opp.salesUserId !== me.userId) throw new ForbiddenError('无权删除该商机');

    await db.delete(schema.salesOpportunities).where(eq(schema.salesOpportunities.id, id));
    await writeAudit(request, 'sales.opportunity.delete', 'sales_opportunity', String(id), { name: opp.name });
    return reply.send({ data: { ok: true } });
  });

  /* ═══════════ 3. 报价单 quotes ═══════════ */

  /** GET /api/v1/me/crm/quotes?opportunity_id=&status= — 我的报价单 */
  app.get('/api/v1/me/crm/quotes', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const opportunityId = q.opportunity_id != null && String(q.opportunity_id).trim() !== '' ? Number(q.opportunity_id) : null;
    const status = String(q.status ?? '').trim();

    const conds = me.isAdmin ? [] : [eq(schema.salesQuotes.salesUserId, me.userId)];
    if (opportunityId != null && Number.isInteger(opportunityId) && opportunityId > 0) {
      conds.push(eq(schema.salesQuotes.opportunityId, opportunityId));
    }
    if (status && QUOTE_STATUSES.has(status)) conds.push(eq(schema.salesQuotes.status, status));

    const rows = await db
      .select()
      .from(schema.salesQuotes)
      .where(conds.length === 1 ? conds[0] : conds.length > 1 ? and(...conds) : undefined)
      .orderBy(desc(schema.salesQuotes.createdAt));

    const list = rows.map((r) => ({
      id: r.id,
      opportunity_id: r.opportunityId,
      version: r.version,
      items: r.items ?? [],
      total_cents: r.totalCents,
      valid_until: r.validUntil,
      status: r.status,
      created_at: r.createdAt,
    }));

    return reply.send({ data: { list } });
  });

  /**
   * POST /api/v1/me/crm/quotes — 基于商机生成报价单
   * body: { opportunity_id, items: [{name, unitPriceCents, quantity}], valid_until? }
   * version 自动 = 该商机下现有报价数 + 1；total_cents 由后端按 unit*qty 重算。
   */
  app.post('/api/v1/me/crm/quotes', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const body = (request.body ?? {}) as Record<string, unknown>;

    const opportunityId = Number(body.opportunity_id ?? body.opportunityId);
    if (!Number.isInteger(opportunityId) || opportunityId <= 0) throw new ValidationError('opportunity_id 非法');

    // 商机存在且归属当前业务员（admin 跨商机允许）
    const oppRows = await db.select().from(schema.salesOpportunities).where(eq(schema.salesOpportunities.id, opportunityId)).limit(1);
    const opp = oppRows[0];
    if (!opp) throw new NotFoundError('商机', opportunityId);
    if (!me.isAdmin && opp.salesUserId !== me.userId) throw new ForbiddenError('无权为该商机报价');

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) throw new ValidationError('报价行项（items）不能为空');
    const items = rawItems.map((it: any) => ({
      name: String(it?.name ?? '').trim(),
      unitPriceCents: Number(it?.unitPriceCents ?? 0),
      quantity: Number(it?.quantity ?? 0),
      subtotalCents: Number(it?.subtotalCents ?? 0),
    }));
    for (const it of items) if (!it.name) throw new ValidationError('报价行项名称不能为空');
    const totalCents = summarizeItems(items);

    const validRaw = body.valid_until ?? body.validUntil;
    const validUntil = validRaw ? new Date(String(validRaw)) : null;
    if (validUntil && Number.isNaN(validUntil.getTime())) throw new ValidationError('valid_until 日期非法');

    // version = 同商机下现有报价数 + 1
    const existing = await db.select().from(schema.salesQuotes).where(eq(schema.salesQuotes.opportunityId, opportunityId));
    const version = existing.length + 1;

    const [created] = await db
      .insert(schema.salesQuotes)
      .values({
        opportunityId,
        salesUserId: me.userId,
        version,
        items,
        totalCents,
        validUntil,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!created) throw new ValidationError('报价单创建失败');

    await writeAudit(request, 'sales.quote.create', 'sales_quote', String(created.id), { opportunityId, version, totalCents });
    return reply.send({
      data: {
        id: created.id,
        opportunity_id: created.opportunityId,
        version: created.version,
        items: created.items,
        total_cents: created.totalCents,
        status: created.status,
      },
    });
  });

  /** GET /api/v1/me/crm/quotes/:id — 报价单详情 */
  app.get('/api/v1/me/crm/quotes/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法报价 ID');

    const rows = await db.select().from(schema.salesQuotes).where(eq(schema.salesQuotes.id, id)).limit(1);
    const quote = rows[0];
    if (!quote) throw new NotFoundError('报价单', id);
    if (!me.isAdmin && quote.salesUserId !== me.userId) throw new ForbiddenError('无权查看该报价单');

    return reply.send({
      data: {
        id: quote.id,
        opportunity_id: quote.opportunityId,
        version: quote.version,
        items: quote.items ?? [],
        total_cents: quote.totalCents,
        valid_until: quote.validUntil,
        status: quote.status,
        created_at: quote.createdAt,
        updated_at: quote.updatedAt,
      },
    });
  });

  /** PUT /api/v1/me/crm/quotes/:id — 更新报价状态（draft/sent/accepted/rejected）或行项 */
  app.put('/api/v1/me/crm/quotes/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法报价 ID');

    const existing = await db.select().from(schema.salesQuotes).where(eq(schema.salesQuotes.id, id)).limit(1);
    const quote = existing[0];
    if (!quote) throw new NotFoundError('报价单', id);
    if (!me.isAdmin && quote.salesUserId !== me.userId) throw new ForbiddenError('无权修改该报价单');

    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, any> = { updatedAt: new Date() };

    if (body.status != null) {
      const status = String(body.status).trim();
      if (!QUOTE_STATUSES.has(status)) throw new ValidationError('status 仅支持：draft/sent/accepted/rejected');
      patch.status = status;
    }
    if (body.items != null) {
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (rawItems.length === 0) throw new ValidationError('报价行项不能为空');
      const items = rawItems.map((it: any) => ({
        name: String(it?.name ?? '').trim(),
        unitPriceCents: Number(it?.unitPriceCents ?? 0),
        quantity: Number(it?.quantity ?? 0),
        subtotalCents: Number(it?.subtotalCents ?? 0),
      }));
      for (const it of items) if (!it.name) throw new ValidationError('报价行项名称不能为空');
      patch.items = items;
      patch.totalCents = summarizeItems(items);
    }
    if (body.valid_until != null || body.validUntil != null) {
      const raw = body.valid_until ?? body.validUntil;
      patch.validUntil = raw ? new Date(String(raw)) : null;
      if (patch.validUntil && Number.isNaN(patch.validUntil.getTime())) throw new ValidationError('valid_until 日期非法');
    }

    const [updated] = await db.update(schema.salesQuotes).set(patch).where(eq(schema.salesQuotes.id, id)).returning();
    await writeAudit(request, 'sales.quote.update', 'sales_quote', String(id), { status: updated?.status });
    return reply.send({ data: { ok: true, quote_id: id, status: updated?.status ?? quote.status } });
  });

  /** DELETE /api/v1/me/crm/quotes/:id — 删除报价单（仅归属人/admin） */
  app.delete('/api/v1/me/crm/quotes/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const me = await requireSales(request);
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法报价 ID');

    const existing = await db.select().from(schema.salesQuotes).where(eq(schema.salesQuotes.id, id)).limit(1);
    const quote = existing[0];
    if (!quote) throw new NotFoundError('报价单', id);
    if (!me.isAdmin && quote.salesUserId !== me.userId) throw new ForbiddenError('无权删除该报价单');

    await db.delete(schema.salesQuotes).where(eq(schema.salesQuotes.id, id));
    await writeAudit(request, 'sales.quote.delete', 'sales_quote', String(id), {});
    return reply.send({ data: { ok: true } });
  });
}
