// ============================================================
//  3cloud (3C) — 团队管理路由
//  POST   /api/v1/team               — 创建团队
//  GET    /api/v1/team               — 获取我的团队信息
//  POST   /api/v1/team/invite        — 邀请成员
//  DELETE /api/v1/team/members/:userId — 移除成员
//  PATCH  /api/v1/team/members/:userId — 更新成员
//  POST   /api/v1/team/leave         — 退出团队
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../middleware/auth.js";
import { AppError } from "../services/auth-service.js";
import {
  createTeam,
  getTeamInfo,
  inviteMember,
  removeMember,
  updateMember,
  leaveTeam,
} from "../services/team-service.js";
import {
  createTeamSchema,
  inviteTeamMemberSchema,
  updateTeamMemberSchema,
} from "../schemas.js";
import type {
  CreateTeamInput,
  InviteTeamMemberInput,
  UpdateTeamMemberInput,
} from "../schemas.js";

export async function teamRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  POST /api/v1/team — 创建团队
  // ──────────────────────────────────────────────

  app.post("/api/v1/team", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const parsed = createTeamSchema.parse(request.body);
        const result = await createTeam(request.user!.userId, parsed.name);

        reply.status(200).send({
          code: 0,
          data: result,
          message: "团队创建成功",
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
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/team — 获取我的团队信息
  // ──────────────────────────────────────────────

  app.get("/api/v1/team", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const result = await getTeamInfo(request.user!.userId);

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
    },
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/team/invite — 邀请成员
  // ──────────────────────────────────────────────

  app.post("/api/v1/team/invite", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const parsed = inviteTeamMemberSchema.parse(request.body);
        const result = await inviteMember(
          request.user!.userId,
          parsed.email,
          parsed.role as "team_admin" | "team_member",
          parsed.quotaBalance,
        );

        reply.status(200).send({
          code: 0,
          data: result,
          message: "邀请成功",
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
    },
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/v1/team/members/:userId — 移除成员
  // ──────────────────────────────────────────────

  app.delete("/api/v1/team/members/:userId", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const { userId } = request.params as { userId: string };
        const targetUserId = parseInt(userId, 10);

        if (isNaN(targetUserId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
          return;
        }

        await removeMember(request.user!.userId, targetUserId);

        reply.status(200).send({
          code: 0,
          data: null,
          message: "成员已移除",
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
  //  PATCH /api/v1/team/members/:userId — 更新成员
  // ──────────────────────────────────────────────

  app.patch("/api/v1/team/members/:userId", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const parsed = updateTeamMemberSchema.parse(request.body);
        const { userId } = request.params as { userId: string };
        const targetUserId = parseInt(userId, 10);

        if (isNaN(targetUserId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
          return;
        }

        await updateMember(request.user!.userId, targetUserId, {
          role: parsed.role,
          quotaBalance: parsed.quotaBalance ?? null,
        });

        reply.status(200).send({
          code: 0,
          data: null,
          message: "成员信息已更新",
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
    },
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/team/leave — 退出团队
  // ──────────────────────────────────────────────

  app.post("/api/v1/team/leave", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        await leaveTeam(request.user!.userId);

        reply.status(200).send({
          code: 0,
          data: null,
          message: "已退出团队",
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
