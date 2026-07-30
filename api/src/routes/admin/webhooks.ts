// ============================================================
//  3cloud (3C) — 全局 Webhook 出站（§32.1）增强版
//  + Webhook 事件日志持久化（webhook_event_logs 表）
//  + 手动重试 API
//  + 失败告警
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, sql, count, and } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { globalWebhooks, webhookEventLogs } from "../../db/schema/index.js";
import { getRedis } from "../../redis.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import crypto from "node:crypto";

const WEBHOOK_LOG_KEY = "webhook:logs";

// ── 事件类型 ──

export const WEBHOOK_EVENTS = [
  "recharge.completed",
  "withdraw.completed",
  "user.created",
  "user.verified",
  "agent.upgraded",
  "key.expired",
  "alert.triggered",
  "order.created",
  "order.completed",
  "test",
] as const;

// ── 路由 ──

export async function adminWebhookRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  const db = getDb();
  const redis = getRedis();

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/webhooks — Webhook 列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/webhooks", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const list = await db.select().from(globalWebhooks).orderBy(desc(globalWebhooks.createdAt));
    reply.status(200).send({ code: 0, data: { list }, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/webhooks — 创建 Webhook
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/webhooks", {
    preHandler: [requirePerm(Perm.CONFIG_ACTION)],
  }, async (request, reply) => {
    const { name, url, events, retryCount, autoDisableAfter } = request.body as {
      name: string;
      url: string;
      events: string;
      retryCount?: number;
      autoDisableAfter?: number;
    };

    if (!name || !url || !events) {
      return reply.status(400).send({ code: 400, message: "缺少必填参数: name, url, events" });
    }

    const secret = crypto.randomBytes(24).toString("hex");

    const [inserted] = await db.insert(globalWebhooks).values({
      name,
      url,
      secret,
      events,
      retryCount: retryCount ?? 3,
      autoDisableAfter: autoDisableAfter ?? 10,
    }).returning();

    reply.status(201).send({ code: 0, data: inserted, message: "Webhook 创建成功" });
  });

  // ──────────────────────────────────────────────
  //  PUT /api/v1/admin/webhooks/:id — 更新 Webhook
  // ──────────────────────────────────────────────

  app.put("/api/v1/admin/webhooks/:id", {
    preHandler: [requirePerm(Perm.CONFIG_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<{
      name: string;
      url: string;
      events: string;
      enabled: boolean;
      retryCount: number;
      autoDisableAfter: number;
    }>;

    const [existing] = await db.select().from(globalWebhooks).where(eq(globalWebhooks.id, Number(id))).limit(1);
    if (!existing) {
      return reply.status(404).send({ code: 404, message: "Webhook 不存在" });
    }

    const [updated] = await db.update(globalWebhooks)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(globalWebhooks.id, Number(id)))
      .returning();

    reply.status(200).send({ code: 0, data: updated, message: "Webhook 已更新" });
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/v1/admin/webhooks/:id — 删除 Webhook
  // ──────────────────────────────────────────────

  app.delete("/api/v1/admin/webhooks/:id", {
    preHandler: [requirePerm(Perm.CONFIG_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.delete(globalWebhooks).where(eq(globalWebhooks.id, Number(id)));
    reply.status(200).send({ code: 0, message: "Webhook 已删除" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/webhooks/:id/test — 测试推送
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/webhooks/:id/test", {
    preHandler: [requirePerm(Perm.CONFIG_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [webhook] = await db.select().from(globalWebhooks).where(eq(globalWebhooks.id, Number(id))).limit(1);
    if (!webhook) {
      return reply.status(404).send({ code: 404, message: "Webhook 不存在" });
    }

    const payload = JSON.stringify({
      event: "test",
      timestamp: new Date().toISOString(),
      data: { message: "这是来自 3Cloud 的测试推送" },
    });

    const signature = crypto
      .createHmac("sha256", webhook.secret)
      .update(payload)
      .digest("hex");

    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Event": "test",
        },
        body: payload,
        signal: AbortSignal.timeout(10000),
      });

      const log = {
        webhookId: webhook.id,
        event: "test",
        status: response.ok ? "success" : "failed",
        statusCode: response.status,
        timestamp: new Date().toISOString(),
      };

      const logs: any[] = JSON.parse(await redis.get(`${WEBHOOK_LOG_KEY}:${webhook.id}`) || "[]");
      logs.unshift(log);
      if (logs.length > 50) logs.pop();
      await redis.set(`${WEBHOOK_LOG_KEY}:${webhook.id}`, JSON.stringify(logs));

      // 持久化到 DB
      await db.insert(webhookEventLogs).values({
        webhookId: webhook.id,
        event: "test",
        status: response.ok ? "success" : "failed",
        statusCode: response.status,
        requestBody: JSON.parse(payload),
        attempt: 1,
        maxRetries: webhook.retryCount || 3,
        errorMessage: response.ok ? null : `HTTP ${response.status}`,
      });

      // 更新 lastSentAt / lastStatus
      await db.update(globalWebhooks)
        .set({ lastSentAt: new Date(), lastStatus: response.ok ? "success" : "failed" })
        .where(eq(globalWebhooks.id, webhook.id));

      reply.status(200).send({
        code: 0,
        data: { status: response.ok ? "success" : "failed", statusCode: response.status },
        message: response.ok ? "测试推送成功" : `推送失败 (HTTP ${response.status})`,
      });
    } catch (e: any) {
      // 持久化失败记录
      await db.insert(webhookEventLogs).values({
        webhookId: webhook.id,
        event: "test",
        status: "failed",
        requestBody: { message: "测试推送" },
        attempt: 1,
        maxRetries: webhook.retryCount || 3,
        errorMessage: e.message,
      });

      reply.status(200).send({ code: 0, data: { status: "error", error: e.message }, message: `推送异常: ${e.message}` });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/webhooks/:id/logs — 推送日志（Redis + DB）
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/webhooks/:id/logs", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

    // 从 DB 获取持久化日志
    const totalResult = await db.select({ total: count(webhookEventLogs.id) })
      .from(webhookEventLogs)
      .where(eq(webhookEventLogs.webhookId, Number(id)));

    const total = Number(totalResult[0]?.total || 0);
    const dbLogs = await db.select()
      .from(webhookEventLogs)
      .where(eq(webhookEventLogs.webhookId, Number(id)))
      .orderBy(desc(webhookEventLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // 从 Redis 获取实时日志（最近 50 条）
    const redisLogs: any[] = JSON.parse(await redis.get(`${WEBHOOK_LOG_KEY}:${id}`) || "[]");

    reply.status(200).send({
      code: 0,
      data: {
        list: dbLogs,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        recentLogs: redisLogs,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/webhooks/:id/logs/:logId/retry — 手动重试
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/webhooks/:id/logs/:logId/retry", {
    preHandler: [requirePerm(Perm.CONFIG_ACTION)],
  }, async (request, reply) => {
    const { id, logId } = request.params as { id: string; logId: string };

    const [logEntry] = await db.select()
      .from(webhookEventLogs)
      .where(
        and(
          eq(webhookEventLogs.id, Number(logId)),
          eq(webhookEventLogs.webhookId, Number(id))
        )
      )
      .limit(1);

    if (!logEntry) {
      return reply.status(404).send({ code: 404, data: null, message: "日志记录不存在" });
    }

    const [webhook] = await db.select().from(globalWebhooks).where(eq(globalWebhooks.id, Number(id))).limit(1);
    if (!webhook) {
      return reply.status(404).send({ code: 404, data: null, message: "Webhook 不存在" });
    }

    if (!webhook.enabled) {
      return reply.status(400).send({ code: 400, data: null, message: "Webhook 已禁用，请先启用" });
    }

    // 构建推送内容
    const payload = JSON.stringify({
      event: logEntry.event,
      timestamp: new Date().toISOString(),
      data: logEntry.requestBody || {},
    });

    const signature = crypto.createHmac("sha256", webhook.secret).update(payload).digest("hex");

    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Event": logEntry.event,
        },
        body: payload,
        signal: AbortSignal.timeout(10000),
      });

      const newStatus = response.ok ? "success" : "failed";

      // 更新日志
      await db.update(webhookEventLogs)
        .set({
          status: newStatus,
          statusCode: response.status,
          attempt: sql`${webhookEventLogs.attempt} + 1`,
          retriedAt: new Date(),
          errorMessage: response.ok ? null : `HTTP ${response.status}`,
        })
        .where(eq(webhookEventLogs.id, Number(logId)));

      // 更新 Webhook 状态
      await db.update(globalWebhooks)
        .set({ lastSentAt: new Date(), lastStatus: newStatus })
        .where(eq(globalWebhooks.id, Number(id)));

      reply.status(200).send({
        code: 0,
        data: { status: newStatus, statusCode: response.status },
        message: response.ok ? "重试成功" : `重试失败 (HTTP ${response.status})`,
      });
    } catch (e: any) {
      await db.update(webhookEventLogs)
        .set({
          status: "failed",
          attempt: sql`${webhookEventLogs.attempt} + 1`,
          retriedAt: new Date(),
          errorMessage: e.message,
        })
        .where(eq(webhookEventLogs.id, Number(logId)));

      reply.status(200).send({
        code: 0,
        data: { status: "error", error: e.message },
        message: `重试异常: ${e.message}`,
      });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/webhooks/stats — Webhook 投递统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/webhooks/stats", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    // 各状态统计
    const statusCounts = await db.select({
      status: webhookEventLogs.status,
      count: count(webhookEventLogs.id),
    })
    .from(webhookEventLogs)
    .groupBy(webhookEventLogs.status);

    // 近 24 小时投递量
    const recentCount = await db.select({ count: count(webhookEventLogs.id) })
      .from(webhookEventLogs)
      .where(sql`${webhookEventLogs.createdAt} >= NOW() - INTERVAL '24 hours'`);

    // 失败最多的 Webhook
    const topFailed = await db.select({
      webhookId: webhookEventLogs.webhookId,
      failCount: count(webhookEventLogs.id),
    })
    .from(webhookEventLogs)
    .where(eq(webhookEventLogs.status, "failed"))
    .groupBy(webhookEventLogs.webhookId)
    .orderBy(sql`count(*) DESC`)
    .limit(5);

    reply.send({
      code: 0,
      data: {
        statusCounts,
        recent24hCount: Number(recentCount[0]?.count || 0),
        topFailed,
      },
      message: "ok",
    });
  });
}

// ── 外部调用：触发 Webhook 推送 ──

export async function triggerWebhooks(event: string, data: unknown): Promise<void> {
  const db = getDb();
  const redis = getRedis();

  const hooks = await db
    .select()
    .from(globalWebhooks)
    .where(sql`${globalWebhooks.enabled} = true AND position(${event} IN ${globalWebhooks.events}) > 0`);

  if (hooks.length === 0) return;

  for (const webhook of hooks) {
    const payload = JSON.stringify({ event, timestamp: new Date().toISOString(), data });
    const signature = crypto.createHmac("sha256", webhook.secret).update(payload).digest("hex");

    // 非阻塞推送
    pushWithRetry(webhook, payload, signature, redis, db);
  }
}

async function pushWithRetry(
  webhook: typeof globalWebhooks.$inferSelect,
  payload: string,
  signature: string,
  redis: any,
  db: any,
  attempt = 0,
): Promise<void> {
  const maxRetries = webhook.retryCount || 3;

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": JSON.parse(payload).event,
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
    });

    const status = response.ok ? "success" : "failed";
    const parsedPayload = JSON.parse(payload);
    const logEntry = {
      webhookId: webhook.id,
      event: parsedPayload.event,
      status,
      statusCode: response.status,
      requestBody: parsedPayload.data,
      attempt: attempt + 1,
      maxRetries,
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
      timestamp: new Date().toISOString(),
    };

    // Redis 缓存
    const logsKey = `${WEBHOOK_LOG_KEY}:${webhook.id}`;
    const logs: any[] = JSON.parse(await redis.get(logsKey) || "[]");
    logs.unshift(logEntry);
    if (logs.length > 50) logs.pop();
    await redis.set(logsKey, JSON.stringify(logs));

    // DB 持久化
    try {
      await db.insert(webhookEventLogs).values({
        webhookId: webhook.id,
        event: parsedPayload.event,
        status,
        statusCode: response.status,
        requestBody: parsedPayload.data,
        attempt: attempt + 1,
        maxRetries,
        errorMessage: response.ok ? null : `HTTP ${response.status}`,
      });
    } catch (_) { /* 日志写入失败不影响主流程 */ }

    await db.update(globalWebhooks)
      .set({
        lastSentAt: new Date(),
        lastStatus: status,
        consecutiveFailures: response.ok ? 0 : sql`${globalWebhooks.consecutiveFailures} + 1`,
      })
      .where(eq(globalWebhooks.id, webhook.id));

    if (!response.ok && attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      return pushWithRetry(webhook, payload, signature, redis, db, attempt + 1);
    }

    // 连续失败超过阈值自动禁用
    if (!response.ok) {
      const [updated] = await db
        .select({ consecutiveFailures: globalWebhooks.consecutiveFailures })
        .from(globalWebhooks)
        .where(eq(globalWebhooks.id, webhook.id))
        .limit(1);

      if (updated && updated.consecutiveFailures >= (webhook.autoDisableAfter || 10)) {
        await db.update(globalWebhooks)
          .set({ enabled: false })
          .where(eq(globalWebhooks.id, webhook.id));
      }
    }
  } catch (e: any) {
    // 记录异常
    try {
      const parsedPayload = JSON.parse(payload);
      await db.insert(webhookEventLogs).values({
        webhookId: webhook.id,
        event: parsedPayload.event,
        status: "failed",
        requestBody: parsedPayload.data,
        attempt: attempt + 1,
        maxRetries,
        errorMessage: e.message,
      });
    } catch (_) {}

    if (attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      return pushWithRetry(webhook, payload, signature, redis, db, attempt + 1);
    }
  }
}