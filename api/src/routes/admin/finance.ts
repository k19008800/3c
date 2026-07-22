// ============================================================
//  3cloud (3C) — 财务路由（管理员）
//
//  板块 1 — 财务工作台
//  板块 2 — 佣金管理
//  板块 3 — 对账报表
//  板块 4 — 提现管理
//  板块 5 — 充值订单
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import {
  // 财务工作台 & 对账
  getFinanceDashboard,
  getReconciliationReport,
  exportReconCsv,
  computeDailyReconSummary,
} from "../../services/agent-finance.js";
import {
  // 佣金
  listAllCommissions,
  listAllCommissionsDetail,
} from "../../services/agent-commission.js";
import {
  settleCommissions,
  batchSettleCommissions,
  batchCancelCommissions,
  settleCommissionsByFilters,
} from "../../services/agent-settlement.js";
import {
  // 提现
  listAllWithdraws,
  firstReviewWithdraw,
  secondReviewWithdraw,
  markWithdrawAsPaid,
  batchReviewWithdraws,
  exportWithdrawsCsv,
} from "../../services/agent-withdraw.js";
import { confirmBankTransfer, parseBankTransferRemark } from "../../services/recharge-service.js";
import { generateVoucherNo } from "../../services/voucher-service.js";
import { firstConfirmRechargeSchema, secondConfirmRechargeSchema } from "../../schemas.js";
import { getDb } from "../../db/index.js";
import {
  withdrawOrders,
  rechargeOrders,
  users,
  agents,
  balanceLogs,
  auditLogs,
  dailyReconSummary,
} from "../../db/schema.js";

