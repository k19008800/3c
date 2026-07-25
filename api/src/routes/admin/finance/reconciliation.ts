// ============================================================
//  自动对账路由
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";
import {
  runAutoReconciliation,
  listReconciliationReports,
  getReconciliationReportDetail,
  resolveMismatch,
} from "../../../services/reconciliation/auto-reconciliation.js";

export async function adminReconciliationRoutes(app: FastifyInstance) {
  // 全局 JWT 认证
  app.addHook("preHandler", authenticateJWT);

  // ════════════════════════════════════════════════════════════
  //  POST /api/v1/admin/finance/reconciliation/run — 执行对账
  // ════════════════════════════════════════════════════════════

  app.post(
    "/api/v1/admin/finance/reconciliation/run",
    {
      preHandler: [requirePerm(Perm.RECONCILIATION_VIEW)],
    },
    async (request, reply) => {
      try {
        const body = request.body as {
          startDate: string;
          endDate: string;
          reconType?: "full" | "recharge" | "balance" | "commission";
        };

        if (!body.startDate || !body.endDate) {
          reply.status(400).send({
            code: 400,
            data: null,
            message: "请提供 startDate 和 endDate",
          });
          return;
        }

        // 验证日期格式
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(body.startDate) || !dateRegex.test(body.endDate)) {
          reply.status(400).send({
            code: 400,
            data: null,
            message: "日期格式应为 YYYY-MM-DD",
          });
          return;
        }

        const operatorId = (request as any).user.userId;

        const result = await runAutoReconciliation({
          startDate: body.startDate,
          endDate: body.endDate,
          reconType: body.reconType || "full",
          createdBy: operatorId,
        });

        reply.status(200).send({
          code: 0,
          data: result,
          message:
            result.status === "completed"
              ? `对账完成：${result.summary.matchedOrders}/${result.summary.totalOrders} 笔匹配，${result.mismatches.length} 处异常`
              : "对账失败",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply
            .status(err.statusCode)
            .send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/finance/reconciliation/reports — 对账报告列表
  // ════════════════════════════════════════════════════════════

  app.get(
    "/api/v1/admin/finance/reconciliation/reports",
    {
      preHandler: [requirePerm(Perm.RECONCILIATION_VIEW)],
    },
    async (request, reply) => {
      try {
        const query = request.query as {
          page?: string;
          pageSize?: string;
          reconType?: string;
          status?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(
          100,
          Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20)
        );

        const result = await listReconciliationReports({
          page,
          pageSize,
          reconType: query.reconType,
          status: query.status,
        });

        reply.status(200).send({
          code: 0,
          data: result,
          message: "ok",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply
            .status(err.statusCode)
            .send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/finance/reconciliation/reports/:id — 报告详情
  // ════════════════════════════════════════════════════════════

  app.get(
    "/api/v1/admin/finance/reconciliation/reports/:id",
    {
      preHandler: [requirePerm(Perm.RECONCILIATION_VIEW)],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const reportId = parseInt(id, 10);

        if (!reportId) {
          reply.status(400).send({
            code: 400,
            data: null,
            message: "无效的报告 ID",
          });
          return;
        }

        const result = await getReconciliationReportDetail(reportId);

        reply.status(200).send({
          code: 0,
          data: result,
          message: "ok",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply
            .status(err.statusCode)
            .send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        if (err.message === "报告不存在") {
          reply.status(404).send({
            code: 404,
            data: null,
            message: "报告不存在",
          });
          return;
        }
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  //  POST /api/v1/admin/finance/reconciliation/mismatches/:id/resolve — 标记异常已解决
  // ════════════════════════════════════════════════════════════

  app.post(
    "/api/v1/admin/finance/reconciliation/mismatches/:id/resolve",
    {
      preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const mismatchId = parseInt(id, 10);

        if (!mismatchId) {
          reply.status(400).send({
            code: 400,
            data: null,
            message: "无效的异常记录 ID",
          });
          return;
        }

        const body = (request.body as { note?: string }) || {};
        const operatorId = (request as any).user.userId;

        await resolveMismatch(mismatchId, operatorId, body.note);

        reply.status(200).send({
          code: 0,
          data: null,
          message: "已标记为已解决",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply
            .status(err.statusCode)
            .send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/finance/reconciliation/export/:id — 导出报告
  // ════════════════════════════════════════════════════════════

  app.get(
    "/api/v1/admin/finance/reconciliation/export/:id",
    {
      preHandler: [requirePerm(Perm.RECONCILIATION_VIEW)],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const reportId = parseInt(id, 10);

        if (!reportId) {
          reply.status(400).send({
            code: 400,
            data: null,
            message: "无效的报告 ID",
          });
          return;
        }

        const { report, mismatches } = await getReconciliationReportDetail(reportId);

        // 设置响应头
        reply.raw.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="reconciliation_report_${reportId}.csv"`,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        });

        // 写入 BOM
        reply.raw.write("\uFEFF");

        const writeLine = (line: string) => {
          reply.raw.write(line + "\n");
        };

        // 报告头
        writeLine('"自动对账报告"');
        writeLine(`"报告ID",${report.id}`);
        writeLine(`"时间范围","${report.startDate} ~ ${report.endDate}"`);
        writeLine(`"对账类型","${report.reconType}"`);
        writeLine(`"状态","${report.status}"`);
        writeLine(`"创建时间","${report.createdAt}"`);
        writeLine("");

        // 汇总
        writeLine('"汇总数据"');
        writeLine('"总订单数","匹配订单数","异常订单数","总金额","差额"');
        writeLine(
          `${report.totalOrders},${report.matchedOrders},${report.mismatchedOrders},"${report.totalAmount}","${report.difference}"`
        );
        writeLine("");

        // 异常明细
        if (mismatches.length > 0) {
          writeLine('"异常明细"');
          writeLine(
            '"ID","关联类型","关联ID","异常类型","期望值","实际值","原因","严重级别","是否已解决","创建时间"'
          );
          for (const m of mismatches) {
            writeLine(
              `${m.id},"${m.refType}",${m.refId},"${m.mismatchType}","${m.expectedValue || ""}","${m.actualValue || ""}","${m.reason.replace(/"/g, '""')}","${m.severity}",${m.resolved ? "是" : "否"},"${m.createdAt}"`
            );
          }
        }

        reply.raw.end();
      } catch (err: any) {
        if (err instanceof AppError) {
          reply
            .status(err.statusCode)
            .send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    }
  );
}
