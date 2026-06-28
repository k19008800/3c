// ============================================================
//  3cloud (3C) — 厂商管理路由（管理员）
//  POST   /api/v1/admin/vendors           — 创建厂商
//  GET    /api/v1/admin/vendors           — 列表
//  GET    /api/v1/admin/vendors/:id       — 详情
//  PATCH  /api/v1/admin/vendors/:id       — 更新
//  DELETE /api/v1/admin/vendors/:id       — 删除
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, asc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { vendors, vendorModels } from "../../db/schema.js";
import { authenticateJWT, requireRole } from "../../middleware/auth.js";

export async function adminVendorRoutes(app: FastifyInstance) {
  // 所有路由需要 admin/super_admin 权限
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requireRole("super_admin", "admin"));

  // ── 创建厂商 ──
  app.post("/api/v1/admin/vendors", async (request, reply) => {
    const db = getDb();
    const { name, baseUrl, description } = request.body as {
      name: string;
      baseUrl: string;
      description?: string;
    };

    if (!name || !baseUrl) {
      reply.status(400).send({ code: 400, data: null, message: "name 和 baseUrl 必填" });
      return;
    }

    try {
      const [vendor] = await db
        .insert(vendors)
        .values({ name, baseUrl, description })
        .returning();
      reply.status(200).send({ code: 0, data: vendor, message: "ok" });
    } catch (err: any) {
      if (err?.code === "23505") {
        reply.status(409).send({ code: 409, data: null, message: "厂商名称已存在" });
        return;
      }
      throw err;
    }
  });

  // ── 列表 ──
  app.get("/api/v1/admin/vendors", async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const keyword = query.keyword?.trim();
    const statusFilter = query.status?.trim();
    const offset = (page - 1) * pageSize;

    // Build conditions
    const conditions = [];
    if (keyword) {
      conditions.push(sql`${vendors.name} ILIKE ${`%${keyword}%`}`);
    }
    if (statusFilter) {
      conditions.push(eq(vendors.status, statusFilter as any));
    }

    const whereClause = conditions.length > 0 ? sql`${conditions.reduce((a, b) => sql`${a} AND ${b}`)}` : undefined;

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(vendors)
      .where(whereClause);
    const total = Number(totalResult?.count ?? 0);

    const rows = await db
      .select()
      .from(vendors)
      .where(whereClause)
      .orderBy(asc(vendors.id))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: { list: rows, total, page, pageSize },
      message: "ok",
    });
  });

  // ── 详情（含熔断状态） ──
  app.get("/api/v1/admin/vendors/:id", async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id);
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "厂商不存在" });
      return;
    }

    // 加载熔断状态
    let circuitInfo: any = null;
    try {
      const { getAllCircuitStatuses } = await import("../../services/circuit-breaker.js");
      const allCircuits = await getAllCircuitStatuses();
      // 查找属于这个厂商的熔断记录
      const vendorCircuits = allCircuits.filter((c) => c.vendorId === id);
      if (vendorCircuits.length > 0) {
        circuitInfo = vendorCircuits;
      }
    } catch {}

    reply.status(200).send({
      code: 0,
      data: {
        ...vendor,
        circuit: circuitInfo,
      },
      message: "ok",
    });
  });

  // ── 更新 ──
  app.patch("/api/v1/admin/vendors/:id", async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id);
    const body = request.body as Record<string, any>;

    const allowedFields = ["baseUrl", "description", "status"] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    const [vendor] = await db
      .update(vendors)
      .set(updates)
      .where(eq(vendors.id, id))
      .returning();
    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "厂商不存在" });
      return;
    }
    reply.status(200).send({ code: 0, data: vendor, message: "ok" });
  });

  // ── 删除 ──
  app.delete("/api/v1/admin/vendors/:id", async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id);

    // 检查是否有关联的 vendor_models
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(vendorModels)
      .where(eq(vendorModels.vendorId, id));

    if (Number(countResult?.count || 0) > 0) {
      reply.status(400).send({
        code: 400,
        data: null,
        message: "该厂商下有关联的模型配置，请先删除关联",
      });
      return;
    }

    const [vendor] = await db
      .delete(vendors)
      .where(eq(vendors.id, id))
      .returning({ id: vendors.id });
    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "厂商不存在" });
      return;
    }
    reply.status(200).send({ code: 0, data: null, message: "ok" });
  });
}
