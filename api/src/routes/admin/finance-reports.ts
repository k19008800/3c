// ============================================================
//  3cloud (3C) — 资金报表中心路由（SPEC-§29.5）
//  POST /api/v1/admin/finance/reports/generate  — 生成报表（daily/weekly/monthly）
//  GET  /api/v1/admin/finance/reports/schedules — 查看定时推送配置
//  POST /api/v1/admin/finance/reports/schedule  — 配置定时推送
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import {
  generateFinanceReport,
  renderReportHtml,
  getReportSchedules,
  setReportSchedule,
  type ReportType,
} from "../../services/finance-reports.js";

export async function adminFinanceReportsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 生成报表 ──
  app.post("/api/v1/admin/finance/reports/generate", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const body = (request.body as { type?: ReportType; date?: string }) || {};
      const type = body.type || "daily";
      if (!["daily", "weekly", "monthly"].includes(type)) {
        reply.status(400).send({ code: 400, data: null, message: "报表类型必须为 daily/weekly/monthly" });
        return;
      }
      const report = await generateFinanceReport(type, body.date);
      // 支持 ?format=html 返回可打印 HTML
      const query = request.query as { format?: string };
      if (query.format === "html") {
        reply.header("Content-Type", "text/html; charset=utf-8");
        reply.status(200).send(renderReportHtml(report));
        return;
      }
      reply.status(200).send({ code: 0, data: report, message: "报表生成成功" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ── 查看定时推送配置 ──
  app.get("/api/v1/admin/finance/reports/schedules", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (_request, reply) => {
    try {
      const schedules = await getReportSchedules();
      reply.status(200).send({ code: 0, data: schedules, message: "ok" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ── 配置定时推送 ──
  app.post("/api/v1/admin/finance/reports/schedule", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const body = request.body as {
        type: ReportType;
        enabled: boolean;
        cronExpr?: string;
        recipients?: string[];
      };
      if (!body.type || !["daily", "weekly", "monthly"].includes(body.type)) {
        reply.status(400).send({ code: 400, data: null, message: "type 必须为 daily/weekly/monthly" });
        return;
      }
      if (typeof body.enabled !== "boolean") {
        reply.status(400).send({ code: 400, data: null, message: "enabled 必须为布尔值" });
        return;
      }
      const schedule = await setReportSchedule(body.type, {
        enabled: body.enabled,
        cronExpr: body.cronExpr,
        recipients: body.recipients,
      });
      reply.status(200).send({ code: 0, data: schedule, message: "定时推送配置已保存" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
