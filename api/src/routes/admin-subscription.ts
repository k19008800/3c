import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { subscriptionPlans } from "../db/schema/subscriptions";

/**
 * 订阅计划管理端
 */

function requireAdmin(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      const role = (decoded as any).role;
      if (role !== "admin" && role !== "super_admin") {
        return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "需要管理员权限" });
      }
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

export function adminSubscriptionRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // 订阅计划列表
  app.get("/admin/subscriptions/plans", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 50);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.status) where += ` AND p.status = ${pp(q.status)}`;
    if (q.billingCycle) where += ` AND p.billing_cycle = ${pp(q.billingCycle)}`;
    const rows = await pool.query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM subscription_users su WHERE su.plan_id=p.id AND su.status='active')::int AS subscriber_count
       FROM subscription_plans p ${where}
       ORDER BY p.sort_order, p.created_at DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`, params);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM subscription_plans p ${where}`, params.slice(0, params.length - 2));
    const mapped = rows.rows.map((r: any) => ({ ...r, price: Number(r.price) }));
    return { code: 0, data: { list: mapped, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) } }, message: "ok" };
  });

  // 创建订阅计划
  app.post("/admin/subscriptions/plans", { onRequest: [admin] }, async (req, reply) => {
    const b = req.body as any;
    if (!b.name) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "缺少 name" });
    const r = await db.insert(subscriptionPlans).values({
      name: b.name,
      description: b.description ?? null,
      price: String(b.price ?? 0),
      billingCycle: b.billingCycle ?? "monthly",
      modelLimit: b.modelLimit ?? null,
      requestLimit: b.requestLimit ?? null,
      features: b.features ?? {},
      status: b.status ?? "active",
      sortOrder: b.sortOrder ?? 0,
    }).returning();
    return { code: 0, data: { ...r[0], price: Number(r[0].price) }, message: "已创建" };
  });

  // 更新订阅计划
  app.put("/admin/subscriptions/plans/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as any;
    const existing = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
    if (!existing[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const upd: Record<string, any> = { updatedAt: new Date() };
    if (b.name !== undefined) upd.name = b.name;
    if (b.description !== undefined) upd.description = b.description;
    if (b.price !== undefined) upd.price = String(b.price);
    if (b.billingCycle !== undefined) upd.billingCycle = b.billingCycle;
    if (b.modelLimit !== undefined) upd.modelLimit = b.modelLimit;
    if (b.requestLimit !== undefined) upd.requestLimit = b.requestLimit;
    if (b.features !== undefined) upd.features = b.features;
    if (b.status !== undefined) upd.status = b.status;
    if (b.sortOrder !== undefined) upd.sortOrder = b.sortOrder;
    const r = await db.update(subscriptionPlans).set(upd).where(eq(subscriptionPlans.id, id)).returning();
    return { code: 0, data: { ...r[0], price: Number(r[0].price) }, message: "已更新" };
  });
}
