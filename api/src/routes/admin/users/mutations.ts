import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import {
  users,
  auditLogs,
} from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

import bcrypt from "bcryptjs";
import { config } from "../../../config.js";
import { adminCreateUserSchema } from "../../../schemas.js";
import type { AdminCreateUserInput } from "../../../schemas.js";

const SALT_ROUNDS = config.bcrypt.saltRounds;

export async function mutationsRoutes(app: FastifyInstance) {
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
}
