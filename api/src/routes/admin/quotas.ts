// ============================================================
//  3cloud (3C) — Admin 额度预算管理路由
//  POST   /api/v1/admin/quotas          — 设置用户额度
//  GET    /api/v1/admin/quotas          — 查询额度列表
//  PUT    /api/v1/admin/quotas/:id      — 修改额度
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { userQuotas, keyQuotas, users, apiKeys, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

// ── Admin routes ──

export async function adminQuotaRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/quotas — 设置用户额度
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/quotas", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const body = request.body as any;
    const { userId, quotaType, quotaAmount, alertPercent, periodStart, periodEnd, reason, rpmLimit, tpmLimit } = body;

    if (!userId || !quotaAmount || !periodStart || !periodEnd) {
      return reply.status(400).send({ code: 1, message: "缺少必填字段: userId, quotaAmount, periodStart, periodEnd" });
    }

    const db = getDb();

    // 验证用户存在
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return reply.status(404).send({ code: 1, message: "用户不存在" });
    }

    const [quota] = await db
      .insert(userQuotas)
      .values({
        userId,
        quotaType: quotaType ?? "monthly",
        quotaAmount: String(quotaAmount),
        alertPercent: String(alertPercent ?? 80),
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        setBy: request.user!.userId,
        setByRole: "admin",
        reason: reason ?? null,
        rpmLimit: rpmLimit ?? null,
        tpmLimit: tpmLimit ?? null,
      })
      .returning();

    // 审计日志
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "quota_create",
      targetType: "user_quota",
      targetId: quota.id,
      after: {
        userId: quota.userId,
        quotaType: quota.quotaType,
        quotaAmount: quota.quotaAmount,
        periodStart: quota.periodStart,
        periodEnd: quota.periodEnd,
        setByRole: quota.setByRole,
        rpmLimit: quota.rpmLimit,
        tpmLimit: quota.tpmLimit,
      },
      ip: request.ip,
      description: `管理员为用户 #${userId} 设置额度 ¥${quotaAmount}（${quotaType ?? "monthly"}）`,
    });

    reply.status(201).send({
      code: 0,
      data: quota,
      message: "额度设置成功",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/quotas — 查询额度列表
  //  Query: user_id, status (active|expired)
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/quotas", {
    preHandler: [requirePerm(Perm.USER_LIST)],
  }, async (request, reply) => {
    const query = request.query as { user_id?: string; status?: string; limit?: string; offset?: string };
    const db = getDb();
    const now = new Date();

    const conditions: any[] = [];

    if (query.user_id) {
      conditions.push(eq(userQuotas.userId, parseInt(query.user_id, 10)));
    }

    if (query.status === "active") {
      conditions.push(lte(userQuotas.periodStart, now));
      conditions.push(gte(userQuotas.periodEnd, now));
    } else if (query.status === "expired") {
      conditions.push(sql`${userQuotas.periodEnd} < ${now}`);
    }

    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10)));
    const offset = Math.max(0, parseInt(query.offset ?? "0", 10));

    const rows = await db
      .select({
        id: userQuotas.id,
        userId: userQuotas.userId,
        userEmail: users.email,
        userNickname: users.nickname,
        quotaType: userQuotas.quotaType,
        quotaAmount: userQuotas.quotaAmount,
        usedAmount: userQuotas.usedAmount,
        alertPercent: userQuotas.alertPercent,
        periodStart: userQuotas.periodStart,
        periodEnd: userQuotas.periodEnd,
        setBy: userQuotas.setBy,
        setByRole: userQuotas.setByRole,
        reason: userQuotas.reason,
        rpmLimit: userQuotas.rpmLimit,
        tpmLimit: userQuotas.tpmLimit,
        createdAt: userQuotas.createdAt,
        updatedAt: userQuotas.updatedAt,
      })
      .from(userQuotas)
      .leftJoin(users, eq(userQuotas.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(userQuotas.createdAt))
      .limit(limit)
      .offset(offset);

    // 计算总额
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userQuotas)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    reply.send({
      code: 0,
      data: {
        items: rows,
        total: totalResult?.count ?? 0,
        limit,
        offset,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  PUT /api/v1/admin/quotas/:id — 修改额度
  // ──────────────────────────────────────────────

  app.put("/api/v1/admin/quotas/:id", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const db = getDb();

    // 读取旧值用于审计
    const [oldQuota] = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.id, parseInt(id, 10)))
      .limit(1);

    if (!oldQuota) {
      return reply.status(404).send({ code: 1, message: "额度记录不存在" });
    }

    const updateData: Record<string, any> = {};

    if (body.quotaAmount !== undefined) updateData.quotaAmount = String(body.quotaAmount);
    if (body.usedAmount !== undefined) updateData.usedAmount = String(body.usedAmount);
    if (body.alertPercent !== undefined) updateData.alertPercent = String(body.alertPercent);
    if (body.periodStart !== undefined) updateData.periodStart = new Date(body.periodStart);
    if (body.periodEnd !== undefined) updateData.periodEnd = new Date(body.periodEnd);
    if (body.reason !== undefined) updateData.reason = body.reason;
    if (body.rpmLimit !== undefined) updateData.rpmLimit = body.rpmLimit;
    if (body.tpmLimit !== undefined) updateData.tpmLimit = body.tpmLimit;
    // 管理员修改时强制更新 setByRole 和 setBy
    updateData.setByRole = "admin";
    updateData.setBy = request.user!.userId;
    updateData.updatedAt = new Date();

    const [quota] = await db
      .update(userQuotas)
      .set(updateData)
      .where(eq(userQuotas.id, parseInt(id, 10)))
      .returning();

    if (!quota) {
      return reply.status(404).send({ code: 1, message: "额度记录不存在" });
    }

    // 审计日志
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "quota_update",
      targetType: "user_quota",
      targetId: quota.id,
      before: {
        quotaAmount: oldQuota.quotaAmount,
        usedAmount: oldQuota.usedAmount,
        alertPercent: oldQuota.alertPercent,
        periodEnd: oldQuota.periodEnd,
        reason: oldQuota.reason,
      },
      after: {
        quotaAmount: quota.quotaAmount,
        usedAmount: quota.usedAmount,
        alertPercent: quota.alertPercent,
        periodEnd: quota.periodEnd,
        reason: quota.reason,
        rpmLimit: quota.rpmLimit,
        tpmLimit: quota.tpmLimit,
      },
      ip: request.ip,
      description: `管理员修改额度 #${quota.id}（用户 #${quota.userId}）`,
    });

    reply.send({
      code: 0,
      data: quota,
      message: "额度更新成功",
    });
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/v1/admin/quotas/:id — 删除额度规则
  // ──────────────────────────────────────────────

  app.delete("/api/v1/admin/quotas/:id", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const [quota] = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.id, parseInt(id, 10)))
      .limit(1);

    if (!quota) {
      return reply.status(404).send({ code: 1, message: "额度记录不存在" });
    }

    // 硬删除
    await db
      .delete(userQuotas)
      .where(eq(userQuotas.id, parseInt(id, 10)));

    // 审计日志
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "quota_delete",
      targetType: "user_quota",
      targetId: quota.id,
      before: {
        userId: quota.userId,
        quotaType: quota.quotaType,
        quotaAmount: quota.quotaAmount,
        usedAmount: quota.usedAmount,
      },
      ip: request.ip,
      description: `管理员删除额度 #${quota.id}（用户 #${quota.userId}）`,
    });

    reply.send({
      code: 0,
      data: null,
      message: "额度已删除",
    });
  });
}
