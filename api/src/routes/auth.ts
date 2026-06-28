// ============================================================
//  3cloud (3C) — 认证路由
//  POST   /api/v1/auth/register
//  POST   /api/v1/auth/verify-email
//  POST   /api/v1/auth/login
//  POST   /api/v1/auth/refresh
//  POST   /api/v1/auth/change-password
//  GET    /api/v1/auth/me
//  POST   /api/v1/auth/resend-verify
//  POST   /api/v1/auth/real-name/upload
//  POST   /api/v1/auth/real-name/personal
//  POST   /api/v1/auth/real-name/enterprise
//  GET    /api/v1/auth/real-name/status
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
import { authenticateJWT, guardNotImpersonating } from "../middleware/auth.js";
import { eq, sql, and, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users, userRealNameReviews } from "../db/schema.js";
import {
  registerSchema,
  loginSchema,
  loginWithCaptchaSchema,
  refreshSchema,
  changePasswordSchema,
  realNamePersonalSchema,
  realNameEnterpriseSchema,
  realNameUploadSchema,
} from "../schemas.js";
import type { RegisterInput, LoginInput, RefreshInput, ChangePasswordInput, RealNamePersonalInput, RealNameEnterpriseInput, RealNameUploadInput } from "../schemas.js";
import fs from "node:fs";
import path from "node:path";
import {
  validateIdNumber,
  saveUploadedFile,
  getFileAbsolutePath,
  getMimeType,
  checkSubmitRateLimit,
  markSubmitRateLimit,
  autoVerifyRealName,
} from "../services/real-name-service.js";

