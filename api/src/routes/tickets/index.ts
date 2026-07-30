// ============================================================
//  3cloud (3C) — 工单系统 用户端 API（§26）
//  GET    /api/v1/me/tickets
//  POST   /api/v1/me/tickets
//  GET    /api/v1/me/tickets/:id
//  POST   /api/v1/me/tickets/:id/reply
//  POST   /api/v1/me/tickets/:id/close
//  POST   /api/v1/me/tickets/:id/satisfaction
//  POST   /api/v1/me/tickets/upload
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, and, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  tickets,
  ticketReplies,
  ticketSatisfaction,
  ticketOperationLogs,
} from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";
import { generateTicketNo } from "./utils.js";

export async function ticketUserRoutes(app: FastifyInstance) {
  // 身份验证中间件
  app.addHook("onRequest", authenticateJWT);

  // ── 我的工单列表 ──
  app.get("/api/v1/me/tickets", async (req, reply) => {
    const userId = (req as any).user.id;
    const query = req.query as any;
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 20));
    const offset = (page - 1) * limit;
    const status = query.status;
    const category = query.category;
    const search = query.search;

    const db = getDb();

    const conditions = [eq(tickets.userId, userId)];
    if (status) conditions.push(eq(tickets.status, status));
    if (category) conditions.push(eq(tickets.category, category));
    if (search) {
      conditions.push(
        sql`(ticket_no ILIKE ${`%${search}%`} OR title ILIKE ${`%${search}%`})`
      );
    }

    const where = and(...conditions);

    const [rows, totalArr] = await Promise.all([
      db
        .select()
        .from(tickets)
        .where(where)
        .orderBy(desc(tickets.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(where),
    ]);

    const total = Number(totalArr[0]?.count || 0);

    return reply.send({
      tickets: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  });

  // ── 创建工单 ──
  app.post("/api/v1/me/tickets", async (req, reply) => {
    const userId = (req as any).user.id;
    const { title, category, priority, description, attachments } = req.body as any;

    if (!title || !title.trim()) {
      return reply.status(400).send({ error: "标题不能为空" });
    }
    if (!category) {
      return reply.status(400).send({ error: "请选择分类" });
    }
    if (!description || !description.trim()) {
      return reply.status(400).send({ error: "描述不能为空" });
    }

    // 检查 5 分钟内是否提交过相似工单（同一用户 + 标题相似）
    const db = getDb();
    const recent = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(
        and(
          eq(tickets.userId, userId),
          sql`created_at > NOW() - INTERVAL '5 minutes'`,
          sql`similarity(title, ${title.trim()}) > 0.9`
        )
      )
      .limit(1);

    if (recent.length > 0) {
      return reply.status(409).send({
        error: "您已提交过相似工单，请勿重复提交",
        existingTicketId: recent[0].id,
      });
    }

    const ticketNo = await generateTicketNo();

    const [ticket] = await db
      .insert(tickets)
      .values({
        ticketNo,
        userId,
        title: title.trim(),
        category,
        priority: priority || "normal",
        description: description.trim(),
        attachments: attachments ? JSON.stringify(attachments) : null,
        status: "pending",
      })
      .returning();

    // 记录操作日志
    await db.insert(ticketOperationLogs).values({
      ticketId: ticket.id,
      operatorId: userId,
      action: "created",
      detail: `用户创建工单 ${ticketNo}`,
    });

    return reply.status(201).send(ticket);
  });

  // ── 工单详情 ──
  app.get("/api/v1/me/tickets/:id", async (req, reply) => {
    const userId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const db = getDb();
    const ticket = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.userId, userId)))
      .limit(1);

    if (ticket.length === 0) {
      return reply.status(404).send({ error: "工单不存在" });
    }

    const replies = await db
      .select()
      .from(ticketReplies)
      .where(eq(ticketReplies.ticketId, id))
      .orderBy(ticketReplies.createdAt);

    return reply.send({ ticket: ticket[0], replies });
  });

  // ── 回复工单 ──
  app.post("/api/v1/me/tickets/:id/reply", async (req, reply) => {
    const userId = (req as any).user.id;
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
      .where(and(eq(tickets.id, id), eq(tickets.userId, userId)))
      .limit(1);

    if (ticket.length === 0) {
      return reply.status(404).send({ error: "工单不存在" });
    }

    if (ticket[0].status === "closed") {
      return reply.status(400).send({ error: "工单已关闭，无法回复" });
    }

    // 如果工单是 resolved 状态，用户回复时自动 reopen
    if (ticket[0].status === "resolved") {
      await db
        .update(tickets)
        .set({ status: "processing", updatedAt: sql`NOW()` })
        .where(eq(tickets.id, id));
    }

    const [replyRecord] = await db
      .insert(ticketReplies)
      .values({
        ticketId: id,
        userId,
        isStaff: false,
        content: content.trim(),
        attachments: attachments ? JSON.stringify(attachments) : null,
      })
      .returning();

    return reply.status(201).send(replyRecord);
  });

  // ── 用户自行关闭工单 ──
  app.post("/api/v1/me/tickets/:id/close", async (req, reply) => {
    const userId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const db = getDb();
    const ticket = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.userId, userId)))
      .limit(1);

    if (ticket.length === 0) {
      return reply.status(404).send({ error: "工单不存在" });
    }

    if (ticket[0].status !== "pending" && ticket[0].status !== "processing") {
      return reply.status(400).send({ error: "仅待处理或处理中的工单允许用户关闭" });
    }

    await db
      .update(tickets)
      .set({ status: "closed", closedAt: sql`NOW()`, updatedAt: sql`NOW()` })
      .where(eq(tickets.id, id));

    await db.insert(ticketOperationLogs).values({
      ticketId: id,
      operatorId: userId,
      action: "closed_by_user",
      detail: "用户自行关闭工单",
    });

    return reply.send({ success: true });
  });

  // ── 提交满意度评价 ──
  app.post("/api/v1/me/tickets/:id/satisfaction", async (req, reply) => {
    const userId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const { rating, comment } = req.body as any;
    const r = parseInt(rating);
    if (isNaN(r) || r < 1 || r > 5) {
      return reply.status(400).send({ error: "评分必须在 1-5 之间" });
    }

    const db = getDb();
    const ticket = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.userId, userId)))
      .limit(1);

    if (ticket.length === 0) {
      return reply.status(404).send({ error: "工单不存在" });
    }

    // 检查是否已评价
    const existing = await db
      .select()
      .from(ticketSatisfaction)
      .where(eq(ticketSatisfaction.ticketId, id))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: "该工单已评价过" });
    }

    const [result] = await db
      .insert(ticketSatisfaction)
      .values({ ticketId: id, rating: r, comment: comment?.trim() })
      .returning();

    return reply.status(201).send(result);
  });
}

export async function ticketUploadRoute(app: FastifyInstance) {
  // ── 上传附件（工单相关） ──
  app.addHook("onRequest", authenticateJWT);

  app.post("/api/v1/me/tickets/upload", async (req, reply) => {
    const file = (req as any).file;
    if (!file) {
      return reply.status(400).send({ error: "请选择文件" });
    }

    // 校验文件类型和大小
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "application/pdf"];
    if (!allowedTypes.includes(file.mimetype)) {
      return reply.status(400).send({ error: "仅支持 jpg/png/gif/pdf 格式" });
    }
    if (file.size > 5 * 1024 * 1024) {
      return reply.status(400).send({ error: "单张文件不超过 5MB" });
    }

    // 返回文件 URL（由上传中间件处理）
    return reply.send({ url: file.path });
  });
}
