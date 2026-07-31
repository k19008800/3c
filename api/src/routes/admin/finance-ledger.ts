// ============================================================
//  3cloud (3C) — 平台资金流水路由（SPEC-§29.1）
//  GET  /api/v1/admin/finance/ledger          — 流水列表（筛选/分页/汇总）
//  GET  /api/v1/admin/finance/ledger/:serialNo — 流水详情
//  GET  /api/v1/admin/finance/ledger/summary  — 汇总（按类型/方向）
//  GET  /api/v1/admin/finance/ledger/export   — 导出 CSV
//  POST /api/v1/admin/finance/ledger/adjust   — 手工调整
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import {
  queryLedger,
  queryLedgerDetail,
  adjustLedger,
} from "../../services/finance-ledger.js";

export async function adminFinanceLedgerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/ledger — 流水列表
  //  query: type, direction, userId, agentId, startDate, endDate, keyword, page, pageSize
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/ledger", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as Record<string, string>;
      const result = await queryLedger({
        type: query.type as any,
        direction: query.direction as any,
        userId: query.userId ? parseInt(query.userId, 10) : undefined,
        agentId: query.agentId ? parseInt(query.agentId, 10) : undefined,
        startDate: query.startDate,
        endDate: query.endDate,
        keyword: query.keyword,
        page: query.page ? parseInt(query.page, 10) : undefined,
        pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      });
      reply.status(200).send({ code: 0, data: result, message: "ok" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/ledger/summary — 汇总
  //  query: startDate, endDate, type, direction
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/ledger/summary", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as Record<string, string>;
      const result = await queryLedger({
        type: query.type as any,
        direction: query.direction as any,
        startDate: query.startDate,
        endDate: query.endDate,
        page: 1,
        pageSize: 1, // 只要 summary，不关心列表
      });
      reply.status(200).send({
        code: 0,
        data: {
          summary: result.summary,
          totalIn: result.summary.totalIn,
          totalOut: result.summary.totalOut,
          totalCount: result.summary.totalCount,
          byType: result.summary.byType,
        },
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/ledger/:serialNo — 流水详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/ledger/:serialNo", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { serialNo } = request.params as { serialNo: string };
      const result = await queryLedgerDetail(serialNo);
      reply.status(200).send({ code: 0, data: result, message: "ok" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/ledger/export — 导出 CSV
  //  query: 同列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/ledger/export", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as Record<string, string>;
      const result = await queryLedger({
        type: query.type as any,
        direction: query.direction as any,
        userId: query.userId ? parseInt(query.userId, 10) : undefined,
        agentId: query.agentId ? parseInt(query.agentId, 10) : undefined,
        startDate: query.startDate,
        endDate: query.endDate,
        keyword: query.keyword,
        page: 1,
        pageSize: 10000,
      });

      const header = "序列号,类型,方向,金额,余额,用户,关联单号,支付渠道,状态,备注,时间,来源\n";
      const rows = result.list.map((r: any) =>
        [
          r.serialNo,
          r.type,
          r.direction,
          r.amount,
          r.balanceAfter ?? "",
          r.userEmail ?? r.userNickname ?? "",
          r.relatedOrderNo ?? "",
          r.paymentChannel ?? "",
          r.status,
          (r.remark ?? "").replace(/[\r\n,]/g, " "),
          r.createdAt,
          r.source,
        ].join(",")
      ).join("\n");

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="ledger-${Date.now()}.csv"`);
      reply.status(200).send("\uFEFF" + header + rows);
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/finance/ledger/adjust — 手工调整
  //  body: { type: "adjust"|"reversal", direction, amount, userId?, relatedOrderNo?, remark }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/ledger/adjust", {
    preHandler: [requirePerm(Perm.RECONCILIATION_MANAGE)],
  }, async (request, reply) => {
    try {
      const body = request.body as {
        type?: "adjust" | "reversal";
        direction: "in" | "out";
        amount: string | number;
        userId?: number;
        relatedOrderNo?: string;
        remark: string;
      };
      const result = await adjustLedger({
        type: body.type || "adjust",
        direction: body.direction,
        amount: body.amount,
        userId: body.userId,
        relatedOrderNo: body.relatedOrderNo,
        remark: body.remark,
        operatorId: request.user!.userId,
        ip: request.ip,
      });
      reply.status(200).send({
        code: 0,
        data: result,
        message: "资金流水调整成功",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
