// ============================================================
//  3cloud (3C) — 封禁管理路由
//  GET   /api/v1/admin/security/bans           — 封禁列表
//  POST  /api/v1/admin/security/bans/ip        — 封禁 IP
//  POST  /api/v1/admin/security/bans/user      — 封禁用户
//  POST  /api/v1/admin/security/unban/ip       — 解封 IP
//  POST  /api/v1/admin/security/unban/user     — 解封用户
// ============================================================

import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { users, auditLogs } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { clearIpBan, clearUserBan } from "../../../services/login-security.js";
import { recordSecurityEvent } from "../../../services/security-event.js";
import { getRedis } from "../../../redis.js";

export async function securityBansRoutes(app: FastifyInstance) {
  // ── 封禁列表 ──
  // GET /api/v1/admin/security/bans
  app.get("/api/v1/admin/security/bans", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const redis = getRedis();
    const db = getDb();

    // 【优化】使用 SCAN 替代 KEYS 避免阻塞
    const scanKeys = async (pattern: string): Promise<string[]> => {
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');
      return keys;
    };

    const [ipKeys, userKeys] = await Promise.all([
      scanKeys("risk:ban:ip:*"),
      scanKeys("risk:ban:user:*"),
    ]);

    // IP 封禁详情
    const ipBans: Array<{ ip: string; banStart: number; remainingMs: number }> = [];
    for (const key of ipKeys) {
      const ip = key.replace("risk:ban:ip:", "");
      const raw = await redis.get(key);
      if (raw) {
        const banStart = parseInt(raw, 10);
        const ttl = await redis.ttl(key);
        ipBans.push({ ip, banStart, remainingMs: Math.max(0, ttl * 1000) });
      }
    }

    // 用户封禁详情
    const userBans: Array<{
      userId: number;
      email: string | null;
      nickname: string | null;
      banStart: number;
      banDurationMs: number;
      remainingMs: number;
    }> = [];
    for (const key of userKeys) {
      const uidStr = key.replace("risk:ban:user:", "");
      const userId = parseInt(uidStr, 10);
      const raw = await redis.get(key);
      if (raw) {
        const parts = raw.split(":");
        const banStart = parseInt(parts[0], 10);
        const banDurationMs = parseInt(parts[1], 10) || 15 * 60 * 1000;
        const ttl = await redis.ttl(key);
        const remainingMs = Math.max(0, ttl * 1000);

        const [user] = await db
          .select({ email: users.email, nickname: users.nickname })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        userBans.push({
          userId,
          email: user?.email ?? null,
          nickname: user?.nickname ?? null,
          banStart,
          banDurationMs,
          remainingMs,
        });
      }
    }

    ipBans.sort((a, b) => a.remainingMs - b.remainingMs);
    userBans.sort((a, b) => a.remainingMs - b.remainingMs);

    reply.status(200).send({
      code: 0,
      data: { ipBans, userBans },
      message: "ok",
    });
  });

  // ── 封禁 IP ──
  // POST /api/v1/admin/security/bans/ip
  app.post("/api/v1/admin/security/bans/ip", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const { ip, durationMinutes } = request.body as { ip: string; durationMinutes?: number };

    if (!ip) {
      reply.status(400).send({ code: 400, data: null, message: "缺少 IP" });
      return;
    }

    const redis = getRedis();
    const minutes = Math.max(1, Math.min(1440, durationMinutes ?? 60));
    await redis.setex(`risk:ban:ip:${ip}`, minutes * 60, String(Date.now()));

    await recordSecurityEvent({
      userId: null,
      eventType: "ip_banned",
      riskLevel: "high",
      ip,
      detail: { operatorId: request.user!.userId, durationMinutes, source: "manual" },
    });

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "risk_control",
      targetId: 0,
      ip: request.ip,
      description: `手动封禁 IP: ${ip} (${minutes}分钟)`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: `IP ${ip} 已被封禁 ${minutes} 分钟`,
    });
  });

  // ── 封禁用户 ──
  // POST /api/v1/admin/security/bans/user
  app.post("/api/v1/admin/security/bans/user", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const { userId, durationMinutes, reason } = request.body as {
      userId: number;
      durationMinutes?: number;
      reason?: string;
    };

    if (!userId) {
      reply.status(400).send({ code: 400, data: null, message: "缺少 userId" });
      return;
    }

    const redis = getRedis();
    const minutes = Math.max(1, Math.min(43200, durationMinutes ?? 1440));
    const banDurationMs = minutes * 60 * 1000;
    await redis.setex(
      `risk:ban:user:${userId}`,
      minutes * 60,
      `${Date.now()}:${banDurationMs}`,
    );

    await recordSecurityEvent({
      userId,
      eventType: "user_banned",
      riskLevel: "critical",
      detail: { operatorId: request.user!.userId, durationMinutes, reason, source: "manual" },
    });

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "risk_control",
      targetId: userId,
      ip: request.ip,
      description: `手动封禁用户 userId=${userId} (${minutes}分钟): ${reason ?? ""}`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: `用户 ${userId} 已被封禁 ${minutes} 分钟`,
    });
  });

  // ── 解封 IP ──
  // POST /api/v1/admin/security/unban/ip
  app.post("/api/v1/admin/security/unban/ip", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const { ip } = request.body as { ip: string };

    if (!ip) {
      reply.status(400).send({ code: 400, data: null, message: "缺少 IP" });
      return;
    }

    await clearIpBan(ip);

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "risk_control",
      targetId: 0,
      ip: request.ip,
      description: `手动解封 IP: ${ip}`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "IP 已解封",
    });
  });

  // ── 解封用户 ──
  // POST /api/v1/admin/security/unban/user
  app.post("/api/v1/admin/security/unban/user", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const { userId } = request.body as { userId: number };

    if (!userId) {
      reply.status(400).send({ code: 400, data: null, message: "缺少 userId" });
      return;
    }

    await clearUserBan(userId);

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "risk_control",
      targetId: userId,
      ip: request.ip,
      description: `手动解封用户: userId=${userId}`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "用户已解封",
    });
  });
}
