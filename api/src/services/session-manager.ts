// ============================================================
//  3cloud (3C) — 会话管理服务
//  活跃会话跟踪 / 并发数限制 / 强制下线 / Token 撤销
// ============================================================

import { eq, and, sql, lte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { userLoginSessions } from "../db/schema.js";
import { getRedis } from "../redis.js";
import { loadSecurityConfig } from "./login-security.js";

// ── Redis Key ──

const KEY = {
  session: (jti: string) => `session:${jti}`,
  userSessions: (uid: number) => `session:count:${uid}`,
};

// ── 创建会话 ──

export interface CreateSessionParams {
  userId: number;
  jti: string;
  ip: string;
  userAgent?: string;
  deviceFingerprint?: string;
  city?: string;
  country?: string;
}

/**
 * 创建会话记录，检查并发数限制，超限时踢掉最旧的
 * 返回: { allowed: boolean, kickedSessionId?: number }
 */
export async function createSession(params: CreateSessionParams): Promise<{
  allowed: boolean;
  kickedSessionId?: number;
}> {
  const db = getDb();
  const redis = getRedis();
  const cfg = await loadSecurityConfig();
  const maxSessions = cfg.max_concurrent_sessions_default ?? 5;
  const expireHours = cfg.session_expire_hours ?? 168;

  // 1. 查当前活跃会话数
  const activeSessions = await db
    .select({ id: userLoginSessions.id })
    .from(userLoginSessions)
    .where(
      and(
        eq(userLoginSessions.userId, params.userId),
        eq(userLoginSessions.isActive, true),
      ),
    );

  // 2. 如果超限，踢掉最旧的
  let kickedSessionId: number | undefined;
  if (activeSessions.length >= maxSessions) {
    const [oldest] = await db
      .select({ id: userLoginSessions.id, sessionToken: userLoginSessions.sessionToken })
      .from(userLoginSessions)
      .where(
        and(
          eq(userLoginSessions.userId, params.userId),
          eq(userLoginSessions.isActive, true),
        ),
      )
      .orderBy(userLoginSessions.lastActivity)
      .limit(1);

    if (oldest) {
      await db
        .update(userLoginSessions)
        .set({ isActive: false })
        .where(eq(userLoginSessions.id, oldest.id));

      // 同时失效 Redis 中的 token
      await redis.del(KEY.session(oldest.sessionToken));
      kickedSessionId = oldest.id;
    }
  }

  // 3. 创建新会话
  const expiredAt = new Date(Date.now() + expireHours * 3600_000);
  await db.insert(userLoginSessions).values({
    userId: params.userId,
    sessionToken: params.jti,
    ip: params.ip,
    userAgent: params.userAgent ?? null,
    deviceFingerprint: params.deviceFingerprint ?? null,
    city: params.city ?? null,
    country: params.country ?? null,
    isActive: true,
    lastActivity: new Date(),
    expiredAt,
  });

  // 4. Redis 缓存会话信息（加速校验）
  await redis.setex(
    KEY.session(params.jti),
    expireHours * 3600,
    JSON.stringify({ userId: params.userId, expiresAt: expiredAt.toISOString() }),
  );

  return { allowed: true, kickedSessionId };
}

// ── 校验会话有效性 ──

export async function validateSession(jti: string): Promise<{
  valid: boolean;
  userId?: number;
}> {
  const redis = getRedis();

  // 先查 Redis 缓存
  const cached = await redis.get(KEY.session(jti));
  if (cached) {
    try {
      const data = JSON.parse(cached);
      if (new Date(data.expiresAt) < new Date()) {
        await redis.del(KEY.session(jti));
        return { valid: false };
      }
      return { valid: true, userId: data.userId };
    } catch {
      // 缓存损坏，回退查 DB
    }
  }

  // 查数据库
  const db = getDb();
  const rows = await db
    .select({
      id: userLoginSessions.id,
      userId: userLoginSessions.userId,
      isActive: userLoginSessions.isActive,
      expiredAt: userLoginSessions.expiredAt,
    })
    .from(userLoginSessions)
    .where(eq(userLoginSessions.sessionToken, jti))
    .limit(1);

  if (rows.length === 0) return { valid: false };
  const session = rows[0];

  if (!session.isActive) return { valid: false };
  if (session.expiredAt && new Date() > session.expiredAt) {
    await db
      .update(userLoginSessions)
      .set({ isActive: false })
      .where(eq(userLoginSessions.id, session.id));
    return { valid: false };
  }

  // 缓存结果
  await redis.setex(
    KEY.session(jti),
    3600,
    JSON.stringify({ userId: session.userId, expiresAt: session.expiredAt?.toISOString() }),
  );

  return { valid: true, userId: session.userId };
}

// ── 撤销会话（用户主动下线） ──

export async function revokeSession(sessionToken: string): Promise<void> {
  const db = getDb();
  const redis = getRedis();

  await db
    .update(userLoginSessions)
    .set({ isActive: false })
    .where(eq(userLoginSessions.sessionToken, sessionToken));

  await redis.del(KEY.session(sessionToken));
}

// ── 撤销用户所有会话（管理端强制下线） ──

export async function revokeAllUserSessions(userId: number): Promise<number> {
  const db = getDb();
  const redis = getRedis();

  const sessions = await db
    .select({ sessionToken: userLoginSessions.sessionToken })
    .from(userLoginSessions)
    .where(
      and(
        eq(userLoginSessions.userId, userId),
        eq(userLoginSessions.isActive, true),
      ),
    );

  const tokens = sessions.map((s) => s.sessionToken);

  if (tokens.length > 0) {
    await db
      .update(userLoginSessions)
      .set({ isActive: false })
      .where(
        and(
          eq(userLoginSessions.userId, userId),
          eq(userLoginSessions.isActive, true),
        ),
      );

    // 批量清除 Redis
    const pipeline = redis.multi();
    for (const t of tokens) {
      pipeline.del(KEY.session(t));
    }
    await pipeline.exec();
  }

  return tokens.length;
}

// ── 获取用户活跃会话数 ──

export async function getActiveSessionCount(userId: number): Promise<number> {
  const db = getDb();
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userLoginSessions)
    .where(
      and(
        eq(userLoginSessions.userId, userId),
        eq(userLoginSessions.isActive, true),
      ),
    );
  return Number(result?.count ?? 0);
}

// ── 获取用户活跃会话列表 ──

export async function getUserActiveSessions(
  userId: number,
  currentSessionToken?: string,
): Promise<Array<{
  id: number;
  ip: string;
  userAgent: string | null;
  city: string | null;
  isCurrent: boolean;
  lastActivity: string;
  createdAt: string;
}>> {
  const db = getDb();

  const rows = await db
    .select()
    .from(userLoginSessions)
    .where(
      and(
        eq(userLoginSessions.userId, userId),
        eq(userLoginSessions.isActive, true),
      ),
    )
    .orderBy(sql`${userLoginSessions.lastActivity} DESC`);

  return rows.map((r) => ({
    id: r.id,
    ip: r.ip,
    userAgent: r.userAgent,
    city: r.city,
    isCurrent: r.sessionToken === currentSessionToken,
    lastActivity: r.lastActivity.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}

// ── 清理过期会话（定时任务调用） ──

export async function cleanupExpiredSessions(): Promise<number> {
  const db = getDb();
  const result = await db
    .update(userLoginSessions)
    .set({ isActive: false })
    .where(
      and(
        eq(userLoginSessions.isActive, true),
        lte(userLoginSessions.expiredAt, new Date()),
      ),
    );
  return result.rowCount ?? 0;
}
