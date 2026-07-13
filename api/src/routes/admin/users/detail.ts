import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, lt } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
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
} from "../../../db/schema.js";
import { getRedis } from "../../../redis.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import {
  adminUnbindOAuthSchema,
  adminAddUserNoteSchema,
  adminIpWhitelistSchema,
} from "../../../schemas.js";
import type {
  AdminUnbindOAuthInput,
  AdminAddUserNoteInput,
  AdminIpWhitelistInput,
} from "../../../schemas.js";

export async function detailRoutes(app: FastifyInstance) {
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
  //  GET /api/v1/admin/users/:id/call-stats — 调用统计（深度分析）
  //
  //  返回: summary(总量/成功/失败/耗时) + byModel + trends(7天) + hourly(24h) + byKey

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
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const conditions = [eq(callLogs.userId, userId)];
    if (query.startDate) conditions.push(sql`${callLogs.createdAt} >= ${new Date(query.startDate)}`);
    if (query.endDate) {
      const end = new Date(query.endDate); end.setDate(end.getDate() + 1);
      conditions.push(sql`${callLogs.createdAt} < ${end}`);
    }

    // 总量统计
    const [summary] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failedCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs}), 0)::int`,
      }).from(callLogs).where(and(...conditions));

    // 今日统计
    const [today] = await db
      .select({
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
        successCount: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failedCount: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
      }).from(callLogs).where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, todayStart)));

    // 按模型分布
    const byModel = await db
      .select({
        modelName: callLogs.modelName,
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
        cost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
        successCount: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failedCount: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
      }).from(callLogs).where(and(...conditions))
      .groupBy(callLogs.modelName).orderBy(sql`count(*) desc`).limit(20);

    // 7天趋势
    const trends = await db
      .select({
        date: sql<string>`to_char(${callLogs.createdAt}, 'MM-DD')`,
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
      }).from(callLogs).where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, sevenDaysAgo)))
      .groupBy(sql`to_char(${callLogs.createdAt}, 'MM-DD')`).orderBy(sql`to_char(${callLogs.createdAt}, 'MM-DD')`);

    // 24h分布
    const hourly = await db
      .select({
        hour: sql<number>`extract(hour from ${callLogs.createdAt})::int`,
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      }).from(callLogs).where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, hours24Ago)))
      .groupBy(sql`extract(hour from ${callLogs.createdAt})`).orderBy(sql`extract(hour from ${callLogs.createdAt})`);

    // 按Key分布
    const byKey = await db
      .select({
        apiKeyId: callLogs.apiKeyId,
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
        cost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
      }).from(callLogs).where(and(...conditions))
      .groupBy(callLogs.apiKeyId).orderBy(sql`count(*) desc`).limit(10);

    reply.status(200).send({
      code: 0,
      data: {
        summary: {
          totalCalls: summary?.totalCalls ?? 0, totalTokens: summary?.totalTokens ?? 0,
          totalCost: summary?.totalCost ?? "0.000000", successCalls: summary?.successCalls ?? 0,
          failedCalls: summary?.failedCalls ?? 0, avgDuration: summary?.avgDuration ?? 0,
        },
        today: { calls: today?.calls ?? 0, tokens: Number(today?.tokens ?? 0), cost: today?.cost ?? '0', successCount: today?.successCount ?? 0, failedCount: today?.failedCount ?? 0 },
        byModel: byModel.map((m) => ({ modelName: m.modelName, calls: m.calls, tokens: m.tokens, cost: m.cost, successCount: m.successCount, failedCount: m.failedCount })),
        byKey: byKey.map((k) => ({ apiKeyId: k.apiKeyId, calls: k.calls, tokens: k.tokens, cost: k.cost })),
        trends, hourly,
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
