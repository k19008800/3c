// ============================================================
//  3cloud (3C) — 客服排班、SLA 与质检（§27.4）
//  GET    /api/v1/admin/support/schedules           — 排班列表
//  POST   /api/v1/admin/support/schedules           — 创建/更新排班
//  DELETE /api/v1/admin/support/schedules/:id       — 删除排班
//  GET    /api/v1/admin/support/sla-configs          — SLA 配置
//  POST   /api/v1/admin/support/sla-configs          — 创建/更新 SLA
//  DELETE /api/v1/admin/support/sla-configs/:id      — 删除 SLA
//  GET    /api/v1/admin/support/quality-checks       — 质检列表
//  POST   /api/v1/admin/support/quality-checks       — 创建质检
//  PUT    /api/v1/admin/support/quality-checks/:id   — 更新质检
//  GET    /api/v1/admin/support/stats                — 客服效能统计（增强版）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, sql, count, and, gte, lte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  staffSchedules,
  staffScheduleExceptions,
  staffSlaConfigs,
  staffQualityChecks,
  tickets,
  ticketReplies,
  ticketSatisfaction,
  chatSessions,
  users,
} from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminSupportEnhanceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  排班管理
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/support/schedules — 排班列表
  app.get("/api/v1/admin/support/schedules", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as { staffId?: string };
    const where = query.staffId ? eq(staffSchedules.staffId, Number(query.staffId)) : undefined;
    const list = await db.select().from(staffSchedules).where(where).orderBy(staffSchedules.weekday);
    reply.send({ code: 0, data: { list }, message: "ok" });
  });

  // POST /api/v1/admin/support/schedules — 创建/更新排班
  app.post("/api/v1/admin/support/schedules", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as {
      staffId: number;
      weekday: number;
      startTime: string;
      endTime: string;
      isHoliday?: boolean;
    };

    if (!body.staffId || body.weekday === undefined || !body.startTime || !body.endTime) {
      return reply.status(400).send({ code: 400, data: null, message: "缺少必填参数" });
    }

    // upsert（同一客服同一星期只能有一条记录）
    const [existing] = await db.select()
      .from(staffSchedules)
      .where(and(eq(staffSchedules.staffId, body.staffId), eq(staffSchedules.weekday, body.weekday)))
      .limit(1);

    if (existing) {
      const [updated] = await db.update(staffSchedules)
        .set({ startTime: body.startTime as any, endTime: body.endTime as any, isHoliday: body.isHoliday ?? false, updatedAt: sql`now()` })
        .where(eq(staffSchedules.id, existing.id))
        .returning();
      return reply.send({ code: 0, data: updated, message: "排班已更新" });
    }

    const [inserted] = await db.insert(staffSchedules).values(body).returning();
    reply.status(201).send({ code: 0, data: inserted, message: "排班已创建" });
  });

  // DELETE /api/v1/admin/support/schedules/:id
  app.delete("/api/v1/admin/support/schedules/:id", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as any;
    await db.delete(staffSchedules).where(eq(staffSchedules.id, Number(id)));
    reply.send({ code: 0, data: null, message: "已删除" });
  });

  // ──────────────────────────────────────────────
  //  排班例外（请假/调班）
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/support/schedule-exceptions
  app.get("/api/v1/admin/support/schedule-exceptions", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as { staffId?: string; status?: string; month?: string };
    const conditions = [];

    if (query.staffId) conditions.push(eq(staffScheduleExceptions.staffId, Number(query.staffId)));
    if (query.status) conditions.push(eq(staffScheduleExceptions.status, query.status));
    if (query.month) {
      conditions.push(gte(staffScheduleExceptions.exceptionDate, `${query.month}-01`));
      conditions.push(lte(staffScheduleExceptions.exceptionDate, `${query.month}-31`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const list = await db.select().from(staffScheduleExceptions).where(where).orderBy(desc(staffScheduleExceptions.exceptionDate));
    reply.send({ code: 0, data: { list }, message: "ok" });
  });

  // POST /api/v1/admin/support/schedule-exceptions
  app.post("/api/v1/admin/support/schedule-exceptions", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as any;
    const [inserted] = await db.insert(staffScheduleExceptions).values(body).returning();
    reply.status(201).send({ code: 0, data: inserted, message: "例外已创建" });
  });

  // PUT /api/v1/admin/support/schedule-exceptions/:id/approve
  app.post("/api/v1/admin/support/schedule-exceptions/:id/approve", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as any;
    const { approvedBy, status } = request.body as any;
    await db.update(staffScheduleExceptions)
      .set({ status: status || "approved", approvedBy: Number(approvedBy) || request.user!.userId })
      .where(eq(staffScheduleExceptions.id, Number(id)));
    reply.send({ code: 0, data: null, message: `已${status === 'approved' ? '批准' : '拒绝'}` });
  });

  // ──────────────────────────────────────────────
  //  SLA 配置管理
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/support/sla-configs
  app.get("/api/v1/admin/support/sla-configs", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (_request, reply) => {
    const db = getDb();
    const list = await db.select().from(staffSlaConfigs).orderBy(staffSlaConfigs.ticketType);
    reply.send({ code: 0, data: { list }, message: "ok" });
  });

  // POST /api/v1/admin/support/sla-configs
  app.post("/api/v1/admin/support/sla-configs", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as any;
    const [inserted] = await db.insert(staffSlaConfigs).values(body).returning();
    reply.status(201).send({ code: 0, data: inserted, message: "SLA 配置已创建" });
  });

  // PUT /api/v1/admin/support/sla-configs/:id
  app.put("/api/v1/admin/support/sla-configs/:id", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as any;
    const updates = request.body as any;
    const [updated] = await db.update(staffSlaConfigs)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(staffSlaConfigs.id, Number(id)))
      .returning();
    reply.send({ code: 0, data: updated, message: "SLA 配置已更新" });
  });

  // DELETE /api/v1/admin/support/sla-configs/:id
  app.delete("/api/v1/admin/support/sla-configs/:id", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as any;
    await db.delete(staffSlaConfigs).where(eq(staffSlaConfigs.id, Number(id)));
    reply.send({ code: 0, data: null, message: "已删除" });
  });

  // ──────────────────────────────────────────────
  //  质检管理
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/support/quality-checks
  app.get("/api/v1/admin/support/quality-checks", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as { staffId?: string; status?: string; page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const conditions = [];

    if (query.staffId) conditions.push(eq(staffQualityChecks.staffId, Number(query.staffId)));
    if (query.status) conditions.push(eq(staffQualityChecks.status, query.status));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const totalResult = await db.select({ total: count(staffQualityChecks.id) }).from(staffQualityChecks).where(where);
    const total = Number(totalResult[0]?.total || 0);
    const list = await db.select()
      .from(staffQualityChecks)
      .where(where)
      .orderBy(desc(staffQualityChecks.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    reply.send({
      code: 0,
      data: { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      message: "ok",
    });
  });

  // POST /api/v1/admin/support/quality-checks
  app.post("/api/v1/admin/support/quality-checks", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as any;
    const [inserted] = await db.insert(staffQualityChecks).values({
      ...body,
      reviewerId: request.user!.userId,
    }).returning();
    reply.status(201).send({ code: 0, data: inserted, message: "质检记录已创建" });
  });

  // PUT /api/v1/admin/support/quality-checks/:id
  app.put("/api/v1/admin/support/quality-checks/:id", {
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as any;
    const updates = request.body as any;
    const [updated] = await db.update(staffQualityChecks)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(staffQualityChecks.id, Number(id)))
      .returning();
    reply.send({ code: 0, data: updated, message: "质检记录已更新" });
  });

  // ──────────────────────────────────────────────
  //  客服效能统计（增强版）
  //  注意：/api/v1/admin/support/stats 已在 chat/index.ts 中注册，此处不重复
  // ──────────────────────────────────────────────
  /*
    preHandler: [requirePerm(Perm.SUPPORT_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as { period?: string; date?: string; staffId?: string };
    const period = query.period || "month";
    const dateStr = query.date || new Date().toISOString().slice(0, 7); // YYYY-MM

    // 日期范围
    let dateFrom: Date, dateTo: Date;
    if (period === "day") {
      dateFrom = new Date(dateStr);
      dateTo = new Date(dateFrom);
      dateTo.setDate(dateTo.getDate() + 1);
    } else if (period === "week") {
      dateFrom = new Date(dateStr);
      dateFrom.setDate(dateFrom.getDate() - dateFrom.getDay());
      dateTo = new Date(dateFrom);
      dateTo.setDate(dateTo.getDate() + 7);
    } else {
      dateFrom = new Date(`${dateStr}-01`);
      dateTo = new Date(dateFrom);
      dateTo.setMonth(dateTo.getMonth() + 1);
    }

    const staffWhere = query.staffId ? [eq(tickets.assignedTo, Number(query.staffId))] : [];

    // 工单统计
    const ticketStats = await db.select({
      total: count(tickets.id),
      closed: sql`count(*) FILTER (WHERE ${tickets.status} = 'closed')`,
      resolved: sql`count(*) FILTER (WHERE ${tickets.status} = 'resolved')`,
    })
    .from(tickets)
    .where(and(gte(tickets.createdAt, dateFrom), lte(tickets.createdAt, dateTo), ...staffWhere));

    // 满意度统计
    const satisfactionStats = await db.select({
      avgScore: sql`avg(${ticketSatisfaction.score})`,
      total: count(ticketSatisfaction.id),
    })
    .from(ticketSatisfaction)
    .where(gte(ticketSatisfaction.createdAt, dateFrom));

    // 会话统计
    const sessionStats = await db.select({
      total: count(chatSessions.id),
      avgDuration: sql`avg(extract(epoch from ${chatSessions.closedAt} - ${chatSessions.staffAssignedAt}))`,
    })
    .from(chatSessions)
    .where(and(gte(chatSessions.createdAt, dateFrom), lte(chatSessions.createdAt, dateTo)));

    // 客服排名
    const staffRanking = await db.select({
      staffId: tickets.assignedTo,
      ticketCount: count(tickets.id),
    })
    .from(tickets)
    .where(and(gte(tickets.createdAt, dateFrom), lte(tickets.createdAt, dateTo)))
    .groupBy(tickets.assignedTo)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

    // 质检统计
    const qualityStats = await db.select({
      avgScore: sql`avg(${staffQualityChecks.score})`,
      total: count(staffQualityChecks.id),
    })
    .from(staffQualityChecks)
    .where(and(gte(staffQualityChecks.createdAt, dateFrom), lte(staffQualityChecks.createdAt, dateTo)));

    reply.send({
      code: 0,
      data: {
        period,
        dateRange: { from: dateFrom, to: dateTo },
        tickets: {
          total: Number(ticketStats[0]?.total || 0),
          closed: Number(ticketStats[0]?.closed || 0),
          resolved: Number(ticketStats[0]?.resolved || 0),
        },
        satisfaction: {
          avgScore: Number(satisfactionStats[0]?.avgScore || 0).toFixed(1),
          total: Number(satisfactionStats[0]?.total || 0),
        },
        sessions: {
          total: Number(sessionStats[0]?.total || 0),
          avgDurationSec: Math.round(Number(sessionStats[0]?.avgDuration || 0)),
        },
        staffRanking,
        quality: {
          avgScore: Number(qualityStats[0]?.avgScore || 0).toFixed(1),
          total: Number(qualityStats[0]?.total || 0),
        },
      },
  */
}