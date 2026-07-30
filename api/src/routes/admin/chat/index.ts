// ============================================================
//  3cloud (3C) — 在线聊天 管理后台 API（§27）
//  GET    /api/v1/admin/chat/queue              — 等待队列
//  GET    /api/v1/admin/chat/active             — 正在服务会话
//  GET    /api/v1/admin/chat/sessions/:id/messages — 消息
//  POST   /api/v1/admin/chat/sessions/:id/close — 关闭会话
//  POST   /api/v1/admin/chat/sessions/:id/accept — 接入会话
//  POST   /api/v1/admin/chat/status             — 更新客服状态
//  GET    /api/v1/admin/chat/staff-status       — 客服状态一览
//  GET    /api/v1/admin/chat/presets            — 预设消息列表
//  POST   /api/v1/admin/chat/presets            — 创建预设消息
//  PUT    /api/v1/admin/chat/presets/:id        — 编辑预设消息
//  DELETE /api/v1/admin/chat/presets/:id        — 删除预设消息
//  GET    /api/v1/admin/support/stats           — 客服绩效统计
//  GET    /api/v1/admin/support/audit-logs      — 客服操作审计
//  POST   /api/v1/admin/support/audit-logs/:id/rollback — 回滚
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import {
  chatSessions,
  chatMessages,
  chatPresets,
  staffOperationLogs,
  tickets,
  ticketReplies,
  ticketSatisfaction,
} from "../../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";

// 客服在线状态（内存管理，简化版用 Map）
const staffStatusMap = new Map<number, { status: string; updatedAt: Date; activeSessions: number }>();

