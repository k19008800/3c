import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { users } from "../../../db/schema.js";
import { getRedis } from "../../../redis.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { adminExportUsersQuerySchema } from "../../../schemas.js";
import type { AdminExportUsersQuery } from "../../../schemas.js";
import { streamExportCsv, EXPORT_CONFIG } from "../../../utils/stream-export.js";

export async function listRoutes(app: FastifyInstance) {
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
  //  GET /api/v1/admin/users/export — 导出用户列表 (CSV) - 流式优化
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

    const headers = [
      "ID", "邮箱", "昵称", "手机号", "类型", "角色", "状态", "余额", "折扣", 
      "实名状态", "姓名", "公司", "邮箱验证", "最后登录", "注册时间"
    ];

    await streamExportCsv(
      reply,
      {
        filename: `users_export_${Date.now()}.csv`,
        maxRows: EXPORT_CONFIG.MAX_EXPORT_ROWS,
        batchSize: EXPORT_CONFIG.BATCH_SIZE,
        timeoutMs: EXPORT_CONFIG.TIMEOUT_MS,
      },
      async (offset: number, limit: number) => {
        return await db
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
          .orderBy(desc(users.createdAt))
          .limit(limit)
          .offset(offset);
      },
      (row: any) => [
        String(row.id),
        row.email,
        row.nickname ?? "",
        row.phone ?? "",
        row.userType,
        row.role,
        row.status,
        row.balance,
        row.discountRate ?? "",
        row.realNameStatus ?? "",
        row.realName ?? "",
        row.companyName ?? "",
        row.emailVerifiedAt?.toISOString() ?? "",
        row.lastLoginAt?.toISOString() ?? "",
        row.createdAt.toISOString(),
      ],
      headers
    );
  });
}
