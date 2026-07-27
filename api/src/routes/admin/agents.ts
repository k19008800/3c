// ============================================================
//  3cloud (3C) — 代理商管理路由（管理员）
//  GET    /api/v1/admin/agents                              — 代理商列表
//  POST   /api/v1/admin/agents                              — 创建代理商
//  PATCH  /api/v1/admin/agents/:id                          — 更新代理商
//  GET    /api/v1/admin/agents/:agentId/clients              — 查看代理商客户列表
//  POST   /api/v1/admin/agents/:agentId/clients              — 绑定客户到代理商
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { auditLogs, agents, withdrawOrders } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import {
  listAllAgents,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  listAgentClientsForAdmin,
  bindAgentClient,
} from "../../services/agent-core.js";
import {
  getAgentCommissionRules,
  upsertCommissionRule,
  deleteCommissionRule,
  setAgentParent,
} from "../../services/agent-commission.js";
import {
  updateSettlementConfig,
  getSettlementConfig,
  settleAgentManually,
  getSettlementHistory,
} from "../../services/agent-settlement.js";
import {
  createAgentSchema,
  updateAgentSchema,
  bindAgentClientSchema,
  upsertCommissionRuleSchema,
  setAgentParentSchema,
} from "../../schemas.js";
import type {
  CreateAgentInput,
  BindAgentClientInput,
  UpsertCommissionRuleInput,
} from "../../schemas.js";

