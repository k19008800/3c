import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { emailTemplates, TEMPLATE_VARS } from "../db/schema/email-templates";

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

function renderWithSample(text: string): string {
  let out = text;
  for (const [k, v] of Object.entries(SAMPLE_VALUES)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  // 剩余未替换变量
  out = out.replace(/\{\{(\w+)\}\}/g, (m, name) => `{${name}}`);
  return out;
}

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

  // 5. 测试发送（返回渲染后的示例，不真发邮件——后续接 SMTP）
  app.post("/admin/email-templates/:name/test", { onRequest: [admin] }, async (req, reply) => {
    const name = (req.params as any).name;
    const t = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name)).limit(1);
    if (!t[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    // 渲染示例
    return {
      code: 0,
      data: {
        subject_zh: renderWithSample(t[0].subjectZh),
        body_html_zh: renderWithSample(t[0].bodyHtmlZh),
        subject_en: t[0].subjectEn ? renderWithSample(t[0].subjectEn) : null,
        body_html_en: t[0].bodyHtmlEn ? renderWithSample(t[0].bodyHtmlEn) : null,
        note: "示例值渲染，未实际发送（SMTP 待接入）",
      },
      message: "ok",
    };
  });
}
