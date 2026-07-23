// ============================================================

//  3cloud (3C) —登录相关路由

//  POST  /api/v1/auth/login              —登录（含风控）//  POST  /api/v1/auth/refresh            —刷新 Token

//  GET   /api/v1/auth/me                 —获取当前用户

//  POST  /api/v1/auth/change-password    —修改密码

// ============================================================



import { FastifyInstance } from "fastify";

import {

  loginUser,

  refreshAccessToken,

  getUserProfile,

  changeUserPassword,

  AppError,

} from "../../services/auth-service/index.js";

import { authenticateJWT, guardNotImpersonating } from "../../middleware/auth.js";

import {

  loginSchema,

  loginWithCaptchaSchema,

  refreshSchema,

  changePasswordSchema,

} from "../../schemas.js";

import { logOperation } from "../../services/operation-log.js";



export async function authLoginRoutes(app: FastifyInstance) {

  // ── 登录（含风控）──

  // POST /api/v1/auth/login

  app.post("/api/v1/auth/login", {
    // 分级限流：登录接口非常敏感，每分钟最多 5 次尝试
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {

    try {

      const body = request.body as Record<string, any>;

      const parsed = body.captchaSession

        ? loginWithCaptchaSchema.parse(request.body)

        : loginSchema.parse(request.body);



      const result = await loginUser(

        parsed.email,

        parsed.password,

        request.ip,

        request.headers["user-agent"] as string | undefined,

        (parsed as any).captcha,

        (parsed as any).captchaSession,

      );



      if (result.user) {

        logOperation({

          userId: result.user.id,

          userRole: result.user.role,

          category: "auth",

          action: "login",

          summary: `用户登录: ${result.user.email}`,

          ip: request.ip,

          userAgent: request.headers["user-agent"] as string | undefined,

        });

      }



      if (result.captchaRequired) {

        reply.status(200).send({

          code: 0,

          data: {

            captchaRequired: true,

            captchaSession: result.captchaSession,

          },

          message: "验证码已发送至您的邮箱，请输入验证码继续登录,"

        });

        return;

      }



      reply.status(200).send({

        code: 0,

        data: {

          user: result.user!,

          accessToken: result.tokens!.accessToken,

          refreshToken: result.tokens!.refreshToken,

          expiresIn: result.tokens!.expiresIn,

          captchaRequired: false,

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

  // POST /api/v1/auth/refresh

  app.post("/api/v1/auth/refresh", {
    // 分级限流：刷新接口防止滥用，每分钟最多 ?, 次尝试
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {

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

  // GET /api/v1/auth/me

  app.get("/api/v1/auth/me", {

    preHandler: [authenticateJWT],

  }, async (request, reply) => {

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

  });



  // ── 修改密码 ──

  // POST /api/v1/auth/change-password

  app.post("/api/v1/auth/change-password", {

    preHandler: [authenticateJWT, guardNotImpersonating],

  }, async (request, reply) => {

    try {

      const parsed = changePasswordSchema.parse(request.body);

      await changeUserPassword(request.user!.userId, parsed.oldPassword, parsed.newPassword);



      logOperation({

        userId: request.user!.userId,

        userRole: request.user!.role,

        category: "auth",

        action: "change_password",

        summary: "修改密码",

        ip: request.ip,

        userAgent: request.headers["user-agent"] as string | undefined,

      });



      reply.status(200).send({ code: 0, data: null, message: "邮箱验证成功" });

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

