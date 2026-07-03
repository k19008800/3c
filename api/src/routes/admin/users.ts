// ============================================================
//  3cloud (3C) — 用户管理路由（管理员）
//  GET    /api/v1/admin/users              — 用户列表
//  GET    /api/v1/admin/users/:id          — 用户详情
//  PATCH  /api/v1/admin/users/:id          — 更新用户
//  DELETE /api/v1/admin/users/:id          — 删除用户
//  POST   /api/v1/admin/users             — 创建用户
//  POST   /api/v1/admin/users/:id/recharge — 手动调余额
//  POST   /api/v1/admin/users/:id/reset-pwd — 重置密码
//  POST   /api/v1/admin/users/:id/change-role — 变更角色
//  POST   /api/v1/admin/users/batch/*      — 批量禁用/启用
//  POST   /api/v1/admin/users/impersonate  — 模拟登录
//  POST   /api/v1/admin/users/export       — 导出用户
//  GET    /api/v1/admin/users/:id/*        — 审计/余额/登录/备注/白名单/调用等
//
//  实名审核 → reviews.ts | API Key 管理 → api-keys.ts
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte, lt } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  balanceLogs,
  rechargeOrders,
  auditLogs,
  apiKeys,
  userRoleHistory,
  userOauthBindings,
  userLoginHistory,
  userNotes,
  userIpWhitelist,
  callLogs,
} from "../../db/schema.js";
import { getRedis } from "../../redis.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

import bcrypt from "bcryptjs";
import { config } from "../../config.js";
import {
  adminChangeRoleSchema,
  adminBatchDisableSchema,
  adminBatchEnableSchema,
  adminUnbindOAuthSchema,
  adminExportUsersQuerySchema,
  adminCreateUserSchema,
  adminAddUserNoteSchema,
  adminIpWhitelistSchema,
  adminImpersonateSchema,
} from "../../schemas.js";
import type {
  AdminChangeRoleInput,
  AdminBatchDisableInput,
  AdminBatchEnableInput,
  AdminUnbindOAuthInput,
  AdminExportUsersQuery,
  AdminCreateUserInput,
  AdminAddUserNoteInput,
  AdminIpWhitelistInput,
  AdminImpersonateInput,
} from "../../schemas.js";

const SALT_ROUNDS = config.bcrypt.saltRounds;

