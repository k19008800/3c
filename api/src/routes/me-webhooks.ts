import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, pool } from "../db/index";
import { webhooks, webhookDeliveryLogs, WEBHOOK_EVENTS } from "../db/schema/webhooks";
import crypto from "crypto";

/**
 * 用户端 Webhook 管理
 * 对齐 SPEC-§32.1 全局 Webhook 用户端
 */

function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };
}

export function meWebhooksRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);
  const uid = (req: any) => Number((req as any).user.sub);

  // 1. 用户 Webhook 列表
  app.get("/me/webhooks", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const rows = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.createdBy, userId))
      .orderBy(webhooks.createdAt);
    return {
      code: 0,
      data: {
        list: rows.map((r) => ({
          ...r,
          events: r.events ? JSON.parse(r.events) : [],
          // 不返回 secret 明文，仅返回是否已设置
          has_secret: !!r.secret,
        })),
      },
      message: "ok",
    };
  });

  // 2. 创建 Webhook
  app.post("/me/webhooks", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const b = req.body as {
      name?: string;
      url?: string;
      events?: string[];
      secret?: string;
      retry_count?: number;
      timeout_ms?: number;
    };

    if (!b.name?.trim()) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "名称必填" });
    if (!b.url?.trim()) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "URL 必填" });
    if (!b.events?.length) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "至少选择一个事件" });

    // 验证事件类型
    for (const evt of b.events) {
      if (!WEBHOOK_EVENTS.includes(evt as any)) {
        return reply.code(400).send({ code: 400, error: "INVALID_EVENT", message: `不支持的事件类型: ${evt}` });
      }
    }

    // URL 格式验证
    try {
      new URL(b.url.trim());
    } catch {
      return reply.code(400).send({ code: 400, error: "INVALID_URL", message: "URL 格式不正确" });
    }

    const secret = b.secret || crypto.randomBytes(24).toString("hex");
    const created = await db
      .insert(webhooks)
      .values({
        name: b.name.trim(),
        url: b.url.trim(),
        events: JSON.stringify(b.events),
        secret,
        isActive: true,
        retryCount: b.retry_count ?? 3,
        timeoutMs: b.timeout_ms ?? 5000,
        createdBy: userId,
      })
      .returning({ id: webhooks.id });

    return {
      code: 0,
      data: { id: created[0]!.id, secret }, // 仅创建时返回 secret
      message: "Webhook 已创建",
    };
  });

  // 3. 更新 Webhook
  app.put("/me/webhooks/:id", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const id = Number((req.params as any).id);
    const b = req.body as {
      name?: string;
      url?: string;
      events?: string[];
      is_active?: boolean;
      retry_count?: number;
      timeout_ms?: number;
    };

    const existing = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.createdBy, userId)))
      .limit(1);
    if (!existing[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "Webhook 不存在" });

    if (b.url) {
      try {
        new URL(b.url.trim());
      } catch {
        return reply.code(400).send({ code: 400, error: "INVALID_URL", message: "URL 格式不正确" });
      }
    }
    if (b.events) {
      for (const evt of b.events) {
        if (!WEBHOOK_EVENTS.includes(evt as any)) {
          return reply.code(400).send({ code: 400, error: "INVALID_EVENT", message: `不支持的事件类型: ${evt}` });
        }
      }
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (b.name !== undefined) updateData.name = b.name.trim();
    if (b.url !== undefined) updateData.url = b.url.trim();
    if (b.events !== undefined) updateData.events = JSON.stringify(b.events);
    if (b.is_active !== undefined) updateData.isActive = b.is_active;
    if (b.retry_count !== undefined) updateData.retryCount = b.retry_count;
    if (b.timeout_ms !== undefined) updateData.timeoutMs = b.timeout_ms;

    await db.update(webhooks).set(updateData).where(eq(webhooks.id, id));
    return { code: 0, data: { success: true }, message: "Webhook 已更新" };
  });

  // 4. 删除 Webhook
  app.delete("/me/webhooks/:id", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const id = Number((req.params as any).id);
    const r = await db
      .delete(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.createdBy, userId)));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "Webhook 不存在" });
    return { code: 0, data: { success: true }, message: "Webhook 已删除" };
  });

  // 5. 测试发送
  app.post("/me/webhooks/:id/test", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const id = Number((req.params as any).id);
    const wh = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.createdBy, userId)))
      .limit(1);
    if (!wh[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "Webhook 不存在" });

    const testPayload = {
      event: "test.ping",
      timestamp: new Date().toISOString(),
      data: { message: "Webhook 测试消息" },
    };

    const payloadStr = JSON.stringify(testPayload);
    const signature = crypto
      .createHmac("sha256", wh[0].secret)
      .update(payloadStr)
      .digest("hex");

    const startTime = Date.now();
    let responseCode: number | null = null;
    let responseBody: string | null = null;
    let status: string = "failed";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), wh[0].timeoutMs ?? 5000);
      const res = await fetch(wh[0].url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Event": "test.ping",
        },
        body: payloadStr,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      responseCode = res.status;
      responseBody = await res.text().catch(() => null);
      status = res.ok ? "success" : "failed";
    } catch (err: any) {
      responseCode = null;
      responseBody = err.message;
      status = "timeout";
    }

    const latencyMs = Date.now() - startTime;

    // 记录投递日志
    await db.insert(webhookDeliveryLogs).values({
      webhookId: id,
      event: "test.ping",
      payload: payloadStr,
      responseCode,
      responseBody,
      latencyMs,
      status,
      attempt: 1,
    });

    // 更新最后触发时间
    await db
      .update(webhooks)
      .set({
        lastTriggeredAt: new Date(),
        ...(status === "success" ? { lastSuccessAt: new Date() } : { lastError: responseBody }),
        updatedAt: new Date(),
      })
      .where(eq(webhooks.id, id));

    return {
      code: 0,
      data: {
        status,
        response_code: responseCode,
        latency_ms: latencyMs,
        response_body: responseBody?.slice(0, 500) ?? null,
      },
      message: status === "success" ? "测试成功" : `测试${status === "timeout" ? "超时" : "失败"}`,
    };
  });
}
