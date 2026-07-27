// ============================================================
//  3cloud (3C) — 会话管理服务 — 管理功能
// ============================================================

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { userLoginSessions } from "../../db/schema.js";
import { getRedis } from "../../redis.js";

const KEY = { session: (jti: string) => `session:${jti}` };

export async function revokeAllUserSessions(userId: number): Promise<number> {
  const db = getDb();
  const redis = getRedis();
  const sessions = await db.select({ sessionToken: userLoginSessions.sessionToken }).from(userLoginSessions)
    .where(and(eq(userLoginSessions.userId, userId), eq(userLoginSessions.isActive, true)));
  const tokens = sessions.map(s => s.sessionToken);
  if (tokens.length > 0) {
    await db.update(userLoginSessions).set({ isActive: false })
      .where(and(eq(userLoginSessions.userId, userId), eq(userLoginSessions.isActive, true)));
    const pipeline = redis.multi();
    for (const t of tokens) pipeline.del(KEY.session(t));
    await pipeline.exec();
  }
  return tokens.length;
}

export async function getActiveSessionCount(userId: number): Promise<number> {
  const db = getDb();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(userLoginSessions)
    .where(and(eq(userLoginSessions.userId, userId), eq(userLoginSessions.isActive, true)));
  return Number(result?.count ?? 0);
}

export async function getUserActiveSessions(userId: number, currentSessionToken?: string): Promise<Array<{
  id: number; ip: string; userAgent: string | null; city: string | null; isCurrent: boolean; lastActivity: string; createdAt: string;
}>> {
  const db = getDb();
  const rows = await db.select().from(userLoginSessions)
    .where(and(eq(userLoginSessions.userId, userId), eq(userLoginSessions.isActive, true)))
    .orderBy(sql`${userLoginSessions.lastActivity} DESC`);
  return rows.map(r => ({ id: r.id, ip: r.ip, userAgent: r.userAgent, city: r.city, isCurrent: r.sessionToken === currentSessionToken, lastActivity: r.lastActivity.toISOString(), createdAt: r.createdAt.toISOString() }));
}
