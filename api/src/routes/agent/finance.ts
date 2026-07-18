// ============================================================
//  3cloud (3C) — 代理端财务路由
//
//  GET /api/v1/agent/finance/settlement — 查看自己的结算单
//  GET /api/v1/agent/finance/ledger      — 查看自己的资金流水
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, asc, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  agents,
  users,
  agentBalanceLedger,
  redemptionBatches,
} from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";

export async function agentFinanceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/agent/finance/settlement — 查看结算单
  // ════════════════════════════════════════════════════════════
  app.get("/api/v1/agent/finance/settlement", {
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;

        if (userRole !== "agent") {
          reply.status(403).send({ code: 403, data: null, message: "仅代理商可用" });
          return;
        }

        const [agent] = await db
          .select({
            id: agents.id,
            settledCommission: agents.settledCommission,
            pendingWithdraw: agents.pendingWithdraw,
            frozenAmount: agents.frozenAmount,
            redemptionLocked: agents.redemptionLocked,
          })
          .from(agents)
          .where(eq(agents.userId, userId))
          .limit(1);

        if (!agent) {
          reply.status(400).send({ code: 400, data: null, message: "代理商信息不存在" });
          return;
        }

        const settled = parseFloat(agent.settledCommission as string ?? "0");
        const pending = parseFloat(agent.pendingWithdraw as string ?? "0");
        const frozen = parseFloat(agent.frozenAmount as string ?? "0");
        const locked = parseFloat(agent.redemptionLocked as string ?? "0");
        const available = settled - pending - frozen - locked;

        // 最近结算周期流水（最近30天）
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentLedger = await db
          .select()
          .from(agentBalanceLedger)
          .where(
            and(
              eq(agentBalanceLedger.agentId, agent.id),
              sql`${agentBalanceLedger.createdAt} >= ${thirtyDaysAgo}::timestamptz`,
            ),
          )
          .orderBy(desc(agentBalanceLedger.createdAt))
          .limit(50);

        // 汇总
        let monthDeduction = 0;
        let monthFreeze = 0;
        let monthUnfreeze = 0;
        for (const e of recentLedger) {
          if (e.changeType === "deduction") monthDeduction += e.amount;
          else if (e.changeType === "freeze") monthFreeze += e.amount;
          else if (e.changeType === "unfreeze" || e.changeType === "refund") monthUnfreeze += e.amount;
        }

        reply.status(200).send({
          code: 0,
          data: {
            account: {
              settledCommission: settled.toFixed(6),
              pendingWithdraw: pending.toFixed(6),
              frozenAmount: frozen.toFixed(6),
              redemptionLocked: locked.toFixed(6),
              available: Math.max(0, available).toFixed(6),
            },
            monthSummary: {
              deduction: monthDeduction,
              freeze: monthFreeze,
              unfreeze: monthUnfreeze,
              netChange: monthUnfreeze - monthDeduction - monthFreeze,
            },
            recentEntries: recentLedger.map((e) => ({
              id: e.id,
              balanceType: e.balanceType,
              changeType: e.changeType,
              amount: e.amount,
              balanceBefore: e.balanceBefore,
              balanceAfter: e.balanceAfter,
              refType: e.refType,
              remark: e.remark,
              createdAt: e.createdAt.toISOString(),
            })),
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
    },
  });

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/agent/finance/ledger — 资金流水
  // ════════════════════════════════════════════════════════════
  app.get("/api/v1/agent/finance/ledger", {
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;

        if (userRole !== "agent") {
          reply.status(403).send({ code: 403, data: null, message: "仅代理商可用" });
          return;
        }

        const [agent] = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.userId, userId))
          .limit(1);

        if (!agent) {
          reply.status(400).send({ code: 400, data: null, message: "代理商信息不存在" });
          return;
        }

        const query = request.query as {
          page?: string;
          pageSize?: string;
          balanceType?: string;
          changeType?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
        const offset = (page - 1) * pageSize;

        const conditions: any[] = [eq(agentBalanceLedger.agentId, agent.id)];
        if (query.balanceType) conditions.push(eq(agentBalanceLedger.balanceType, query.balanceType));
        if (query.changeType) conditions.push(eq(agentBalanceLedger.changeType, query.changeType));

        const [totalResult] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(agentBalanceLedger)
          .where(and(...conditions));

        const rows = await db
          .select()
          .from(agentBalanceLedger)
          .where(and(...conditions))
          .orderBy(desc(agentBalanceLedger.createdAt))
          .limit(pageSize)
          .offset(offset);

        reply.status(200).send({
          code: 0,
          data: {
            list: rows.map((r) => ({
              id: r.id,
              balanceType: r.balanceType,
              changeType: r.changeType,
              amount: r.amount,
              balanceBefore: r.balanceBefore,
              balanceAfter: r.balanceAfter,
              refType: r.refType,
              refId: r.refId,
              remark: r.remark,
              createdAt: r.createdAt.toISOString(),
            })),
            total: totalResult?.total ?? 0,
            page,
            pageSize,
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
    },
  });

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/agent/finance/settlement/export — CSV 导出资金流水
  //  params: period (2026-07), startDate, endDate (可选, 覆盖 period)
  // ════════════════════════════════════════════════════════════
  app.get("/api/v1/agent/finance/settlement/export", {
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;

        if (userRole !== "agent") {
          reply.status(403).send({ code: 403, data: null, message: "仅代理商可用" });
          return;
        }

        const [agent] = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.userId, userId))
          .limit(1);

        if (!agent) {
          reply.status(400).send({ code: 400, data: null, message: "代理商信息不存在" });
          return;
        }

        const q = request.query as {
          period?: string;
          startDate?: string;
          endDate?: string;
        };

        // 日期范围：优先 startDate/endDate，否则按 period 计算整月
        let start: Date;
        let end: Date;
        if (q.startDate) {
          start = new Date(q.startDate);
        } else if (q.period) {
          const [year, month] = q.period.split("-").map(Number);
          start = new Date(year, month - 1, 1);
        } else {
          start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        }
        if (q.endDate) {
          end = new Date(q.endDate);
          end.setHours(23, 59, 59, 999);
        } else if (q.period) {
          const [year, month] = q.period.split("-").map(Number);
          end = new Date(year, month, 0, 23, 59, 59, 999);
        } else {
          end = new Date();
        }

        const conditions: any[] = [
          eq(agentBalanceLedger.agentId, agent.id),
          gte(agentBalanceLedger.createdAt, start),
          lte(agentBalanceLedger.createdAt, end),
        ];

        const rows = await db
          .select()
          .from(agentBalanceLedger)
          .where(and(...conditions))
          .orderBy(asc(agentBalanceLedger.createdAt));

        // 生成 CSV（按时间正序排列）
        const BOM = "\uFEFF";
        const headers = ["时间", "类型", "余额类型", "金额(元)", "变更前(元)", "变更后(元)", "关联类型", "备注"];
        const changeLabel: Record<string, string> = {
          deduction: "扣费", freeze: "冻结", unfreeze: "解冻", refund: "退款",
        };
        const balanceLabel: Record<string, string> = {
          available: "可用余额", frozen: "冻结余额",
        };

        const csvRows = rows.map((r) => [
          r.createdAt.toISOString(),
          changeLabel[r.changeType] || r.changeType,
          balanceLabel[r.balanceType] || r.balanceType,
          (r.amount / 1_000_000).toFixed(4),
          (r.balanceBefore / 1_000_000).toFixed(4),
          (r.balanceAfter / 1_000_000).toFixed(4),
          r.refType || "",
          (r.remark || "").replace(/"/g, '""'),
        ]);

        const csv = BOM + [
          headers.join(","),
          ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
        ].join("\n");

        const periodLabel = q.period || start.toISOString().slice(0, 7);
        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="ledger_${periodLabel}.csv"`);
        reply.status(200).send(csv);
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });
}
