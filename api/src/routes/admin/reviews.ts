// ============================================================
//  3cloud (3C) — 实名审核管理（管理员）
//  GET    /api/v1/admin/real-name-review          — 审核列表
//  GET    /api/v1/admin/real-name-review/detail/:userId — 审核详情
//  POST   /api/v1/admin/real-name-review/:id     — 审核操作
//  POST   /api/v1/admin/users/:id/manual-real-name — 手动确认实名
//  GET    /api/v1/admin/users/:id/real-name-history — 实名变更历史
//  GET    /api/v1/admin/real-name-reviews        — 审核列表(新版)
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, lte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  userRealNameReviews,
  auditLogs,
} from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

import {
  adminRealNameReviewActionSchema,
  adminManualRealNameSchema,
} from "../../schemas.js";

export async function adminReviewRoutes(app: FastifyInstance) {
  // All endpoints need JWT + at least REVIEW_LIST
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/real-name-review — 审核列表
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/real-name-review", {
    preHandler: [requirePerm(Perm.REVIEW_LIST)]
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      status?: string;
      keyword?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [sql`1=1`];
    if (query.status) {
      conditions.push(eq(users.realNameStatus, query.status as any));
    }
    if (query.keyword) {
      conditions.push(
        sql`(${users.email}::text ILIKE ${`%${query.keyword}%`} OR ${users.realName}::text ILIKE ${`%${query.keyword}%`})`
      );
    }

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(...conditions));

    const total = Number(totalResult?.count ?? 0);

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        nickname: users.nickname,
        userType: users.userType,
        realNameStatus: users.realNameStatus,
        realName: users.realName,
        idNumber: users.idNumber,
        idFrontImage: users.idFrontImage,
        idBackImage: users.idBackImage,
        companyName: users.companyName,
        companyRegNumber: users.companyRegNumber,
        businessLicense: users.businessLicense,
        bankName: users.bankName,
        bankAccount: users.bankAccount,
        rejectReason: users.rejectReason,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.updatedAt))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt?.toISOString() ?? null,
          updatedAt: r.updatedAt?.toISOString() ?? null,
        })),
        total,
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/real-name-review/detail/:userId — 审核详情
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/real-name-review/detail/:userId", {
    preHandler: [requirePerm(Perm.REVIEW_LIST)]
  }, async (request, reply) => {
    const db = getDb();
    const { userId } = request.params as { userId: string };
    const uid = parseInt(userId, 10);

    if (isNaN(uid)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        nickname: users.nickname,
        userType: users.userType,
        realNameStatus: users.realNameStatus,
        realName: users.realName,
        idNumber: users.idNumber,
        idFrontImage: users.idFrontImage,
        idBackImage: users.idBackImage,
        companyName: users.companyName,
        companyRegNumber: users.companyRegNumber,
        businessLicense: users.businessLicense,
        bankName: users.bankName,
        bankAccount: users.bankAccount,
        bankAddress: users.bankAddress,
        invoiceTitle: users.invoiceTitle,
        invoiceTaxId: users.invoiceTaxId,
        rejectReason: users.rejectReason,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1);

    if (!user) {
      reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    reply.status(200).send({
      code: 0,
      data: {
        ...user,
        createdAt: user.createdAt?.toISOString() ?? null,
        updatedAt: user.updatedAt?.toISOString() ?? null,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/real-name-review/:id — 审核操作
  // ──────────────────────────────────────────────
  app.post("/api/v1/admin/real-name-review/:id", {
    preHandler: [requirePerm(Perm.REVIEW_ACTION)]
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { id } = request.params as { id: string };
      const userId = parseInt(id, 10);
      const operatorId = request.user!.userId;

      if (isNaN(userId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
        return;
      }

      const parsed = adminRealNameReviewActionSchema.parse(request.body);

      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!targetUser) {
        reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
        return;
      }

      const action = parsed.action;

      await db.transaction(async (tx) => {
        const reviewStatus = action === "approve" ? "approved" : "rejected";
        const now = new Date();

        // 1. 更新 users 表主状态
        if (action === "approve") {
          await tx
            .update(users)
            .set({ realNameStatus: "approved", rejectReason: null })
            .where(eq(users.id, userId));
        } else {
          await tx
            .update(users)
            .set({
              realNameStatus: "rejected",
              rejectReason: parsed.rejectReason || "信息不符",
            })
            .where(eq(users.id, userId));
        }

        // 2. 同步更新 user_real_name_reviews 中所有 pending 版本记录
        await tx
          .update(userRealNameReviews)
          .set({
            status: reviewStatus,
            reviewerId: operatorId,
            rejectReason: action === "reject" ? (parsed.rejectReason || "信息不符") : null,
            reviewedAt: now,
          })
          .where(
            and(
              eq(userRealNameReviews.userId, userId),
              eq(userRealNameReviews.status, "pending_review"),
            )
          );

        // 3. 审计日志
        await tx.insert(auditLogs).values({
          operatorId,
          action: action === "approve" ? "real_name_approve" : "real_name_reject",
          targetType: "user",
          targetId: userId,
          ip: request.ip,
          description: `${action === "approve" ? "通过" : "拒绝"}用户 #${userId} 实名认证${parsed.rejectReason ? ": " + parsed.rejectReason : ""}`,
        });
      });

      reply.status(200).send({
        code: 0,
        data: null,
        message: action === "approve" ? "实名认证已通过" : "实名认证已拒绝",
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/users/:userId/manual-real-name — 手动确认实名
  // ──────────────────────────────────────────────
  app.post("/api/v1/admin/users/:userId/manual-real-name", {
    preHandler: [requirePerm(Perm.REVIEW_ACTION)]
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { userId: paramUserId } = request.params as { userId: string };
      const userId = parseInt(paramUserId, 10);
      const operatorId = request.user!.userId;

      if (isNaN(userId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
        return;
      }

      const parsed = adminManualRealNameSchema.parse(request.body);

      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!targetUser) {
        reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
        return;
      }

      const updateData: any = {
        realNameStatus: parsed.action === "approve" ? "approved" : "rejected",
        rejectReason: parsed.action === "reject" ? (parsed.rejectReason || null) : null,
      };
      if (parsed.realName) updateData.realName = parsed.realName;
      if (parsed.idNumber) updateData.idNumber = parsed.idNumber;
      if (parsed.companyName) updateData.companyName = parsed.companyName;

      await db.transaction(async (tx) => {
        await tx.update(users).set(updateData).where(eq(users.id, userId));

        await tx.insert(auditLogs).values({
          operatorId,
          action: parsed.action === "approve" ? "real_name_approve" : "real_name_reject",
          targetType: "user",
          targetId: userId,
          ip: request.ip,
          description: `${parsed.action === "approve" ? "手动通过" : "手动拒绝"}用户 #${userId} 实名认证${parsed.rejectReason ? ": " + parsed.rejectReason : ""}`,
        });
      });

      reply.status(200).send({
        code: 0,
        data: null,
        message: parsed.action === "approve" ? "实名认证已手动确认" : "实名认证已手动拒绝",
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:userId/real-name-history — 实名变更历史
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:userId/real-name-history", {
    preHandler: [requirePerm(Perm.REVIEW_LIST)]
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const rows = await db
      .select()
      .from(userRealNameReviews)
      .where(eq(userRealNameReviews.userId, userId))
      .orderBy(desc(userRealNameReviews.createdAt));

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt?.toISOString() ?? null,
          reviewedAt: r.reviewedAt?.toISOString() ?? null,
        })),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/real-name-reviews — 审核列表(新版带分页)
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/real-name-reviews", {
    preHandler: [requirePerm(Perm.REVIEW_LIST)]
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      status?: string;
      keyword?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [sql`1=1`];
    if (query.status) {
      conditions.push(eq(users.realNameStatus, query.status as any));
    }
    if (query.keyword) {
      conditions.push(
        sql`(${users.email}::text ILIKE ${`%${query.keyword}%`})`
      );
    }

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(...conditions));

    const total = Number(totalResult?.count ?? 0);

    const rows = await db
      .select({
        userId: users.id,
        email: users.email,
        nickname: users.nickname,
        userType: users.userType,
        realNameStatus: users.realNameStatus,
        realName: users.realName,
        idNumber: users.idNumber,
        idFrontImage: users.idFrontImage,
        idBackImage: users.idBackImage,
        companyName: users.companyName,
        companyRegNumber: users.companyRegNumber,
        businessLicense: users.businessLicense,
        bankName: users.bankName,
        bankAccount: users.bankAccount,
        rejectReason: users.rejectReason,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.updatedAt))
      .limit(pageSize)
      .offset(offset);

    // 批量加载最新版本的 OCR 结果（逐条查询，避免 ANY/ARRAY 兼容问题）
    const ocrMap: Record<number, any> = {};
    if (rows.length > 0) {
      for (const r of rows) {
        const [latest] = await db
          .select({
            userId: userRealNameReviews.userId,
            ocrResult: userRealNameReviews.ocrResult,
          })
          .from(userRealNameReviews)
          .where(eq(userRealNameReviews.userId, r.userId))
          .orderBy(desc(userRealNameReviews.version))
          .limit(1);
        if (latest) {
          ocrMap[r.userId] = latest.ocrResult;
        }
      }
    }

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          id: r.userId,
          userId: r.userId,
          email: r.email,
          nickname: r.nickname,
          userType: r.userType,
          realNameStatus: r.realNameStatus,
          version: 0,
          realName: r.realName,
          idNumber: r.idNumber,
          idFrontImage: r.idFrontImage,
          idBackImage: r.idBackImage,
          companyName: r.companyName,
          companyRegNumber: r.companyRegNumber,
          businessLicense: r.businessLicense,
          bankName: r.bankName,
          bankAccount: r.bankAccount,
          status: r.realNameStatus,
          rejectReason: r.rejectReason,
          createdAt: null as any,
          updatedAt: r.updatedAt?.toISOString() ?? null,
          ocrResult: ocrMap[r.userId] ?? null,
        })),
        total,
        page,
        pageSize,
      },
      message: "ok",
    });
  });
}