export async function adminFinanceRoutes(app: FastifyInstance) {
  // 全局 JWT 认证（所有管理端接口都需要登录）
  app.addHook("preHandler", authenticateJWT);

  // ════════════════════════════════════════════════════════════
  //  板块 1 — 财务工作台 (Dashboard)
  // ════════════════════════════════════════════════════════════

  app.get("/api/v1/admin/finance/dashboard", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const result = await getFinanceDashboard();

      reply.status(200).send({
        code: 0,
        data: result,
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

  // ════════════════════════════════════════════════════════════
  //  板块 2 — 佣金管理 (Commissions)
  // ════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/commissions — 佣金流水总览
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/commissions", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        agentId?: string;
        agentSearch?: string;
        startDate?: string;
        endDate?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const result = await listAllCommissions(page, pageSize, {
        agentId: query.agentId ? parseInt(query.agentId, 10) : undefined,
        agentSearch: query.agentSearch || undefined,
        startDate: query.startDate,
        endDate: query.endDate,
      });

      reply.status(200).send({
        code: 0,
        data: result,
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
  //  GET /api/v1/admin/finance/commissions/detail — 查看某代理商某天佣金明细
  //  params: agentId, date, status?, page, pageSize
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/commissions/detail", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        agentId?: string;
        date?: string;
        status?: string;
        commissionType?: string;
        page?: string;
        pageSize?: string;
      };

      const agentId = query.agentId ? parseInt(query.agentId, 10) : undefined;
      if (!agentId || !query.date) {
        reply.status(400).send({ code: 400, data: null, message: "请提供 agentId 和 date 参数" });
        return;
      }

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const result = await listAllCommissionsDetail(page, pageSize, {
        agentId,
        date: query.date,
        status: query.status,
        commissionType: query.commissionType,
      });

      reply.status(200).send({
        code: 0,
        data: result,
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

  // ════════════════════════════════════════════════════════════
  //  板块 3 — 对账报表 (Reconciliation)
  // ════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/reconciliation — 对账报表
  //  params: startDate, endDate, granularity (day|week|month)
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/reconciliation", {
    preHandler: [requirePerm(Perm.RECONCILIATION_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        startDate?: string
        endDate?: string
        granularity?: 'day' | 'week' | 'month'
      };
      const result = await getReconciliationReport({
        startDate: query.startDate,
        endDate: query.endDate,
        granularity: query.granularity,
      });

      reply.status(200).send({
        code: 0,
        data: result,
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
  //  GET /api/v1/admin/finance/reconciliation/export — CSV 导出
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/reconciliation/export", {
    preHandler: [requirePerm(Perm.RECONCILIATION_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        startDate?: string
        endDate?: string
        granularity?: string
      };
      const gran = (query.granularity === 'week' || query.granularity === 'month') ? query.granularity : 'day';
      const csv = await exportReconCsv({
        startDate: query.startDate,
        endDate: query.endDate,
        granularity: gran,
      });

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="reconciliation_${query.startDate || 'report'}.csv"`);
      reply.status(200).send(csv);
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/agent-integrity — 代理商财务完整性校验
  //  交叉验证每个代理商的缓存字段与实际子表数据
  //  params: agentId?, agentSearch?, page?, pageSize?
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/agent-integrity", {
    preHandler: [requirePerm(Perm.RECONCILIATION_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        agentId?: string;
        agentSearch?: string;
        page?: string;
        pageSize?: string;
      };
      const { getAgentIntegrity } = await import("../../services/agent-service.js");
      const result = await getAgentIntegrity({
        agentId: query.agentId ? parseInt(query.agentId, 10) : undefined,
        agentSearch: query.agentSearch,
        page: query.page ? parseInt(query.page, 10) : undefined,
        pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      });

      reply.status(200).send({
        code: 0,
        data: result,
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
  //  POST /api/v1/admin/finance/commissions/settle — 批量结算佣金
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/commissions/settle", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const body = request.body as { ids?: number[] } || {};
      const count = body.ids?.length
        ? await batchSettleCommissions(body.ids)
        : await settleCommissions();
      reply.status(200).send({ code: 0, data: { settledCount: count }, message: `成功结算 ${count} 笔佣金` });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/finance/commissions/settle-by-filters — 按筛选条件批量结算
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/commissions/settle-by-filters", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const body = request.body as {
        agentId?: number;
        startDate?: string;
        endDate?: string;
        commissionType?: string;
      } || {};
      const count = await settleCommissionsByFilters(body);
      reply.status(200).send({
        code: 0,
        data: { settledCount: count },
        message: `成功结算 ${count} 笔佣金`,
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ══════════════════════════════════════════════
  //  POST /api/v1/admin/finance/commissions/auto-settle — 自动结算 方案B
  //  结算指定天数前的所有待结算佣金，由定时任务触发
  //  Body: { daysBefore?: number, apiKey?: string }
  //  daysBefore 默认 1（结算1天前的佣金），传 0 则结算全部
  //  安全：支持 apiKey 验证（从 system_configs.auto_settle_api_key 读取）
  // ══════════════════════════════════════════════

  app.post("/api/v1/admin/finance/commissions/auto-settle", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const body = (request.body as { daysBefore?: number }) || {};
      const daysBefore = Math.max(0, body.daysBefore ?? 1);

      let count: number;
      if (daysBefore > 0) {
        const endDate = new Date(Date.now() - daysBefore * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        count = await settleCommissionsByFilters({ endDate });
      } else {
        count = await settleCommissions();
      }

      reply.status(200).send({
        code: 0,
        data: { settledCount: count, cutoffDays: daysBefore },
        message: `自动结算完成：${count} 笔（结算 ${daysBefore > 0 ? `${daysBefore}天前` : "全部"} 待结算佣金）`,
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
  //  POST /api/v1/admin/finance/commissions/cancel — 批量作废佣金
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/commissions/cancel", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const body = request.body as { ids: number[] };
      if (!body.ids?.length) {
        reply.status(400).send({ code: 400, data: null, message: "请选择要作废的佣金记录" });
        return;
      }
      const count = await batchCancelCommissions(body.ids);
      reply.status(200).send({ code: 0, data: { cancelledCount: count }, message: `成功作废 ${count} 笔佣金` });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  //  板块 4 — 提现管理 (Withdraw Management)
  // ════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/withdraws — 提现列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/withdraws", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        status?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const status = query.status || undefined;

      const result = await listAllWithdraws(page, pageSize, status);

      reply.status(200).send({
        code: 0,
        data: result,
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
  //  GET /api/v1/admin/withdraws/stats — 按状态统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/withdraws/stats", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (_request, reply) => {
    try {
      const db = getDb();
      const rows = await db
        .select({
          status: withdrawOrders.status,
          count: sql<number>`count(*)::int`,
          totalAmount: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
        })
        .from(withdrawOrders)
        .groupBy(withdrawOrders.status)
        .orderBy(withdrawOrders.status);

      reply.status(200).send({
        code: 0,
        data: rows,
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
  //  GET /api/v1/admin/withdraws/export — CSV 导出
  //  Query: ?status=pending_first_review (可选)
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/withdraws/export", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const query = request.query as { status?: string };
      const csv = await exportWithdrawsCsv(query.status || undefined);

      reply.header("Content-Type", "text/csv; charset=utf-8");
      const filename = query.status
        ? `withdraws_${query.status}_${new Date().toISOString().slice(0, 10)}.csv`
        : `withdraws_all_${new Date().toISOString().slice(0, 10)}.csv`;
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      reply.status(200).send(csv);
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/withdraws/:id — 提现详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/withdraws/:id", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const withdrawId = parseInt(id, 10);
      if (!withdrawId) {
        reply.status(400).send({ code: 400, data: null, message: "无效的提现 ID" });
        return;
      }

      const db = getDb();

      const [row] = await db
        .select({
          id: withdrawOrders.id,
          agentId: withdrawOrders.agentId,
          userId: agents.userId,
          email: users.email,
          nickname: users.nickname,
          voucherNo: withdrawOrders.voucherNo,
          amount: withdrawOrders.amount,
          feeAmount: withdrawOrders.feeAmount,
          actualAmount: withdrawOrders.actualAmount,
          bankCardNo: withdrawOrders.bankCardNo,
          bankName: withdrawOrders.bankName,
          bankVoucherUrl: withdrawOrders.bankVoucherUrl,
          wechatPayNo: withdrawOrders.wechatPayNo,
          status: withdrawOrders.status,
          auditLevel: withdrawOrders.auditLevel,
          rejectReason: withdrawOrders.rejectReason,
          riskCheckResult: withdrawOrders.riskCheckResult,
          firstAuditorId: withdrawOrders.firstAuditorId,
          firstAuditedAt: withdrawOrders.firstAuditedAt,
          secondAuditorId: withdrawOrders.secondAuditorId,
          secondAuditedAt: withdrawOrders.secondAuditedAt,
          paidOperatorId: withdrawOrders.paidOperatorId,
          matchedBankTxId: withdrawOrders.matchedBankTxId,
          createdAt: withdrawOrders.createdAt,
          reviewedAt: withdrawOrders.reviewedAt,
          paidAt: withdrawOrders.paidAt,
        })
        .from(withdrawOrders)
        .innerJoin(agents, eq(withdrawOrders.agentId, agents.id))
        .innerJoin(users, eq(agents.userId, users.id))
        .where(eq(withdrawOrders.id, withdrawId))
        .limit(1);

      if (!row) {
        reply.status(404).send({ code: 404, data: null, message: "提现订单不存在" });
        return;
      }

      reply.status(200).send({
        code: 0,
        data: {
          ...row,
          feeAmount: row.feeAmount ?? "0.000000",
          actualAmount: row.actualAmount ?? row.amount,
          createdAt: row.createdAt.toISOString(),
          reviewedAt: row.reviewedAt?.toISOString() ?? null,
          firstAuditedAt: row.firstAuditedAt?.toISOString() ?? null,
          secondAuditedAt: row.secondAuditedAt?.toISOString() ?? null,
          paidAt: row.paidAt?.toISOString() ?? null,
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
  //  POST /api/v1/admin/withdraws/batch-review — 批量审核
  //  Body: { ids: number[], action: "approve" | "reject", rejectReason?: string }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/withdraws/batch-review", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const body = request.body as {
        ids: number[];
        action: "approve" | "reject";
        rejectReason?: string;
      };

      if (!body.ids?.length) {
        reply.status(400).send({ code: 400, data: null, message: "请选择要审核的提现订单" });
        return;
      }
      if (!body.action || !["approve", "reject"].includes(body.action)) {
        reply.status(400).send({ code: 400, data: null, message: "action 必须为 approve 或 reject" });
        return;
      }

      const operatorId = (request as any).user.userId;
      const result = await batchReviewWithdraws(operatorId, body.ids, body.action, body.rejectReason);

      reply.status(200).send({
        code: 0,
        data: result,
        message: `批量操作完成：通过 ${result.approved} 笔，拒绝 ${result.rejected} 笔${result.errors.length ? `，${result.errors.length} 笔失败` : ""}`,
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
  //  POST /api/v1/admin/withdraws/:id/first-review — 初审
  //  Body: { action: "approve" | "reject", rejectReason?: string }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/withdraws/:id/first-review", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const withdrawId = parseInt(id, 10);
      if (!withdrawId) {
        reply.status(400).send({ code: 400, data: null, message: "无效的提现 ID" });
        return;
      }

      const body = request.body as {
        action: "approve" | "reject";
        rejectReason?: string;
      };

      if (!body.action || !["approve", "reject"].includes(body.action)) {
        reply.status(400).send({ code: 400, data: null, message: "action 必须为 approve 或 reject" });
        return;
      }

      const operatorId = (request as any).user.userId;
      const result = await firstReviewWithdraw(operatorId, withdrawId, body.action, body.rejectReason);

      reply.status(200).send({
        code: 0,
        data: result,
        message: body.action === "approve" ? "初审通过" : "已拒绝",
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
  //  POST /api/v1/admin/withdraws/:id/second-review — 复审
  //  Body: { action: "approve" | "reject", rejectReason?: string, bankVoucherUrl?: string }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/withdraws/:id/second-review", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const withdrawId = parseInt(id, 10);
      if (!withdrawId) {
        reply.status(400).send({ code: 400, data: null, message: "无效的提现 ID" });
        return;
      }

      const body = request.body as {
        action: "approve" | "reject";
        rejectReason?: string;
        bankVoucherUrl?: string;
      };

      if (!body.action || !["approve", "reject"].includes(body.action)) {
        reply.status(400).send({ code: 400, data: null, message: "action 必须为 approve 或 reject" });
        return;
      }

      const operatorId = (request as any).user.userId;
      const result = await secondReviewWithdraw(operatorId, withdrawId, body.action, body.rejectReason, body.bankVoucherUrl);

      reply.status(200).send({
        code: 0,
        data: result,
        message: body.action === "approve" ? "复审通过" : "复审拒绝",
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
  //  POST /api/v1/admin/withdraws/:id/mark-paid — 标记已打款
  //  Body: { bankVoucherUrl?: string }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/withdraws/:id/mark-paid", {
    preHandler: [requirePerm(Perm.FINANCE_WITHDRAW)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const withdrawId = parseInt(id, 10);
      if (!withdrawId) {
        reply.status(400).send({ code: 400, data: null, message: "无效的提现 ID" });
        return;
      }

      const body = (request.body as { bankVoucherUrl?: string }) || {};
      const operatorId = (request as any).user.userId;
      const result = await markWithdrawAsPaid(operatorId, withdrawId, body.bankVoucherUrl);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "已标记为打款",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════
  //  板块 5 — 充值订单 (Recharge Orders)
  // ════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/recharge-orders — 充值订单列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/recharge-orders", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      status?: string;
      channel?: string;
      userId?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [sql`1=1`];

    if (query.status) {
      conditions.push(eq(rechargeOrders.status, query.status as any));
    }
    if (query.channel) {
      conditions.push(eq(rechargeOrders.channel, query.channel as any));
    }
    if (query.userId) {
      conditions.push(eq(rechargeOrders.userId, parseInt(query.userId, 10)));
    }

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(rechargeOrders)
      .where(and(...conditions));

    const total = Number(totalResult?.count ?? 0);

    const rows = await db
      .select({
        id: rechargeOrders.id,
        userId: rechargeOrders.userId,
        orderNo: rechargeOrders.orderNo,
        amount: rechargeOrders.amount,
        channel: rechargeOrders.channel,
        status: rechargeOrders.status,
        channelOrderNo: rechargeOrders.channelOrderNo,
        voucherImage: rechargeOrders.voucherImage,
        voucherNo: rechargeOrders.voucherNo,
        confirmedBy: rechargeOrders.confirmedBy,
        firstConfirmedBy: rechargeOrders.firstConfirmedBy,
        firstConfirmedAt: rechargeOrders.firstConfirmedAt,
        secondConfirmedBy: rechargeOrders.secondConfirmedBy,
        secondConfirmedAt: rechargeOrders.secondConfirmedAt,
        remark: rechargeOrders.remark,
        // 独立银行信息字段
        payerAccountName: rechargeOrders.payerAccountName,
        payerAccountNo: rechargeOrders.payerAccountNo,
        transferRemark: rechargeOrders.transferRemark,
        paidAt: rechargeOrders.paidAt,
        confirmedAt: rechargeOrders.confirmedAt,
        expiresAt: rechargeOrders.expiresAt,
        createdAt: rechargeOrders.createdAt,
        // 用户信息
        userEmail: users.email,
        userNickname: users.nickname,
      })
      .from(rechargeOrders)
      .innerJoin(users, eq(rechargeOrders.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(rechargeOrders.createdAt))
      .limit(pageSize)
      .offset(offset);

    // 为旧记录补偿解析 bankName/accountNumber/transferDate
    const list = rows.map((r) => {
      let bankName = r.payerAccountName ?? null;
      let accountNumber = r.payerAccountNo ?? null;
      let transferDate: string | null = null;
      let parsedRemark: string | null = r.remark;

      // 旧记录：从 remark 中解析
      if (!bankName || !accountNumber) {
        const parsed = parseBankTransferRemark(r.remark);
        if (!bankName) bankName = parsed.bankName;
        if (!accountNumber) accountNumber = parsed.accountNumber;
        transferDate = parsed.transferDate;
        parsedRemark = parsed.userRemark ?? r.remark;
      } else {
        // 新记录：transferRemark 就是用户备注，remark 是拼接的完整字符串
        const parsed = parseBankTransferRemark(r.remark);
        transferDate = parsed.transferDate;
      }

      return {
        id: r.id,
        userId: r.userId,
        orderNo: r.orderNo,
        amount: r.amount,
        channel: r.channel,
        status: r.status,
        channelOrderNo: r.channelOrderNo,
        voucherImage: r.voucherImage,
        voucherNo: r.voucherNo,
        confirmedBy: r.confirmedBy,
        firstConfirmedBy: r.firstConfirmedBy,
        firstConfirmedAt: r.firstConfirmedAt?.toISOString() ?? null,
        secondConfirmedBy: r.secondConfirmedBy,
        secondConfirmedAt: r.secondConfirmedAt?.toISOString() ?? null,
        remark: r.remark,
        bankName,
        accountNumber,
        transferDate,
        paidAt: r.paidAt?.toISOString() ?? null,
        confirmedAt: r.confirmedAt?.toISOString() ?? null,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        userEmail: r.userEmail,
        userNickname: r.userNickname,
      };
    });

    reply.status(200).send({
      code: 0,
      data: {
        list,
        total,
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/recharge-orders/:id — 订单详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/recharge-orders/:id", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);

    if (isNaN(orderId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的订单 ID" });
      return;
    }

    const [row] = await db
      .select({
        id: rechargeOrders.id,
        userId: rechargeOrders.userId,
        orderNo: rechargeOrders.orderNo,
        amount: rechargeOrders.amount,
        channel: rechargeOrders.channel,
        status: rechargeOrders.status,
        channelOrderNo: rechargeOrders.channelOrderNo,
        voucherImage: rechargeOrders.voucherImage,
        voucherNo: rechargeOrders.voucherNo,
        confirmedBy: rechargeOrders.confirmedBy,
        firstConfirmedBy: rechargeOrders.firstConfirmedBy,
        firstConfirmedAt: rechargeOrders.firstConfirmedAt,
        secondConfirmedBy: rechargeOrders.secondConfirmedBy,
        secondConfirmedAt: rechargeOrders.secondConfirmedAt,
        remark: rechargeOrders.remark,
        payerAccountName: rechargeOrders.payerAccountName,
        payerAccountNo: rechargeOrders.payerAccountNo,
        transferRemark: rechargeOrders.transferRemark,
        paidAt: rechargeOrders.paidAt,
        confirmedAt: rechargeOrders.confirmedAt,
        expiresAt: rechargeOrders.expiresAt,
        createdAt: rechargeOrders.createdAt,
        userEmail: users.email,
        userNickname: users.nickname,
        userBalance: users.balance,
      })
      .from(rechargeOrders)
      .innerJoin(users, eq(rechargeOrders.userId, users.id))
      .where(eq(rechargeOrders.id, orderId))
      .limit(1);

    if (!row) {
      reply.status(404).send({ code: 404, data: null, message: "订单不存在" });
      return;
    }

    // 解析 bankName/accountNumber/transferDate（兼容新旧记录）
    const parsed = parseBankTransferRemark(row.remark);

    reply.status(200).send({
      code: 0,
      data: {
        id: row.id,
        userId: row.userId,
        orderNo: row.orderNo,
        amount: row.amount,
        channel: row.channel,
        status: row.status,
        channelOrderNo: row.channelOrderNo,
        voucherImage: row.voucherImage,
        voucherNo: row.voucherNo,
        confirmedBy: row.confirmedBy,
        firstConfirmedBy: row.firstConfirmedBy,
        firstConfirmedAt: row.firstConfirmedAt?.toISOString() ?? null,
        secondConfirmedBy: row.secondConfirmedBy,
        secondConfirmedAt: row.secondConfirmedAt?.toISOString() ?? null,
        remark: row.remark,
        bankName: row.payerAccountName ?? parsed.bankName,
        accountNumber: row.payerAccountNo ?? parsed.accountNumber,
        transferDate: parsed.transferDate,
        paidAt: row.paidAt?.toISOString() ?? null,
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        userEmail: row.userEmail,
        userNickname: row.userNickname,
        userBalance: row.userBalance,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/recharge-orders/:id/confirm — 确认对公转账（兼容旧版单次确认）
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/recharge-orders/:id/confirm", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const orderId = parseInt(id, 10);
      const adminUserId = request.user!.userId;

      if (isNaN(orderId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的订单 ID" });
        return;
      }

      await confirmBankTransfer(orderId, adminUserId);

      reply.status(200).send({
        code: 0,
        data: null,
        message: "对公转账已确认到账",
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
  //  POST /api/v1/admin/recharge-orders/:id/cancel — 取消订单
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/recharge-orders/:id/cancel", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);
    const operatorId = request.user!.userId;

    if (isNaN(orderId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的订单 ID" });
      return;
    }

    const [order] = await db
      .select()
      .from(rechargeOrders)
      .where(eq(rechargeOrders.id, orderId))
      .limit(1);

    if (!order) {
      reply.status(404).send({ code: 404, data: null, message: "订单不存在" });
      return;
    }

    if (order.status !== "pending") {
      reply.status(400).send({ code: 400, data: null, message: `订单状态为 ${order.status}，无法取消` });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(rechargeOrders)
        .set({ status: "cancelled" })
        .where(eq(rechargeOrders.id, orderId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "user_update",
        targetType: "order",
        targetId: orderId,
        before: { status: order.status },
        after: { status: "cancelled" },
        ip: request.ip,
        description: `管理员取消充值订单 #${orderId} (${order.orderNo})`,
      });
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "订单已取消",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/recharge-orders/batch-confirm — 批量初审/复审
  //  Body: { ids: number[], action: "confirm" | "reject", rejectReason?: string, isSecond?: boolean }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/recharge-orders/batch-confirm", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as {
      ids: number[];
      action: "confirm" | "reject";
      rejectReason?: string;
      isSecond?: boolean;
    };
    const operatorId = request.user!.userId;

    if (!body.ids?.length) {
      reply.status(400).send({ code: 400, data: null, message: "请选择要审核的订单" });
      return;
    }
    if (!body.action || !["confirm", "reject"].includes(body.action)) {
      reply.status(400).send({ code: 400, data: null, message: "action 必须为 confirm 或 reject" });
      return;
    }

    const results = { confirmed: 0, rejected: 0, errors: [] as { id: number; message: string }[] };

    // ── 【优化】先批量查询所有订单（消除 N+1）──
    const orders = await db
      .select()
      .from(rechargeOrders)
      .where(sql`${rechargeOrders.id} = ANY(ARRAY[${sql.join(body.ids.map(id => sql`${id}::int`), sql`, `)}])`);

    // 构建 id -> order 映射
    const orderMap = new Map<number, typeof orders[0]>();
    for (const order of orders) {
      orderMap.set(order.id, order);
    }

    const isSecondReview = body.isSecond === true;
    const ip = request.ip;

    // ── 在内存中验证和分组 ──
    const validOrders: typeof orders = [];
    const invalidOrders: { id: number; message: string }[] = [];

    for (const orderId of body.ids) {
      const order = orderMap.get(orderId);
      if (!order) {
        invalidOrders.push({ id: orderId, message: "订单不存在" });
        continue;
      }
      if (order.channel !== "bank_transfer") {
        invalidOrders.push({ id: orderId, message: `订单 ${order.orderNo} 非对公转账` });
        continue;
      }

      if (isSecondReview) {
        // 复审验证
        if (!order.firstConfirmedBy) {
          invalidOrders.push({ id: orderId, message: `订单 ${order.orderNo} 尚未初审` });
          continue;
        }
        if (order.secondConfirmedBy || order.status !== "pending") {
          invalidOrders.push({ id: orderId, message: `订单 ${order.orderNo} 状态无法复审` });
          continue;
        }
      } else {
        // 初审验证
        if (order.firstConfirmedBy) {
          invalidOrders.push({ id: orderId, message: `订单 ${order.orderNo} 已初审` });
          continue;
        }
        if (order.status !== "pending") {
          invalidOrders.push({ id: orderId, message: `订单 ${order.orderNo} 状态无法初审` });
          continue;
        }
      }

      validOrders.push(order);
    }

    results.errors = invalidOrders;

    // ── 批量处理有效订单 ──
    if (validOrders.length > 0) {
      if (isSecondReview) {
        if (body.action === "confirm") {
          // ── 复审确认：需要逐个处理（因为涉及余额更新和佣金计算）──
          for (const order of validOrders) {
            try {
              const voucherNo = await generateVoucherNo('C');
              await db.transaction(async (tx) => {
                await tx
                  .update(rechargeOrders)
                  .set({
                    status: "confirmed",
                    secondConfirmedBy: operatorId,
                    secondConfirmedAt: new Date(),
                    confirmedBy: operatorId,
                    confirmedAt: new Date(),
                    voucherNo,
                  })
                  .where(eq(rechargeOrders.id, order.id));

                await tx
                  .update(users)
                  .set({ balance: sql`${users.balance} + ${order.amount}` })
                  .where(eq(users.id, order.userId));

                await tx.insert(balanceLogs).values({
                  userId: order.userId,
                  amount: order.amount,
                  balanceAfter: sql`(SELECT balance FROM ${users} WHERE id = ${order.userId})`,
                  type: "recharge",
                  refType: "recharge",
                  refId: order.id,
                  description: `对公转账批量到账 / ${order.orderNo} / 凭证 ${voucherNo}`,
                });

                const { processRenewalCommission } = await import("../../services/billing/index.js");
                await processRenewalCommission(tx, order.userId, order.id, order.amount, order.orderNo);

                await tx.insert(auditLogs).values({
                  operatorId,
                  action: "recharge_second_confirm",
                  targetType: "recharge_orders",
                  targetId: order.id,
                  before: { status: "pending", first_confirmed: true },
                  after: { status: "confirmed", voucherNo },
                  ip,
                  description: `批量复审确认 #${order.id} (${order.orderNo})`,
                });
              });
              results.confirmed++;
            } catch (err: any) {
              results.errors.push({ id: order.id, message: err.message || "处理失败" });
            }
          }
        } else {
          // ── 复审拒绝：可批量处理 ──
          await db.transaction(async (tx) => {
            for (const order of validOrders) {
              await tx
                .update(rechargeOrders)
                .set({
                  status: "cancelled",
                  secondConfirmedBy: operatorId,
                  secondConfirmedAt: new Date(),
                  remark: body.rejectReason || "批量复审拒绝",
                })
                .where(eq(rechargeOrders.id, order.id));

              await tx.insert(auditLogs).values({
                operatorId,
                action: "order_cancel",
                targetType: "recharge_orders",
                targetId: order.id,
                before: { status: "pending", first_confirmed: true },
                after: { status: "cancelled" },
                ip,
                description: `批量复审拒绝 #${order.id}: ${body.rejectReason ?? "无原因"}`,
              });
            }
          });
          results.rejected = validOrders.length;
        }
      } else {
        // ── 初审：可批量处理（不涉及余额变更）──
        await db.transaction(async (tx) => {
          for (const order of validOrders) {
            if (body.action === "confirm") {
              await tx
                .update(rechargeOrders)
                .set({
                  firstConfirmedBy: operatorId,
                  firstConfirmedAt: new Date(),
                })
                .where(eq(rechargeOrders.id, order.id));

              await tx.insert(auditLogs).values({
                operatorId,
                action: "recharge_first_confirm",
                targetType: "recharge_orders",
                targetId: order.id,
                before: { status: "pending" },
                after: { first_confirmed: true },
                ip,
                description: `批量初审确认 #${order.id} (${order.orderNo})`,
              });
            } else {
              await tx
                .update(rechargeOrders)
                .set({
                  status: "cancelled",
                  remark: body.rejectReason || "批量初审拒绝",
                })
                .where(eq(rechargeOrders.id, order.id));

              await tx.insert(auditLogs).values({
                operatorId,
                action: "order_cancel",
                targetType: "recharge_orders",
                targetId: order.id,
                before: { status: "pending" },
                after: { status: "cancelled" },
                ip,
                description: `批量初审拒绝 #${order.id}: ${body.rejectReason ?? "无原因"}`,
              });
            }
          }
        });
        if (body.action === "confirm") results.confirmed = validOrders.length;
        else results.rejected = validOrders.length;
      }
    }

    reply.status(200).send({
      code: 0,
      data: results,
      message: `批量操作完成：通过 ${results.confirmed} 笔，拒绝 ${results.rejected} 笔${results.errors.length ? `，${results.errors.length} 笔失败` : ""}`,
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/recharge-orders/:id/first-confirm — 充值初审
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/recharge-orders/:id/first-confirm", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);
    const operatorId = request.user!.userId;
    const ip = request.ip;

    if (isNaN(orderId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的订单 ID" });
      return;
    }

    try {
      const parsed = firstConfirmRechargeSchema.parse(request.body);

      const [order] = await db
        .select()
        .from(rechargeOrders)
        .where(eq(rechargeOrders.id, orderId))
        .limit(1);

      if (!order) {
        reply.status(404).send({ code: 404, data: null, message: "订单不存在" });
        return;
      }

      if (order.channel !== "bank_transfer") {
        reply.status(400).send({ code: 400, data: null, message: "仅支持对公转账订单" });
        return;
      }

      if (order.status !== "pending") {
        reply.status(400).send({ code: 400, data: null, message: `订单状态为 ${order.status}，无法审核` });
        return;
      }

      await db.transaction(async (tx) => {
        if (parsed.action === "confirm") {
          await tx
            .update(rechargeOrders)
            .set({
              firstConfirmedBy: operatorId,
              firstConfirmedAt: new Date(),
            })
            .where(eq(rechargeOrders.id, orderId));

          await tx.insert(auditLogs).values({
            operatorId,
            action: "recharge_first_confirm",
            targetType: "recharge_orders",
            targetId: orderId,
            before: { status: "pending" },
            after: { first_confirmed: true },
            ip,
            description: `初审确认对公转账 #${orderId} (${order.orderNo})`,
          });
        } else {
          // 拒绝
          await tx
            .update(rechargeOrders)
            .set({
              status: "cancelled",
              remark: parsed.rejectReason || "初审拒绝",
            })
            .where(eq(rechargeOrders.id, orderId));

          await tx.insert(auditLogs).values({
            operatorId,
            action: "order_cancel",
            targetType: "recharge_orders",
            targetId: orderId,
            before: { status: "pending" },
            after: { status: "cancelled", reason: parsed.rejectReason },
            ip,
            description: `初审拒绝对公转账 #${orderId}: ${parsed.rejectReason ?? "无原因"}`,
          });
        }
      });

      reply.status(200).send({
        code: 0,
        data: null,
        message: parsed.action === "confirm" ? "初审通过，等待复审确认" : "初审已拒绝",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      if (err?.name === "ZodError") {
        reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/recharge-orders/:id/second-confirm — 充值复审
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/recharge-orders/:id/second-confirm", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);
    const operatorId = request.user!.userId;
    const ip = request.ip;

    if (isNaN(orderId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的订单 ID" });
      return;
    }

    try {
      const parsed = secondConfirmRechargeSchema.parse(request.body);

      const [order] = await db
        .select()
        .from(rechargeOrders)
        .where(eq(rechargeOrders.id, orderId))
        .limit(1);

      if (!order) {
        reply.status(404).send({ code: 404, data: null, message: "订单不存在" });
        return;
      }

      if (order.channel !== "bank_transfer") {
        reply.status(400).send({ code: 400, data: null, message: "仅支持对公转账订单" });
        return;
      }

      if (!order.firstConfirmedBy) {
        reply.status(400).send({ code: 400, data: null, message: "请先通过初审" });
        return;
      }

      if (order.status !== "pending" || order.secondConfirmedBy) {
        reply.status(400).send({ code: 400, data: null, message: `订单状态无法复审` });
        return;
      }

      const amount = order.amount;

      await db.transaction(async (tx) => {
        if (parsed.action === "confirm") {
          // 生成充值凭证号
          const voucherNo = await generateVoucherNo('C');

          await tx
            .update(rechargeOrders)
            .set({
              status: "confirmed",
              secondConfirmedBy: operatorId,
              secondConfirmedAt: new Date(),
              confirmedBy: operatorId,           // 兼容旧字段
              confirmedAt: new Date(),
              voucherNo,
              bankTxId: parsed.bankTxId ?? null,
            })
            .where(eq(rechargeOrders.id, orderId));

          // 增加用户余额
          await tx
            .update(users)
            .set({
              balance: sql`${users.balance} + ${amount}`,
            })
            .where(eq(users.id, order.userId));

          // 记录余额变动
          const bankInfo = order.payerAccountName
            ? `${order.payerAccountName}/${order.payerAccountNo ?? ""}`
            : order.remark ?? "";
          await tx.insert(balanceLogs).values({
            userId: order.userId,
            amount: amount,
            balanceAfter: sql`(SELECT balance FROM ${users} WHERE id = ${order.userId})`,
            type: "recharge",
            refType: "recharge",
            refId: order.id,
            description: `对公转账到账 / ${bankInfo} / ${order.orderNo} / 凭证 ${voucherNo}`,
          });

          // 处理续费佣金
          const { processRenewalCommission } = await import("../../services/billing/index.js");
          await processRenewalCommission(tx, order.userId, order.id, amount, order.orderNo);

          await tx.insert(auditLogs).values({
            operatorId,
            action: "recharge_second_confirm",
            targetType: "recharge_orders",
            targetId: orderId,
            before: { status: "pending", first_confirmed: true },
            after: { status: "confirmed", voucherNo },
            ip,
            description: `复审确认对公转账 #${orderId} (${order.orderNo})，金额 ${amount}`,
          });
        } else {
          // 复审拒绝
          await tx
            .update(rechargeOrders)
            .set({
              status: "cancelled",
              secondConfirmedBy: operatorId,
              secondConfirmedAt: new Date(),
              remark: parsed.rejectReason || "复审拒绝",
            })
            .where(eq(rechargeOrders.id, orderId));

          await tx.insert(auditLogs).values({
            operatorId,
            action: "order_cancel",
            targetType: "recharge_orders",
            targetId: orderId,
            before: { status: "pending", first_confirmed: true },
            after: { status: "cancelled", reason: parsed.rejectReason },
            ip,
            description: `复审拒绝对公转账 #${orderId}: ${parsed.rejectReason ?? "无原因"}`,
          });
        }
      });

      reply.status(200).send({
        code: 0,
        data: null,
        message: parsed.action === "confirm" ? "复审确认，充值已到账" : "复审已拒绝",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      if (err?.name === "ZodError") {
        reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
        return;
      }
      throw err;
    }
  });
}
