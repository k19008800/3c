import type { FastifyInstance } from "fastify";
import { redis } from "../lib/redis";
import { ACTIVITY_CHANNEL, getRecentActivity } from "../services/activity-push";

/**
 * 实时活动流端点（管理端）
 * - SSE: GET /admin/activity/stream（Redis 订阅推送）
 * - 历史: GET /admin/activity/history
 */

function requireAdmin(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      const role = (decoded as any).role;
      if (role !== "admin" && role !== "super_admin") {
        return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "需要管理员权限" });
      }
    } catch (e: any) {
      if (e?.statusCode === 403) return;
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

export function adminActivityRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // 1. SSE 实时流
  app.get("/admin/activity/stream", { onRequest: [admin] }, async (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(": connected\n\n");

    // 独立订阅连接（BullMQ 的 redisConnection 不能用于 pubsub 阻塞）
    const sub = redis.duplicate();
    sub.subscribe(ACTIVITY_CHANNEL);

    const onMessage = (_channel: string, message: string) => {
      try {
        reply.raw.write(`data: ${message}\n\n`);
      } catch { /* client gone */ }
    };
    sub.on("message", onMessage);

    // 心跳
    const heartbeat = setInterval(() => {
      try { reply.raw.write(": ping\n\n"); } catch { /* ignore */ }
    }, 25000);

    // 心跳检测关闭
    const wrap: any = reply.raw;
    wrap.on("close", () => {
      clearInterval(heartbeat);
      sub.unsubscribe(ACTIVITY_CHANNEL);
      sub.disconnect();
    });
    // 防止 Fastify 关闭响应（SSE 长连接）
    return reply;
  });

  // 2. 历史活动
  app.get("/admin/activity/history", { onRequest: [admin] }, async (req) => {
    const limit = Math.min(Number((req.query as any).limit ?? 50), 100);
    return { code: 0, data: { list: await getRecentActivity(limit) }, message: "ok" };
  });
}