export async function adminUserRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users — 用户列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users", {
    preHandler: [requirePerm(Perm.USER_LIST)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      keyword?: string;    // 搜索邮箱或昵称
      status?: string;
      userType?: string;
      role?: string;
      realNameStatus?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [sql`1=1`];

    if (query.keyword) {
      conditions.push(
        sql`(${users.email}::text ILIKE ${`%${query.keyword}%`} OR ${users.nickname}::text ILIKE ${`%${query.keyword}%`})`,
      );
    }
    if (query.status) {
      conditions.push(eq(users.status, query.status as any));
    }
    if (query.userType) {
      conditions.push(eq(users.userType, query.userType as any));
    }
    if (query.role) {
      conditions.push(eq(users.role, query.role as any));
    }
    if (query.realNameStatus) {
      conditions.push(eq(users.realNameStatus, query.realNameStatus as any));
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
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        userType: users.userType,
        role: users.role,
        status: users.status,
        balance: users.balance,
        realNameStatus: users.realNameStatus,
        realName: users.realName,
        companyName: users.companyName,
        emailVerifiedAt: users.emailVerifiedAt,
        lastLoginAt: users.lastLoginAt,
        discountRate: users.discountRate,
        rpmOverride: users.rpmOverride,
        tpmOverride: users.tpmOverride,
        disabledUntil: users.disabledUntil,
        disabledReason: users.disabledReason,
        teamId: users.teamId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset);

    // 批量查询 Redis 封禁状态
    const redis = getRedis();
    const userBans = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        banned: (await redis.exists(`risk:ban:user:${r.id}`)) === 1,
      }))
    );
    const banMap = new Map(userBans.map((b) => [b.id, b.banned]));

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          ...r,
          isBanned: banMap.get(r.id) ?? false,
          disabledUntil: r.disabledUntil?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id — 用户详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    // 安全查询：不返回 passwordHash 等敏感字段
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        nickname: users.nickname,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        userType: users.userType,
        role: users.role,
        status: users.status,
        balance: users.balance,
        realNameStatus: users.realNameStatus,
        realName: users.realName,
        idNumber: users.idNumber,
        companyName: users.companyName,
        companyRegNumber: users.companyRegNumber,
        idFrontImage: users.idFrontImage,
        idBackImage: users.idBackImage,
        businessLicense: users.businessLicense,
        bankName: users.bankName,
        bankAccount: users.bankAccount,
        bankAddress: users.bankAddress,
        invoiceTitle: users.invoiceTitle,
        invoiceTaxId: users.invoiceTaxId,
        emailVerifiedAt: users.emailVerifiedAt,
        lastLoginAt: users.lastLoginAt,
        discountRate: users.discountRate,
        rpmOverride: users.rpmOverride,
        tpmOverride: users.tpmOverride,
        disabledUntil: users.disabledUntil,
        disabledReason: users.disabledReason,
        rejectReason: users.rejectReason,
        teamId: users.teamId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    // 查 API Key 数量
    const [{ apiKeyCount }] = await db
      .select({ apiKeyCount: sql<number>`count(*)` })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));

    // 查统计
    const [stats] = await db
      .select({
        totalRecharge: sql<string>`coalesce(sum(case when ${rechargeOrders.status} in ('paid','confirmed') then ${rechargeOrders.amount} else 0 end)::text, '0.000000')`,
        orderCount: sql<number>`count(*)`,
      })
      .from(rechargeOrders)
      .where(eq(rechargeOrders.userId, userId));

    // 查询 Redis 封禁状态
    const redis = getRedis();
    const isBanned = (await redis.exists(`risk:ban:user:${userId}`)) === 1;

    reply.status(200).send({
      code: 0,
      data: {
        ...user,
        isBanned,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        disabledUntil: user.disabledUntil?.toISOString() ?? null,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        stats: {
          totalRecharge: stats?.totalRecharge ?? "0.000000",
          orderCount: Number(stats?.orderCount ?? 0),
          apiKeyCount: Number(apiKeyCount ?? 0),
        },
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/users/:id — 更新用户
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/users/:id", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);
    const operatorId = request.user!.userId;

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    const body = request.body as Record<string, any>;

    // 构建更新字段（只允许特定字段）
    const allowedFields = [
      "nickname", "phone", "avatarUrl",
      "status", "role", "discountRate",
      "rpmOverride", "tpmOverride", "userType",
      "disabledUntil", "disabledReason",
    ];

    const updateData: Record<string, any> = {};
    let hasChanges = false;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      reply.status(400).send({ code: 400, data: null, message: "没有需要更新的字段" });
      return;
    }

    // 智能联动：status 变更时自动处理 emailVerifiedAt
    //   pending → active : 手动验证邮箱，自动补齐验证时间
    //   active → pending : 撤销验证，清除验证时间
    if (updateData.status === "active" && user.status === "pending") {
      updateData.emailVerifiedAt = new Date();
    }
    if (updateData.status === "pending" && user.status === "active") {
      updateData.emailVerifiedAt = null;
    }

    // 记录变更快照
    const beforeSnapshot = {
      nickname: user.nickname,
      status: user.status,
      role: user.role,
      discountRate: user.discountRate,
      rpmOverride: user.rpmOverride,
      tpmOverride: user.tpmOverride,
      userType: user.userType,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    };

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId));

      // 审计日志
      await tx.insert(auditLogs).values({
        operatorId,
        action: "user_update",
        targetType: "user",
        targetId: userId,
        before: beforeSnapshot,
        after: updateData,
        ip: request.ip,
        description: `管理员更新用户 #${userId}: ${Object.keys(updateData).join(", ")}`,
      });
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "用户更新成功",
    });
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/v1/admin/users/:id — 删除/禁用用户
  // ──────────────────────────────────────────────

  app.delete("/api/v1/admin/users/:id", {
    preHandler: [requirePerm(Perm.USER_DELETE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);
    const operatorId = request.user!.userId;

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    // 软删除：更新 status 为 deleted，记录 deletedAt
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status: "deleted", deletedAt: new Date() })
        .where(eq(users.id, userId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "user_disable",
        targetType: "user",
        targetId: userId,
        before: { status: user.status },
        after: { status: "deleted" },
        ip: request.ip,
        description: `管理员删除用户 #${userId}`,
      });
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "用户已删除",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/users/:id/recharge — 手动调余额
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/users/:id/recharge", {
    preHandler: [requirePerm(Perm.USER_BALANCE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);
    const operatorId = request.user!.userId;

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const { amount, description } = request.body as {
      amount: string;
      description?: string;
    };

    if (!amount || isNaN(parseFloat(amount))) {
      reply.status(400).send({ code: 400, data: null, message: "无效的金额" });
      return;
    }

    const amountNum = parseFloat(amount);

    const [user] = await db
      .select({ balance: users.balance, id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    const balanceBefore = parseFloat(user.balance);
    const newBalance = balanceBefore + amountNum;
    const newBalanceStr = newBalance.toFixed(6);

    await db.transaction(async (tx) => {
      // 更新余额
      await tx
        .update(users)
        .set({
          balance: newBalanceStr,
        })
        .where(eq(users.id, userId));

      // 余额变动记录
      await tx.insert(balanceLogs).values({
        userId,
        amount: amountNum.toFixed(6),
        balanceAfter: newBalanceStr,
        type: amountNum >= 0 ? "recharge" : "refund",
        refType: "manual",
        description: description
          ? `管理员操作: ${description}`
          : `管理员手动调整余额 (${amountNum >= 0 ? "+" : ""}${amountNum.toFixed(6)})`,
      });

      // 审计日志
      await tx.insert(auditLogs).values({
        operatorId,
        action: "balance_adjust",
        targetType: "user",
        targetId: userId,
        before: { balance: balanceBefore.toFixed(6) },
        after: { balance: newBalanceStr },
        ip: request.ip,
        description: description ?? `管理员手动调整余额: ${amountNum >= 0 ? "+" : ""}${amountNum.toFixed(6)}`,
      });
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "余额调整成功",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/users/:id/reset-pwd — 重置密码
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/users/:id/reset-pwd", {
    preHandler: [requirePerm(Perm.USER_RESET_PWD)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);
    const operatorId = request.user!.userId;

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const { newPassword } = request.body as { newPassword: string };

    if (!newPassword || newPassword.length < 6) {
      reply.status(400).send({ code: 400, data: null, message: "密码至少 6 位" });
      return;
    }

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: hashedPassword })
        .where(eq(users.id, userId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "user_password_reset",
        targetType: "user",
        targetId: userId,
        ip: request.ip,
        description: `管理员重置用户 #${userId} 密码`,
      });
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "密码重置成功",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/audit-logs — 用户审计日志
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id/audit-logs", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const query = request.query as { page?: string; pageSize?: string; cursor?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const useCursor = !!query.cursor;
    const offset = useCursor ? 0 : (page - 1) * pageSize;

    const conditions = [eq(auditLogs.targetType, "user"), eq(auditLogs.targetId, userId)];
    if (useCursor && query.cursor) {
      conditions.push(lt(auditLogs.createdAt, new Date(query.cursor)));
    }

    let total = 0;
    if (!useCursor) {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(eq(auditLogs.targetId, userId));
      total = Number(totalResult?.count ?? 0);
    }

    const queryBuilder = db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        operatorId: auditLogs.operatorId,
        before: auditLogs.before,
        after: auditLogs.after,
        description: auditLogs.description,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize);

    const rows = useCursor ? await queryBuilder : await queryBuilder.offset(offset);
    const nextCursor = useCursor && rows.length === pageSize
      ? rows[rows.length - 1].createdAt.toISOString()
      : undefined;

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        total,
        page,
        pageSize,
        nextCursor,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/balance-logs — 用户余额流水
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id/balance-logs", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const query = request.query as { page?: string; pageSize?: string; cursor?: string; type?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const useCursor = !!query.cursor;
    const offset = useCursor ? 0 : (page - 1) * pageSize;

    const conditions = [eq(balanceLogs.userId, userId)];
    if (useCursor && query.cursor) {
      conditions.push(lt(balanceLogs.createdAt, new Date(query.cursor)));
    }
    if (query.type) {
      conditions.push(eq(balanceLogs.type, query.type as any));
    }

    let total = 0;
    if (!useCursor) {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(balanceLogs)
        .where(and(...conditions));
      total = Number(totalResult?.count ?? 0);
    }

    const queryBuilder = db
      .select()
      .from(balanceLogs)
      .where(and(...conditions))
      .orderBy(desc(balanceLogs.createdAt))
      .limit(pageSize);

    const rows = useCursor ? await queryBuilder : await queryBuilder.offset(offset);
    const nextCursor = useCursor && rows.length === pageSize
      ? rows[rows.length - 1].createdAt.toISOString()
      : undefined;

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
        nextCursor,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/users/:id/change-role — 变更角色
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/users/:id/change-role", {
    preHandler: [requirePerm(Perm.USER_CHANGE_ROLE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);
    const operatorId = request.user!.userId;

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const parsed = adminChangeRoleSchema.parse(request.body);

    const [user] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    if (user.role === parsed.role) {
      reply.status(400).send({ code: 400, data: null, message: "角色未变化" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ role: parsed.role })
        .where(eq(users.id, userId));

      await tx.insert(userRoleHistory).values({
        userId,
        oldRole: user.role,
        newRole: parsed.role,
        operatorId,
        reason: parsed.reason,
      });

      await tx.insert(auditLogs).values({
        operatorId,
        action: "role_change",
        targetType: "user",
        targetId: userId,
        before: { role: user.role },
        after: { role: parsed.role },
        ip: request.ip,
        description: `角色变更: ${user.role} → ${parsed.role}${parsed.reason ? ` (${parsed.reason})` : ""}`,
      });
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "角色变更成功",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/role-history — 角色变更历史
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id/role-history", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
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
      .from(userRoleHistory)
      .where(eq(userRoleHistory.userId, userId))
      .orderBy(desc(userRoleHistory.createdAt))
      .limit(50);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/oauth-bindings — OAuth 绑定列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id/oauth-bindings", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const bindings = await db
      .select({
        id: userOauthBindings.id,
        provider: userOauthBindings.provider,
        providerUserId: userOauthBindings.providerUserId,
        providerEmail: userOauthBindings.providerEmail,
        nickname: userOauthBindings.nickname,
        avatarUrl: userOauthBindings.avatarUrl,
        createdAt: userOauthBindings.createdAt,
      })
      .from(userOauthBindings)
      .where(eq(userOauthBindings.userId, userId))
      .orderBy(desc(userOauthBindings.createdAt));

    reply.status(200).send({
      code: 0,
      data: {
        list: bindings.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() })),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/users/:id/unbind-oauth — 解绑 OAuth
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/users/:id/unbind-oauth", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);
    const operatorId = request.user!.userId;

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const parsed = adminUnbindOAuthSchema.parse(request.body);

    const [binding] = await db
      .select({ id: userOauthBindings.id })
      .from(userOauthBindings)
      .where(and(eq(userOauthBindings.userId, userId), eq(userOauthBindings.provider, parsed.provider)))
      .limit(1);

    if (!binding) {
      reply.status(404).send({ code: 404, data: null, message: `用户未绑定 ${parsed.provider}` });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.delete(userOauthBindings).where(eq(userOauthBindings.id, binding.id));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "user_update",
        targetType: "user",
        targetId: userId,
        ip: request.ip,
        description: `管理员解绑用户第三方账号: ${parsed.provider}`,
      });
    });

    reply.status(200).send({ code: 0, data: null, message: `${parsed.provider} 已解绑` });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/users/batch/disable — 批量禁用
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/users/batch/disable", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;

    const parsed = adminBatchDisableSchema.parse(request.body);

    const usersFound = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(sql`${users.id} = ANY(${sql`ARRAY[${sql.join(parsed.userIds, sql`,`)}]::int[]`})`);

    if (usersFound.length === 0) {
      reply.status(404).send({ code: 404, data: null, message: "未找到有效用户" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: "disabled",
          disabledReason: parsed.reason ?? null,
          disabledBy: operatorId,
          disabledAt: new Date(),
          disabledUntil: parsed.disabledUntil ? new Date(parsed.disabledUntil) : null,
        })
        .where(sql`${users.id} = ANY(${sql`ARRAY[${sql.join(parsed.userIds, sql`,`)}]::int[]`})`);

      for (const u of usersFound) {
        await tx.insert(auditLogs).values({
          operatorId,
          action: "user_disable",
          targetType: "user",
          targetId: u.id,
          before: { status: u.status },
          after: { status: "disabled" },
          ip: request.ip,
          description: `批量禁用${parsed.reason ? `: ${parsed.reason}` : ""}`,
        });
      }
    });

    reply.status(200).send({
      code: 0,
      data: { affected: usersFound.length },
      message: `已禁用 ${usersFound.length} 个用户`,
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/users/batch/enable — 批量启用
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/users/batch/enable", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;

    const parsed = adminBatchEnableSchema.parse(request.body);

    const usersFound = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(sql`${users.id} = ANY(${sql`ARRAY[${sql.join(parsed.userIds, sql`,`)}]::int[]`})`);

    if (usersFound.length === 0) {
      reply.status(404).send({ code: 404, data: null, message: "未找到有效用户" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: "active",
          disabledReason: null,
          disabledBy: null,
          disabledAt: null,
          disabledUntil: null,
        })
        .where(sql`${users.id} = ANY(${sql`ARRAY[${sql.join(parsed.userIds, sql`,`)}]::int[]`})`);

      for (const u of usersFound) {
        await tx.insert(auditLogs).values({
          operatorId,
          action: "user_enable",
          targetType: "user",
          targetId: u.id,
          before: { status: u.status, disabledReason: null },
          after: { status: "active" },
          ip: request.ip,
          description: "批量启用",
        });
      }
    });

    reply.status(200).send({
      code: 0,
      data: { affected: usersFound.length },
      message: `已启用 ${usersFound.length} 个用户`,
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/export — 导出用户列表 (CSV)
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/export", {
    preHandler: [requirePerm(Perm.USER_LIST)],
  }, async (request, reply) => {
    const db = getDb();

    const query = request.query as Record<string, string | undefined>;
    const parsed = adminExportUsersQuerySchema.parse(query);

    const conditions = [sql`1=1`];
    if (parsed.keyword) {
      conditions.push(
        sql`(${users.email}::text ILIKE ${`%${parsed.keyword}%`} OR ${users.nickname}::text ILIKE ${`%${parsed.keyword}%`})`,
      );
    }
    if (parsed.status) conditions.push(eq(users.status, parsed.status as any));
    if (parsed.userType) conditions.push(eq(users.userType, parsed.userType as any));
    if (parsed.role) conditions.push(eq(users.role, parsed.role as any));
    if (parsed.startDate) conditions.push(gte(users.createdAt, new Date(parsed.startDate)));
    if (parsed.endDate) {
      const end = new Date(parsed.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(sql`${users.createdAt} < ${end}`);
    }

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        nickname: users.nickname,
        phone: users.phone,
        userType: users.userType,
        role: users.role,
        status: users.status,
        balance: users.balance,
        discountRate: users.discountRate,
        realNameStatus: users.realNameStatus,
        realName: users.realName,
        companyName: users.companyName,
        emailVerifiedAt: users.emailVerifiedAt,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt));

    // 生成 CSV
    const header = "ID,邮箱,昵称,手机号,类型,角色,状态,余额,折扣,实名状态,姓名,公司,邮箱验证,最后登录,注册时间";
    const csvRows = rows.map((r) => {
      const escape = (v: unknown) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [
        r.id,
        r.email,
        escape(r.nickname),
        escape(r.phone),
        r.userType,
        r.role,
        r.status,
        r.balance,
        r.discountRate,
        r.realNameStatus,
        escape(r.realName),
        escape(r.companyName),
        r.emailVerifiedAt?.toISOString() ?? "",
        r.lastLoginAt?.toISOString() ?? "",
        r.createdAt.toISOString(),
      ].join(",");
    });

    const csv = "\uFEFF" + [header, ...csvRows].join("\n"); // BOM for Chinese Excel

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="users_export_${Date.now()}.csv"`);
    reply.status(200).send(csv);
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/users — 管理员创建用户
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/users", {
    preHandler: [requirePerm(Perm.USER_CREATE)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;

    const parsed = adminCreateUserSchema.parse(request.body);

    // 检查邮箱是否已存在
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      reply.status(409).send({ code: 409, data: null, message: "该邮箱已注册" });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.password, SALT_ROUNDS);

    await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          email: parsed.email.toLowerCase(),
          passwordHash,
          nickname: parsed.nickname ?? null,
          phone: parsed.phone ?? null,
          userType: parsed.userType,
          role: parsed.role,
          status: parsed.status,
          balance: parsed.balance ?? "0.000000",
          discountRate: parsed.discountRate ?? "1.0000",
          emailVerifiedAt: parsed.status === "active" ? new Date() : null,
        })
        .returning({ id: users.id, email: users.email });

      await tx.insert(auditLogs).values({
        operatorId,
        action: "user_create",
        targetType: "user",
        targetId: newUser.id,
        after: parsed,
        ip: request.ip,
        description: `管理员创建用户: ${parsed.email}${parsed.remark ? ` (${parsed.remark})` : ""}`,
      });

      reply.status(200).send({
        code: 0,
        data: { id: newUser.id, email: newUser.email },
        message: "用户创建成功",
      });
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/login-history — 登录历史
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id/login-history", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const query = request.query as { page?: string; pageSize?: string; cursor?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const useCursor = !!query.cursor;
    const offset = useCursor ? 0 : (page - 1) * pageSize;

    const conditions = [eq(userLoginHistory.userId, userId)];
    if (useCursor && query.cursor) {
      conditions.push(lt(userLoginHistory.createdAt, new Date(query.cursor)));
    }

    let total = 0;
    if (!useCursor) {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userLoginHistory)
        .where(eq(userLoginHistory.userId, userId));
      total = Number(totalResult?.count ?? 0);
    }

    const queryBuilder = db
      .select()
      .from(userLoginHistory)
      .where(and(...conditions))
      .orderBy(desc(userLoginHistory.createdAt))
      .limit(pageSize);

    const rows = useCursor ? await queryBuilder : await queryBuilder.offset(offset);
    const nextCursor = useCursor && rows.length === pageSize
      ? rows[rows.length - 1].createdAt.toISOString()
      : undefined;

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        total,
        page,
        pageSize,
        nextCursor,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/call-stats — 调用统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id/call-stats", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const query = request.query as { startDate?: string; endDate?: string };

    const conditions = [eq(callLogs.userId, userId)];
    if (query.startDate) {
      conditions.push(sql`${callLogs.createdAt} >= ${new Date(query.startDate)}`);
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(sql`${callLogs.createdAt} < ${end}`);
    }

    const [summary] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failedCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs}), 0)::int`,
      })
      .from(callLogs)
      .where(and(...conditions));

    // 按模型分组
    const byModel = await db
      .select({
        modelName: callLogs.modelName,
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
        cost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
      })
      .from(callLogs)
      .where(and(...conditions))
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    reply.status(200).send({
      code: 0,
      data: {
        summary: {
          totalCalls: summary?.totalCalls ?? 0,
          totalTokens: summary?.totalTokens ?? 0,
          totalCost: summary?.totalCost ?? "0.000000",
          successCalls: summary?.successCalls ?? 0,
          failedCalls: summary?.failedCalls ?? 0,
          avgDuration: summary?.avgDuration ?? 0,
        },
        byModel: byModel.map((m) => ({
          modelName: m.modelName,
          calls: m.calls,
          tokens: m.tokens,
          cost: m.cost,
        })),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  用户备注 (Notes)
  // ──────────────────────────────────────────────

  //  GET /api/v1/admin/users/:id/notes — 备注列表

  app.get("/api/v1/admin/users/:id/notes", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const rows = await db
      .select({
        id: userNotes.id,
        content: userNotes.content,
        createdBy: userNotes.createdBy,
        createdAt: userNotes.createdAt,
        updatedAt: userNotes.updatedAt,
      })
      .from(userNotes)
      .where(eq(userNotes.userId, userId))
      .orderBy(desc(userNotes.createdAt));

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
      message: "ok",
    });
  });

  //  POST /api/v1/admin/users/:id/notes — 添加备注

  app.post("/api/v1/admin/users/:id/notes", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const parsed = adminAddUserNoteSchema.parse(request.body);

    const [note] = await db
      .insert(userNotes)
      .values({
        userId,
        content: parsed.content,
        createdBy: request.user!.userId,
      })
      .returning({ id: userNotes.id });

    reply.status(200).send({
      code: 0,
      data: { id: note.id },
      message: "备注已添加",
    });
  });

  //  DELETE /api/v1/admin/users/:id/notes/:noteId — 删除备注

  app.delete("/api/v1/admin/users/:id/notes/:noteId", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id, noteId } = request.params as { id: string; noteId: string };
    const userId = parseInt(id, 10);
    const parsedNoteId = parseInt(noteId, 10);

    if (isNaN(userId) || isNaN(parsedNoteId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的参数" });
      return;
    }

    const [note] = await db
      .select({ id: userNotes.id })
      .from(userNotes)
      .where(and(eq(userNotes.id, parsedNoteId), eq(userNotes.userId, userId)))
      .limit(1);

    if (!note) {
      reply.status(404).send({ code: 404, data: null, message: "备注不存在" });
      return;
    }

    await db.delete(userNotes).where(eq(userNotes.id, parsedNoteId));
    reply.status(200).send({ code: 0, data: null, message: "备注已删除" });
  });

  // ──────────────────────────────────────────────
  //  IP 白名单管理
  // ──────────────────────────────────────────────

  //  GET /api/v1/admin/users/:id/ip-whitelist — 列表

  app.get("/api/v1/admin/users/:id/ip-whitelist", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const list = await db
      .select()
      .from(userIpWhitelist)
      .where(and(eq(userIpWhitelist.userId, userId), eq(userIpWhitelist.enabled, true)))
      .orderBy(desc(userIpWhitelist.createdAt));

    reply.status(200).send({
      code: 0,
      data: {
        list: list.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
      message: "ok",
    });
  });

  //  POST /api/v1/admin/users/:id/ip-whitelist — 添加

  app.post("/api/v1/admin/users/:id/ip-whitelist", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const parsed = adminIpWhitelistSchema.parse(request.body);

    // 检查是否已存在
    const existing = await db
      .select({ id: userIpWhitelist.id })
      .from(userIpWhitelist)
      .where(and(eq(userIpWhitelist.userId, userId), eq(userIpWhitelist.ip, parsed.ip)))
      .limit(1);

    if (existing.length > 0) {
      // 如果存在但被禁用，重新启用
      await db
        .update(userIpWhitelist)
        .set({ enabled: true, description: parsed.description ?? null, updatedAt: new Date() })
        .where(eq(userIpWhitelist.id, existing[0].id));

      reply.status(200).send({ code: 0, data: null, message: "IP 白名单已更新" });
      return;
    }

    await db.insert(userIpWhitelist).values({
      userId,
      ip: parsed.ip,
      description: parsed.description ?? null,
    });

    reply.status(200).send({ code: 0, data: null, message: "IP 已加入白名单" });
  });

  //  DELETE /api/v1/admin/users/:id/ip-whitelist/:whitelistId — 删除

  app.delete("/api/v1/admin/users/:id/ip-whitelist/:whitelistId", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id, whitelistId } = request.params as { id: string; whitelistId: string };
    const userId = parseInt(id, 10);
    const parsedId = parseInt(whitelistId, 10);

    if (isNaN(userId) || isNaN(parsedId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的参数" });
      return;
    }

    const [entry] = await db
      .select({ id: userIpWhitelist.id })
      .from(userIpWhitelist)
      .where(and(eq(userIpWhitelist.id, parsedId), eq(userIpWhitelist.userId, userId)))
      .limit(1);

    if (!entry) {
      reply.status(404).send({ code: 404, data: null, message: "白名单条目不存在" });
      return;
    }

    // 软删除：禁用而不是物理删除
    await db
      .update(userIpWhitelist)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(userIpWhitelist.id, parsedId));

    reply.status(200).send({ code: 0, data: null, message: "IP 已从白名单移除" });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/export-data — 用户数据导出
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id/export-data", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    // 敏感字段脱敏
    const safeUser = {
      ...user,
      passwordHash: undefined,
      idFrontImage: user.idFrontImage ? "[图片文件]" : null,
      idBackImage: user.idBackImage ? "[图片文件]" : null,
      businessLicense: user.businessLicense ? "[图片文件]" : null,
    };
    delete safeUser.passwordHash;

    // 收集相关数据
    const [apiKeyList, balanceLogList, callLogSummary, oauthBindings, notesList] = await Promise.all([
      db
        .select({ name: apiKeys.name, keyPrefix: apiKeys.keyPrefix, status: apiKeys.status, createdAt: apiKeys.createdAt })
        .from(apiKeys)
        .where(eq(apiKeys.userId, userId)),
      db
        .select({ amount: balanceLogs.amount, type: balanceLogs.type, balanceAfter: balanceLogs.balanceAfter, description: balanceLogs.description, createdAt: balanceLogs.createdAt })
        .from(balanceLogs)
        .where(eq(balanceLogs.userId, userId))
        .orderBy(desc(balanceLogs.createdAt))
        .limit(100),
      db
        .select({ totalCalls: sql<number>`count(*)::int`, totalTokens: sql<number>`coalesce(sum(total_tokens),0)::int`, totalCost: sql<string>`coalesce(sum(cost)::text,'0.000000')` })
        .from(callLogs)
        .where(eq(callLogs.userId, userId)),
      db
        .select({ provider: userOauthBindings.provider, createdAt: userOauthBindings.createdAt })
        .from(userOauthBindings)
        .where(eq(userOauthBindings.userId, userId)),
      db
        .select({ content: userNotes.content, createdAt: userNotes.createdAt })
        .from(userNotes)
        .where(eq(userNotes.userId, userId))
        .orderBy(desc(userNotes.createdAt)),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: safeUser,
      stats: callLogSummary[0] ?? { totalCalls: 0, totalTokens: 0, totalCost: "0.000000" },
      apiKeys: apiKeyList,
      balanceLogs: balanceLogList.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
      oauthBindings: oauthBindings.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() })),
      adminNotes: notesList.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    };

    const json = JSON.stringify(exportData, null, 2);

    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="user_${userId}_data_export_${Date.now()}.json"`);
    reply.status(200).send(json);
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/users/impersonate — 模拟登录
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/users/impersonate", {
    preHandler: [requirePerm(Perm.USER_IMPERSONATE)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;
    const parsed = adminImpersonateSchema.parse(request.body);

    const [targetUser] = await db
      .select({ id: users.id, role: users.role, status: users.status, email: users.email })
      .from(users)
      .where(eq(users.id, parsed.userId))
      .limit(1);

    if (!targetUser) {
      reply.status(404).send({ code: 404, data: null, message: "目标用户不存在" });
      return;
    }

    if (targetUser.status === "deleted") {
      reply.status(400).send({ code: 400, data: null, message: "目标用户已注销" });
      return;
    }

    if (targetUser.role === "super_admin") {
      reply.status(403).send({ code: 403, data: null, message: "不允许模拟超管账号" });
      return;
    }

    // 生成模拟 token，有效期按参数
    const expiresIn = parsed.durationMinutes * 60;
    const jwt = await import("jsonwebtoken");
    const { config } = await import("../../config.js");

    const impersonateToken = jwt.default.sign(
      { userId: targetUser.id, role: targetUser.role, impersonatorId: operatorId },
      config.jwt.accessSecret,
      { expiresIn }
    );

    await db.insert(auditLogs).values({
      operatorId,
      action: "user_impersonate" as any,
      targetType: "user",
      targetId: targetUser.id,
      ip: request.ip,
      description: `管理员模拟登录: ${targetUser.email}${parsed.reason ? ` (${parsed.reason})` : ""}`,
    });

    reply.status(200).send({
      code: 0,
      data: {
        accessToken: impersonateToken,
        expiresIn,
        userId: targetUser.id,
        role: targetUser.role,
        warning: `您正在以 ${targetUser.email} 的身份操作，有效期 ${parsed.durationMinutes} 分钟`,
      },
      message: "模拟 Token 已生成",
    });
  });

  // ══════════════════════════════════════════════════════════
  //  调用明细 & 趋势 (用户级 + API Key 级)
  // ══════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/call-logs — 用户调用明细列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id/call-logs", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const query = request.query as {
      page?: string;
      pageSize?: string;
      startDate?: string;
      endDate?: string;
      modelName?: string;
      status?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(callLogs.userId, userId)];
    if (query.startDate) conditions.push(sql`${callLogs.createdAt} >= ${new Date(query.startDate)}`);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(sql`${callLogs.createdAt} < ${end}`);
    }
    if (query.modelName) conditions.push(sql`${callLogs.modelName} ILIKE ${`%${query.modelName}%`}`);
    if (query.status) conditions.push(eq(callLogs.status, query.status as any));

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(callLogs)
      .where(and(...conditions));

    const total = Number(totalResult?.count ?? 0);

    const rows = await db
      .select({
        id: callLogs.id,
        modelId: callLogs.modelId,
        apiKeyId: callLogs.apiKeyId,
        modelName: callLogs.modelName,
        vendorName: callLogs.vendorName,
        promptTokens: callLogs.promptTokens,
        completionTokens: callLogs.completionTokens,
        totalTokens: callLogs.totalTokens,
        cost: callLogs.cost,
        durationMs: callLogs.durationMs,
        status: callLogs.status,
        isStreaming: callLogs.isStreaming,
        errorMessage: callLogs.errorMessage,
        ip: callLogs.ip,
        userAgent: callLogs.userAgent,
        createdAt: callLogs.createdAt,
      })
      .from(callLogs)
      .where(and(...conditions))
      .orderBy(desc(callLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/call-trends — 用户调用趋势
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/users/:id/call-trends", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const query = request.query as { days?: string; granularity?: string };
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "7", 10) || 7));
    const granularity = query.granularity === "hour" ? "hour" : "day";

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    const trunc = granularity === "hour"
      ? sql`date_trunc('hour', ${callLogs.createdAt})`
      : sql`date_trunc('day', ${callLogs.createdAt})`;

    const rows = await db
      .select({
        date: sql<string>`${trunc}::text`,
        totalCalls: sql<number>`count(*)::int`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failedCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
        promptTokens: sql<number>`coalesce(sum(${callLogs.promptTokens}), 0)::int`,
        completionTokens: sql<number>`coalesce(sum(${callLogs.completionTokens}), 0)::int`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs}), 0)::int`,
      })
      .from(callLogs)
      .where(and(
        eq(callLogs.userId, userId),
        sql`${callLogs.createdAt} >= ${start}`,
        sql`${callLogs.createdAt} < ${end}`,
      ))
      .groupBy(trunc)
      .orderBy(sql`1`);

    const series = rows.map((r) => ({
      date: r.date,
      calls: {
        total: r.totalCalls,
        success: r.successCalls,
        failed: r.failedCalls,
        successRate: r.totalCalls > 0
          ? parseFloat(((r.successCalls / r.totalCalls) * 100).toFixed(1))
          : 100,
      },
      tokens: {
        total: r.totalTokens,
        prompt: r.promptTokens,
        completion: r.completionTokens,
      },
      cost: r.totalCost,
      avgDuration: r.avgDuration,
    }));

    reply.status(200).send({
      code: 0,
      data: { days, series },
      message: "ok",
    });
  });

}
