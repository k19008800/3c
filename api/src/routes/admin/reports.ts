// ============================================================
//  3cloud (3C) — 自定义报表
//  预置报表模板 + 自定义查询条件 + 数据导出
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, gte, sql, like, lt, between, asc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { operationLogs, auditLogs, users, apiKeys, balanceLogs, orders } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getRedis } from "../../redis.js";
import { z } from "zod";

// ── 报表分类 ──

const REPORT_TEMPLATES = [
  {
    id: "daily_usage",
    name: "每日用量汇总",
    category: "usage",
    description: "按天统计 API 调用量、Token 消耗、用户数",
    defaultMetrics: ["date", "api_calls", "tokens", "active_users", "revenue"],
    table: "operation_logs",
    groupBy: "daily",
  },
  {
    id: "user_topup",
    name: "用户充值统计",
    category: "finance",
    description: "充值金额、充值次数、充值方式分布",
    defaultMetrics: ["date", "total_amount", "count", "avg_amount", "payment_method"],
    table: "balance_logs",
    groupBy: "daily",
  },
  {
    id: "api_error",
    name: "API 错误分析",
    category: "monitor",
    description: "错误类型分布、错误趋势、受影响用户",
    defaultMetrics: ["date", "error_type", "count", "affected_users", "error_rate"],
    table: "operation_logs",
    groupBy: "daily",
  },
  {
    id: "new_users",
    name: "新用户注册趋势",
    category: "user",
    description: "每日新注册用户数、认证方式、来源分布",
    defaultMetrics: ["date", "new_users", "verified_count", "source"],
    table: "users",
    groupBy: "daily",
  },
  {
    id: "security_events",
    name: "安全事件报表",
    category: "security",
    description: "安全事件类型分布、风险等级、趋势",
    defaultMetrics: ["date", "event_type", "risk_level", "count", "unique_ips"],
    table: "security_events",
    groupBy: "daily",
  },
  {
    id: "agent_performance",
    name: "代理商业绩报表",
    category: "agent",
    description: "代理商佣金、订单数、充值金额",
    defaultMetrics: ["date", "commission", "orders", "recharge", "active_agents"],
    table: "orders",
    groupBy: "daily",
  },
];

const REDIS_SAVED_KEY = "report:saved";

interface SavedReport {
  id: string;
  name: string;
  templateId: string;
  dateRange: string;
  filters: Record<string, any>;
  metrics: string[];
  createdAt: string;
  createdBy: number;
}