export async function authRoutes(app: FastifyInstance) {
  // ── 注册 ──
  app.post("/api/v1/auth/register", async (request, reply) => {
    try {
      const parsed = registerSchema.parse(request.body);
      const result = await registerUser(parsed.email, parsed.password, parsed.refCode);

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

  // ── 登录（含风控） ──
  app.post("/api/v1/auth/login", async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      // 如果带了 captchaSession，用增强校验 schema
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

      // 如果需要验证码（未提交验证码时）
      if (result.captchaRequired) {
        reply.status(200).send({
          code: 0,
          data: {
            captchaRequired: true,
            captchaSession: result.captchaSession,
          },
          message: "验证码已发送至您的邮箱，请输入验证码继续登录",
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
    preHandler: [authenticateJWT, guardNotImpersonating],
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

  // ════════════════════════════════════════════
  //  实名认证相关路由
  // ════════════════════════════════════════════

  // ── 上传证件图片 ──
  // POST /api/v1/auth/real-name/upload (multipart/form-data)
  // Fields: fileType (id_front | id_back | business_license), file (binary)
  app.post("/api/v1/auth/real-name/upload", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const userId = request.user!.userId;

      try {
        // 处理 multipart 上传
        const file = await request.file();
        if (!file) {
          reply.status(400).send({ code: 400, data: null, message: "请上传文件" });
          return;
        }

        // 读取 fileType 字段（可从 multipart fields 或 query 读取）
        const body = request.body as Record<string, string>;
        const fileType = body?.fileType ?? (request.query as any)?.fileType;
        if (!fileType || !["id_front", "id_back", "business_license"].includes(fileType)) {
          reply.status(400).send({ code: 400, data: null, message: "缺少或无效的 fileType 参数" });
          return;
        }

        // 获取当前版本号
        const db = getDb();
        const [verResult] = await db
          .select({ maxVer: sql<number>`coalesce(max(${userRealNameReviews.version}), 0)` })
          .from(userRealNameReviews)
          .where(eq(userRealNameReviews.userId, userId));
        const currentVersion = (verResult?.maxVer ?? 0) + 1;

        // 读取文件 buffer
        const buffer = await file.toBuffer();

        // 保存文件
        const result = await saveUploadedFile(
          userId,
          currentVersion,
          fileType,
          buffer,
          file.filename,
        );

        reply.status(200).send({
          code: 0,
          data: { relativePath: result.relativePath, type: fileType, version: currentVersion },
          message: "上传成功",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({
            code: err.statusCode,
            data: null,
            message: err.message,
          });
          return;
        }
        throw err;
      }
    },
  });

  // ── 提交个人实名 ──
  // POST /api/v1/auth/real-name/personal
  // Body: { realName, idNumber, idFrontImage?, idBackImage? }
  app.post("/api/v1/auth/real-name/personal", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      try {
        const parsed = realNamePersonalSchema.parse(request.body);

        // 校验身份证校验位
        if (!validateIdNumber(parsed.idNumber)) {
          reply.status(400).send({ code: 400, data: null, message: "身份证号格式不正确（校验位错误）" });
          return;
        }

        // 检查当前用户状态
        const [user] = await db
          .select({ realNameStatus: users.realNameStatus })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!user) {
          reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
          return;
        }

        if (user.realNameStatus === "approved") {
          reply.status(400).send({ code: 400, data: null, message: "已通过实名认证，无需重复提交" });
          return;
        }

        if (user.realNameStatus === "pending_review") {
          reply.status(400).send({ code: 400, data: null, message: "已有实名申请正在审核中，请等待审核结果" });
          return;
        }

        // 频率限制
        await checkSubmitRateLimit(userId);

        // 获取下一个版本号
        const [verResult] = await db
          .select({ maxVer: sql<number>`coalesce(max(${userRealNameReviews.version}), 0)` })
          .from(userRealNameReviews)
          .where(eq(userRealNameReviews.userId, userId));
        const nextVersion = (verResult?.maxVer ?? 0) + 1;

        // 开启事务
        await db.transaction(async (tx) => {
          // 写入历史
          await tx.insert(userRealNameReviews).values({
            userId,
            version: nextVersion,
            realName: parsed.realName,
            idNumber: parsed.idNumber,
            idFrontImage: parsed.idFrontImage ?? null,
            idBackImage: parsed.idBackImage ?? null,
            status: "pending_review",
          });

          // 更新 users 表
          await tx
            .update(users)
            .set({
              realNameStatus: "pending_review",
              realName: parsed.realName,
              idNumber: parsed.idNumber,
              idFrontImage: parsed.idFrontImage ?? null,
              idBackImage: parsed.idBackImage ?? null,
            })
            .where(eq(users.id, userId));
        });

        // 提交成功后标记频率限制
        await markSubmitRateLimit(userId);

        // 异步触发自动核验（不阻塞响应）
        autoVerifyRealName(userId, nextVersion).then((result) => {
          if (result.autoVerified) {
            if (result.passed) {
              console.log(`[RealName] 用户 ${userId} 实名自动通过`);
            } else {
              console.log(`[RealName] 用户 ${userId} 实名自动核验未通过，转人工审核`);
            }
          }
        }).catch((err) => {
          console.error(`[RealName] 自动核验出错 (userId=${userId}):`, err);
        });

        reply.status(200).send({
          code: 0,
          data: { version: nextVersion },
          message: "实名信息已提交，等待审核",
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

  // ── 提交企业实名 ──
  // POST /api/v1/auth/real-name/enterprise
  // Body: { realName, idNumber, companyName, companyRegNumber, ... }
  app.post("/api/v1/auth/real-name/enterprise", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      try {
        const parsed = realNameEnterpriseSchema.parse(request.body);

        // 校验身份证校验位
        if (!validateIdNumber(parsed.idNumber)) {
          reply.status(400).send({ code: 400, data: null, message: "身份证号格式不正确（校验位错误）" });
          return;
        }

        // 检查当前用户状态
        const [user] = await db
          .select({ realNameStatus: users.realNameStatus })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!user) {
          reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
          return;
        }

        if (user.realNameStatus === "approved") {
          reply.status(400).send({ code: 400, data: null, message: "已通过实名认证，无需重复提交" });
          return;
        }

        if (user.realNameStatus === "pending_review") {
          reply.status(400).send({ code: 400, data: null, message: "已有实名申请正在审核中，请等待审核结果" });
          return;
        }

        // 频率限制
        await checkSubmitRateLimit(userId);

        // 获取下一个版本号
        const [verResult] = await db
          .select({ maxVer: sql<number>`coalesce(max(${userRealNameReviews.version}), 0)` })
          .from(userRealNameReviews)
          .where(eq(userRealNameReviews.userId, userId));
        const nextVersion = (verResult?.maxVer ?? 0) + 1;

        // 开启事务
        await db.transaction(async (tx) => {
          // 写入历史
          await tx.insert(userRealNameReviews).values({
            userId,
            version: nextVersion,
            status: "pending_review",
            realName: parsed.realName,
            idNumber: parsed.idNumber,
            idFrontImage: parsed.idFrontImage ?? null,
            idBackImage: parsed.idBackImage ?? null,
            businessLicense: parsed.businessLicense ?? null,
            companyName: parsed.companyName,
            companyRegNumber: parsed.companyRegNumber,
            bankName: parsed.bankName ?? null,
            bankAccount: parsed.bankAccount ?? null,
            bankAddress: parsed.bankAddress ?? null,
            invoiceTitle: parsed.invoiceTitle ?? null,
            invoiceTaxId: parsed.invoiceTaxId ?? null,
          });

          // 更新 users 表
          await tx
            .update(users)
            .set({
              realNameStatus: "pending_review",
              realName: parsed.realName,
              idNumber: parsed.idNumber,
              idFrontImage: parsed.idFrontImage ?? null,
              idBackImage: parsed.idBackImage ?? null,
              businessLicense: parsed.businessLicense ?? null,
              companyName: parsed.companyName,
              companyRegNumber: parsed.companyRegNumber,
              bankName: parsed.bankName ?? null,
              bankAccount: parsed.bankAccount ?? null,
              bankAddress: parsed.bankAddress ?? null,
              invoiceTitle: parsed.invoiceTitle ?? null,
              invoiceTaxId: parsed.invoiceTaxId ?? null,
              userType: "enterprise",
            })
            .where(eq(users.id, userId));
        });

        // 提交成功后标记频率限制
        await markSubmitRateLimit(userId);

        // 异步触发自动核验
        autoVerifyRealName(userId, nextVersion).then((result) => {
          if (result.autoVerified) {
            if (result.passed) {
              console.log(`[RealName] 用户 ${userId} 企业实名自动通过`);
            } else {
              console.log(`[RealName] 用户 ${userId} 企业实名自动核验未通过，转人工审核`);
            }
          }
        }).catch((err) => {
          console.error(`[RealName] 自动核验出错 (userId=${userId}):`, err);
        });

        reply.status(200).send({
          code: 0,
          data: { version: nextVersion },
          message: "企业实名信息已提交，等待审核",
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

  // ── 查询实名认证状态 ──
  // GET /api/v1/auth/real-name/status
  app.get("/api/v1/auth/real-name/status", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      try {
        const [user] = await db
          .select({
            realNameStatus: users.realNameStatus,
            userType: users.userType,
            realName: users.realName,
            idNumber: users.idNumber,
            idFrontImage: users.idFrontImage,
            idBackImage: users.idBackImage,
            companyName: users.companyName,
            companyRegNumber: users.companyRegNumber,
            businessLicense: users.businessLicense,
            rejectReason: users.rejectReason,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!user) {
          reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
          return;
        }

        // 获取最新版本号
        const [verResult] = await db
          .select({ maxVer: sql<number>`coalesce(max(${userRealNameReviews.version}), 0)` })
          .from(userRealNameReviews)
          .where(eq(userRealNameReviews.userId, userId));
        const currentVersion = verResult?.maxVer ?? null;

        reply.status(200).send({
          code: 0,
          data: {
            ...user,
            reviewVersion: currentVersion,
          },
          message: "ok",
        });
      } catch (err) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ── 用户查看自己的实名证件文件 ──
  // GET /api/v1/auth/real-name/file/{filename}
  // 文件名格式: {version}_{type}.{ext}
  app.get("/api/v1/auth/real-name/file/:filename", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const userId = request.user!.userId;
      const params = request.params as { filename: string };
      const filename = params.filename;

      // 安全校验：防止路径穿越
      if (
        filename.includes("..") ||
        filename.includes("/") ||
        filename.includes("\\") ||
        !filename.match(/^\d+_(id_front|id_back|business_license)\.\w+$/)
      ) {
        reply.status(400).send({ code: 400, data: null, message: "非法文件名" });
        return;
      }

      try {
        const relativePath = `/real-name/${userId}/${filename}`;
        const filePath = getFileAbsolutePath(relativePath);

        if (!fs.existsSync(filePath)) {
          reply.status(404).send({ code: 404, data: null, message: "文件不存在" });
          return;
        }

        const ext = path.extname(filename).toLowerCase();
        reply.type(getMimeType(ext));
        reply.send(fs.createReadStream(filePath));
      } catch (err) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({
            code: err.statusCode,
            data: null,
            message: err.message,
          });
          return;
        }
        throw err;
      }
    },
  });

  // ── 获取最近一次被拒提交通稿（用于自动回填）──
  // GET /api/v1/auth/real-name/last-submission
  app.get("/api/v1/auth/real-name/last-submission", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      try {
        // 查最近一条被拒绝的审核记录
        const [last] = await db
          .select({
            id: userRealNameReviews.id,
            version: userRealNameReviews.version,
            realName: userRealNameReviews.realName,
            idNumber: userRealNameReviews.idNumber,
            idFrontImage: userRealNameReviews.idFrontImage,
            idBackImage: userRealNameReviews.idBackImage,
            companyName: userRealNameReviews.companyName,
            companyRegNumber: userRealNameReviews.companyRegNumber,
            businessLicense: userRealNameReviews.businessLicense,
            bankName: userRealNameReviews.bankName,
            bankAccount: userRealNameReviews.bankAccount,
            bankAddress: userRealNameReviews.bankAddress,
            invoiceTitle: userRealNameReviews.invoiceTitle,
            invoiceTaxId: userRealNameReviews.invoiceTaxId,
            status: userRealNameReviews.status,
            rejectReason: userRealNameReviews.rejectReason,
          })
          .from(userRealNameReviews)
          .where(
            and(
              eq(userRealNameReviews.userId, userId),
              eq(userRealNameReviews.status, "rejected"),
            ),
          )
          .orderBy(desc(userRealNameReviews.version))
          .limit(1);

        if (!last) {
          reply.status(200).send({
            code: 0,
            data: null,
            message: "无最近被拒记录",
          });
          return;
        }

        reply.status(200).send({
          code: 0,
          data: {
            id: last.id,
            version: last.version,
            realName: last.realName,
            idNumber: last.idNumber,
            idFrontImage: last.idFrontImage,
            idBackImage: last.idBackImage,
            companyName: last.companyName,
            companyRegNumber: last.companyRegNumber,
            businessLicense: last.businessLicense,
            bankName: last.bankName,
            bankAccount: last.bankAccount,
            bankAddress: last.bankAddress,
            invoiceTitle: last.invoiceTitle,
            invoiceTaxId: last.invoiceTaxId,
            status: last.status,
            rejectReason: last.rejectReason,
          },
          message: "ok",
        });
      } catch (err) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ── 用户查看自己的实名审核历史 ──
  // GET /api/v1/auth/real-name/history
  app.get("/api/v1/auth/real-name/history", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      const rows = await db
        .select()
        .from(userRealNameReviews)
        .where(eq(userRealNameReviews.userId, userId))
        .orderBy(desc(userRealNameReviews.version));

      reply.status(200).send({
        code: 0,
        data: {
          list: rows.map((r) => ({
            id: r.id,
            userId: r.userId,
            version: r.version,
            realName: r.realName,
            idNumber: r.idNumber ? r.idNumber.substring(0, 6) + "********" + r.idNumber.substring(14) : null,
            companyName: r.companyName,
            companyRegNumber: r.companyRegNumber,
            status: r.status,
            reviewerId: r.reviewerId,
            rejectReason: r.rejectReason,
            createdAt: r.createdAt.toISOString(),
            reviewedAt: r.reviewedAt?.toISOString() ?? null,
          })),
        },
        message: "ok",
      });
    },
  });
}
