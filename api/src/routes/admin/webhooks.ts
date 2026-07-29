// ============================================================
//  3cloud (3C) — 全局 Webhook 出站（§32.1）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { globalWebhooks } from "../../db/schema/index.js";
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
      reply.status(200).send({ code: 0, data: { status: "error", error: e.message }, message: `推送异常: ${e.message}` });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/webhooks/:id/logs — 推送日志
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/webhooks/:id/logs", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const logs: any[] = JSON.parse(await redis.get(`${WEBHOOK_LOG_KEY}:${id}`) || "[]");
    reply.status(200).send({ code: 0, data: { list: logs }, message: "ok" });
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
    const logEntry = {
      webhookId: webhook.id,
      event: JSON.parse(payload).event,
      status,
      statusCode: response.status,
      timestamp: new Date().toISOString(),
      attempt: attempt + 1,
    };

    const logsKey = `${WEBHOOK_LOG_KEY}:${webhook.id}`;
    const logs: any[] = JSON.parse(await redis.get(logsKey) || "[]");
    logs.unshift(logEntry);
    if (logs.length > 50) logs.pop();
    await redis.set(logsKey, JSON.stringify(logs));

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
    if (attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      return pushWithRetry(webhook, payload, signature, redis, db, attempt + 1);
    }
  }
}
