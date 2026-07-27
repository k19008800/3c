// ============================================================
//  3cloud (3C) — 代理商自我服务路由 (PRD 3.1)
//  POST   /api/v1/agent/upgrade-request   — 发起等级晋升申请
//  GET    /api/v1/agent/profile           — 获取代理信息（含等级）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { agents } from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import { getAgentByUserId } from "../../services/agent-helpers.js";

export async function agentSelfServiceRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  POST /api/v1/agent/upgrade-request — 代理晋升申请
  //  预备代理 → 一级代理, 一级代理 → 高级代理
  // ──────────────────────────────────────────────

  app.post("/api/v1/agent/upgrade-request", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const userId = request.user!.userId;
        const db = getDb();
        const agent = await getAgentByUserId(userId);

        if (agent.auditStatus === "pending") {
          throw new AppError("ALREADY_PENDING", "已有待审核的晋升申请", 400);
        }

        // 确定目标等级
        let targetLevel: string;
        if (agent.level === "preparatory") {
          targetLevel = "primary";
        } else if (agent.level === "primary") {
          // 检查是否有资格申请高级代理（月调用 > 100万Token）
          targetLevel = "advanced";
        } else {
          throw new AppError("NOT_ELIGIBLE", "当前等级不可申请晋升", 400);
        }

        await db
          .update(agents)
          .set({
            auditStatus: "pending",
            auditRemark: `申请晋升为 ${targetLevel}`,
          })
          .where(eq(agents.id, agent.id));

        reply.status(200).send({
          code: 0,
          data: { currentLevel: agent.level, targetLevel, auditStatus: "pending" },
          message: "晋升申请已提交，请等待管理员审核",
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

  // ──────────────────────────────────────────────
  //  GET /api/v1/agent/profile — 获取代理信息
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/profile", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const agent = await getAgentByUserId(request.user!.userId);

        reply.status(200).send({
          code: 0,
          data: {
            id: agent.id,
            userId: agent.userId,
            level: agent.level,
            auditStatus: agent.auditStatus,
            auditRemark: agent.auditRemark,
            status: agent.status,
            totalCommission: agent.totalCommission,
            settledCommission: agent.settledCommission,
            availableBalance: agent.settledCommission,
            pendingWithdraw: agent.pendingWithdraw,
            frozenAmount: agent.frozenAmount,
            minWithdrawAmount: agent.minWithdrawAmount,
            withdrawCooldownHours: agent.withdrawCooldownHours,
            withdrawFreezeDays: agent.withdrawFreezeDays,
            parentAgentId: agent.parentAgentId,
            teamDepth: agent.teamDepth,
            // 高级代理字段
            accountManager: agent.accountManager,
            prioritySupport: agent.prioritySupport,
            createdAt: agent.createdAt,
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
