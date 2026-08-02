import type { FastifyInstance } from "fastify";
import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "../db/index";
import { webhooks, webhookDeliveryLogs } from "../db/schema/webhooks";
import crypto from "crypto";

interface WebhookBody {
  name?: string;
  url?: string;
  events?: string[];
  secret?: string;
  retryCount?: number;
  timeoutMs?: number;
  isActive?: boolean;
}

interface LogsQuery {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: string;
  offset?: string;
}

/**
 * §32.1 全局 Webhook 管理路由
 * 对齐 docs/ref-32-sso-integration.md
 */

export function webhookRoutes(app: FastifyInstance) {
  app.get("/admin/webhooks", async () => {
    const list = await db.select().from(webhooks).orderBy(desc(webhooks.createdAt));
    return { data: { list } };
  });

  app.get<{ Params: { id: string } }>("/admin/webhooks/:id", async (req, rep) => {
    const id = Number(req.params.id);
    const row = await db.select().from(webhooks).where(eq(webhooks.id, id)).then((r) => r[0]);
    if (!row) return rep.status(404).send({ error: "Webhook not found" });
    return { data: row };
  });

  app.post<{ Body: WebhookBody }>("/admin/webhooks", async (req, rep) => {
    const { name, url, events, secret, retryCount, timeoutMs, isActive } = req.body;
    if (!name || !url || !events?.length) {
      return rep.status(400).send({ error: "name, url, events 必填" });
    }
    const sec = secret || crypto.randomBytes(16).toString("hex");
    const [row] = await db
      .insert(webhooks)
      .values({
        name,
        url,
        events: JSON.stringify(events),
        secret: sec,
        retryCount: retryCount ?? 3,
        timeoutMs: timeoutMs ?? 5000,
        isActive: isActive ?? true,
        createdBy: (req as any).user?.id,
      })
      .returning();
    return { data: row };
  });

  app.put<{ Params: { id: string }; Body: WebhookBody }>("/admin/webhooks/:id", async (req, rep) => {
    const id = Number(req.params.id);
    const existing = await db.select().from(webhooks).where(eq(webhooks.id, id)).then((r) => r[0]);
    if (!existing) return rep.status(404).send({ error: "Webhook not found" });
    const { name, url, events, secret, retryCount, timeoutMs, isActive } = req.body;
    const [row] = await db
      .update(webhooks)
      .set({
        ...(name !== undefined && { name }),
        ...(url !== undefined && { url }),
        ...(events !== undefined && { events: JSON.stringify(events) }),
        ...(secret !== undefined && { secret }),
        ...(retryCount !== undefined && { retryCount }),
        ...(timeoutMs !== undefined && { timeoutMs }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(webhooks.id, id))
      .returning();
    return { data: row };
  });

  app.delete<{ Params: { id: string } }>("/admin/webhooks/:id", async (req, rep) => {
    const id = Number(req.params.id);
    const [row] = await db.delete(webhooks).where(eq(webhooks.id, id)).returning();
    if (!row) return rep.status(404).send({ error: "Webhook not found" });
    return { data: row };
  });

  app.put<{ Params: { id: string }; Body: { isActive: boolean } }>("/admin/webhooks/:id/toggle", async (req, rep) => {
    const id = Number(req.params.id);
    const existing = await db.select().from(webhooks).where(eq(webhooks.id, id)).then((r) => r[0]);
    if (!existing) return rep.status(404).send({ error: "Webhook not found" });
    const [row] = await db
      .update(webhooks)
      .set({ isActive: req.body.isActive, updatedAt: new Date() })
      .where(eq(webhooks.id, id))
      .returning();
    return { data: row };
  });

  // 测试投递
  app.post<{ Params: { id: string } }>("/admin/webhooks/:id/test", async (req, rep) => {
    const id = Number(req.params.id);
    const wh = await db.select().from(webhooks).where(eq(webhooks.id, id)).then((r) => r[0]);
    if (!wh) return rep.status(404).send({ error: "Webhook not found" });

    const event = "test.event";
    const payload = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: { message: "This is a test webhook from 3cloud" },
    });

    const result = await deliverWebhook(wh, event, payload);
    await db.insert(webhookDeliveryLogs).values({
      webhookId: wh.id,
      event,
      payload,
      responseCode: result.statusCode,
      responseBody: result.body,
      latencyMs: result.latencyMs,
      status: result.status,
      attempt: 1,
    });
    return { data: result };
  });

  // 投递日志
  app.get<{ Params: { id: string }; Querystring: LogsQuery }>("/admin/webhooks/:id/logs", async (req) => {
    const id = Number(req.params.id);
    const { status, dateFrom, dateTo, limit: qLimit, offset } = req.query;
    const conditions: any[] = [eq(webhookDeliveryLogs.webhookId, id)];
    if (status) conditions.push(eq(webhookDeliveryLogs.status, status));
    if (dateFrom) conditions.push(sql`${webhookDeliveryLogs.createdAt} >= ${dateFrom}`);
    if (dateTo) conditions.push(sql`${webhookDeliveryLogs.createdAt} <= ${dateTo}`);

    const list = await db
      .select()
      .from(webhookDeliveryLogs)
      .where(and(...conditions))
      .orderBy(desc(webhookDeliveryLogs.createdAt))
      .limit(Number(qLimit) || 50)
      .offset(Number(offset) || 0);

    return { data: { list } };
  });
}

/** 发送 Webhook 并记录结果 */
async function deliverWebhook(
  wh: { url: string; secret: string; timeoutMs: number },
  event: string,
  payload: string,
): Promise<{ status: string; statusCode: number | null; body: string; latencyMs: number; attempts: number }> {
  const start = Date.now();
  const timestamp = Math.floor(start / 1000);
  const signature = crypto.createHmac("sha256", wh.secret).update(payload).digest("hex");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), wh.timeoutMs);

    const res = await fetch(wh.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Event": event,
        "X-Webhook-Timestamp": String(timestamp),
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const body = await res.text();
    return {
      status: res.ok ? "success" : "failed",
      statusCode: res.status,
      body: body.slice(0, 2000),
      latencyMs: Date.now() - start,
      attempts: 1,
    };
  } catch (err: any) {
    return {
      status: err.name === "AbortError" ? "timeout" : "failed",
      statusCode: null,
      body: err.message || String(err),
      latencyMs: Date.now() - start,
      attempts: 1,
    };
  }
}
