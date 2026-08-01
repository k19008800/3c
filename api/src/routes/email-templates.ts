import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { emailTemplates, TEMPLATE_VARS } from "../db/schema/email-templates";
import { sendEmail, smtpEnabled, renderTemplate } from "../services/smtp";

/**
 * 邮件模板系统
 * 对齐 ref-4.5-marketing.md §4
 * CRUD + 变量系统 + 测试发送（占位符替换为示例值）
 */

function requireAdmin(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      const role = (decoded as any).role;
      if (role !== "admin" && role !== "super_admin") {
        return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "需要管理员权限" });
      }
    } catch (e: any) {
      if (e?.statusCode === 403) return;
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

/** 示例值替换变量（测试发送/预览用） */
const SAMPLE_VALUES: Record<string, string> = {
  username: "张三",
  amount: "100.00",
  time: "2026-08-01 12:00:00",
  balance: "1,234.56",
  keyName: "production-key",
  modelName: "deepseek-chat",
  reason: "账户余额不足",
  code: "3C-ABC123XY",
};

export function emailTemplateRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // 1. 模板列表
  app.get("/admin/email-templates", { onRequest: [admin] }, async () => {
    const rows = await db
      .select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        subjectZh: emailTemplates.subjectZh,
        subjectEn: emailTemplates.subjectEn,
        description: emailTemplates.description,
        updatedAt: emailTemplates.updatedAt,
      })
      .from(emailTemplates)
      .orderBy(emailTemplates.createdAt);
    return { code: 0, data: { list: rows, available_vars: TEMPLATE_VARS }, message: "ok" };
  });

  // 2. 创建模板
  app.post("/admin/email-templates", { onRequest: [admin] }, async (req, reply) => {
    const b = req.body as { name?: string; subject_zh?: string; body_html_zh?: string; subject_en?: string; body_html_en?: string; description?: string };
    if (!b.name?.trim() || !b.subject_zh?.trim() || !b.body_html_zh?.trim()) {
      return reply.code(400).send({ code: 400, error: "MISSING", message: "模板名/中文标题/中文正文必填" });
    }
    try {
      const created = await db.insert(emailTemplates).values({
        name: b.name.trim(), subjectZh: b.subject_zh.trim(), bodyHtmlZh: b.body_html_zh,
        subjectEn: b.subject_en ?? null, bodyHtmlEn: b.body_html_en ?? null, description: b.description ?? null,
      }).returning({ id: emailTemplates.id });
      return { code: 0, data: { id: created[0]!.id }, message: "模板已创建" };
    } catch (e: any) {
      if (e?.code === "23505") return reply.code(409).send({ code: 409, error: "DUPLICATE", message: "模板名已存在" });
      throw e;
    }
  });

  // 3. 更新模板
  app.put("/admin/email-templates/:name", { onRequest: [admin] }, async (req, reply) => {
    const name = (req.params as any).name;
    const b = req.body as { subject_zh?: string; body_html_zh?: string; subject_en?: string; body_html_en?: string; description?: string };
    const upd: any = { updatedAt: new Date() };
    if (b.subject_zh != null) upd.subjectZh = b.subject_zh;
    if (b.body_html_zh != null) upd.bodyHtmlZh = b.body_html_zh;
    if (b.subject_en != null) upd.subjectEn = b.subject_en;
    if (b.body_html_en != null) upd.bodyHtmlEn = b.body_html_en;
    if (b.description != null) upd.description = b.description;
    const r = await db.update(emailTemplates).set(upd).where(eq(emailTemplates.name, name));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "模板已更新" };
  });

  // 4. 删除模板
  app.delete("/admin/email-templates/:name", { onRequest: [admin] }, async (req, reply) => {
    const name = (req.params as any).name;
    const r = await db.delete(emailTemplates).where(eq(emailTemplates.name, name));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "模板已删除" };
  });

  // 5. 测试发送（未配置 SMTP 时返回渲染示例；配置后带 to 参数可真实发送）
  app.post("/admin/email-templates/:name/test", { onRequest: [admin] }, async (req, reply) => {
    const name = (req.params as any).name;
    const { to } = req.body as { to?: string };
    const t = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name)).limit(1);
    if (!t[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const options = { subject: renderTemplate(t[0].subjectZh, SAMPLE_VALUES), zh: renderTemplate(t[0].bodyHtmlZh, SAMPLE_VALUES), en: t[0].bodyHtmlEn ? renderTemplate(t[0].bodyHtmlEn, SAMPLE_VALUES) : null };
    
    // 若配置了 SMTP 且传了 to，则真实发送
    if (smtpEnabled() && to?.trim()) {
      const r = await sendEmail({
        to: to.trim(),
        subject: options.subject,
        html: options.zh,
        templateName: name,
        vars: SAMPLE_VALUES,
        senderId: Number((req as any).user.sub),
      });
      return { code: 0, data: { subject_zh: options.subject, body_html_zh: options.zh, body_html_en: options.en, sent: r.ok, message: r.message }, message: r.ok ? "测试邮件已发送" : r.message };
    }

    // 否则仅返回渲染示例
    return {
      code: 0,
      data: {
        subject_zh: options.subject,
        body_html_zh: options.zh,
        subject_en: t[0].subjectEn ? options.en : null,
        body_html_en: options.en,
        note: smtpEnabled() ? "示例值渲染（传 to 可真实发送测试邮件）" : "示例值渲染，SMTP 未配置",
        smtp_enabled: smtpEnabled(),
      },
      message: "ok",
    };
  });

  // 6. 管理端：直接发送模板邮件（指定单/多收件人）
  app.post("/admin/email-send", { onRequest: [admin] }, async (req, reply) => {
    const b = req.body as { template?: string; to?: string[]; to_emails?: string[]; vars?: Record<string, string> };
    const recipients = [...(b.to ?? []), ...(b.to_emails ?? [])].filter(Boolean);
    if (!b.template?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_TEMPLATE", message: "模板名必填" });
    if (recipients.length === 0) return reply.code(400).send({ code: 400, error: "MISSING_TO", message: "收件人必填" });
    const t = await db.select().from(emailTemplates).where(eq(emailTemplates.name, b.template.trim())).limit(1);
    if (!t[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "模板不存在" });
    const template = t[0];

    const results: { to: string; ok: boolean; message: string }[] = [];
    for (const addr of recipients) {
      const vars = { ...(b.vars ?? {}) };
      const r = await sendEmail({
        to: addr, subject: renderTemplate(template.subjectZh, vars), html: renderTemplate(template.bodyHtmlZh, vars),
        templateName: template.name, vars, senderId: Number((req as any).user.sub),
      });
      results.push({ to: addr, ok: r.ok, message: r.message });
    }
    const okCount = results.filter(r => r.ok).length;
    return { code: 0, data: { sent: okCount, failed: results.length - okCount, results }, message: `已发送 ${okCount}/${results.length} 封` };
  });

  // 7. 邮件发送日志（管理端）
  app.get("/admin/email-logs", { onRequest: [admin] }, async (req) => {
    const q = req.query as { page?: number; page_size?: number; status?: string };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.status) where += ` AND status = ${pp(q.status)}`;
    const rows = await pool.query(`SELECT * FROM email_logs ${where} ORDER BY id DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`, params);
    const total = await pool.query(`SELECT COUNT(*)::int AS total FROM email_logs ${where}`, params.slice(0, Math.max(0, params.length - 2)));
    return { code: 0, data: { list: rows.rows, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) } }, message: "ok" };
  });
}
