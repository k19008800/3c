// ============================================================
//  3cloud (3C) —注册相关路由
//  POST  /api/v1/auth/register          —注册
//  POST  /api/v1/auth/verify-email      —邮箱验证
//  POST  /api/v1/auth/resend-verify     —重发验证码// ============================================================

import { FastifyInstance } from "fastify";
import {
  registerUser,
  verifyUserEmail,
  resendVerifyCode,
  AppError,
} from "../../services/auth-service/index.js";
import { authenticateJWT } from "../../middleware/auth.js";
import { registerSchema } from "../../schemas.js";
import { logOperation } from "../../services/operation-log.js";

export async function authRegisterRoutes(app: FastifyInstance) {
  // ── 注册 ──
  // POST /api/v1/auth/register
  app.post("/api/v1/auth/register", async (request, reply) => {
    try {
      const parsed = registerSchema.parse(request.body);
      const result = await registerUser(parsed.email, parsed.password, parsed.refCode);

      logOperation({
        userId: result.user.id,
        userRole: result.user.role,
        category: "auth",
        action: "register",
        summary: `用户注册: ${parsed.email}`,
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string | undefined,
      });

      reply.status(200).send({
        code: 0,
        data: {
          user: result.user,
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
  // POST /api/v1/auth/verify-email
  app.post("/api/v1/auth/verify-email", {
    preHandler: [authenticateJWT],
  }, async (request, reply) => {
    try {
      const { code } = request.body as { code: string };
      if (!code || typeof code !== "string") {
        reply.status(400).send({ code: 400, data: null, message: "缺少验证码 " });
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
  });

  // ── 重发验证码──
  // POST /api/v1/auth/resend-verify
  app.post("/api/v1/auth/resend-verify", {
    preHandler: [authenticateJWT],
  }, async (request, reply) => {
    try {
      await resendVerifyCode(request.user!.userId);
      reply.status(200).send({ code: 0, data: null, message: "验证码已发送 " });
    } catch (err) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
