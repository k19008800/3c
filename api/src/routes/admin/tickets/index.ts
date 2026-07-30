// ============================================================
//  3cloud (3C) — 工单系统 管理后台 API（§26）
//  GET    /api/v1/admin/tickets              — 工单队列
//  GET    /api/v1/admin/tickets/stats         — 工单统计
//  GET    /api/v1/admin/tickets/:id           — 工单详情
//  POST   /api/v1/admin/tickets/:id/reply     — 回复工单
//  POST   /api/v1/admin/tickets/:id/assign    — 分配工单
//  POST   /api/v1/admin/tickets/:id/status    — 变更状态
//  POST   /api/v1/admin/tickets/:id/priority  — 变更优先级
//  POST   /api/v1/admin/tickets/:id/tags      — 添加/移除标签
//  POST   /api/v1/admin/tickets/:id/note      — 内部备注
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import {
  tickets,
  ticketReplies,
  ticketSatisfaction,
  ticketOperationLogs,
  ticketTagDefs,
  users,
} from "../../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";

export async function adminTicketRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticateJWT);
  app.addHook("onRequest", requirePerm(Perm.SUPPORT_MANAGE));

  // ── 工单队列 ──
  app.get("/api/v1/admin/tickets", async (req, reply) => {
    const query = req.query as any;
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
    const offset = (page - 1) * limit;

    const db = getDb();
    const conditions: any[] = [];

    if (query.status) conditions.push(eq(tickets.status, query.status));
    if (query.priority) conditions.push(eq(tickets.priority, query.priority));
    if (query.category) conditions.push(eq(tickets.category, query.category));
    if (query.assigneeId) conditions.push(eq(tickets.assigneeId, parseInt(query.assigneeId)));
    if (query.search) {
      const s = `%${query.search}%`;
      conditions.push(sql`(ticket_no ILIKE ${s} OR title ILIKE ${s})`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalArr, statsArr] = await Promise.all([
      db
        .select({
          id: tickets.id,
          ticketNo: tickets.ticketNo,
          title: tickets.title,
          category: tickets.category,
          priority: tickets.priority,
          status: tickets.status,
          userId: tickets.userId,
          assigneeId: tickets.assigneeId,
          tags: tickets.tags,
          source: tickets.source,
          createdAt: tickets.createdAt,
          firstResponseAt: tickets.firstResponseAt,
        })
        .from(tickets)
        .where(where)
        .orderBy(desc(tickets.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(where),
      db
        .select({
          status: tickets.status,
          count: sql<number>`count(*)`,
        })
        .from(tickets)
        .groupBy(tickets.status),
    ]);

    const total = Number(totalArr[0]?.count || 0);
    const stats: Record<string, number> = {};
    statsArr.forEach((r) => { stats[r.status] = Number(r.count); });

    return reply.send({
      tickets: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats,
    });
  });

  // ── 工单统计 ──
  app.get("/api/v1/admin/tickets/stats", async (req, reply) => {
    const query = req.query as any;
    const db = getDb();

    const dateFrom = query.dateFrom || sql`NOW() - INTERVAL '30 days'`;
    const dateTo = query.dateTo || sql`NOW()`;

    // 统计指标
    const [totalResult, avgResponseResult, avgResolveResult, satisfactionResult, categoryResult, staffResult] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(*)` })
          .from(tickets)
          .where(and(gte(tickets.createdAt, dateFrom), lte(tickets.createdAt, dateTo))),
        db
          .select({ avg: sql<string>`COALESCE(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))), 0)` })
          .from(tickets)
          .where(and(gte(tickets.createdAt, dateFrom), lte(tickets.createdAt, dateTo), sql`first_response_at IS NOT NULL`)),
        db
          .select({ avg: sql<string>`COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))), 0)` })
          .from(tickets)
          .where(and(gte(tickets.createdAt, dateFrom), lte(tickets.createdAt, dateTo), sql`resolved_at IS NOT NULL`)),
        db
          .select({ avg: sql<string>`COALESCE(AVG(rating), 0)` })
          .from(ticketSatisfaction)
          .innerJoin(tickets, eq(ticketSatisfaction.ticketId, tickets.id))
          .where(and(gte(tickets.createdAt, dateFrom), lte(tickets.createdAt, dateTo))),
        db
          .select({
            category: tickets.category,
            count: sql<number>`count(*)`,
          })
          .from(tickets)
          .where(and(gte(tickets.createdAt, dateFrom), lte(tickets.createdAt, dateTo)))
          .groupBy(tickets.category),
        db
          .select({
            staffId: tickets.assigneeId,
            count: sql<number>`count(*)`,
          })
          .from(tickets)
          .where(and(gte(tickets.createdAt, dateFrom), lte(tickets.createdAt, dateTo), sql`assignee_id IS NOT NULL`))
          .groupBy(tickets.assigneeId),
      ]);

    return reply.send({
      totalTickets: Number(totalResult[0]?.count || 0),
      avgResponseSeconds: Math.round(Number(avgResponseResult[0]?.avg || 0)),
      avgResolveSeconds: Math.round(Number(avgResolveResult[0]?.avg || 0)),
      avgSatisfaction: Math.round(Number(satisfactionResult[0]?.avg || 0) * 10) / 10,
      categoryDistribution: categoryResult,
      staffDistribution: staffResult,
    });
  });

  // ── 工单详情 ──
  app.get("/api/v1/admin/tickets/:id", async (req, reply) => {
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const db = getDb();

    const ticket = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, id))
      .limit(1);

    if (ticket.length === 0) {
      return reply.status(404).send({ error: "工单不存在" });
    }

    const [replies, operationLogs, satisfaction] = await Promise.all([
      db
        .select()
        .from(ticketReplies)
        .where(eq(ticketReplies.ticketId, id))
        .orderBy(ticketReplies.createdAt),
      db
        .select()
        .from(ticketOperationLogs)
        .where(eq(ticketOperationLogs.ticketId, id))
        .orderBy(ticketOperationLogs.createdAt),
      db
        .select()
        .from(ticketSatisfaction)
        .where(eq(ticketSatisfaction.ticketId, id))
        .limit(1),
    ]);

    return reply.send({
      ticket: ticket[0],
      replies,
      operationLogs,
      satisfaction: satisfaction[0] || null,
    });
  });

  // ── 客服回复 ──
  app.post("/api/v1/admin/tickets/:id/reply", async (req, reply) => {
    const staffId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const { content, attachments } = req.body as any;
    if (!content || !content.trim()) {
      return reply.status(400).send({ error: "回复内容不能为空" });
    }

    const db = getDb();
    const ticket = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, id))
      .limit(1);

    if (ticket.length === 0) {
      return reply.status(404).send({ error: "工单不存在" });
    }

    if (ticket[0].status === "closed") {
      return reply.status(400).send({ error: "工单已关闭" });
    }

    // 首次回复记录 firstResponseAt
    const updateData: any = { updatedAt: sql`NOW()` };
    if (!ticket[0].firstResponseAt) {
      updateData.firstResponseAt = sql`NOW()`;
    }

    await db
      .update(tickets)
      .set(updateData)
      .where(eq(tickets.id, id));

    const [replyRecord] = await db
      .insert(ticketReplies)
      .values({
        ticketId: id,
        userId: staffId,
        isStaff: true,
        content: content.trim(),
        attachments: attachments ? JSON.stringify(attachments) : null,
      })
      .returning();

    await db.insert(ticketOperationLogs).values({
      ticketId: id,
      operatorId: staffId,
      action: "replied",
      detail: "客服回复工单",
    });

    return reply.status(201).send(replyRecord);
  });

  // ── 分配工单 ──
  app.post("/api/v1/admin/tickets/:id/assign", async (req, reply) => {
    const staffId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const { assigneeId } = req.body as any;
    if (!assigneeId) return reply.status(400).send({ error: "请指定客服" });

    const db = getDb();
    const [ticket] = await db
      .update(tickets)
      .set({ assigneeId: parseInt(assigneeId), updatedAt: sql`NOW()` })
      .where(eq(tickets.id, id))
      .returning();

    await db.insert(ticketOperationLogs).values({
      ticketId: id,
      operatorId: staffId,
      action: "assigned",
      detail: `分配给客服 ${assigneeId}`,
    });

    return reply.send(ticket);
  });

  // ── 变更状态 ──
  app.post("/api/v1/admin/tickets/:id/status", async (req, reply) => {
    const staffId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const { status } = req.body as any;
    const allowedStatuses = ["pending", "processing", "resolved", "closed"];
    if (!allowedStatuses.includes(status)) {
      return reply.status(400).send({ error: `无效状态，允许: ${allowedStatuses.join(", ")}` });
    }

    const db = getDb();
    const updateData: any = { status, updatedAt: sql`NOW()` };

    if (status === "resolved") {
      updateData.resolvedAt = sql`NOW()`;
    }
    if (status === "closed") {
      updateData.closedAt = sql`NOW()`;
    }

    const [ticket] = await db
      .update(tickets)
      .set(updateData)
      .where(eq(tickets.id, id))
      .returning();

    await db.insert(ticketOperationLogs).values({
      ticketId: id,
      operatorId: staffId,
      action: "status_changed",
      detail: `状态变更 → ${status}`,
    });

    return reply.send(ticket);
  });

  // ── 变更优先级 ──
  app.post("/api/v1/admin/tickets/:id/priority", async (req, reply) => {
    const staffId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const { priority } = req.body as any;
    const allowedPriorities = ["low", "normal", "high", "urgent"];
    if (!allowedPriorities.includes(priority)) {
      return reply.status(400).send({ error: "无效优先级" });
    }

    const db = getDb();
    const [ticket] = await db
      .update(tickets)
      .set({ priority, updatedAt: sql`NOW()` })
      .where(eq(tickets.id, id))
      .returning();

    await db.insert(ticketOperationLogs).values({
      ticketId: id,
      operatorId: staffId,
      action: "priority_changed",
      detail: `优先级变更 → ${priority}`,
    });

    return reply.send(ticket);
  });

  // ── 添加/移除标签 ──
  app.post("/api/v1/admin/tickets/:id/tags", async (req, reply) => {
    const staffId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const { action: tagAction, tagName } = req.body as any;
    if (!tagName) return reply.status(400).send({ error: "请指定标签名" });

    const db = getDb();
    const ticket = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, id))
      .limit(1);

    if (ticket.length === 0) return reply.status(404).send({ error: "工单不存在" });

    const currentTags = ticket[0].tags ? ticket[0].tags.split(",").filter(Boolean) : [];
    let newTags: string[];

    if (tagAction === "add") {
      newTags = [...new Set([...currentTags, tagName])];
    } else if (tagAction === "remove") {
      newTags = currentTags.filter((t) => t !== tagName);
    } else {
      return reply.status(400).send({ error: "无效操作，应为 add 或 remove" });
    }

    await db
      .update(tickets)
      .set({ tags: newTags.join(","), updatedAt: sql`NOW()` })
      .where(eq(tickets.id, id));

    await db.insert(ticketOperationLogs).values({
      ticketId: id,
      operatorId: staffId,
      action: tagAction === "add" ? "tag_added" : "tag_removed",
      detail: `${tagAction === "add" ? "添加" : "移除"}标签: ${tagName}`,
    });

    return reply.send({ tags: newTags });
  });

  // ── 内部备注（用户不可见）──
  app.post("/api/v1/admin/tickets/:id/note", async (req, reply) => {
    const staffId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const { note } = req.body as any;
    if (!note || !note.trim()) {
      return reply.status(400).send({ error: "备注不能为空" });
    }

    const db = getDb();
    await db.insert(ticketOperationLogs).values({
      ticketId: id,
      operatorId: staffId,
      action: "note_added",
      detail: `内部备注: ${note.trim()}`,
    });

    return reply.send({ success: true });
  });

  // ── 导出工单列表 ──
  app.get("/api/v1/admin/tickets/export", async (req, reply) => {
    const query = req.query as any;
    const db = getDb();
    const conditions: any[] = [];

    if (query.status) conditions.push(eq(tickets.status, query.status));
    if (query.category) conditions.push(eq(tickets.category, query.category));

    const rows = await db
      .select()
      .from(tickets)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tickets.createdAt))
      .limit(5000);

    // 生成 CSV
    const header = "工单号,标题,分类,优先级,状态,用户ID,创建时间,首次响应时间,解决时间\n";
    const csv = rows.map((r) =>
      [
        r.ticketNo,
        `"${(r.title || "").replace(/"/g, '""')}"`,
        r.category,
        r.priority,
        r.status,
        r.userId,
        r.createdAt,
        r.firstResponseAt || "",
        r.resolvedAt || "",
      ].join(",")
    ).join("\n");

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=tickets.csv");
    return reply.send(header + csv);
  });
}
