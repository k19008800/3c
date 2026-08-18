/**
 * 管理端发票路由 — /api/v1/admin/invoices + /admin/invoice-stats（邮件交付 2026-08-15）
 *
 * 端点：
 *   GET  /admin/invoices                      — 发票列表（状态/关键字筛选 + 分页，join 用户）
 *   POST /admin/invoices/:id/issue            — 开票（生成 invoice_no，status=issued）
 *   POST /admin/invoices/:id/reject           — 驳回（填原因，status=rejected）
 *   POST /admin/invoices/:id/send-email       — 财务发送发票邮件（SMTP → 收件邮箱，记录 email_logs + 发票 email_sent_at/email_status）
 *   GET  /admin/invoices/:id/download         — 发票下载（admin 视角，结构化 JSON 附件）
 *   GET  /admin/invoice-stats/summary         — 本月开票统计（开票数/金额/专票/普票）
 *   GET  /admin/invoice-stats/trend           — 近 N 月开票趋势（默认 12）
 *   GET  /admin/invoice-stats/uninvoiced      — 未开票预估（paid 充值 − 已开票）
 *
 * 审计：issue/reject/send-email 写 audit_logs；只读 GET 不写。
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { sendMail } from '../services/mailer';
import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError, AppError } from '../lib/errors';

/* ───────── auth / audit helpers ───────── */

async function adminAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
  const { role } = payload as { role: string };
  if (role !== 'admin' && role !== 'super_admin') throw new ForbiddenError('Admin access required');
}

function writeAudit(request: any, section: string, details: Record<string, unknown>) {
  const ctx = request.userContext ?? {};
  return db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action: `finance.${section}`,
    resource: 'invoice',
    resourceId: null,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待开票',
  issued: '已开票',
  rejected: '已驳回',
  void: '已作废',
  cancelled: '已取消',
  draft: '草稿',
  paid: '已付款',
};

const TYPE_LABEL: Record<string, string> = {
  ordinary: '普通发票（电子）',
  special: '专用发票（电子）',
};

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

/** 生成发票号：INV + yyyyMMdd + 4 位随机 */
function genInvoiceNo(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `INV-${ts}-${rand}`;
}

function monthStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function adminInvoiceRoutes(app: FastifyInstance) {
  /* ───────── 发票列表 ───────── */

  /** GET /api/v1/admin/invoices — 发票列表（筛选：status / keyword 邮箱或抬头） */
  app.get('/api/v1/admin/invoices', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { status?: string; keyword?: string; page?: string; page_size?: string };
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 200);

    const conditions: any[] = [];
    if (q.status) conditions.push(eq(schema.invoices.status, q.status as any));
    if (q.keyword) {
      conditions.push(sql`(${schema.invoices.email} ILIKE ${'%' + q.keyword + '%'} OR ${schema.invoices.title} ILIKE ${'%' + q.keyword + '%'} OR ${schema.users.email} ILIKE ${'%' + q.keyword + '%'})`);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select({
        id: schema.invoices.id,
        userId: schema.invoices.userId,
        invoiceNo: schema.invoices.invoiceNo,
        type: schema.invoices.type,
        amount: schema.invoices.amount,
        taxRate: schema.invoices.taxRate,
        taxAmount: schema.invoices.taxAmount,
        totalAmount: schema.invoices.totalAmount,
        status: schema.invoices.status,
        rejectReason: schema.invoices.rejectReason,
        title: schema.invoices.title,
        taxId: schema.invoices.taxId,
        email: schema.invoices.email,
        emailSentAt: schema.invoices.emailSentAt,
        emailStatus: schema.invoices.emailStatus,
        issuedAt: schema.invoices.issuedAt,
        createdAt: schema.invoices.createdAt,
        userEmail: schema.users.email,
        username: schema.users.name,
      })
        .from(schema.invoices)
        .leftJoin(schema.users, eq(schema.users.id, schema.invoices.userId))
        .where(whereClause)
        .orderBy(desc(schema.invoices.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.invoices)
        .leftJoin(schema.users, eq(schema.users.id, schema.invoices.userId))
        .where(whereClause),
    ]);

    const list = rows.map((r) => ({
      id: r.id,
      user_id: r.userId,
      invoice_no: r.invoiceNo,
      amount: toNum(r.amount),
      tax_rate: toNum(r.taxRate),
      tax_amount: toNum(r.taxAmount),
      total_amount: toNum(r.totalAmount ?? r.amount),
      type: r.type,
      type_label: TYPE_LABEL[r.type] ?? r.type,
      status: r.status,
      status_label: STATUS_LABEL[r.status] ?? r.status,
      reject_reason: r.rejectReason,
      title: r.title,
      tax_no: r.taxId,
      email: r.email,
      email_sent_at: r.emailSentAt,
      email_status: r.emailStatus,
      email_user: r.email ?? r.userEmail,
      username: r.username,
      created_at: r.createdAt,
      issued_at: r.issuedAt,
    }));

    return reply.send({
      data: { list, pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) } },
    });
  });

  /* ───────── 开票 / 驳回 / 发送邮件 / 下载 ───────── */

  /** POST /api/v1/admin/invoices/:id/issue — 开票（生成 invoice_no，pending → issued） */
  app.post('/api/v1/admin/invoices/:id/issue', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoiceId = parseInt(id, 10);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) throw new ValidationError('Invalid invoice id');
    const body = (request.body || {}) as Record<string, unknown>;
    const providedNo = String(body.invoice_no || '').trim();

    const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).limit(1);
    if (!inv) throw new NotFoundError('Invoice', id);
    if (inv.status !== 'pending' && inv.status !== 'draft') {
      throw new ValidationError('仅待开票的发票可开票');
    }

    const invoiceNo = providedNo || genInvoiceNo();
    const [updated] = await db
      .update(schema.invoices)
      .set({
        invoiceNo,
        status: 'issued',
        issuedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.invoices.id, invoiceId))
      .returning({ id: schema.invoices.id, invoiceNo: schema.invoices.invoiceNo, status: schema.invoices.status });

    await writeAudit(request, 'invoice.issue', { invoiceId, invoiceNo });

    return reply.send({ data: { id: updated?.id, invoice_no: updated?.invoiceNo, status: updated?.status, message: '已开票' } });
  });

  /** POST /api/v1/admin/invoices/:id/reject — 驳回（pending → rejected，填原因） */
  app.post('/api/v1/admin/invoices/:id/reject', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoiceId = parseInt(id, 10);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) throw new ValidationError('Invalid invoice id');
    const body = (request.body || {}) as Record<string, unknown>;
    const reason = String(body.reason || '').trim() || '信息有误';

    const [updated] = await db
      .update(schema.invoices)
      .set({ status: 'rejected', rejectReason: reason, updatedAt: new Date() })
      .where(and(eq(schema.invoices.id, invoiceId), sql`${schema.invoices.status} IN ('pending', 'draft')`))
      .returning({ id: schema.invoices.id, status: schema.invoices.status });

    if (!updated) throw new ValidationError('仅待开票的发票可驳回');
    await writeAudit(request, 'invoice.reject', { invoiceId, reason });

    return reply.send({ data: { id: updated.id, status: updated.status, message: '已驳回' } });
  });

  /**
   * POST /api/v1/admin/invoices/:id/send-email — 财务发送发票邮件（邮件交付）
   *
   * 说明：仅 issued 状态可发送；SMTP 未配置时返回 skipped（不报错），前端提示需配置 SMTP。
   * 发送结果写 email_logs（sendMail 内部）+ invoices.email_sent_at / email_status。
   */
  app.post('/api/v1/admin/invoices/:id/send-email', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoiceId = parseInt(id, 10);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) throw new ValidationError('Invalid invoice id');

    const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).limit(1);
    if (!inv) throw new NotFoundError('Invoice', id);
    if (inv.status !== 'issued') throw new ValidationError('仅已开票的发票可发送邮件');
    const to = inv.email?.trim() || null;
    if (!to) throw new ValidationError('该发票未填写收件邮箱，无法发送');

    const total = toNum(inv.totalAmount ?? inv.amount);
    const typeLabel = TYPE_LABEL[inv.type] ?? inv.type;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#1f2937">发票开具通知</h2>
        <p>您好，您的电子发票已开具，详情如下：</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:6px 0;color:#6b7280">发票号</td><td style="padding:6px 0;font-weight:600">${inv.invoiceNo ?? '-'}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">类型</td><td style="padding:6px 0">${typeLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">金额（不含税）</td><td style="padding:6px 0">¥${toNum(inv.amount).toFixed(2)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">税率</td><td style="padding:6px 0">${toNum(inv.taxRate)}%</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">税额</td><td style="padding:6px 0">¥${toNum(inv.taxAmount).toFixed(2)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">价税合计</td><td style="padding:6px 0;font-weight:700;color:#4f6ef7">¥${total.toFixed(2)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">抬头</td><td style="padding:6px 0">${inv.title ?? '-'}</td></tr>
        </table>
        <p style="color:#6b7280;font-size:13px;margin-top:16px">本邮件由 3cloud 平台财务开具，发票文件可在控制台「我的发票」中下载。</p>
      </div>
    `;

    const result = await sendMail({ to, subject: `【3cloud】发票开具通知 ${inv.invoiceNo ?? ''}`, html, templateName: 'invoice_issued' });

    // 更新发票发送状态（skipped/failed 也记录，供后台确认是否需补发）
    await db.update(schema.invoices)
      .set({
        emailSentAt: new Date(),
        emailStatus: result.ok ? 'sent' : result.skipped ? 'skipped' : 'failed',
        updatedAt: new Date(),
      })
      .where(eq(schema.invoices.id, invoiceId));

    await writeAudit(request, 'invoice.send-email', { invoiceId, to, ok: result.ok, skipped: !!result.skipped });

    if (result.skipped) {
      return reply.send({ data: { id: invoiceId, email_status: 'skipped', message: 'SMTP 未配置，邮件未发送（请在系统设置中配置 SMTP 后重试）' } });
    }
    if (!result.ok) {
      return reply.send({ data: { id: invoiceId, email_status: 'failed', message: `邮件发送失败：${result.error ?? '未知错误'}` } });
    }
    return reply.send({ data: { id: invoiceId, email_status: 'sent', message: '发票邮件已发送' } });
  });

  /** GET /api/v1/admin/invoices/:id/download — 发票下载（admin 视角） */
  app.get('/api/v1/admin/invoices/:id/download', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoiceId = parseInt(id, 10);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) throw new ValidationError('Invalid invoice id');

    const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).limit(1);
    if (!inv) throw new NotFoundError('Invoice', id);

    const filename = `invoice-${inv.invoiceNo || inv.id}.json`;
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send({
      id: inv.id,
      user_id: inv.userId,
      invoice_no: inv.invoiceNo,
      type: inv.type,
      type_label: TYPE_LABEL[inv.type] ?? inv.type,
      amount: toNum(inv.amount),
      tax_rate: toNum(inv.taxRate),
      tax: toNum(inv.taxAmount),
      total_amount: toNum(inv.totalAmount ?? inv.amount),
      status: inv.status,
      title: inv.title,
      tax_id: inv.taxId,
      email: inv.email,
      issued_at: inv.issuedAt,
      created_at: inv.createdAt,
    });
  });

  /* ───────── 税票统计 ───────── */

  /** GET /api/v1/admin/invoice-stats/summary — 本月开票统计 */
  app.get('/api/v1/admin/invoice-stats/summary', { preHandler: [adminAuth] }, async (_request, reply) => {
    const start = monthStart();
    const [rows] = await db
      .select({
        count: sql<number>`count(*)::int`,
        amount: sql<string>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
        specialAmount: sql<string>`coalesce(sum(case when ${schema.invoices.type}='special' then ${schema.invoices.totalAmount} else 0 end), 0)`,
        specialCount: sql<number>`count(*) filter (where ${schema.invoices.type}='special')::int`,
        ordinaryAmount: sql<string>`coalesce(sum(case when ${schema.invoices.type}='ordinary' then ${schema.invoices.totalAmount} else 0 end), 0)`,
        ordinaryCount: sql<number>`count(*) filter (where ${schema.invoices.type}='ordinary')::int`,
      })
      .from(schema.invoices)
      .where(and(
        gte(schema.invoices.createdAt, start),
        eq(schema.invoices.status, 'issued'),
      ));

    return reply.send({
      data: {
        count: rows?.count ?? 0,
        amount: toNum(rows?.amount),
        special_amount: toNum(rows?.specialAmount),
        special_count: rows?.specialCount ?? 0,
        ordinary_amount: toNum(rows?.ordinaryAmount),
        ordinary_count: rows?.ordinaryCount ?? 0,
      },
    });
  });

  /** GET /api/v1/admin/invoice-stats/trend?months=12 — 近 N 月开票趋势 */
  app.get('/api/v1/admin/invoice-stats/trend', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = request.query as { months?: string };
    const months = Math.min(Math.max(parseInt(q.months ?? '12', 10) || 12, 1), 36);

    // 按月分组聚合（issued 发票）
    const rows = await db
      .select({
        month: sql<string>`to_char(${schema.invoices.createdAt}, 'YYYY-MM')`,
        amount: sql<string>`coalesce(sum(${schema.invoices.totalAmount}), 0)`,
      })
      .from(schema.invoices)
      .where(and(
        eq(schema.invoices.status, 'issued'),
        gte(schema.invoices.createdAt, sql`date_trunc('month', now()) - (${months} - 1) * interval '1 month'`),
      ))
      .groupBy(sql`to_char(${schema.invoices.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${schema.invoices.createdAt}, 'YYYY-MM')`);

    const map = new Map(rows.map((r) => [r.month, toNum(r.amount)]));
    const list: { month: string; amount: number }[] = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      list.push({ month: key, amount: map.get(key) ?? 0 });
    }

    return reply.send({ data: { list } });
  });

  /** GET /api/v1/admin/invoice-stats/uninvoiced — 未开票预估（paid 充值 − 已开票） */
  app.get('/api/v1/admin/invoice-stats/uninvoiced', { preHandler: [adminAuth] }, async (_request, reply) => {
    const [rechargeRow] = await db
      .select({ total: sql<string>`coalesce(sum(${schema.rechargeOrders.amount}), 0)` })
      .from(schema.rechargeOrders)
      .where(eq(schema.rechargeOrders.status, 'paid'));
    const [invoicedRow] = await db
      .select({ total: sql<string>`coalesce(sum(${schema.invoices.totalAmount}), 0)` })
      .from(schema.invoices)
      .where(eq(schema.invoices.status, 'issued'));

    const paidTotal = toNum(rechargeRow?.total);
    const invoicedTotal = toNum(invoicedRow?.total);
    const uninvoiced = Math.max(0, paidTotal - invoicedTotal);

    return reply.send({ data: { uninvoiced_amount: uninvoiced } });
  });
}
