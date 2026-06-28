// ============================================================
//  3cloud (3C) — 代理商管理路由（管理员）
//  GET    /api/v1/admin/agents                              — 代理商列表
//  POST   /api/v1/admin/agents                              — 创建代理商
//  PATCH  /api/v1/admin/agents/:id                          — 更新代理商
//  GET    /api/v1/admin/agents/:agentId/clients              — 查看代理商客户列表
//  POST   /api/v1/admin/agents/:agentId/clients              — 绑定客户到代理商
//  GET    /api/v1/admin/withdraws                           — 提现订单列表
//  POST   /api/v1/admin/withdraws/:id/review                 — 审核提现（兼容旧版）
//  POST   /api/v1/admin/withdraws/:id/first-review           — 提现初审
//  POST   /api/v1/admin/withdraws/:id/second-review          — 提现复审
//  POST   /api/v1/admin/withdraws/:id/mark-paid              — 标记已打款
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requireRole } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service.js";
import {
  listAllAgents,
  createAgent,
  updateAgent,
  listAllWithdraws,
  reviewWithdraw,
  firstReviewWithdraw,
  secondReviewWithdraw,
  markWithdrawAsPaid,
  listAgentClientsForAdmin,
  bindAgentClient,
} from "../../services/agent-service.js";
import {
  createAgentSchema,
  updateAgentSchema,
  reviewWithdrawSchema,
  firstReviewWithdrawSchema,
  secondReviewWithdrawSchema,
  markWithdrawPaidSchema,
  bindAgentClientSchema,
} from "../../schemas.js";
import type {
  CreateAgentInput,
  ReviewWithdrawInput,
  FirstReviewWithdrawInput,
  SecondReviewWithdrawInput,
  MarkWithdrawPaidInput,
  BindAgentClientInput,
} from "../../schemas.js";

export async function adminAgentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requireRole("super_admin", "admin"));

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/agents — 代理商列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/agents", async (request, reply) => {
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
  //  POST /api/v1/admin/agents — 创建代理商
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/agents", async (request, reply) => {
    try {
      const parsed = createAgentSchema.parse(request.body);
      const result = await createAgent(
        request.user!.userId,
        parsed.userId,
        parsed.commissionRate,
      );

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

  app.patch("/api/v1/admin/agents/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const agentId = parseInt(id, 10);

      if (isNaN(agentId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const parsed = updateAgentSchema.parse(request.body);
      const result = await updateAgent(agentId, {
        commissionRate: parsed.commissionRate,
        status: parsed.status,
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
  //  GET /api/v1/admin/withdraws — 提现订单列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/withdraws", async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        status?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const result = await listAllWithdraws(page, pageSize, query.status);

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
  //  POST /api/v1/admin/withdraws/:id/review — 审核提现（兼容旧版单审）
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/withdraws/:id/review", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const withdrawId = parseInt(id, 10);

      if (isNaN(withdrawId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的提现订单 ID" });
        return;
      }

      const parsed = reviewWithdrawSchema.parse(request.body);
      const result = await reviewWithdraw(
        request.user!.userId,
        withdrawId,
        parsed.action,
        parsed.rejectReason,
      );

      reply.status(200).send({
        code: 0,
        data: result,
        message: parsed.action === "approve" ? "提现已审核通过" : "提现已拒绝",
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
  //  POST /api/v1/admin/withdraws/:id/first-review — 提现初审
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/withdraws/:id/first-review", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const withdrawId = parseInt(id, 10);

      if (isNaN(withdrawId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的提现订单 ID" });
        return;
      }

      const parsed = firstReviewWithdrawSchema.parse(request.body);
      const result = await firstReviewWithdraw(
        request.user!.userId,
        withdrawId,
        parsed.action,
        parsed.rejectReason,
      );

      reply.status(200).send({
        code: 0,
        data: result,
        message: parsed.action === "approve" ? "初审通过，等待复审" : "初审已拒绝",
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
  //  POST /api/v1/admin/withdraws/:id/second-review — 提现复审
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/withdraws/:id/second-review", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const withdrawId = parseInt(id, 10);

      if (isNaN(withdrawId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的提现订单 ID" });
        return;
      }

      const parsed = secondReviewWithdrawSchema.parse(request.body);
      const result = await secondReviewWithdraw(
        request.user!.userId,
        withdrawId,
        parsed.action,
        parsed.rejectReason,
        parsed.bankVoucherUrl,
      );

      reply.status(200).send({
        code: 0,
        data: result,
        message: parsed.action === "approve" ? "复审通过，等待打款" : "复审已拒绝",
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
  //  POST /api/v1/admin/withdraws/:id/mark-paid — 标记已打款
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/withdraws/:id/mark-paid", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const withdrawId = parseInt(id, 10);

      if (isNaN(withdrawId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的提现订单 ID" });
        return;
      }

      const parsed = markWithdrawPaidSchema.parse(request.body ?? {});
      const result = await markWithdrawAsPaid(
        request.user!.userId,
        withdrawId,
        parsed.bankVoucherUrl,
      );

      reply.status(200).send({
        code: 0,
        data: result,
        message: "已标记为已打款",
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

  app.get("/api/v1/admin/agents/:agentId/clients", async (request, reply) => {
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

  app.post("/api/v1/admin/agents/:agentId/clients", async (request, reply) => {
    try {
      const { agentId } = request.params as { agentId: string };
      const id = parseInt(agentId, 10);

      if (isNaN(id)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const parsed = bindAgentClientSchema.parse(request.body);
      const result = await bindAgentClient(request.user!.userId, id, parsed.clientUserId);

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
}
