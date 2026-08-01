import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, pool } from "../db/index";
import { vendorSettlements, SETTLEMENT_STATUS } from "../db/schema/vendor-settlements";

/**
 * 供应商结算管理
 * 对齐 ref-4.15-vendor-settlement.md（精简核心）：结算单生成/确认/打款/争议
 * 结算单基于 billing_logs 按供应商聚合生成
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
    } catch (e: any) {
      if (e?.statusCode === 403) return;
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

/** 生成某供应商某周期的结算单 */
export async function generateSettlement(vendorId: number, period: string, commissionRate: number): Promise<{ created: boolean; id?: number; message: string }> {  // 查重
  const exist = await db.select().from(vendorSettlements).where(and(eq(vendorSettlements.vendorId, vendorId), eq(vendorSettlements.period, period))).limit(1);
  if (exist[0]) return { created: false, id: exist[0].id, message: "s已存在" };

  // 周期范围
  const [y, m] = period.split("-").map(Number) as [number, number];
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);

  // 从 call_logs 聚合该供应商（成本计费），从 billing_logs 聚合用户消费（收入）
  const calls = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status='success')::int AS success,
            COUNT(*) FILTER (WHERE status='failed')::int AS failed,
            COALESCE(SUM(total_tokens),0)::bigint AS tokens
     FROM call_logs WHERE vendor_id=$1 AND created_at >= $2 AND created_at < $3`,
    [vendorId, start, end],
  );
  const costRow = await pool.query(
    `SELECT COALESCE(SUM(cost),0)::float AS cost FROM call_logs WHERE vendor_id=$1 AND created_at >= $2 AND created_at < $3`,
    [vendorId, start, end],
  );
  // 用户消费收入（该供应商的调用计费）
  const revenue = await pool.query(
    `SELECT COALESCE(SUM(bl.actual_cost),0)::float AS rev
     FROM billing_logs bl JOIN call_logs cl ON cl.id = bl.call_log_id
     WHERE cl.vendor_id=$1 AND bl.created_at >= $2 AND bl.created_at < $3`,
    [vendorId, start, end],
  );

  const totalCalls = calls.rows[0]?.total ?? 0;
  if (totalCalls === 0) return { created: false, message: "该周期无调用记录，跳过生成" };

  const totalCost = Number(costRow.rows[0]?.cost ?? 0);
  const userRevenue = Number(revenue.rows[0]?.rev ?? 0);
  const rate = commissionRate;
  const commissionAmount = Math.round(userRevenue * rate * 100) / 100;
  const settlementAmount = Math.round((userRevenue - commissionAmount) * 100) / 100;

  const created = await db.insert(vendorSettlements).values({
    vendorId, period,
    totalCalls, successCalls: calls.rows[0]?.success ?? 0, failedCalls: calls.rows[0]?.failed ?? 0,
    totalTokens: calls.rows[0]?.tokens ?? 0,
    totalCost: String(totalCost), userRevenue: String(userRevenue),
    commissionRate: String(rate), commissionAmount: String(commissionAmount),
    settlementAmount: String(settlementAmount),
    status: "generated", generatedAt: new Date(),
  }).returning({ id: vendorSettlements.id });

  return { created: true, id: created[0]!.id, message: "结算单已生成" };
}

export function adminVendorSettlementRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // 1. 结算单列表
  app.get("/admin/vendor-settlements", { onRequest: [admin] }, async (req) => {
    const q = req.query as { status?: string; vendor_id?: string; page?: number; page_size?: number };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.status) where += ` AND vs.status = ${pp(q.status)}`;
    if (q.vendor_id) where += ` AND vs.vendor_id = ${pp(Number(q.vendor_id))}`;
    const rows = await pool.query(
      `SELECT vs.*, v.name AS vendor_name
       FROM vendor_settlements vs JOIN vendors v ON v.id = vs.vendor_id ${where}
       ORDER BY vs.period DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`,
      params,
    );
    const total = await pool.query(`SELECT COUNT(*)::int AS total FROM vendor_settlements vs ${where}`, params.slice(0, params.length - 2));
    return {
      code: 0,
      data: {
        list: rows.rows.map(r => ({ ...r, status_label: SETTLEMENT_STATUS[r.status] ?? r.status, settlement_amount: Number(r.settlement_amount), total_cost: Number(r.total_cost), user_revenue: Number(r.user_revenue) })),
        pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) },
      },
      message: "ok",
    };
  });

  // 2. 生成结算单（指定供应商 + 周期）
  app.post("/admin/vendor-settlements/generate", { onRequest: [admin] }, async (req, reply) => {
    const b = req.body as { vendor_id?: number; period?: string; commission_rate?: number };
    if (!b.vendor_id || !b.period) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "供应商和周期必填" });
    const r = await generateSettlement(b.vendor_id, b.period, b.commission_rate ?? 0.1);
    if (!r.created) return reply.code(409).send({ code: 409, error: "EXISTS", message: r.message });
    return { code: 0, data: { id: r.id }, message: r.message };
  });

  // 3. 结算单详情 + 模型明细
  app.get("/admin/vendor-settlements/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const rows = await pool.query(
      `SELECT vs.*, v.name AS vendor_name FROM vendor_settlements vs JOIN vendors v ON v.id=vs.vendor_id WHERE vs.id=$1`, [id]);
    if (!rows.rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const rec = rows.rows[0];
    // 周期范围（start = period-01, end = 下月 1 日）
    const [py, pm] = rec.period.split("-").map(Number) as [number, number];
    const pEnd = new Date(py, pm, 1).toISOString();
    const pStart = `${rec.period}-01 00:00:00`;
    // 按模型聚合该周期调用/成本/收入
    const modelItems = await pool.query(
      `SELECT COALESCE(m.name, cl.upstream_model, 'unknown') AS model,
              COUNT(*)::int AS calls,
              COUNT(*) FILTER (WHERE cl.status='success')::int AS success,
              COUNT(*) FILTER (WHERE cl.status='failed')::int AS failed,
              COALESCE(SUM(cl.total_tokens),0)::bigint AS tokens,
              COALESCE(SUM(cl.cost),0)::float AS cost,
              COALESCE(SUM(bl.actual_cost),0)::float AS revenue
       FROM call_logs cl
       LEFT JOIN models m ON m.id = cl.model_id
       LEFT JOIN billing_logs bl ON bl.call_log_id = cl.id
       WHERE cl.vendor_id=$1 AND cl.created_at >= $2 AND cl.created_at < $3
       GROUP BY COALESCE(m.name, cl.upstream_model, 'unknown')
       ORDER BY cost DESC`,
      [rec.vendor_id, pStart, pEnd],
    );
    return { code: 0, data: { ...rec, model_items: modelItems.rows, status_label: SETTLEMENT_STATUS[rec.status] ?? rec.status, settlement_amount: Number(rec.settlement_amount), total_cost: Number(rec.total_cost), user_revenue: Number(rec.user_revenue) }, message: "ok" };
  });

  // 4. 确认结算单
  app.post("/admin/vendor-settlements/:id/confirm", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const userId = Number((req as any).user.sub);
    const rec = await db.select().from(vendorSettlements).where(eq(vendorSettlements.id, id)).limit(1);
    if (!rec[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (!["generated", "disputed"].includes(rec[0].status)) return reply.code(400).send({ code: 400, error: "BAD_STATE", message: "当前状态不可确认" });
    await db.update(vendorSettlements).set({ status: "confirmed", confirmedAt: new Date(), confirmedBy: userId, disputeReason: null, updatedAt: new Date() }).where(eq(vendorSettlements.id, id));
    return { code: 0, data: { status: "confirmed", status_label: SETTLEMENT_STATUS.confirmed }, message: "结算单已确认" };
  });

  // 5. 标记争议
  app.post("/admin/vendor-settlements/:id/dispute", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { reason } = req.body as { reason?: string };
    const rec = await db.select().from(vendorSettlements).where(eq(vendorSettlements.id, id)).limit(1);
    if (!rec[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (rec[0].status !== "generated") return reply.code(400).send({ code: 400, error: "BAD_STATE", message: "仅已生成可标记争议" });
    await db.update(vendorSettlements).set({ status: "disputed", disputeReason: reason ?? "供应商提出争议", updatedAt: new Date() }).where(eq(vendorSettlements.id, id));
    return { code: 0, data: { status: "disputed", status_label: SETTLEMENT_STATUS.disputed }, message: "已标记争议" };
  });

  // 6. 标记已打款
  app.post("/admin/vendor-settlements/:id/paid", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const userId = Number((req as any).user.sub);
    const { payment_reference } = req.body as { payment_reference?: string };
    const rec = await db.select().from(vendorSettlements).where(eq(vendorSettlements.id, id)).limit(1);
    if (!rec[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (rec[0].status !== "confirmed") return reply.code(400).send({ code: 400, error: "BAD_STATE", message: "仅已确认可打款" });
    await db.update(vendorSettlements).set({ status: "paid", paidAt: new Date(), paidBy: userId, paymentReference: payment_reference ?? null, updatedAt: new Date() }).where(eq(vendorSettlements.id, id));
    return { code: 0, data: { status: "paid", status_label: SETTLEMENT_STATUS.paid }, message: "已标记打款" };
  });
}
