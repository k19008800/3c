// ============================================================
//  3cloud (3C) — 会话管理服务 — 核心操作
// ============================================================

import { eq, and, lte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { userLoginSessions } from "../../db/schema.js";
import { getRedis } from "../../redis.js";
import { loadSecurityConfig } from "../login-security.js";

const KEY = { session: (jti: string) => `session:${jti}`, userSessions: (uid: number) => `session:count:${uid}` };

export interface CreateSessionParams {
  userId: number; jti: string; ip: string; userAgent?: string; deviceFingerprint?: string; city?: string; country?: string;
}

export async function createSession(params: CreateSessionParams): Promise<{ allowed: boolean; kickedSessionId?: number }> {
  const db = getDb();
  const redis = getRedis();
  const cfg = await loadSecurityConfig();
  const maxSessions = cfg.max_concurrent_sessions_default ?? 5;
  const expireHours = cfg.session_expire_hours ?? 168;

  const activeSessions = await db.select({ id: userLoginSessions.id }).from(userLoginSessions)
    .where(and(eq(userLoginSessions.userId, params.userId), eq(userLoginSessions.isActive, true)));

  let kickedSessionId: number | undefined;
  if (activeSessions.length >= maxSessions) {
    const [oldest] = await db.select({ id: userLoginSessions.id, sessionToken: userLoginSessions.sessionToken }).from(userLoginSessions)
      .where(and(eq(userLoginSessions.userId, params.userId), eq(userLoginSessions.isActive, true)))
      .orderBy(userLoginSessions.lastActivity).limit(1);
    if (oldest) {
      await db.update(userLoginSessions).set({ isActive: false }).where(eq(userLoginSessions.id, oldest.id));
      await redis.del(KEY.session(oldest.sessionToken));
      kickedSessionId = oldest.id;
    }
  }

  const expiredAt = new Date(Date.now() + expireHours * 3600_000);
  await db.insert(userLoginSessions).values({
    userId: params.userId, sessionToken: params.jti, ip: params.ip,
    userAgent: params.userAgent ?? null, deviceFingerprint: params.deviceFingerprint ?? null,
    city: params.city ?? null, country: params.country ?? null,
    isActive: true, lastActivity: new Date(), expiredAt,
  });
  await redis.setex(KEY.session(params.jti), expireHours * 3600, JSON.stringify({ userId: params.userId, expiresAt: expiredAt.toISOString() }));
  return { allowed: true, kickedSessionId };
}

export async function validateSession(jti: string): Promise<{ valid: boolean; userId?: number }> {
  const redis = getRedis();
  const cached = await redis.get(KEY.session(jti));
  if (cached) {
    try {
      const data = JSON.parse(cached);
      if (new Date(data.expiresAt) < new Date()) { await redis.del(KEY.session(jti)); return { valid: false }; }
      return { valid: true, userId: data.userId };
    } catch {}
  }
  const db = getDb();
  const [session] = await db.select({ id: userLoginSessions.id, userId: userLoginSessions.userId, isActive: userLoginSessions.isActive, expiredAt: userLoginSessions.expiredAt })
    .from(userLoginSessions).where(eq(userLoginSessions.sessionToken, jti)).limit(1);
  if (!session) return { valid: false };
  if (!session.isActive) return { valid: false };
  if (session.expiredAt && new Date() > session.expiredAt) {
    await db.update(userLoginSessions).set({ isActive: false }).where(eq(userLoginSessions.id, session.id));
    return { valid: false };
  }
  await redis.setex(KEY.session(jti), 3600, JSON.stringify({ userId: session.userId, expiresAt: session.expiredAt?.toISOString() }));
  return { valid: true, userId: session.userId };
}

export async function revokeSession(sessionToken: string): Promise<void> {
  const db = getDb();
  const redis = getRedis();
  await db.update(userLoginSessions).set({ isActive: false }).where(eq(userLoginSessions.sessionToken, sessionToken));
  await redis.del(KEY.session(sessionToken));
}

export async function cleanupExpiredSessions(): Promise<number> {
  const db = getDb();
  const result = await db.update(userLoginSessions).set({ isActive: false })
    .where(and(eq(userLoginSessions.isActive, true), lte(userLoginSessions.expiredAt, new Date())));
  return result.rowCount ?? 0;
}
