import type { FastifyInstance } from "fastify";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { db } from "../db/index";
import {
  monitoringRules,
  monitoringAlerts,
  type MonitoringRule,
} from "../db/schema/monitoring";

/**
 * 告警管理路由（§5.4 管理端）
 * 覆盖 ref-5.4-alert-rules.md §2.1-2.3：
 * - 告警规则 CRUD
 * - 告警事件列表/确认/解决/批量
 * - 告警命中趋势统计
 */

export function monitoringRoutes(app: FastifyInstance) {
  // ===== 告警规则 CRUD =====

  // 获取全部规则
  app.get(
    "/monitoring/rules",
    {
      schema: { tags: ["admin-monitoring"] },
    },
    async () => {
      const rules = await db.select().from(monitoringRules).orderBy(monitoringRules.type);
      return { list: rules };
    },
  );

  // 新增规则（扩展 type 用）
  app.post(
    "/monitoring/rules",
    {
      schema: {
        tags: ["admin-monitoring"],
        body: {
          type: "object",
          required: ["type", "name", "threshold", "severity"],
          properties: {
            type: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            threshold: { type: "number" },
            severity: { type: "string", enum: ["critical", "warning", "info"] },
            enabled: { type: "boolean" },
            duration: { type: "integer" },
            silencePeriod: { type: "integer" },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as Partial<MonitoringRule> & { type: string; name: string; threshold: number; severity: string };
      const created = await db
        .insert(monitoringRules)
        .values({
          type: body.type,
          name: body.name,
          description: body.description,
          threshold: body.threshold,
          severity: body.severity as any,
          enabled: body.enabled ?? true,
          duration: body.duration ?? 60,
          silencePeriod: body.silencePeriod ?? 300,
        })
        .returning();
      return reply.code(201).send(created[0]);
    },
  );

  // 更新单条规则
  app.put(
    "/monitoring/rules/:id",
    {
      schema: {
        tags: ["admin-monitoring"],
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            threshold: { type: "number" },
            severity: { type: "string" },
            enabled: { type: "boolean" },
            duration: { type: "integer" },
            silencePeriod: { type: "integer" },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as Partial<MonitoringRule>;
      const updated = await db.update(monitoringRules).set(body).where(eq(monitoringRules.id, id as any)).returning();
      if (!updated[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "规则不存在" });
      return updated[0];
    },
  );

  // 删除规则
  app.delete(
    "/monitoring/rules/:id",
    {
      schema: { tags: ["admin-monitoring"], params: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const deleted = await db.delete(monitoringRules).where(eq(monitoringRules.id, id as any)).returning();
      if (!deleted[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "规则不存在" });
      return { ok: true };
    },
  );

  // ===== 告警事件 =====

  // 事件列表（支持筛选）
  app.get(
    "/monitoring/alerts",
    {
      schema: {
        tags: ["admin-monitoring"],
        querystring: {
          type: "object",
          properties: {
            type: { type: "string" },
            severity: { type: "string" },
            acknowledged: { type: "string" },
            resolved: { type: "string" },
            range: { type: "string" }, // 7d / 30d
            page: { type: "integer" },
            pageSize: { type: "integer" },
          },
        },
      },
    },
    async (req) => {
      const q = req.query as { type?: string; severity?: string; acknowledged?: string; resolved?: string; range?: string; page?: number; pageSize?: number };
      const page = q.page ?? 1;
      const pageSize = q.pageSize ?? 20;

      const conds: any[] = [];
      if (q.type) conds.push(eq(monitoringAlerts.type, q.type));
      if (q.severity) conds.push(eq(monitoringAlerts.severity, q.severity));
      if (q.acknowledged) conds.push(eq(monitoringAlerts.acknowledged, q.acknowledged === "true"));
      if (q.resolved) conds.push(eq(monitoringAlerts.resolved, q.resolved === "true"));
      if (q.range) {
        const daysAgo = new Date(Date.now() - (q.range === "30d" ? 30 : 7) * 24 * 3600 * 1000);
        conds.push(gte(monitoringAlerts.timestamp, daysAgo));
      }

      const where = conds.length ? and(...conds) : undefined;
      const items = await db.select().from(monitoringAlerts).where(where).orderBy(desc(monitoringAlerts.timestamp)).limit(pageSize).offset((page - 1) * pageSize);
      const totalRows = await db.select({ count: monitoringAlerts.id }).from(monitoringAlerts).where(where);
      return { list: items, total: totalRows.length, page, pageSize };
    },
  );

  // 确认单条
  app.post(
    "/monitoring/alerts/:id/acknowledge",
    {
      schema: { tags: ["admin-monitoring"], params: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const r = await db.update(monitoringAlerts).set({ acknowledged: true, acknowledgedAt: new Date() }).where(eq(monitoringAlerts.id, id as any)).returning();
      if (!r[0]) return reply.code(404).send({ error: "NOT_FOUND" });
      return { ok: true };
    },
  );

  // 解决单条
  app.post(
    "/monitoring/alerts/:id/resolve",
    {
      schema: { tags: ["admin-monitoring"], params: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const r = await db.update(monitoringAlerts).set({ resolved: true, resolvedAt: new Date() }).where(eq(monitoringAlerts.id, id as any)).returning();
      if (!r[0]) return reply.code(404).send({ error: "NOT_FOUND" });
      return { ok: true };
    },
  );

  // 批量确认
  app.post(
    "/monitoring/alerts/batch-acknowledge",
    {
      schema: { tags: ["admin-monitoring"], body: { type: "object", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } } } } },
    },
    async (req, reply) => {
      const { ids } = req.body as { ids: string[] };
      if (!ids.length) return reply.code(400).send({ error: "BAD_REQUEST", message: "ids 不能为空" });
      const r = await db.update(monitoringAlerts).set({ acknowledged: true, acknowledgedAt: new Date() }).where(sqlIn(ids));
      return { affected: r.rowCount ?? 0 };
    },
  );

  // 批量解决
  app.post(
    "/monitoring/alerts/batch-resolve",
    {
      schema: { tags: ["admin-monitoring"], body: { type: "object", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } } } } },
    },
    async (req) => {
      const { ids } = req.body as { ids: string[] };
      const r = await db.update(monitoringAlerts).set({ resolved: true, resolvedAt: new Date() }).where(sqlIn(ids));
      return { affected: r.rowCount ?? 0 };
    },
  );

  // 告警命中趋势（近 7 天）
  app.get(
    "/monitoring/alert-stats",
    {
      schema: { tags: ["admin-monitoring"], querystring: { type: "object", properties: { range: { type: "string", enum: ["7d", "30d"] } } } },
    },
    async (req) => {
      const { range = "7d" } = req.query as { range?: string };
      const days = range === "30d" ? 30 : 7;
      const since = new Date(Date.now() - days * 24 * 3600 * 1000);

      // 按天分组统计（SQL 聚合）
      const rows = await db
        .select({
          day: sql<string>`to_char(${monitoringAlerts.timestamp}, 'YYYY-MM-DD')`,
          type: monitoringAlerts.type,
          count: sql<number>`count(*)`,
        })
        .from(monitoringAlerts)
        .where(gte(monitoringAlerts.timestamp, since))
        .groupBy(sql`to_char(${monitoringAlerts.timestamp}, 'YYYY-MM-DD')`, monitoringAlerts.type)
        .orderBy(sql`to_char(${monitoringAlerts.timestamp}, 'YYYY-MM-DD')`);

      return { range, list: rows };
    },
  );
}

/** 辅助：uuid 数组 IN 条件 */
function sqlIn(ids: string[]) {
  return sql`${monitoringAlerts.id} IN (${sql.join(ids.map((x) => sql`${x as any}`), sql`, `)})`;
}
