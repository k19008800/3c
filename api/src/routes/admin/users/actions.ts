import { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import {
  users,
  balanceLogs,
  auditLogs,
} from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

import bcrypt from "bcryptjs";
import { config } from "../../../config.js";
import {
  adminBatchDisableSchema,
  adminBatchEnableSchema,
  adminImpersonateSchema,
} from "../../../schemas.js";
import type {
  AdminBatchDisableInput,
  AdminBatchEnableInput,
  AdminImpersonateInput,
} from "../../../schemas.js";

const SALT_ROUNDS = config.bcrypt.saltRounds;

export async function actionsRoutes(app: FastifyInstance) {
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
    const { config } = await import("../../../config.js");

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
}
