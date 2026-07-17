import { eq, sql, desc } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { getDb } from "../../../../db/index.js";
import {
  users,
  rechargeOrders,
  apiKeys,
  balanceLogs,
  callLogs,
  userOauthBindings,
  userNotes,
} from "../../../../db/schema.js";
import { getRedis } from "../../../../redis.js";
import { requirePerm, Perm } from "../../../../middleware/auth.js";
import { validateUserId } from "./types.js";

export function registerInfoRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id — 用户详情
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

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

    // API Key 数量
    const [{ apiKeyCount }] = await db
      .select({ apiKeyCount: sql<number>`count(*)` })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));

    // 充值统计
    const [stats] = await db
      .select({
        totalRecharge: sql<string>`coalesce(sum(case when ${rechargeOrders.status} in ('paid','confirmed') then ${rechargeOrders.amount} else 0 end)::text, '0.000000')`,
        orderCount: sql<number>`count(*)`,
      })
      .from(rechargeOrders)
      .where(eq(rechargeOrders.userId, userId));

    // Redis 封禁状态
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
  //  GET /api/v1/admin/users/:id/export-data — 用户数据导出
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/export-data", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    // 脱敏
    const safeUser = {
      ...user,
      passwordHash: undefined,
      idFrontImage: user.idFrontImage ? "[图片文件]" : null,
      idBackImage: user.idBackImage ? "[图片文件]" : null,
      businessLicense: user.businessLicense ? "[图片文件]" : null,
    };
    delete safeUser.passwordHash;

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
}