export async function adminReportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  获取报表模板列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/reports/templates", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    reply.status(200).send({
      code: 0,
      data: { list: REPORT_TEMPLATES },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  执行报表查询（基于模板 + 参数）
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/reports/query", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const body = request.body as any;
    const schema = z.object({
      templateId: z.string(),
      dateRange: z.string().optional().default("7d"),
      metrics: z.array(z.string()).optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ code: 400, message: parsed.error.errors.map(e => e.message).join("; ") });
    }

    const { templateId, dateRange, metrics } = parsed.data;
    const template = REPORT_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      return reply.status(404).send({ code: 404, message: "报表模板不存在" });
    }

    // 计算日期范围
    let days = 7;
    if (dateRange === "30d") days = 30;
    else if (dateRange === "90d") days = 90;
    else if (dateRange === "1y") days = 365;

    const db = getDb();
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let data: any[] = [];

    // 按模板执行查询
    if (templateId === "daily_usage") {
      data = await db
        .select({
          date: sql<string>`to_char(created_at, 'YYYY-MM-DD')`,
          api_calls: sql<number>`count(*)::int`,
          success_count: sql<number>`count(*) FILTER (WHERE status = 'success')::int`,
          fail_count: sql<number>`count(*) FILTER (WHERE status = 'failure')::int`,
          active_users: sql<number>`count(DISTINCT user_id)::int`,
        })
        .from(operationLogs)
        .where(gte(operationLogs.createdAt, startDate))
        .groupBy(sql`to_char(created_at, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(created_at, 'YYYY-MM-DD')`);
    } else if (templateId === "api_error") {
      data = await db
        .select({
          date: sql<string>`to_char(created_at, 'YYYY-MM-DD')`,
          error_type: operationLogs.action,
          count: sql<number>`count(*)::int`,
          affected_users: sql<number>`count(DISTINCT user_id)::int`,
        })
        .from(operationLogs)
        .where(and(gte(operationLogs.createdAt, startDate), eq(operationLogs.status, "failure")))
        .groupBy(sql`to_char(created_at, 'YYYY-MM-DD')`, operationLogs.action)
        .orderBy(desc(sql`count(*)`))
        .limit(100);
    } else if (templateId === "new_users") {
      data = await db
        .select({
          date: sql<string>`to_char(created_at, 'YYYY-MM-DD')`,
          new_users: sql<number>`count(*)::int`,
          verified_count: sql<number>`count(*) FILTER (WHERE status = 'active')::int`,
        })
        .from(users)
        .where(gte(users.createdAt, startDate))
        .groupBy(sql`to_char(created_at, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(created_at, 'YYYY-MM-DD')`);
    } else {
      // 通用 fallback：直接从 operation_logs 返回每日统计
      data = await db
        .select({
          date: sql<string>`to_char(created_at, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
          unique_users: sql<number>`count(DISTINCT user_id)::int`,
        })
        .from(operationLogs)
        .where(gte(operationLogs.createdAt, startDate))
        .groupBy(sql`to_char(created_at, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(created_at, 'YYYY-MM-DD')`);
    }

    // 汇总
    const summary = data.length > 0 ? {
      totalRows: data.length,
      totalCount: data.reduce((s: number, r: any) => s + (r.count || r.api_calls || r.new_users || 0), 0),
      dateFrom: data[0]?.date,
      dateTo: data[data.length - 1]?.date,
    } : null;

    reply.status(200).send({
      code: 0,
      data: {
        template: { id: templateId, name: template.name },
        dateRange,
        metrics: metrics || template.defaultMetrics,
        rows: data,
        summary,
        generatedAt: new Date().toISOString(),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  保存/加载自定义报表配置
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/reports/saved
  app.get("/api/v1/admin/reports/saved", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const redis = getRedis();
    let reports: SavedReport[] = [];

    try {
      const raw = await redis.get(REDIS_SAVED_KEY);
      if (raw) reports = JSON.parse(raw);
    } catch { /* 默认空 */ }

    reply.status(200).send({ code: 0, data: { list: reports }, message: "ok" });
  });

  // POST /api/v1/admin/reports/saved
  app.post("/api/v1/admin/reports/saved", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const body = request.body as any;
    const schema = z.object({
      name: z.string().min(1).max(100),
      templateId: z.string(),
      dateRange: z.string(),
      metrics: z.array(z.string()),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ code: 400, message: parsed.error.errors.map(e => e.message).join("; ") });
    }

    const redis = getRedis();
    let reports: SavedReport[] = [];

    try {
      const raw = await redis.get(REDIS_SAVED_KEY);
      if (raw) reports = JSON.parse(raw);
    } catch { /* 默认空 */ }

    const saved: SavedReport = {
      id: `rpt_${Date.now()}`,
      ...parsed.data,
      filters: {},
      createdAt: new Date().toISOString(),
      createdBy: request.user!.userId,
    };

    reports.unshift(saved);
    await redis.set(REDIS_SAVED_KEY, JSON.stringify(reports));

    reply.status(200).send({ code: 0, data: saved, message: "报表已保存" });
  });

  // DELETE /api/v1/admin/reports/saved/:id
  app.delete("/api/v1/admin/reports/saved/:id", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const redis = getRedis();
    let reports: SavedReport[] = [];

    try {
      const raw = await redis.get(REDIS_SAVED_KEY);
      if (raw) reports = JSON.parse(raw);
    } catch { /* 默认空 */ }

    reports = reports.filter(r => r.id !== id);
    await redis.set(REDIS_SAVED_KEY, JSON.stringify(reports));

    reply.status(200).send({ code: 0, message: "报表已删除" });
  });
}
