// ============================================================
//  3cloud (3C) — TPM/RPM 限流管理路由（管理员）
//  GET    /api/v1/admin/rate-limits/rules           — 规则+当前水位
//  PATCH  /api/v1/admin/rate-limits/rules           — 批量更新规则
//  GET    /api/v1/admin/rate-limits/overrides       — 用户覆盖规则列表
//  POST   /api/v1/admin/rate-limits/overrides       — 设置/更新用户级 RPM/TPM
//  PATCH  /api/v1/admin/rate-limits/overrides/:id   — 部分更新覆盖值
//  DELETE /api/v1/admin/rate-limits/overrides/:id   — 删除覆盖
//  GET    /api/v1/admin/rate-limits/hits            — 限流命中事件
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { systemConfigs, userQuotas, users, auditLogs, callLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { clearRateLimitCache } from "../../middleware/rate-limit.js";

// ── 常量 ──

const WINDOW_SECONDS = 60;

interface SetOverrideBody {
  userId: number;
  rpmLimit: number | null;
  tpmLimit: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

const RATE_LIMIT_KEYS = [
  "rate_limit_personal_rpm",
  "rate_limit_personal_tpm",
  "rate_limit_enterprise_rpm",
  "rate_limit_enterprise_tpm",
  "rate_limit_global_rpm",
  "rate_limit_global_tpm",
] as const;

const KEY_DEFAULTS: Record<string, string> = {
  rate_limit_personal_rpm: "60",
  rate_limit_personal_tpm: "100000",
  rate_limit_enterprise_rpm: "300",
  rate_limit_enterprise_tpm: "500000",
  rate_limit_global_rpm: "30",
  rate_limit_global_tpm: "50000",
};

const KEY_LABELS: Record<string, string> = {
  rate_limit_personal_rpm: "个人用户每分钟请求数 (RPM)",
  rate_limit_personal_tpm: "个人用户每分钟 Token 数 (TPM)",
  rate_limit_enterprise_rpm: "企业用户每分钟请求数 (RPM)",
  rate_limit_enterprise_tpm: "企业用户每分钟 Token 数 (TPM)",
  rate_limit_global_rpm: "全局兜底每分钟请求数 (RPM)",
  rate_limit_global_tpm: "全局兜底每分钟 Token 数 (TPM)",
};

// ── 帮助函数：读 Redis 滑窗水位 ──

async function getRedisCount(redisKey: string): Promise<number> {
  const redis = getRedis();
  const now = Date.now();
  const cutoff = now - WINDOW_SECONDS * 1000;
  await redis.zremrangebyscore(redisKey, 0, cutoff);
  return redis.zcard(redisKey);
}

async function getRedisTokenSum(redisKey: string): Promise<number> {
  const redis = getRedis();
  const now = Date.now();
  const cutoff = now - WINDOW_SECONDS * 1000;
  const members = await redis.zrange(redisKey, 0, -1, "WITHSCORES");
  await redis.zremrangebyscore(redisKey, 0, cutoff);
  let total = 0;
  for (let i = 1; i < members.length; i += 2) {
    total += parseInt(members[i] ?? "0");
  }
  return total;
}

// ── 请求体类型 ──

export async function adminRateLimitRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/rate-limits/rules
  //  返回：6 条规则 + 当前各层水位 + 规则说明
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/rate-limits/rules", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const redis = getRedis();

    // 从 DB 读取配置
    const rows = await db
      .select({ key: systemConfigs.key, value: systemConfigs.value })
      .from(systemConfigs)
      .where(inArray(systemConfigs.key, RATE_LIMIT_KEYS as unknown as string[]));

    const cfgMap = new Map(rows.map((r) => [r.key, r.value]));

    const rules = RATE_LIMIT_KEYS.map((key) => ({
      key,
      label: KEY_LABELS[key],
      value: cfgMap.get(key) ?? KEY_DEFAULTS[key],
      isDefault: !cfgMap.has(key),
    }));

    // 读取各层水位（实时 Redis 滑窗）
    let waterLevels: Record<string, any> = {};

    try {
      // 个人滑窗：查询个人的 Redis key，取全量归总
      // 实际按 user type 区分的方式是：在请求时查 user 表
      // 这里我们读全局 + 用户级的聚合
      const [globalRpm, globalTpm] = await Promise.all([
        getRedisCount("rl:rpm:global:0"),
        getRedisTokenSum("rl:tpm:global:0"),
      ]);

      // 读取所有活跃的 user-level keys
      // 用 Redis SCAN 获取 rl:rpm:user:* 模式
      let userRpmTotal = 0;
      let userTpmTotal = 0;
      let cursor = "0";
      do {
        const [nextCursor, items] = await redis.sscan("rl:users:index", cursor, "MATCH", "*", "COUNT", "1000");
        cursor = nextCursor;
        // 不需要 user 级别聚合
      } while (cursor !== "0");

      // 改用 SCAN 模式扫描 keys
      cursor = "0";
      const userRpmKeys: string[] = [];
      const userTpmKeys: string[] = [];

      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "rl:rpm:user:*", "COUNT", "500");
        cursor = nextCursor;
        userRpmKeys.push(...keys);
      } while (cursor !== "0");

      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "rl:tpm:user:*", "COUNT", "500");
        cursor = nextCursor;
        userTpmKeys.push(...keys);
      } while (cursor !== "0");

      const userRpmCounts = await Promise.all(userRpmKeys.map((k) => getRedisCount(k)));
      const userTpmSums = await Promise.all(userTpmKeys.map((k) => getRedisTokenSum(k)));

      userRpmTotal = userRpmCounts.reduce((a, b) => a + b, 0);
      userTpmTotal = userTpmSums.reduce((a, b) => a + b, 0);

      // Key 级汇总
      let keyRpmKeys: string[] = [];
      cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "rl:rpm:key:*", "COUNT", "500");
        cursor = nextCursor;
        keyRpmKeys.push(...keys);
      } while (cursor !== "0");

      const keyRpmCounts = await Promise.all(keyRpmKeys.map((k) => getRedisCount(k)));
      const totalKeyRpm = keyRpmCounts.reduce((a, b) => a + b, 0);

      // 活跃用户——从 Redis SCAN 的用户数
      const activeUserKeys = new Set(
        [...userRpmKeys, ...userTpmKeys].map((k) => k.replace(/^rl:(rpm|tpm):user:/, ""))
      );

      waterLevels = {
        globalRpm: { current: globalRpm, limit: parseInt(cfgMap.get("rate_limit_global_rpm") ?? KEY_DEFAULTS.rate_limit_global_rpm) },
        globalTpm: { current: globalTpm, limit: parseInt(cfgMap.get("rate_limit_global_tpm") ?? KEY_DEFAULTS.rate_limit_global_tpm) },
        userRpmTotal: { current: userRpmTotal, label: "全部用户当前窗口 RPM" },
        userTpmTotal: { current: userTpmTotal, label: "全部用户当前窗口 TPM" },
        activeUsersInWindow: activeUserKeys.size,
        activeKeysInWindow: keyRpmKeys.length,
        totalKeyRpm,
      };
    } catch (err: any) {
      request.log.warn({ err: err.message }, "[RateLimits] 水位查询失败");
    }

    reply.send({
      code: 0,
      data: { rules, waterLevels },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/rate-limits/rules
  //  Body: { rules: { key: string, value: string }[] }
  //  批量更新，自动清缓存
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/rate-limits/rules", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;
    const { rules } = request.body as { rules: Array<{ key: string; value: string }> };

    if (!rules || !Array.isArray(rules) || rules.length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "缺少 rules 数组" });
      return;
    }

    // 验证所有 key 合法
    const validKeys = new Set(RATE_LIMIT_KEYS);
    for (const r of rules) {
      if (!validKeys.has(r.key as any)) {
        reply.status(400).send({ code: 400, data: null, message: `无效的配置 key: ${r.key}` });
        return;
      }
      const num = parseInt(r.value, 10);
      if (isNaN(num) || num < 1) {
        reply.status(400).send({ code: 400, data: null, message: `${r.key} 值必须为正整数` });
        return;
      }
    }

    await db.transaction(async (tx) => {
      for (const rule of rules) {
        const [existing] = await tx
          .select({ id: systemConfigs.id, value: systemConfigs.value })
          .from(systemConfigs)
          .where(eq(systemConfigs.key, rule.key))
          .limit(1);

        if (existing) {
          await tx
            .update(systemConfigs)
            .set({ value: rule.value })
            .where(eq(systemConfigs.key, rule.key));

          await tx.insert(auditLogs).values({
            operatorId,
            action: "config_update",
            targetType: "config",
            targetId: existing.id,
            before: { key: rule.key, value: existing.value },
            after: { key: rule.key, value: rule.value },
            ip: request.ip,
            description: `限流规则更新 ${rule.key}: ${existing.value} → ${rule.value}`,
          });
        }
      }
    });

    // 清限流中间件缓存
    clearRateLimitCache();

    reply.send({
      code: 0,
      data: null,
      message: `已更新 ${rules.length} 条限流规则`,
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/rate-limits/overrides
  //  返回：所有有 RPM/TPM 覆盖的用户列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/rate-limits/overrides", {
    preHandler: [requirePerm(Perm.USER_LIST)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as { user_id?: string; search?: string; limit?: string; offset?: string };
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10)));
    const offset = Math.max(0, parseInt(query.offset ?? "0", 10));

    const conditions: any[] = [
      sql`COALESCE(${userQuotas.rpmLimit}, ${userQuotas.tpmLimit}) IS NOT NULL`,
    ];

    if (query.user_id) {
      conditions.push(eq(userQuotas.userId, parseInt(query.user_id, 10)));
    }
    if (query.search) {
      conditions.push(
        sql`(${users.nickname} ILIKE ${'%' + query.search + '%'} OR ${users.email} ILIKE ${'%' + query.search + '%'})`,
      );
    }

    const rows = await db
      .select({
        quotaId: userQuotas.id,
        userId: userQuotas.userId,
        userEmail: users.email,
        userNickname: users.nickname,
        userType: users.userType,
        rpmLimit: userQuotas.rpmLimit,
        tpmLimit: userQuotas.tpmLimit,
        periodStart: userQuotas.periodStart,
        periodEnd: userQuotas.periodEnd,
        setByRole: userQuotas.setByRole,
        updatedAt: userQuotas.updatedAt,
      })
      .from(userQuotas)
      .leftJoin(users, eq(userQuotas.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(userQuotas.updatedAt))
      .limit(limit)
      .offset(offset);

    // 同时从 Redis 读取每个用户的当前水位
    const redis = getRedis();
    const enriched = await Promise.all(rows.map(async (row) => {
      let currentRpm = 0;
      let currentTpm = 0;
      try {
        [currentRpm, currentTpm] = await Promise.all([
          getRedisCount(`rl:rpm:user:${row.userId}`),
          getRedisTokenSum(`rl:tpm:user:${row.userId}`),
        ]);
      } catch { /* Redis 不可用 */ }
      return {
        ...row,
        currentRpm,
        currentTpm,
        periodStart: row.periodStart?.toISOString() ?? null,
        periodEnd: row.periodEnd?.toISOString() ?? null,
        updatedAt: row.updatedAt?.toISOString() ?? null,
      };
    }));

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userQuotas)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    reply.send({
      code: 0,
      data: {
        items: enriched,
        total: totalResult?.count ?? 0,
        limit,
        offset,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/v1/admin/rate-limits/overrides/:id
  //  删除某个额度的 RPM/TPM 覆盖（清空为 NULL）
  // ──────────────────────────────────────────────

  app.delete("/api/v1/admin/rate-limits/overrides/:id", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const operatorId = request.user!.userId;

    const [quota] = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.id, parseInt(id, 10)))
      .limit(1);

    if (!quota) {
      reply.status(404).send({ code: 404, data: null, message: "额度记录不存在" });
      return;
    }

    const oldRpm = quota.rpmLimit;
    const oldTpm = quota.tpmLimit;

    if (oldRpm === null && oldTpm === null) {
      reply.send({ code: 0, data: null, message: "该额度没有限流覆盖，无需删除" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(userQuotas)
        .set({ rpmLimit: null, tpmLimit: null, updatedAt: new Date() })
        .where(eq(userQuotas.id, parseInt(id, 10)));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "quota_update",
        targetType: "user_quota",
        targetId: quota.id,
        before: { rpmLimit: oldRpm, tpmLimit: oldTpm },
        after: { rpmLimit: null, tpmLimit: null },
        ip: request.ip,
        description: `清除用户 #${quota.userId} 限流覆盖（RPM:${oldRpm} TPM:${oldTpm}）`,
      });
    });

    // 清限流中间件缓存让新配置生效
    clearRateLimitCache();

    reply.send({
      code: 0,
      data: null,
      message: "限流覆盖已清除",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/rate-limits/hits
  //  返回：近期的 429 限流命中事件
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/rate-limits/hits", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const redis = getRedis();
    const query = request.query as { limit?: string; offset?: string; range?: string; user_id?: string };
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10)));
    const offset = Math.max(0, parseInt(query.offset ?? "0", 10));

    // 计算时间范围
    let since: Date;
    switch (query.range) {
      case 'today': { const d = new Date(); d.setHours(0, 0, 0, 0); since = d; break; }
      case '6h': since = new Date(Date.now() - 6 * 3600000); break;
      case '1h': default: since = new Date(Date.now() - 3600000); break;
    }

    // 从 call_logs 查限流失败的记录（status = 429）
    const hitConditions: any[] = [
      eq(callLogs.status, 'rate_limited'),
      gte(callLogs.createdAt, since),
    ];
    if (query.user_id) {
      hitConditions.push(eq(callLogs.userId, parseInt(query.user_id, 10)));
    }

    const [rows, totalResult] = await Promise.all([
      db
        .select({
          id: callLogs.id,
          userId: callLogs.userId,
          userEmail: users.email,
          userNickname: users.nickname,
          modelName: callLogs.modelName,
          errorMessage: callLogs.errorMessage,
          requestTokens: callLogs.totalTokens,
          createdAt: callLogs.createdAt,
        })
        .from(callLogs)
        .leftJoin(users, eq(callLogs.userId, users.id))
        .where(and(...hitConditions))
        .orderBy(desc(callLogs.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(callLogs)
        .where(and(...hitConditions)),
    ]);

    // 从 DB 读取今天的限流总数
    let total429Today = 0;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [todayCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(callLogs)
        .where(
          and(
            eq(callLogs.status, 'rate_limited'),
            gte(callLogs.createdAt, todayStart),
          ),
        );
      total429Today = todayCount?.count ?? 0;
    } catch { /* ignore */ }

    reply.send({
      code: 0,
      data: {
        items: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt?.toISOString() ?? null,
        })),
        total: totalResult[0]?.count ?? 0,
        total429Today,
        limit,
        offset,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/rate-limits/overrides
  //  设置或更新用户级 RPM/TPM 覆盖
  //  Body: { userId, rpmLimit, tpmLimit }
  //  传 null 表示不清除该维度；清空用 DELETE
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/rate-limits/overrides", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;
    const body = request.body as SetOverrideBody;

    if (!body || !body.userId) {
      reply.status(400).send({ code: 400, data: null, message: "缺少 userId" });
      return;
    }

    const rpmLimit = body.rpmLimit !== undefined && body.rpmLimit !== null ? Math.max(1, body.rpmLimit) : null;
    const tpmLimit = body.tpmLimit !== undefined && body.tpmLimit !== null ? Math.max(1, body.tpmLimit) : null;

    if (rpmLimit === null && tpmLimit === null) {
      reply.status(400).send({ code: 400, data: null, message: "至少设置 RPM 或 TPM 之一" });
      return;
    }

    // 检查用户是否存在
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, body.userId))
      .limit(1);

    if (!user) {
      reply.status(404).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    // 检查该用户是否已有 monthly 额度记录（无论是否有 rpm/tpm）
    // 避免 `(userId, quota_type)` 唯一键冲突
    const [existing] = await db
      .select({ id: userQuotas.id, rpmLimit: userQuotas.rpmLimit, tpmLimit: userQuotas.tpmLimit })
      .from(userQuotas)
      .where(
        and(
          eq(userQuotas.userId, body.userId),
          eq(userQuotas.quotaType, 'monthly'),
        ),
      )
      .orderBy(desc(userQuotas.updatedAt))
      .limit(1);

    await db.transaction(async (tx) => {
      if (existing) {
        // 更新
        const before = { rpmLimit: existing.rpmLimit, tpmLimit: existing.tpmLimit };
        const after = {
          rpmLimit: rpmLimit ?? existing.rpmLimit,
          tpmLimit: tpmLimit ?? existing.tpmLimit,
        };
        const updateFields: any = {
          rpmLimit: after.rpmLimit,
          tpmLimit: after.tpmLimit,
          updatedAt: new Date(),
        };
        if (body.periodStart) updateFields.periodStart = new Date(body.periodStart);
        if (body.periodEnd) updateFields.periodEnd = new Date(body.periodEnd);
        await tx
          .update(userQuotas)
          .set(updateFields)
          .where(eq(userQuotas.id, existing.id));

        await tx.insert(auditLogs).values({
          operatorId,
          action: "quota_update",
          targetType: "user_quota",
          targetId: existing.id,
          before,
          after,
          ip: request.ip,
          description: `更新用户 #${body.userId} 限流覆盖（RPM:${before.rpmLimit}→${after.rpmLimit} TPM:${before.tpmLimit}→${after.tpmLimit}）`,
        });
      } else {
        // 新建 — 使用指定有效期或默认当月
        const now = new Date();
        const periodStart = body.periodStart ? new Date(body.periodStart) : new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = body.periodEnd ? new Date(body.periodEnd) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const [inserted] = await tx
          .insert(userQuotas)
          .values({
            userId: body.userId,
            quotaType: 'monthly',
            quotaAmount: '0.000000',
            usedAmount: '0.000000',
            alertPercent: '80.00',
            periodStart,
            periodEnd,
            setBy: operatorId,
            setByRole: 'admin',
            rpmLimit,
            tpmLimit,
          })
          .returning({ id: userQuotas.id });

        await tx.insert(auditLogs).values({
          operatorId,
          action: "quota_update",
          targetType: "user_quota",
          targetId: inserted.id,
          before: null,
          after: { rpmLimit, tpmLimit },
          ip: request.ip,
          description: `添加用户 #${body.userId} 限流覆盖（RPM:${rpmLimit} TPM:${tpmLimit}）`,
        });
      }
    });

    // 清限流中间件缓存
    clearRateLimitCache();

    reply.send({
      code: 0,
      data: null,
      message: `用户 #${body.userId} 的限流覆盖已${existing ? '更新' : '设置'}`,
    });
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/rate-limits/overrides/:id
  //  只更新部分字段（rpmLimit / tpmLimit）
  //  Body: { rpmLimit?, tpmLimit? }
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/rate-limits/overrides/:id", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const operatorId = request.user!.userId;
    const body = request.body as { rpmLimit?: number | null; tpmLimit?: number | null };

    const [quota] = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.id, parseInt(id, 10)))
      .limit(1);

    if (!quota) {
      reply.status(404).send({ code: 404, data: null, message: "额度记录不存在" });
      return;
    }

    const before = { rpmLimit: quota.rpmLimit, tpmLimit: quota.tpmLimit };
    const after = {
      rpmLimit: body.rpmLimit !== undefined ? body.rpmLimit : quota.rpmLimit,
      tpmLimit: body.tpmLimit !== undefined ? body.tpmLimit : quota.tpmLimit,
    };

    await db.transaction(async (tx) => {
      await tx
        .update(userQuotas)
        .set({
          rpmLimit: after.rpmLimit,
          tpmLimit: after.tpmLimit,
          updatedAt: new Date(),
        })
        .where(eq(userQuotas.id, parseInt(id, 10)));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "quota_update",
        targetType: "user_quota",
        targetId: quota.id,
        before,
        after,
        ip: request.ip,
        description: `用户 #${quota.userId} 限流覆盖部分更新（RPM:${before.rpmLimit}→${after.rpmLimit} TPM:${before.tpmLimit}→${after.tpmLimit}）`,
      });
    });

    clearRateLimitCache();

    reply.send({
      code: 0,
      data: null,
      message: "限流覆盖已更新",
    });
  });
}