export async function adminAgentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/agents/stats — 代理商统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/agents/stats", {
    preHandler: [requirePerm(Perm.AGENT_LIST)],
  }, async (request, reply) => {
    const db = getDb();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 总代理数 + 总佣金
    const [summary] = await db.select({
      totalAgents: sql<number>`count(*)::int`,
      totalCommission: sql<string>`coalesce(sum(${agents.totalCommission}::numeric), 0)`,
      pendingWithdraw: sql<string>`coalesce(sum(${agents.pendingWithdraw}::numeric), 0)`,
    }).from(agents);

    // 本月提现统计（代理商提现）
    const [monthWithdraw] = await db.select({
      total: sql<string>`coalesce(sum(${withdrawOrders.amount}::numeric), 0)`,
    }).from(withdrawOrders)
      .where(and(
        sql`${withdrawOrders.agentId} IS NOT NULL`, // 代理商提现
        eq(withdrawOrders.status, "paid"), // 已完成提现
        gte(withdrawOrders.createdAt, monthStart),
      ));

    reply.status(200).send({
      code: 0,
      data: {
        totalAgents: summary.totalAgents,
        totalCommission: summary.totalCommission,
        monthPendingWithdraw: summary.pendingWithdraw,
        monthWithdrawn: monthWithdraw?.total ?? "0",
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/agents — 代理商列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/agents", {
    preHandler: [requirePerm(Perm.AGENT_LIST)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        status?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const result = await listAllAgents(page, pageSize, query.status);

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
  //  GET /api/v1/admin/agents/:id — 单个代理商详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/agents/:id", {
    preHandler: [requirePerm(Perm.AGENT_LIST)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const agentId = parseInt(id, 10);

      if (isNaN(agentId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const result = await getAgentById(agentId);

      if (!result) {
        reply.status(404).send({ code: 404, data: null, message: "代理商不存在" });
        return;
      }

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
  //  POST /api/v1/admin/agents — 创建代理商
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/agents", {
    preHandler: [requirePerm(Perm.AGENT_MANAGE)],
  }, async (request, reply) => {
    try {
      const parsed = createAgentSchema.parse(request.body);
      const result = await createAgent(
        request.user!.userId,
        parsed.userId,
        parsed.initialSaleRate,
      );

      const db = getDb();
      await db.insert(auditLogs).values({
        operatorId: request.user!.userId,
        action: "agent_create",
        targetType: "agent",
        targetId: result.id,
        after: { userId: parsed.userId, initialSaleRate: parsed.initialSaleRate },
        ip: request.ip,
        description: `创建代理商: user#${parsed.userId}`,
      });

      reply.status(200).send({
        code: 0,
        data: result,
        message: "代理商创建成功",
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
  //  PATCH /api/v1/admin/agents/:id — 更新代理商
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/agents/:id", {
    preHandler: [requirePerm(Perm.AGENT_MANAGE)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const agentId = parseInt(id, 10);

      if (isNaN(agentId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const parsed = updateAgentSchema.parse(request.body);
      const result = await updateAgent(agentId, {
        status: parsed.status,
      });

      const db = getDb();
      await db.insert(auditLogs).values({
        operatorId: request.user!.userId,
        action: "agent_update",
        targetType: "agent",
        targetId: agentId,
        after: { status: parsed.status },
        ip: request.ip,
        description: `编辑代理商 #${agentId}: status → ${parsed.status}`,
      });

      reply.status(200).send({
        code: 0,
        data: result,
        message: "代理商已更新",
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
  //  GET /api/v1/admin/agents/:agentId/clients — 查看代理商客户列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/agents/:agentId/clients", {
    preHandler: [requirePerm(Perm.AGENT_LIST)],
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as { agentId: string };
      const id = parseInt(agentId, 10);

      if (isNaN(id)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const query = request.query as { page?: string; pageSize?: string };
      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const result = await listAgentClientsForAdmin(id, page, pageSize);

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
  //  POST /api/v1/admin/agents/:agentId/clients — 绑定客户到代理商
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/agents/:agentId/clients", {
    preHandler: [requirePerm(Perm.AGENT_MANAGE)],
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as { agentId: string };
      const id = parseInt(agentId, 10);

      if (isNaN(id)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const parsed = bindAgentClientSchema.parse(request.body);
      const result = await bindAgentClient(request.user!.userId, id, parsed.clientUserId);

      const db = getDb();
      await db.insert(auditLogs).values({
        operatorId: request.user!.userId,
        action: "agent_update",
        targetType: "agent",
        targetId: id,
        after: { clientUserId: parsed.clientUserId },
        ip: request.ip,
        description: `代理商 #${id}: 绑定客户 user#${parsed.clientUserId}`,
      });

      reply.status(200).send({
        code: 0,
        data: result,
        message: "客户绑定成功",
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
  //  GET /api/v1/admin/agents/:agentId/rules — 获取佣金规则列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/agents/:agentId/rules", {
    preHandler: [requirePerm(Perm.AGENT_LIST)],
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as { agentId: string };
      const id = parseInt(agentId, 10);

      if (isNaN(id)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const result = await getAgentCommissionRules(id);

      reply.status(200).send({
        code: 0,
        data: { list: result },
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
  //  POST /api/v1/admin/agents/:agentId/rules — 创建/更新佣金规则
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/agents/:agentId/rules", {
    preHandler: [requirePerm(Perm.AGENT_MANAGE)],
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as { agentId: string };
      const id = parseInt(agentId, 10);

      if (isNaN(id)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const parsed = upsertCommissionRuleSchema.parse(request.body);
      const result = await upsertCommissionRule(id, parsed, request.user!.userId);

      const db = getDb();
      await db.insert(auditLogs).values({
        operatorId: request.user!.userId,
        action: "agent_update",
        targetType: "agent",
        targetId: id,
        after: parsed,
        ip: request.ip,
        description: `代理用户 #${id}: 保存佣金规则`,
      });

      reply.status(200).send({
        code: 0,
        data: result,
        message: "佣金规则已保存",
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
  //  DELETE /api/v1/admin/agents/:agentId/rules/:ruleId — 删除佣金规则
  // ──────────────────────────────────────────────

  app.delete("/api/v1/admin/agents/:agentId/rules/:ruleId", {
    preHandler: [requirePerm(Perm.AGENT_MANAGE)],
  }, async (request, reply) => {
    try {
      const { agentId, ruleId } = request.params as { agentId: string; ruleId: string };
      const id = parseInt(agentId, 10);
      const rid = parseInt(ruleId, 10);

      if (isNaN(id) || isNaN(rid)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的参数" });
        return;
      }

      await deleteCommissionRule(id, rid, request.user!.userId);

      const db = getDb();
      await db.insert(auditLogs).values({
        operatorId: request.user!.userId,
        action: "agent_update",
        targetType: "agent",
        targetId: id,
        ip: request.ip,
        description: `代理用户 #${id}: 删除佣金规则 #${rid}`,
      });

      reply.status(200).send({
        code: 0,
        data: null,
        message: "佣金规则已删除",
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
  //  PATCH /api/v1/admin/agents/:agentId/parent — 设置上级代理商
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/agents/:agentId/parent", {
    preHandler: [requirePerm(Perm.AGENT_MANAGE)],
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as { agentId: string };
      const id = parseInt(agentId, 10);

      if (isNaN(id)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const parsed = setAgentParentSchema.parse(request.body);
      const result = await setAgentParent(id, parsed.parentAgentId, request.user!.userId);

      const db = getDb();
      await db.insert(auditLogs).values({
        operatorId: request.user!.userId,
        action: "agent_update",
        targetType: "agent",
        targetId: id,
        after: { parentAgentId: parsed.parentAgentId },
        ip: request.ip,
        description: `代理商 #${id}: ${parsed.parentAgentId ? `设上级为 agent#${parsed.parentAgentId}` : "解除上级"}`,
      });

      reply.status(200).send({
        code: 0,
        data: result,
        message: parsed.parentAgentId ? "上级代理商已设置" : "上级代理商已解除",
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
  //  DELETE /api/v1/admin/agents/:id — 删除代理商身份
  // ──────────────────────────────────────────────

  app.delete("/api/v1/admin/agents/:id", {
    preHandler: [requirePerm(Perm.AGENT_MANAGE)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const agentId = parseInt(id, 10);
      if (isNaN(agentId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }
      const result = await deleteAgent(request.user!.userId, agentId);

      const db = getDb();
      await db.insert(auditLogs).values({
        operatorId: request.user!.userId,
        action: "agent_update",
        targetType: "agent",
        targetId: agentId,
        ip: request.ip,
        description: `删除代理商 #${agentId}`,
      });

      reply.status(200).send({ code: 0, data: result, message: "代理商身份已删除" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/agents/:id/settlement-config — 获取结算设置
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/agents/:id/settlement-config", {
    preHandler: [requirePerm(Perm.AGENT_LIST)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const agentId = parseInt(id, 10);

      if (isNaN(agentId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const result = await getSettlementConfig(agentId);

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
  //  PUT /api/v1/admin/agents/:id/settlement-config — 更新结算周期
  // ──────────────────────────────────────────────

  app.put("/api/v1/admin/agents/:id/settlement-config", {
    preHandler: [requirePerm(Perm.AGENT_MANAGE)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const agentId = parseInt(id, 10);

      if (isNaN(agentId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const body = request.body as { settlementCycle?: string };

      if (!body.settlementCycle) {
        reply.status(400).send({ code: 400, data: null, message: "settlementCycle 必填" });
        return;
      }

      const result = await updateSettlementConfig(agentId, body.settlementCycle, request.user!.userId);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "结算周期已更新",
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
  //  POST /api/v1/admin/agents/:id/settle — 立即结算该代理商
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/agents/:id/settle", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const agentId = parseInt(id, 10);

      if (isNaN(agentId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const result = await settleAgentManually(agentId, request.user!.userId);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "结算成功",
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
  //  GET /api/v1/admin/agents/settlement-history — 结算历史
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/agents/settlement-history", {
    preHandler: [requirePerm(Perm.AGENT_LIST)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        agentId?: string;
        page?: string;
        pageSize?: string;
      };

      const agentId = parseInt(query.agentId ?? "", 10);
      if (isNaN(agentId)) {
        reply.status(400).send({ code: 400, data: null, message: "agentId 必填" });
        return;
      }

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const result = await getSettlementHistory(agentId, page, pageSize);

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
  //  POST /api/v1/admin/agents/:id/audit — 代理等级审核 (PRD 3.1)
  //  审核预备代理晋升为一级代理, 或一级代理晋升为高级代理
  //  请求体: { action: "approve" | "reject", level: "primary" | "advanced", remark?: string }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/agents/:id/audit", {
    preHandler: [requirePerm(Perm.AGENT_MANAGE)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const agentId = parseInt(id, 10);
      if (isNaN(agentId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const body = request.body as {
        action: "approve" | "reject";
        level?: "primary" | "advanced";
        remark?: string;
      };

      if (!["approve", "reject"].includes(body.action)) {
        reply.status(400).send({ code: 400, data: null, message: "action 必须为 approve 或 reject" });
        return;
      }

      if (body.action === "approve" && !body.level) {
        reply.status(400).send({ code: 400, data: null, message: "approve 时必须指定 level" });
        return;
      }

      const db = getDb();
      const [agent] = await db
        .select({ id: agents.id, level: agents.level, auditStatus: agents.auditStatus })
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);

      if (!agent) {
        reply.status(404).send({ code: 404, data: null, message: "代理商不存在" });
        return;
      }

      if (agent.auditStatus !== "pending") {
        reply.status(400).send({ code: 400, data: null, message: "该代理不在待审核状态" });
        return;
      }

      if (body.action === "approve") {
        await db
          .update(agents)
          .set({
            level: body.level as any,
            auditStatus: "approved",
            auditRemark: body.remark ?? null,
            auditedBy: request.user!.userId,
            auditedAt: new Date(),
          })
          .where(eq(agents.id, agentId));

        reply.status(200).send({
          code: 0,
          data: { agentId, level: body.level, auditStatus: "approved" },
          message: `代理已晋升为 ${body.level}`,
        });
      } else {
        await db
          .update(agents)
          .set({
            auditStatus: "rejected",
            auditRemark: body.remark ?? "审核未通过",
            auditedBy: request.user!.userId,
            auditedAt: new Date(),
          })
          .where(eq(agents.id, agentId));

        reply.status(200).send({
          code: 0,
          data: { agentId, auditStatus: "rejected" },
          message: "已拒绝代理晋升申请",
        });
      }
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
