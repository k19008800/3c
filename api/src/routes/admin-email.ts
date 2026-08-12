/**
 * 管理端邮件模板 + 发送日志 API
 *
 * 端点覆盖：
 *   GET    /api/v1/admin/email-templates                — 模板列表 + available_vars
 *   POST   /api/v1/admin/email-templates                — 新建模板
 *   PUT    /api/v1/admin/email-templates/:name          — 更新模板
 *   DELETE /api/v1/admin/email-templates/:name          — 删除模板
 *   POST   /api/v1/admin/email-templates/:name/test     — 渲染预览（示例值）；body.to 时真实发送
 *   GET    /api/v1/admin/email-logs                     — 邮件发送日志
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, desc } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { sendMail, getSmtpConfig } from '../services/mailer';

/* ───────── helpers ───────── */

async function adminAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
  const { role } = payload as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

/** 示例变量（模板预览用） */
const SAMPLE_VARS: Record<string, string> = {
  username: '张三',
  amount: '¥100.00',
  time: '2026-08-12 10:00',
  balance: '¥1,234.56',
  keyName: 'my-api-key',
  modelName: 'DeepSeek-V3',
  reason: '价格调整',
  code: 'ABC123',
};

function renderTemplate(body: string, vars: Record<string, string> = {}): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (vars[k] ?? `{{${k}}}`));
}

function toRow(t: any) {
  return {
    id: t.id,
    name: t.name,
    subject_zh: t.subjectZh,
    subject_en: t.subjectEn,
    body_html_zh: t.bodyHtmlZh,
    body_html_en: t.bodyHtmlEn,
    description: t.description,
    updated_at: t.updatedAt,
  };
}

/* ───────── route plugin ───────── */

export async function adminEmailRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/email-templates — 模板列表 */
  app.get('/api/v1/admin/email-templates', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rows = await db.select().from(schema.emailTemplates).orderBy(desc(schema.emailTemplates.createdAt));
    return reply.send({
      data: {
        list: rows.map(toRow),
        available_vars: SAMPLE_VARS,
      },
    });
  });

  /** POST /api/v1/admin/email-templates — 新建模板 */
  app.post('/api/v1/admin/email-templates', { preHandler: [adminAuth] }, async (request, reply) => {
    const b = (request.body || {}) as Record<string, unknown>;
    const name = String(b.name || '').trim();
    const subjectZh = String(b.subject_zh || '').trim();
    const bodyHtmlZh = String(b.body_html_zh || '').trim();
    if (!name || !subjectZh || !bodyHtmlZh) {
      throw new ValidationError('name, subject_zh and body_html_zh are required');
    }

    const [row] = await db.insert(schema.emailTemplates).values({
      name,
      subjectZh,
      bodyHtmlZh,
      subjectEn: b.subject_en ? String(b.subject_en) : null,
      bodyHtmlEn: b.body_html_en ? String(b.body_html_en) : null,
      description: b.description ? String(b.description).slice(0, 300) : null,
    }).returning();

    return reply.status(201).send({ data: toRow(row), message: '模板已创建' });
  });

  /** PUT /api/v1/admin/email-templates/:name — 更新模板 */
  app.put('/api/v1/admin/email-templates/:name', { preHandler: [adminAuth] }, async (request, reply) => {
    const name = String((request.params as Record<string, unknown>).name || '');
    const b = (request.body || {}) as Record<string, unknown>;

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (b.subject_zh !== undefined) setData.subjectZh = String(b.subject_zh);
    if (b.body_html_zh !== undefined) setData.bodyHtmlZh = String(b.body_html_zh);
    if (b.subject_en !== undefined) setData.subjectEn = b.subject_en ? String(b.subject_en) : null;
    if (b.body_html_en !== undefined) setData.bodyHtmlEn = b.body_html_en ? String(b.body_html_en) : null;
    if (b.description !== undefined) setData.description = b.description ? String(b.description).slice(0, 300) : null;

    if (Object.keys(setData).length <= 1) throw new ValidationError('No fields to update');

    const [row] = await db.update(schema.emailTemplates)
      .set(setData)
      .where(eq(schema.emailTemplates.name, name))
      .returning();
    if (!row) throw new NotFoundError('Email template', name);

    return reply.send({ data: toRow(row), message: '模板已保存' });
  });

  /** DELETE /api/v1/admin/email-templates/:name — 删除模板 */
  app.delete('/api/v1/admin/email-templates/:name', { preHandler: [adminAuth] }, async (request, reply) => {
    const name = String((request.params as Record<string, unknown>).name || '');
    const [row] = await db.delete(schema.emailTemplates)
      .where(eq(schema.emailTemplates.name, name))
      .returning({ id: schema.emailTemplates.id });
    if (!row) throw new NotFoundError('Email template', name);
    return reply.send({ data: { ok: true }, message: '模板已删除' });
  });

  /** POST /api/v1/admin/email-templates/:name/test — 预览渲染 / 真实发送 */
  app.post('/api/v1/admin/email-templates/:name/test', { preHandler: [adminAuth] }, async (request, reply) => {
    const name = String((request.params as Record<string, unknown>).name || '');
    const b = (request.body || {}) as Record<string, unknown>;

    const [tpl] = await db.select().from(schema.emailTemplates)
      .where(eq(schema.emailTemplates.name, name)).limit(1);
    if (!tpl) throw new NotFoundError('Email template', name);

    const subject = renderTemplate(tpl.subjectZh, SAMPLE_VARS);
    const body = renderTemplate(tpl.bodyHtmlZh, SAMPLE_VARS);
    const smtp = await getSmtpConfig();

    if (b.to) {
      const to = String(b.to).trim();
      if (!to.includes('@')) throw new ValidationError('Invalid recipient email');
      const r = await sendMail({ to, subject, html: body, templateName: name });
      if (!r.ok && r.skipped) {
        return reply.send({ data: { subject_zh: subject, body_html_zh: body, smtp_enabled: false }, message: 'SMTP 未配置，已仅预览' });
      }
      if (!r.ok) {
        return reply.send({ data: { subject_zh: subject, body_html_zh: body, smtp_enabled: true }, message: `发送失败：${r.error ?? '未知错误'}` });
      }
      return reply.send({ data: { subject_zh: subject, body_html_zh: body, smtp_enabled: true }, message: '测试邮件已发送' });
    }

    return reply.send({ data: { subject_zh: subject, body_html_zh: body, smtp_enabled: smtp.enabled && !!smtp.host } });
  });

  /** GET /api/v1/admin/email-logs — 邮件发送日志 */
  app.get('/api/v1/admin/email-logs', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || '50', 10) || 50));
    const offset = (page - 1) * pageSize;

    const rows = await db.select().from(schema.emailLogs)
      .orderBy(desc(schema.emailLogs.createdAt))
      .limit(pageSize).offset(offset);

    const list = rows.map((l) => ({
      id: l.id,
      to_address: l.toAddress,
      subject: l.subject,
      template_name: l.templateName,
      status: l.status,
      error: l.error,
      created_at: l.createdAt,
    }));
    return reply.send({ data: { list, total: list.length } });
  });
}
