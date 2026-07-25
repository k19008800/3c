// ============================================================
//  3cloud (3C) — 自定义报表
//  按时间范围、维度、指标灵活生成统计分析报表
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, gte, lte, sql, count, sum, avg } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { operationLogs, apiKeys, users } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getRedis } from "../../redis.js";

// 可用维度和指标的映射
const DIMENSION_QUERIES: Record<string, (from: Date, to: Date, groupBy: string) => any> = {
  by_user: (from, to) => sql`
    SELECT user_id, count(*)::int as total, 
           count(*) FILTER (WHERE status='success')::int as success,
           count(*) FILTER (WHERE status='failure')::int as failure
    FROM operation_logs
    WHERE created_at >= ${from.toISOString()} AND created_at < ${to.toISOString()} AND user_id IS NOT NULL
    GROUP BY user_id ORDER BY total DESC
  `,
  by_action: (from, to) => sql`
    SELECT action, count(*)::int as total,
           count(*) FILTER (WHERE status='success')::int as success,
           count(*) FILTER (WHERE status='failure')::int as failure,
           count(DISTINCT user_id)::int as unique_users
    FROM operation_logs
    WHERE created_at >= ${from.toISOString()} AND created_at < ${to.toISOString()}
    GROUP BY action ORDER BY total DESC
  `,
  by_date: (from, to) => sql`
    SELECT to_char(created_at, 'YYYY-MM-DD') as date,
           count(*)::int as total,
           count(*) FILTER (WHERE status='success')::int as success
    FROM operation_logs
    WHERE created_at >= ${from.toISOString()} AND created_at < ${to.toISOString()}
    GROUP BY to_char(created_at, 'YYYY-MM-DD') ORDER BY date
  `,
  by_hour: (from, to) => sql`
    SELECT EXTRACT(HOUR FROM created_at)::int as hour,
           count(*)::int as total
    FROM operation_logs
    WHERE created_at >= ${from.toISOString()} AND created_at < ${to.toISOString()}
    GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY hour
  `,
  by_api_key: (from, to) => sql`
    SELECT key_name, count(*)::int as total,
           count(DISTINCT user_id)::int as users
    FROM operation_logs
    WHERE created_at >= ${from.toISOString()} AND created_at < ${to.toISOString()} AND key_name IS NOT NULL
    GROUP BY key_name ORDER BY total DESC
  `,
  by_ip: (from, to) => sql`
    SELECT ip, count(*)::int as total,
           count(DISTINCT user_id)::int as users
    FROM operation_logs
    WHERE created_at >= ${from.toISOString()} AND created_at < ${to.toISOString()} AND ip IS NOT NULL
    GROUP BY ip ORDER BY total DESC
  `,
  by_status: (from, to) => sql`
    SELECT status, count(*)::int as total
    FROM operation_logs
    WHERE created_at >= ${from.toISOString()} AND created_at < ${to.toISOString()}
    GROUP BY status ORDER BY total DESC
  `,
};

// 预设报表模板
const REPORT_TEMPLATES: Record<string, { name: string; description: string; dimension: string; defaultDays: number }> = {
  daily_usage: { name: "日活统计", description: "按日统计活跃用户和操作量", dimension: "by_date", defaultDays: 30 },
  action_dist: { name: "操作分布", description: "各类操作的频次和成功率", dimension: "by_action", defaultDays: 30 },
  user_ranking: { name: "用户活跃排行", description: "最活跃用户 Top N", dimension: "by_user", defaultDays: 7 },
  hourly: { name: "时段分布", description: "24小时操作分布", dimension: "by_hour", defaultDays: 7 },
  key_usage: { name: "Key 使用统计", description: "各 API Key 的使用量统计", dimension: "by_api_key", defaultDays: 30 },
  ip_dist: { name: "IP 分布", description: "来源 IP 统计", dimension: "by_ip", defaultDays: 7 },
  error_analysis: { name: "错误分析", description: "按状态码分析请求结果", dimension: "by_status", defaultDays: 7 },
};

export async function adminCustomReportsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  获取报表模板列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/custom-reports/templates", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const templates = Object.entries(REPORT_TEMPLATES).map(([key, tmpl]) => ({
      key,
      ...tmpl,
    }));

    reply.status(200).send({
      code: 0,
      data: { list: templates },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  获取可用维度列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/custom-reports/dimensions", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const dimensions = Object.keys(DIMENSION_QUERIES).map(key => ({
      key,
      label: {
        by_user: "按用户",
        by_action: "按操作类型",
        by_date: "按日期",
        by_hour: "按小时",
        by_api_key: "按 API Key",
        by_ip: "按 IP",
        by_status: "按状态",
      }[key] || key,
    }));

    reply.status(200).send({
      code: 0,
      data: { list: dimensions },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  执行自定义报表查询
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/custom-reports/query", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const { dimension, days, limit: queryLimit } = request.body as {
      dimension: string;
      days?: number;
      limit?: number;
    };

    if (!dimension || !DIMENSION_QUERIES[dimension]) {
      return reply.status(400).send({ code: 400, message: `不支持的维度: ${dimension}` });
    }

    const db = getDb();
    const numDays = Math.min(Math.max(days || 30, 1), 365);
    const to = new Date();
    const from = new Date(to.getTime() - numDays * 24 * 60 * 60 * 1000);

    const result = await db.execute(DIMENSION_QUERIES[dimension](from, to));

    const rows = (result.rows || []).slice(0, queryLimit || 1000);

    // 计算汇总
    const total = rows.reduce((s: number, r: any) => s + (parseInt(r.total) || 0), 0);

    reply.status(200).send({
      code: 0,
      data: {
        dimension,
        days: numDays,
        from: from.toISOString(),
        to: to.toISOString(),
        total,
        rows,
      },
      message: "ok",
    });
  });
}
