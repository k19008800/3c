// ============================================================
//  3cloud (3C) — 认证路由
//  POST /api/v1/auth/register
//  POST /api/v1/auth/verify-email
//  POST /api/v1/auth/login
//  POST /api/v1/auth/refresh
//  POST /api/v1/auth/change-password
//  GET  /api/v1/auth/me
//  POST /api/v1/auth/resend-verify
// ============================================================

import { FastifyInstance } from "fastify";
import {
  registerUser,
  loginUser,
  verifyUserEmail,
  refreshAccessToken,
  getUserProfile,
  changeUserPassword,
  resendVerifyCode,
  AppError,
} from "../services/auth-service.js";
import { authenticateJWT } from "../middleware/auth.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
} from "../schemas.js";
import type { RegisterInput, LoginInput, RefreshInput, ChangePasswordInput } from "../schemas.js";

export async function authRoutes(app: FastifyInstance) {
  // ── 注册 ──
  app.post("/api/v1/auth/register", async (request, reply) => {
    try {
      const parsed = registerSchema.parse(request.body);
      const result = await registerUser(parsed.email, parsed.password);

      reply.status(200).send({
        code: 0,
        data: {
          ...result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresIn: result.tokens.expiresIn,
        },
        message: "ok",
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

  // ── 邮箱验证 ──
  app.post("/api/v1/auth/verify-email", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const { code } = request.body as { code: string };
        if (!code || typeof code !== "string") {
          reply.status(400).send({ code: 400, data: null, message: "缺少验证码" });
          return;
        }
        await verifyUserEmail(request.user!.userId, code);
        reply.status(200).send({ code: 0, data: null, message: "邮箱验证成功" });
      } catch (err) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ── 重发验证码 ──
  app.post("/api/v1/auth/resend-verify", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        await resendVerifyCode(request.user!.userId);
        reply.status(200).send({ code: 0, data: null, message: "验证码已发送" });
      } catch (err) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ── 登录 ──
  app.post("/api/v1/auth/login", async (request, reply) => {
    try {
      const parsed = loginSchema.parse(request.body);
      const result = await loginUser(parsed.email, parsed.password);

      reply.status(200).send({
        code: 0,
        data: {
          ...result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresIn: result.tokens.expiresIn,
        },
        message: "ok",
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

  // ── 刷新 Token ──
  app.post("/api/v1/auth/refresh", async (request, reply) => {
    try {
      const parsed = refreshSchema.parse(request.body);
      const result = await refreshAccessToken(parsed.refreshToken);
      reply.status(200).send({ code: 0, data: result, message: "ok" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      if (err?.name === "ZodError") {
        reply.status(400).send({ code: 400, data: null, message: "缺少 refreshToken" });
        return;
      }
      reply.status(401).send({ code: 401, data: null, message: "Token 无效或已过期" });
    }
  });

  // ── 获取当前用户 ──
  app.get("/api/v1/auth/me", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const profile = await getUserProfile(request.user!.userId);
        reply.status(200).send({ code: 0, data: profile, message: "ok" });
      } catch (err) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ── 修改密码 ──
  app.post("/api/v1/auth/change-password", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const parsed = changePasswordSchema.parse(request.body);
        await changeUserPassword(request.user!.userId, parsed.oldPassword, parsed.newPassword);
        reply.status(200).send({ code: 0, data: null, message: "密码修改成功" });
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
}
