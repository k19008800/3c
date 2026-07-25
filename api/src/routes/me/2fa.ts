// ============================================================
//  3cloud (3C) — 双因素认证路由
//  POST /api/v1/me/2fa/setup        — 初始化 2FA
//  POST /api/v1/me/2fa/verify       — 验证并启用 2FA
//  POST /api/v1/me/2fa/disable      — 禁用 2FA
//  POST /api/v1/me/2fa/backup-codes — 重新生成备用码
//  GET  /api/v1/me/2fa/status       — 获取 2FA 状态
// ============================================================

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticateJWT, guardNotImpersonating } from "../../middleware/auth.js";
import {
  setup2FA,
  enable2FA,
  disable2FA,
  regenerateBackupCodes,
  verify2FA,
} from "../../services/2fa.js";
import { getDb } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { eq } from "drizzle-orm";
import { logOperation } from "../../services/operation-log.js";
import { AppError } from "../../services/auth-service/index.js";

// ── Schema ──

const setupSchema = z.object({});

const verifySchema = z.object({
  token: z.string().length(6, "验证码必须是 6 位"),
});

const disableSchema = z.object({
  password: z.string().min(1, "请输入密码"),
});

const verifyLoginSchema = z.object({
  userId: z.number().int().positive(),
  token: z.string().min(6, "验证码至少 6 位"),
});

// ── 路由 ──

export async function twoFactorRoutes(app: FastifyInstance) {
  // ── 获取 2FA 状态 ──
  // GET /api/v1/me/2fa/status
  app.get("/api/v1/me/2fa/status", {
    preHandler: [authenticateJWT],
  }, async (request, reply) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, request.user!.userId),
      columns: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!user) {
      throw new AppError(404, "用户不存在");
    }

    const backupCodesCount = user.twoFactorBackupCodes
      ? (user.twoFactorBackupCodes as string[]).length
      : 0;

    reply.status(200).send({
      code: 0,
      data: {
        enabled: user.twoFactorEnabled,
        backupCodesCount,
      },
      message: "ok",
    });
  });

  // ── 初始化 2FA ──
  // POST /api/v1/me/2fa/setup
  app.post("/api/v1/me/2fa/setup", {
    preHandler: [authenticateJWT, guardNotImpersonating],
  }, async (request, reply) => {
    try {
      const result = await setup2FA(request.user!.userId);

      logOperation({
        userId: request.user!.userId,
        userRole: request.user!.role,
        category: "security",
        action: "2fa_setup",
        summary: "初始化双因素认证",
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string | undefined,
      });

      reply.status(200).send({
        code: 0,
        data: {
          secret: result.secret,
          otpauth: result.otpauth,
          backupCodes: result.backupCodes,
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
  });

  // ── 验证并启用 2FA ──
  // POST /api/v1/me/2fa/verify
  app.post("/api/v1/me/2fa/verify", {
    preHandler: [authenticateJWT, guardNotImpersonating],
  }, async (request, reply) => {
    try {
      const parsed = verifySchema.parse(request.body);
      await enable2FA(request.user!.userId, parsed.token);

      logOperation({
        userId: request.user!.userId,
        userRole: request.user!.role,
        category: "security",
        action: "2fa_enable",
        summary: "启用双因素认证",
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string | undefined,
      });

      reply.status(200).send({
        code: 0,
        data: null,
        message: "双因素认证已启用",
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

  // ── 禁用 2FA ──
  // POST /api/v1/me/2fa/disable
  app.post("/api/v1/me/2fa/disable", {
    preHandler: [authenticateJWT, guardNotImpersonating],
  }, async (request, reply) => {
    try {
      const parsed = disableSchema.parse(request.body);

      // 验证密码
      const bcrypt = await import("bcryptjs");
      const user = await db.query.users.findFirst({
        where: eq(users.id, request.user!.userId),
        columns: {
          passwordHash: true,
          twoFactorEnabled: true,
        },
      });

      if (!user) {
        throw new AppError(404, "用户不存在");
      }

      if (!user.twoFactorEnabled) {
        throw new AppError(400, "双因素认证未启用");
      }

      const validPassword = await bcrypt.compare(parsed.password, user.passwordHash);
      if (!validPassword) {
        throw new AppError(401, "密码错误");
      }

      await disable2FA(request.user!.userId);

      logOperation({
        userId: request.user!.userId,
        userRole: request.user!.role,
        category: "security",
        action: "2fa_disable",
        summary: "禁用双因素认证",
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string | undefined,
      });

      reply.status(200).send({
        code: 0,
        data: null,
        message: "双因素认证已禁用",
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

  // ── 重新生成备用码 ──
  // POST /api/v1/me/2fa/backup-codes
  app.post("/api/v1/me/2fa/backup-codes", {
    preHandler: [authenticateJWT, guardNotImpersonating],
  }, async (request, reply) => {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, request.user!.userId),
        columns: {
          twoFactorEnabled: true,
        },
      });

      if (!user || !user.twoFactorEnabled) {
        throw new AppError(400, "请先启用双因素认证");
      }

      const backupCodes = await regenerateBackupCodes(request.user!.userId);

      logOperation({
        userId: request.user!.userId,
        userRole: request.user!.role,
        category: "security",
        action: "2fa_regenerate_backup",
        summary: "重新生成备用码",
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string | undefined,
      });

      reply.status(200).send({
        code: 0,
        data: { backupCodes },
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
}

// ── 登录时验证 2FA ──
// POST /api/v1/auth/2fa/verify
export async function twoFactorVerifyLoginRoute(app: FastifyInstance) {
  app.post("/api/v1/auth/2fa/verify", async (request, reply) => {
    try {
      const parsed = verifyLoginSchema.parse(request.body);

      const result = await verify2FA(parsed.userId, parsed.token);

      if (!result.valid) {
        throw new AppError(401, "验证码错误");
      }

      // 生成 token
      const { generateTokens } = await import("../../services/auth-service/index.js");
      const user = await db.query.users.findFirst({
        where: eq(users.id, parsed.userId),
      });

      if (!user) {
        throw new AppError(404, "用户不存在");
      }

      const tokens = await generateTokens(user);

      logOperation({
        userId: user.id,
        userRole: user.role,
        category: "auth",
        action: "2fa_login",
        summary: `2FA 登录验证成功${result.usedBackupCode ? "（使用备用码）" : ""}`,
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string | undefined,
      });

      reply.status(200).send({
        code: 0,
        data: {
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
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
}