export async function adminChatRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticateJWT);
  app.addHook("onRequest", requirePerm(Perm.SUPPORT_MANAGE));

  // ── 等待队列 ──
  app.get("/api/v1/admin/chat/queue", async (req, reply) => {
    const db = getDb();
    const queue = await db
      .select({
        sessionId: chatSessions.id,
        userId: chatSessions.userId,
        status: chatSessions.status,
        category: chatSessions.category,
        queuePosition: chatSessions.queuePosition,
        waitingStartedAt: chatSessions.waitingStartedAt,
        createdAt: chatSessions.createdAt,
      })
      .from(chatSessions)
      .where(eq(chatSessions.status, "waiting"))
      .orderBy(chatSessions.createdAt);

    return reply.send({ queue });
  });

  // ── 正在服务的会话 ──
  app.get("/api/v1/admin/chat/active", async (req, reply) => {
    const db = getDb();
    const active = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.status, "active"))
      .orderBy(chatSessions.staffAssignedAt);

    return reply.send({ active });
  });

  // ── 会话消息 ──
  app.get("/api/v1/admin/chat/sessions/:id/messages", async (req, reply) => {
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const db = getDb();
    const session = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, id))
      .limit(1);

    if (session.length === 0) {
      return reply.status(404).send({ error: "会话不存在" });
    }

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, id))
      .orderBy(chatMessages.createdAt);

    return reply.send({ session: session[0], messages });
  });

  // ── 客服接入会话（从等待队列接单）──
  app.post("/api/v1/admin/chat/sessions/:id/accept", async (req, reply) => {
    const staffId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const db = getDb();
    const session = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, id))
      .limit(1);

    if (session.length === 0) return reply.status(404).send({ error: "会话不存在" });
    if (session[0].status !== "waiting") {
      return reply.status(400).send({ error: "会话不在等待状态" });
    }

    const [updated] = await db
      .update(chatSessions)
      .set({
        staffId,
        status: "active",
        staffAssignedAt: sql`NOW()`,
      })
      .where(eq(chatSessions.id, id))
      .returning();

    // 插入系统消息
    await db.insert(chatMessages).values({
      sessionId: id,
      senderId: staffId,
      senderType: "system",
      contentType: "system",
      content: "客服已接入",
    });

    // 更新内存中的客服活跃会话数
    const cur = staffStatusMap.get(staffId) || { status: "online", updatedAt: new Date(), activeSessions: 0 };
    cur.activeSessions++;
    staffStatusMap.set(staffId, cur);

    return reply.send(updated);
  });

  // ── 关闭会话 ──
  app.post("/api/v1/admin/chat/sessions/:id/close", async (req, reply) => {
    const staffId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const db = getDb();
    await db
      .update(chatSessions)
      .set({ status: "closed", closedAt: sql`NOW()`, closedBy: "staff" })
      .where(eq(chatSessions.id, id));

    // 插入结束系统消息
    await db.insert(chatMessages).values({
      sessionId: id,
      senderId: staffId,
      senderType: "system",
      contentType: "system",
      content: "会话已结束",
    });

    // 更新内存中的活跃会话数
    const cur = staffStatusMap.get(staffId);
    if (cur && cur.activeSessions > 0) cur.activeSessions--;
    staffStatusMap.set(staffId, cur || { status: "online", updatedAt: new Date(), activeSessions: 0 });

    return reply.send({ success: true });
  });

  // ── 更新客服状态（online/busy/offline）──
  app.post("/api/v1/admin/chat/status", async (req, reply) => {
    const staffId = (req as any).user.id;
    const { status } = req.body as any;
    if (!["online", "busy", "offline"].includes(status)) {
      return reply.status(400).send({ error: "无效状态" });
    }

    const cur = staffStatusMap.get(staffId) || { status: "online", updatedAt: new Date(), activeSessions: 0 };
    cur.status = status;
    cur.updatedAt = new Date();
    staffStatusMap.set(staffId, cur);

    return reply.send({ staffId, status });
  });

  // ── 所有客服状态一览 ──
  app.get("/api/v1/admin/chat/staff-status", async (req, reply) => {
    const statuses: any[] = [];
    staffStatusMap.forEach((val, key) => {
      statuses.push({ staffId: key, ...val });
    });
    return reply.send({ staffStatuses: statuses });
  });

  // ── 预设消息列表 ──
  app.get("/api/v1/admin/chat/presets", async (req, reply) => {
    const db = getDb();
    const presets = await db
      .select()
      .from(chatPresets)
      .orderBy(chatPresets.sortOrder);
    return reply.send({ presets });
  });

  // ── 创建预设消息 ──
  app.post("/api/v1/admin/chat/presets", async (req, reply) => {
    const { type, title, content, sortOrder } = req.body as any;
    if (!content) return reply.status(400).send({ error: "内容不能为空" });

    const db = getDb();
    const [preset] = await db
      .insert(chatPresets)
      .values({
        type: type || "custom",
        title: title || null,
        content,
        sortOrder: sortOrder || 0,
      })
      .returning();

    return reply.status(201).send(preset);
  });

  // ── 编辑预设消息 ──
  app.put("/api/v1/admin/chat/presets/:id", async (req, reply) => {
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const { type, title, content, sortOrder } = req.body as any;
    const db = getDb();

    const [preset] = await db
      .update(chatPresets)
      .set({
        ...(type !== undefined && { type }),
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(sortOrder !== undefined && { sortOrder }),
      })
      .where(eq(chatPresets.id, id))
      .returning();

    if (!preset) return reply.status(404).send({ error: "预设消息不存在" });
    return reply.send(preset);
  });

  // ── 删除预设消息 ──
  app.delete("/api/v1/admin/chat/presets/:id", async (req, reply) => {
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const db = getDb();
    await db.delete(chatPresets).where(eq(chatPresets.id, id));
    return reply.send({ success: true });
  });

  // ── 客服绩效统计 ──
  app.get("/api/v1/admin/support/stats", async (req, reply) => {
    const query = req.query as any;
    const db = getDb();

    const dateFrom = query.dateFrom || sql`NOW() - INTERVAL '30 days'`;
    const dateTo = query.dateTo || sql`NOW()`;

    // 会话统计
    const [chatSessStats, chatDuration] = await Promise.all([
      db
        .select({
          staffId: chatSessions.staffId,
          count: sql<number>`count(*)`,
        })
        .from(chatSessions)
        .where(
          and(
            sql`staff_id IS NOT NULL`,
            gte(chatSessions.createdAt, dateFrom),
            lte(chatSessions.createdAt, dateTo)
          )
        )
        .groupBy(chatSessions.staffId),
      db
        .select({
          avgSeconds: sql<string>`COALESCE(AVG(EXTRACT(EPOCH FROM (closed_at - staff_assigned_at))), 0)`,
        })
        .from(chatSessions)
        .where(
          and(
            sql`staff_assigned_at IS NOT NULL`,
            sql`closed_at IS NOT NULL`,
            gte(chatSessions.createdAt, dateFrom),
            lte(chatSessions.createdAt, dateTo)
          )
        ),
    ]);

    // 工单统计（客服角度）
    const [ticketCount, ticketResponse] = await Promise.all([
      db
        .select({
          assigneeId: tickets.assigneeId,
          count: sql<number>`count(*)`,
        })
        .from(tickets)
        .where(
          and(
            sql`assignee_id IS NOT NULL`,
            gte(tickets.createdAt, dateFrom),
            lte(tickets.createdAt, dateTo)
          )
        )
        .groupBy(tickets.assigneeId),
      db
        .select({
          avgSeconds: sql<string>`COALESCE(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))), 0)`,
        })
        .from(tickets)
        .where(
          and(
            sql`first_response_at IS NOT NULL`,
            gte(tickets.createdAt, dateFrom),
            lte(tickets.createdAt, dateTo)
          )
        ),
    ]);

    return reply.send({
      chatStats: {
        perStaff: chatSessStats,
        avgSessionSeconds: Math.round(Number(chatDuration[0]?.avgSeconds || 0)),
      },
      ticketStats: {
        perStaff: ticketCount,
        avgResponseSeconds: Math.round(Number(ticketResponse[0]?.avgSeconds || 0)),
      },
    });
  });

  // ── 客服操作审计列表 ──
  app.get("/api/v1/admin/support/audit-logs", async (req, reply) => {
    const query = req.query as any;
    const db = getDb();
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));

    const conditions: any[] = [];
    if (query.staffId) conditions.push(eq(staffOperationLogs.staffId, parseInt(query.staffId)));
    if (query.operationType) conditions.push(eq(staffOperationLogs.operationType, query.operationType));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalArr] = await Promise.all([
      db
        .select()
        .from(staffOperationLogs)
        .where(where)
        .orderBy(desc(staffOperationLogs.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({ count: sql<number>`count(*)` })
        .from(staffOperationLogs)
        .where(where),
    ]);

    return reply.send({
      logs: rows,
      total: Number(totalArr[0]?.count || 0),
      page,
    });
  });

  // ── 操作回滚 ──
  app.post("/api/v1/admin/support/audit-logs/:id/rollback", async (req, reply) => {
    const staffId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const { reason } = req.body as any;
    if (!reason) return reply.status(400).send({ error: "请填写回滚原因" });

    const db = getDb();
    const log = await db
      .select()
      .from(staffOperationLogs)
      .where(eq(staffOperationLogs.id, id))
      .limit(1);

    if (log.length === 0) return reply.status(404).send({ error: "操作记录不存在" });

    // 检查是否 24 小时内
    const age = Date.now() - new Date(log[0].createdAt).getTime();
    if (age > 24 * 60 * 60 * 1000) {
      return reply.status(400).send({ error: "超过 24 小时的操作不允许回滚" });
    }

    // 记录回滚操作
    await db.insert(staffOperationLogs).values({
      staffId,
      operationType: "rollback",
      targetId: String(id),
      beforeValue: log[0].afterValue,
      afterValue: log[0].beforeValue,
      reason: reason.trim(),
      rollbackToId: id,
    });

    return reply.send({ success: true, rollbackLogId: (await db.select().from(staffOperationLogs).orderBy(desc(staffOperationLogs.id)).limit(1))[0]?.id });
  });
}
