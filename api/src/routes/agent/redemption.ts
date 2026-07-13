// ============================================================
//  3cloud (3C) — 代理端兑换码增强路由
//
//  GET    /api/v1/agent/redemption/templates       — 模板列表
//  POST   /api/v1/agent/redemption/templates       — 保存模板
//  POST   /api/v1/agent/redemption/batch-action    — 批量操作
//  GET    /api/v1/agent/redemption/export           — 导出
//  GET    /api/v1/agent/redemption/cost-analysis    — 成本分析
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, inArray, or } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  agents,
  redemptionBatches,
  redemptionCodes,
  redemptionLogs,
  codeTemplates,
} from "../../db/schema.js";
import { authenticateJWT, requireRole } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service.js";

// ── 兑换码脱敏 ──
function maskCode(code: string): string {
  if (code.length <= 8) return code.substring(0, 2) + "****" + code.slice(-2);
  return code.substring(0, 4) + "****" + code.slice(-4);
}

export async function agentRedemptionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/agent/redemption/templates — 模板列表
  // ════════════════════════════════════════════════════════════
  app.get("/api/v1/agent/redemption/templates", {
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;

        if (userRole !== "agent") {
          reply.status(403).send({ code: 403, data: null, message: "仅代理商可用" });
          return;
        }

        const templates = await db
          .select()
          .from(codeTemplates)
          .where(
            and(
              eq(codeTemplates.createdByType, "agent"),
              eq(codeTemplates.createdById, userId),
            ),
          )
          .orderBy(desc(codeTemplates.createdAt));

        reply.status(200).send({
          code: 0,
          data: templates,
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
  //  POST /api/v1/agent/redemption/templates — 保存模板
  // ════════════════════════════════════════════════════════════
  app.post("/api/v1/agent/redemption/templates", {
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;

        if (userRole !== "agent") {
          reply.status(403).send({ code: 403, data: null, message: "仅代理商可用" });
          return;
        }

        const body = request.body as {
          name?: string;
          tokenAmount?: string | number;
          validDays?: number;
          maxPerUser?: number;
          userScope?: string;
          remark?: string;
        };

        if (!body.name || !body.tokenAmount) {
          reply.status(400).send({ code: 400, data: null, message: "name 和 tokenAmount 必填" });
          return;
        }

        const [template] = await db
          .insert(codeTemplates)
          .values({
            name: String(body.name).trim(),
            type: "fixed_token",
            tokenAmount: String(body.tokenAmount),
            validDays: body.validDays ?? null,
            maxPerUser: body.maxPerUser ?? 1,
            userScope: body.userScope ?? "all",
            remark: body.remark ?? null,
            createdByType: "agent",
            createdById: userId,
          })
          .returning();

        reply.status(200).send({
          code: 0,
          data: template,
          message: "模板保存成功",
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
  //  POST /api/v1/agent/redemption/batch-action — 批量操作
  //  actions: disable | enable (批量停用/启用兑换码)
  // ════════════════════════════════════════════════════════════
  app.post("/api/v1/agent/redemption/batch-action", {
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;

        if (userRole !== "agent") {
          reply.status(403).send({ code: 403, data: null, message: "仅代理商可用" });
          return;
        }

        const body = request.body as {
          action: "disable" | "enable";
          codeIds?: number[];
          batchId?: number;
          allUnused?: boolean;  // 如果 true，操作该代理全部未使用码
        };

        if (!body.action || !["disable", "enable"].includes(body.action)) {
          reply.status(400).send({ code: 400, data: null, message: "action 必须为 disable 或 enable" });
          return;
        }

        if (!body.codeIds && !body.batchId && !body.allUnused) {
          reply.status(400).send({ code: 400, data: null, message: "请提供 codeIds, batchId 或 allUnused" });
          return;
        }

        // 找该代理创建的所有批次 ID
        const agentBatchesSub = db
          .select({ id: redemptionBatches.id })
          .from(redemptionBatches)
          .where(eq(redemptionBatches.creatorId, userId));

        // 构建条件
        const whereConditions: any[] = [
          eq(redemptionCodes.batchId, sql`ANY(${agentBatchesSub})`),
        ];

        if (body.codeIds && body.codeIds.length > 0) {
          whereConditions.push(inArray(redemptionCodes.id, body.codeIds));
        }
        if (body.batchId) {
          whereConditions.push(eq(redemptionCodes.batchId, body.batchId));
        }
        if (body.allUnused) {
          whereConditions.push(eq(redemptionCodes.status, "unused"));
        }

        const newStatus = body.action === "disable" ? "disabled" : "unused";
        const result = await db
          .update(redemptionCodes)
          .set({ status: newStatus as any })
          .where(and(...whereConditions))
          .returning({ id: redemptionCodes.id });

        const updatedCount = result.length;

        reply.status(200).send({
          code: 0,
          data: {
            action: body.action,
            updatedCount,
            codeIds: result.map((r) => r.id),
          },
          message: `批量${body.action === "disable" ? "停用" : "启用"}完成，共 ${updatedCount} 个`,
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
  //  GET /api/v1/agent/redemption/export — 导出自有兑换码
  //  返回 CSV 格式的可下载文件
  // ════════════════════════════════════════════════════════════
  app.get("/api/v1/agent/redemption/export", {
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;

        if (userRole !== "agent") {
          reply.status(403).send({ code: 403, data: null, message: "仅代理商可用" });
          return;
        }

        const query = request.query as { batchId?: string; status?: string };

        // 查代理批次
        const agentBatches = await db
          .select({ id: redemptionBatches.id })
          .from(redemptionBatches)
          .where(eq(redemptionBatches.creatorId, userId));

        const batchIds = agentBatches.map((b) => b.id);
        if (batchIds.length === 0) {
          reply.status(200).send({ code: 0, data: { csv: "兑换码,面额,状态,创建时间" }, message: "ok" });
          return;
        }

        const conditions: any[] = [inArray(redemptionCodes.batchId, batchIds)];
        if (query.batchId) conditions.push(eq(redemptionCodes.batchId, parseInt(query.batchId, 10)));
        if (query.status) conditions.push(eq(redemptionCodes.status, query.status as any));

        const codes = await db
          .select({
            code: redemptionCodes.code,
            amount: redemptionCodes.amount,
            status: redemptionCodes.status,
            createdAt: redemptionCodes.createdAt,
            batchName: redemptionBatches.name,
          })
          .from(redemptionCodes)
          .leftJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
          .where(and(...conditions))
          .orderBy(desc(redemptionCodes.createdAt));

        // 生成 CSV
        const header = "兑换码,面额,状态,批次名,创建时间";
        const rows = codes.map((c) =>
          [
            c.code,
            c.amount,
            c.status,
            c.batchName ?? "",
            c.createdAt.toISOString(),
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(","),
        );

        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", "attachment; filename=redemption-codes.csv");
        reply.status(200).send({
          code: 0,
          data: { csv: [header, ...rows].join("\n") },
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
  //  GET /api/v1/agent/redemption/cost-analysis — 成本效益分析
  //  面值/成本/补贴/ROI 展示
  // ════════════════════════════════════════════════════════════
  app.get("/api/v1/agent/redemption/cost-analysis", {
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;

        if (userRole !== "agent") {
          reply.status(403).send({ code: 403, data: null, message: "仅代理商可用" });
          return;
        }

        // 查该代理的批次
        const batches = await db
          .select({
            id: redemptionBatches.id,
            name: redemptionBatches.name,
            amount: redemptionBatches.amount,
            totalCount: redemptionBatches.totalCount,
            usedCount: redemptionBatches.usedCount,
            status: redemptionBatches.status,
            createdAt: redemptionBatches.createdAt,
          })
          .from(redemptionBatches)
          .where(eq(redemptionBatches.creatorId, userId))
          .orderBy(desc(redemptionBatches.createdAt));

        // 查该代理的余额信息
        const [agent] = await db
          .select({
            settledCommission: agents.settledCommission,
            redemptionLocked: agents.redemptionLocked,
          })
          .from(agents)
          .where(eq(agents.userId, userId))
          .limit(1);

        // 成本系数
        const COST_RATE = 0.85;

        let totalFaceValue = 0;
        let totalUsed = 0;
        let totalCost = 0;
        let totalSubsidy = 0;

        const batchDetails = batches.map((b) => {
          const faceValue = parseFloat(b.amount as string) * b.totalCount;
          const usedToken = parseFloat(b.amount as string) * b.usedCount;
          const costAmount = usedToken * COST_RATE;
          const subsidy = usedToken - costAmount;
          const usageRate = b.totalCount > 0 ? (b.usedCount / b.totalCount) * 100 : 0;

          totalFaceValue += faceValue;
          totalUsed += usedToken;
          totalCost += costAmount;
          totalSubsidy += subsidy;

          return {
            batchId: b.id,
            batchName: b.name,
            totalCount: b.totalCount,
            usedCount: b.usedCount,
            usageRate: Math.round(usageRate * 100) / 100,
            faceValue: Math.round(faceValue),
            costAmount: Math.round(costAmount),
            subsidy: Math.round(subsidy),
            status: b.status,
          };
        });

        const lockedAmount = parseFloat(agent?.redemptionLocked as string ?? "0");

        reply.status(200).send({
          code: 0,
          data: {
            summary: {
              totalBatches: batches.length,
              totalFaceValue: Math.round(totalFaceValue),
              totalUsedToken: Math.round(totalUsed),
              totalCost: Math.round(totalCost),
              totalSubsidy: Math.round(totalSubsidy),
              overallUsageRate: totalFaceValue > 0
                ? Math.round((totalUsed / totalFaceValue) * 10000) / 100
                : 0,
              lockedAmount: Math.round(lockedAmount),
            },
            batches: batchDetails,
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
}
