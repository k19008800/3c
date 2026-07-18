// ============================================================
//  3cloud (3C) �?密码重置路由
//  POST  /api/v1/auth/forgot-password     �?忘记密码（发送重置链接）
//  POST  /api/v1/auth/reset-password      �?重置密码
// ============================================================

import { FastifyInstance } from "fastify";
import {
  forgotPassword,
  resetPasswordWithToken,
  AppError,
} from "../../services/auth-service/index.js";
import {
  resetPasswordSchema,
  resetPasswordConfirmSchema,
} from "../../schemas.js";

export async function authResetRoutes(app: FastifyInstance) {
  // ── 忘记密码 ──
  // POST /api/v1/auth/forgot-password
  app.post("/api/v1/auth/forgot-password", async (request, reply) => {
    try {
      const parsed = resetPasswordSchema.parse(request.body);
      await forgotPassword(parsed.email, request.ip, request.headers["user-agent"]);
      reply.status(200).send({
        code: 0,
        data: null,
        message: "如果该邮箱已注册，重置密码链接已发送到您的邮箱",
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

  // ── 重置密码 ──
  // POST /api/v1/auth/reset-password
  app.post("/api/v1/auth/reset-password", async (request, reply) => {
    try {
      const parsed = resetPasswordConfirmSchema.parse(request.body);
      await resetPasswordWithToken(parsed.token, parsed.newPassword, request.ip, request.headers["user-agent"]);
      reply.status(200).send({
        code: 0,
        data: null,
        message: "密码重置成功，请重新登录",
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
