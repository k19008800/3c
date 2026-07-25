// ============================================================
//  3cloud (3C) — 用户操作路由（管理员）
//  POST /api/v1/admin/users/:id/recharge — 手动调余额
//  POST /api/v1/admin/users/:id/reset-pwd — 重置密码
//  POST /api/v1/admin/users/impersonate — 模拟登录
//  
//  注意：batch/disable 和 batch/enable 已移至 batch.ts
// ============================================================

import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import {
  users,
  balanceLogs,
  auditLogs,
  rechargeOrders,
} from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { config } from "../../../config.js";
import {
  adminImpersonateSchema,
} from "../../../schemas.js";
import type {
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
    const REVIEW_THRESHOLD = 1000;

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

    // ── 大额调整阈值检查 ──
    // 金额绝对值 > 1000 元时，创建待审核充值订单，不走直接调整
    if (Math.abs(amountNum) > REVIEW_THRESHOLD) {
      const orderNo = `ADM${crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;

      await db.insert(rechargeOrders).values({
        userId,
        orderNo,
        amount: amountNum.toFixed(6),
        channel: "bank_transfer",
        status: "pending",
        remark: description
          ? `管理员大额余额调整，待审核: ${description}`
          : `管理员大额余额调整 (${amountNum >= 0 ? "+" : ""}${amountNum.toFixed(6)})，待审核`,
      });

      await db.insert(auditLogs).values({
        operatorId,
        action: "balance_adjust",
        targetType: "user",
        targetId: userId,
        before: { balance: balanceBefore.toFixed(6) },
        after: { pendingReview: true, amount: amountNum.toFixed(6), orderNo },
        ip: request.ip,
        description: `大额余额调整已创建待审核订单: ${amountNum >= 0 ? "+" : ""}${amountNum.toFixed(6)}${description ? ` (${description})` : ""}`,
      });

      reply.status(200).send({
        code: 0,
        data: { orderNo },
        message: "金额超过 1000 元，需要审核确认",
      });
      return;
    }

    // ── 小额直接调整 ──
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