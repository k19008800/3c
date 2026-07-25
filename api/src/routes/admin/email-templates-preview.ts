// ============================================================
//  3cloud (3C) — 邮件模板预览与测试发送路由
//  POST /api/v1/admin/email-templates/preview      — 预览模板（渲染后 HTML）
//  POST /api/v1/admin/email-templates/test-send   — 发送测试邮件
// ============================================================

import { FastifyInstance } from "fastify";
import { getDb } from "../../db/index.js";
import { emailTemplates, auditLogs } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { sendEmail, renderTemplate } from "../../services/email-service.js";
import { logger } from "../../logger.js";

// ── 模板变量定义（用于提示和示例） ──

export const TEMPLATE_VARIABLES: Record<string, { label: string; example: string }> = {
  username: { label: "用户名", example: "张三" },
  email: { label: "邮箱地址", example: "zhangsan@example.com" },
  nickname: { label: "昵称", example: "小张" },
  realName: { label: "真实姓名", example: "张三" },
  amount: { label: "金额", example: "100.00" },
  date: { label: "日期", example: "2025-01-15" },
  time: { label: "时间", example: "2025-01-15 14:30:00" },
  ip: { label: "IP 地址", example: "192.168.1.100" },
  city: { label: "城市", example: "北京" },
  country: { label: "国家", example: "中国" },
  device: { label: "设备", example: "Chrome / Windows" },
  reason: { label: "原因", example: "违规操作" },
  duration: { label: "时长", example: "7 天" },
  unbanAt: { label: "解封时间", example: "2025-01-22 14:30:00" },
  status: { label: "状态", example: "已通过" },
  rejectReason: { label: "拒绝原因", example: "信息不完整" },
  userType: { label: "用户类型", example: "个人用户" },
  extraInfo: { label: "额外信息", example: "您现在可以正常使用全部 API 功能。" },
  verifyLink: { label: "验证链接", example: "https://example.com/verify?token=xxx" },
  resetLink: { label: "重置链接", example: "https://example.com/reset?token=xxx" },
  orderId: { label: "订单号", example: "ORD202501150001" },
  productName: { label: "产品名称", example: "API 基础版" },
};

// 默认示例数据
const DEFAULT_SAMPLE_DATA: Record<string, string> = Object.fromEntries(
  Object.entries(TEMPLATE_VARIABLES).map(([key, val]) => [key, val.example])
);

export async function adminEmailTemplatePreviewRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 获取模板变量列表 ──
  app.get("/api/v1/admin/email-templates/variables", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    reply.status(200).send({
      code: 0,
      data: TEMPLATE_VARIABLES,
      message: "ok",
    });
  });

  // ── 预览模板（渲染后 HTML） ──
  app.post("/api/v1/admin/email-templates/preview", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const body = request.body as {
      templateName?: string;
      subjectZh?: string;
      subjectEn?: string;
      bodyHtmlZh?: string;
      bodyHtmlEn?: string;
      sampleData?: Record<string, string>;
      lang?: "zh" | "en";
    };

    const lang = body.lang || "zh";
    const sampleData = { ...DEFAULT_SAMPLE_DATA, ...body.sampleData };

    let subject: string;
    let bodyHtml: string;

    // 如果提供了模板名称，从数据库加载
    if (body.templateName) {
      const db = getDb();
      const [tmpl] = await db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.name, body.templateName))
        .limit(1);

      if (!tmpl) {
        reply.status(404).send({ code: 404, data: null, message: "模板不存在" });
        return;
      }

      subject = lang === "zh" ? tmpl.subjectZh : tmpl.subjectEn;
      bodyHtml = lang === "zh" ? tmpl.bodyHtmlZh : tmpl.bodyHtmlEn;
    } else {
      // 使用提供的原始内容
      subject = lang === "zh" ? (body.subjectZh || "") : (body.subjectEn || "");
      bodyHtml = lang === "zh" ? (body.bodyHtmlZh || "") : (body.bodyHtmlEn || "");
    }

    // 渲染模板
    const renderedSubject = renderTemplate(subject, sampleData);
    const renderedHtml = renderTemplate(bodyHtml, sampleData);

    // 提取模板中使用的变量
    const usedVars = new Set<string>();
    const varPattern = /\{\{(\w+)\}\}/g;
    let match;
    while ((match = varPattern.exec(subject + bodyHtml)) !== null) {
      usedVars.add(match[1]);
    }

    reply.status(200).send({
      code: 0,
      data: {
        subject: renderedSubject,
        html: renderedHtml,
        usedVariables: Array.from(usedVars),
        lang,
      },
      message: "ok",
    });
  });

  // ── 发送测试邮件 ──
  app.post("/api/v1/admin/email-templates/test-send", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const body = request.body as {
      to: string;
      templateName?: string;
      subjectZh?: string;
      subjectEn?: string;
      bodyHtmlZh?: string;
      bodyHtmlEn?: string;
      sampleData?: Record<string, string>;
      lang?: "zh" | "en";
    };

    if (!body.to || !body.to.includes("@")) {
      reply.status(400).send({ code: 400, data: null, message: "请提供有效的收件人邮箱" });
      return;
    }

    const lang = body.lang || "zh";
    const sampleData = { ...DEFAULT_SAMPLE_DATA, ...body.sampleData };

    let subject: string;
    let bodyHtml: string;

    // 如果提供了模板名称，从数据库加载
    if (body.templateName) {
      const db = getDb();
      const [tmpl] = await db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.name, body.templateName))
        .limit(1);

      if (!tmpl) {
        reply.status(404).send({ code: 404, data: null, message: "模板不存在" });
        return;
      }

      subject = lang === "zh" ? tmpl.subjectZh : tmpl.subjectEn;
      bodyHtml = lang === "zh" ? tmpl.bodyHtmlZh : tmpl.bodyHtmlEn;
    } else {
      // 使用提供的原始内容
      subject = lang === "zh" ? (body.subjectZh || "") : (body.subjectEn || "");
      bodyHtml = lang === "zh" ? (body.bodyHtmlZh || "") : (body.bodyHtmlEn || "");
    }

    if (!subject.trim() || !bodyHtml.trim()) {
      reply.status(400).send({ code: 400, data: null, message: "主题和正文不能为空" });
      return;
    }

    // 渲染模板
    const renderedSubject = renderTemplate(subject, sampleData);
    const renderedHtml = renderTemplate(bodyHtml, sampleData);

    // 记录审计日志
    const operatorId = request.user!.userId;
    const db = getDb();
    await db.insert(auditLogs).values({
      operatorId,
      action: "email_template_test_send",
      targetType: "email_template",
      targetId: 0,
      after: { to: body.to, templateName: body.templateName, lang },
      ip: request.ip,
      description: `发送测试邮件到 ${body.to}`,
    });

    // 发送邮件
    try {
      const success = await sendEmail({
        to: body.to,
        subject: `[测试] ${renderedSubject}`,
        html: renderedHtml,
      });

      if (success) {
        logger.info({ to: body.to, templateName: body.templateName }, "[Email] 测试邮件发送成功");
        reply.status(200).send({
          code: 0,
          data: { to: body.to, subject: renderedSubject },
          message: "测试邮件已发送",
        });
      } else {
        reply.status(500).send({ code: 500, data: null, message: "邮件发送失败" });
      }
    } catch (err) {
      logger.error({ err, to: body.to }, "[Email] 测试邮件发送异常");
      reply.status(500).send({ code: 500, data: null, message: "邮件发送失败" });
    }
  });
}
