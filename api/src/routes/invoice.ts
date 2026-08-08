import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { invoices } from "../db/schema/invoices";
import { generateInvoicePdf } from "../services/invoice-pdf";

/**
 * 发票模块
 * 对齐 ref-9.6-tax-invoice.md + ref-2.2.8-redemption-invoices.md
 * 用户端：申请发票 / 我的发票
 * 管理端：列表 / 开票 / 驳回 / 税票统计看板
 */

const STATUS_LABEL: Record<string, string> = {
  pending: "待开票",
  issued: "已开票",
  voided: "已作废",
  rejected: "已驳回",
};
const TYPE_LABEL: Record<string, string> = { special: "专票", ordinary: "普票" };

function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };
}
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

/** 计算该用户累计已消费（billing_logs actual_cost 合计） */
async function userConsumed(userId: number): Promise<number> {
  const r = await pool.query("SELECT COALESCE(SUM(actual_cost),0)::float AS total FROM billing_logs WHERE user_id=$1", [userId]);
  return Number(r.rows[0]?.total ?? 0);
}
/** 该用户已开票/待开票已申请的金额 */
async function userApplied(userId: number): Promise<number> {
  const r = await pool.query("SELECT COALESCE(SUM(total_amount),0)::float AS total FROM invoices WHERE user_id=$1 AND status IN ('pending','issued')", [userId]);
  return Number(r.rows[0]?.total ?? 0);
}

export function invoiceRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);
  const admin = requireAdmin(app);

  // ============================================================
  // 用户端
  // ============================================================

  // 1. 可开票额度
  app.get("/me/invoices/quota", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const consumed = await userConsumed(userId);
    const applied = await userApplied(userId);
    return { code: 0, data: { consumed, applied, available: Math.max(0, consumed - applied) }, message: "ok" };
  });

  // 2. 发票列表（用户端主路由 /invoices）
  app.get("/invoices", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const rows = await pool.query(
      "SELECT * FROM invoices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [userId],
    );
    return { code: 0, data: { list: rows.rows.map(fmt) }, message: "ok" };
  });

  // 2b. 我的发票列表（/me 路径保留兼容）
  app.get("/me/invoices", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const rows = await pool.query(
      "SELECT * FROM invoices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [userId],
    );
    return { code: 0, data: { list: rows.rows.map(fmt) }, message: "ok" };
  });

  // 3. 申请发票（用户端主路由 /invoices）
  app.post("/invoices", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const b = req.body as { amount: number; type?: string; title?: string; tax_no?: string; address?: string; bank_account?: string; email?: string; remark?: string };
    const amount = Math.round((Number(b.amount) || 0) * 100) / 100;
    if (amount <= 0) return reply.code(400).send({ code: 400, error: "INVALID_AMOUNT", message: "发票金额无效" });
    if (!b.title?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_TITLE", message: "请填写发票抬头" });
    const type = b.type === "special" ? "special" : "ordinary";
    if (type === "special" && !b.tax_no?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_TAXNO", message: "专票需填写税号" });

    const consumed = await userConsumed(userId);
    const applied = await userApplied(userId);
    const available = Math.max(0, consumed - applied);
    if (amount > available) return reply.code(400).send({ code: 400, error: "EXCEED_QUOTA", message: `可开票额度不足，当前可用 ¥${available.toFixed(2)}` });

    const taxRate = 13;
    const taxAmount = Math.round((amount * taxRate) / 100 * 100) / 100;
    const totalAmount = Math.round((amount + taxAmount) * 100) / 100;

    const created = await db
      .insert(invoices)
      .values({
        userId,
        amount: String(amount),
        taxRate: String(taxRate),
        taxAmount: String(taxAmount),
        totalAmount: String(totalAmount),
        type,
        status: "pending",
        title: b.title.trim(),
        taxNo: b.tax_no ?? null,
        address: b.address ?? null,
        bankAccount: b.bank_account ?? null,
        email: b.email ?? null,
        remark: b.remark ?? null,
      })
      .returning({ id: invoices.id });
    return { code: 0, data: { id: created[0]!.id, amount, totalAmount, status: "pending" }, message: "发票申请已提交" };
  });

  // 3b. 申请发票（/me 路径保留兼容）
  app.post("/me/invoices", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const b = req.body as { amount: number; type?: string; title?: string; tax_no?: string; address?: string; bank_account?: string; email?: string; remark?: string };
    const amount = Math.round((Number(b.amount) || 0) * 100) / 100;
    if (amount <= 0) return reply.code(400).send({ code: 400, error: "INVALID_AMOUNT", message: "发票金额无效" });
    if (!b.title?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_TITLE", message: "请填写发票抬头" });
    const type = b.type === "special" ? "special" : "ordinary";
    if (type === "special" && !b.tax_no?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_TAXNO", message: "专票需填写税号" });

    const consumed = await userConsumed(userId);
    const applied = await userApplied(userId);
    const available = Math.max(0, consumed - applied);
    if (amount > available) return reply.code(400).send({ code: 400, error: "EXCEED_QUOTA", message: `可开票额度不足，当前可用 ¥${available.toFixed(2)}` });

    const taxRate = 13;
    const taxAmount = Math.round((amount * taxRate) / 100 * 100) / 100;
    const totalAmount = Math.round((amount + taxAmount) * 100) / 100;

    const created = await db
      .insert(invoices)
      .values({
        userId,
        amount: String(amount),
        taxRate: String(taxRate),
        taxAmount: String(taxAmount),
        totalAmount: String(totalAmount),
        type,
        status: "pending",
        title: b.title.trim(),
        taxNo: b.tax_no ?? null,
        address: b.address ?? null,
        bankAccount: b.bank_account ?? null,
        email: b.email ?? null,
        remark: b.remark ?? null,
      })
      .returning({ id: invoices.id });
    return { code: 0, data: { id: created[0]!.id, amount, totalAmount, status: "pending" }, message: "发票申请已提交" };
  });

  // ============================================================
  // 管理端：开票管理
  // ============================================================

  // 4. 发票列表（管理端）
  app.get("/admin/invoices", { onRequest: [admin] }, async (req) => {
    const q = req.query as { page?: number; page_size?: number; status?: string; type?: string; keyword?: string };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;

    let where = "WHERE 1=1";
    const whereParams: any[] = [];
    const wp = (v: any) => { whereParams.push(v); return `$${whereParams.length}`; };
    if (q.status) where += ` AND i.status = ${wp(q.status)}`;
    if (q.type) where += ` AND i.type = ${wp(q.type)}`;
    if (q.keyword) where += ` AND (u.email ILIKE ${wp(`%${q.keyword}%`)} OR i.title ILIKE ${wp(`%${q.keyword}%`)})`;

    const pageParams = [...whereParams, pageSize, offset];
    const rows = await pool.query(
      `SELECT i.*, u.email, u.username
       FROM invoices i JOIN users u ON u.id = i.user_id ${where}
       ORDER BY i.created_at DESC LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
      pageParams,
    );
    const total = await pool.query(`SELECT COUNT(*)::int AS total FROM invoices i JOIN users u ON u.id = i.user_id ${where}`, whereParams);
    return { code: 0, data: { list: rows.rows.map(fmt), pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) } }, message: "ok" };
  });

  // 5. 开票
  app.post("/admin/invoices/:id/issue", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const issuedBy = Number((req as any).user.sub);
    const { invoice_no } = req.body as { invoice_no?: string };
    const r = await db
      .update(invoices)
      .set({ status: "issued", invoiceNo: invoice_no ?? `INV${Date.now()}`, issuedBy, issuedAt: new Date(), updatedAt: new Date() })
      .where(eq(invoices.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "已开票" };
  });

  // 6. 驳回
  app.post("/admin/invoices/:id/reject", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { reason } = req.body as { reason?: string };
    const r = await db
      .update(invoices)
      .set({ status: "rejected", rejectReason: reason ?? "信息有误", updatedAt: new Date() })
      .where(eq(invoices.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "已驳回" };
  });

  // ============================================================
  // 税票统计看板
  // ============================================================

  // 7. 汇总
  app.get("/admin/invoice-stats/summary", { onRequest: [admin] }, async (req) => {
    const q = req.query as { year?: string; month?: string };
    const now = new Date();
    const year = Number(q.year ?? now.getFullYear());
    const month = Number(q.month ?? now.getMonth() + 1);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;

    const r = await pool.query(
      `SELECT
         COUNT(*)::int AS total_count,
         COALESCE(SUM(CASE WHEN type='special' THEN total_amount END),0)::float AS special_amount,
         COALESCE(SUM(CASE WHEN type='ordinary' THEN total_amount END),0)::float AS ordinary_amount,
         COALESCE(SUM(total_amount),0)::float AS total_amount,
         COUNT(*) FILTER (WHERE type='special')::int AS special_count,
         COUNT(*) FILTER (WHERE type='ordinary')::int AS ordinary_count
       FROM invoices WHERE created_at >= $1 AND created_at < $1::date + interval '1 month'`,
      [start],
    );
    const row = r.rows[0];
    return {
      code: 0,
      data: {
        period: `${year}-${String(month).padStart(2, "0")}`,
        count: Number(row?.total_count ?? 0),
        amount: Number(row?.total_amount ?? 0),
        special_amount: Number(row?.special_amount ?? 0),
        ordinary_amount: Number(row?.ordinary_amount ?? 0),
        special_count: Number(row?.special_count ?? 0),
        ordinary_count: Number(row?.ordinary_count ?? 0),
      },
      message: "ok",
    };
  });

  // 8. 趋势（近 N 月）
  app.get("/admin/invoice-stats/trend", { onRequest: [admin] }, async (req) => {
    const months = Math.min(Number((req.query as any).months ?? 12), 24);
    const r = await pool.query(
      `SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS month,
              COUNT(*)::int AS count,
              COALESCE(SUM(total_amount),0)::float AS amount
       FROM invoices
       WHERE created_at >= date_trunc('month', now()) - ($1 || ' months')::interval
       GROUP BY date_trunc('month', created_at)
       ORDER BY month ASC`,
      [months],
    );
    return { code: 0, data: { list: r.rows }, message: "ok" };
  });

  // 9. 未开票预估（已消费但未申请发票的用户）
  app.get("/admin/invoice-stats/uninvoiced", { onRequest: [admin] }, async (_req) => {
    const r = await pool.query(
      `SELECT
         (SELECT COALESCE(SUM(actual_cost),0)::float FROM billing_logs) AS total_consumed,
         (SELECT COALESCE(SUM(total_amount),0)::float FROM invoices WHERE status IN ('pending','issued')) AS total_invoiced`,
    );
    const row = r.rows[0];
    const totalConsumed = Number(row?.total_consumed ?? 0);
    const totalInvoiced = Number(row?.total_invoiced ?? 0);
    return {
      code: 0,
      data: { uninvoiced_amount: Math.max(0, Math.round((totalConsumed - totalInvoiced) * 100) / 100), total_consumed: totalConsumed, total_invoiced: totalInvoiced },
      message: "ok",
    };
  });

  // 10. 未开票客户列表
  app.get("/admin/invoice-stats/uninvoiced/customers", { onRequest: [admin] }, async (_req) => {
    const r = await pool.query(
      `SELECT u.id, u.email, u.username,
              (SELECT COALESCE(SUM(bl.actual_cost),0)::float FROM billing_logs bl WHERE bl.user_id=u.id) AS consumed,
              (SELECT COALESCE(SUM(i.total_amount),0)::float FROM invoices i WHERE i.user_id=u.id AND i.status IN ('pending','issued')) AS invoiced
       FROM users u
       WHERE (SELECT COALESCE(SUM(bl.actual_cost),0) FROM billing_logs bl WHERE bl.user_id=u.id) > 0
       ORDER BY consumed DESC LIMIT 50`,
    );
    return {
      code: 0,
      data: { list: r.rows.map((x: any) => ({ ...x, uninvoiced: Math.max(0, Math.round((Number(x.consumed) - Number(x.invoiced)) * 100) / 100) })) },
      message: "ok",
    };
  });

  // ===== 下载发票 PDF（用户端 /invoices/:id/pdf + /me 兼容）=====
  app.get("/invoices/:id/pdf", { onRequest: [auth] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const rows = await pool.query("SELECT * FROM invoices WHERE id=$1 AND user_id=$2", [id, (req as any).user.sub]);
    const inv = rows.rows[0];
    if (!inv) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const u = await pool.query("SELECT email, username FROM users WHERE id=$1", [(req as any).user.sub]);
    const pdf = await generateInvoicePdf({
      invoiceNo: inv.invoice_no ?? `INV${inv.id}`, title: inv.title, taxNo: inv.tax_no, type: inv.type,
      amount: Number(inv.amount).toFixed(2), taxRate: Number(inv.tax_rate ?? 13).toFixed(2),
      taxAmount: inv.tax_amount ? Number(inv.tax_amount).toFixed(2) : "", totalAmount: Number(inv.total_amount ?? inv.amount).toFixed(2),
      email: inv.email, createdAt: new Date(inv.created_at).toLocaleString(), userName: u.rows[0]?.username ?? "",
    });
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="invoice-${inv.id}.pdf"`);
    return reply.send(pdf);
  });

  app.get("/me/invoices/:id/download", { onRequest: [auth] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const rows = await pool.query("SELECT * FROM invoices WHERE id=$1 AND user_id=$2", [id, (req as any).user.sub]);
    const inv = rows.rows[0];
    if (!inv) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const u = await pool.query("SELECT email, username FROM users WHERE id=$1", [(req as any).user.sub]);
    const pdf = await generateInvoicePdf({
      invoiceNo: inv.invoice_no ?? `INV${inv.id}`, title: inv.title, taxNo: inv.tax_no, type: inv.type,
      amount: Number(inv.amount).toFixed(2), taxRate: Number(inv.tax_rate ?? 13).toFixed(2),
      taxAmount: inv.tax_amount ? Number(inv.tax_amount).toFixed(2) : "", totalAmount: Number(inv.total_amount ?? inv.amount).toFixed(2),
      email: inv.email, createdAt: new Date(inv.created_at).toLocaleString(), userName: u.rows[0]?.username ?? "",
    });
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="invoice-${inv.id}.pdf"`);
    return reply.send(pdf);
  });

  app.get("/admin/invoices/:id/download", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const rows = await pool.query("SELECT * FROM invoices WHERE id=$1", [id]);
    const inv = rows.rows[0];
    if (!inv) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const u = await pool.query("SELECT email, username FROM users WHERE id=$1", [inv.user_id]);
    const pdf = await generateInvoicePdf({
      invoiceNo: inv.invoice_no ?? `INV${inv.id}`, title: inv.title, taxNo: inv.tax_no, type: inv.type,
      amount: Number(inv.amount).toFixed(2), taxRate: Number(inv.tax_rate ?? 13).toFixed(2),
      taxAmount: inv.tax_amount ? Number(inv.tax_amount).toFixed(2) : "", totalAmount: Number(inv.total_amount ?? inv.amount).toFixed(2),
      email: inv.email, createdAt: new Date(inv.created_at).toLocaleString(), userName: u.rows[0]?.username ?? "",
    });
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="invoice-${inv.id}.pdf"`);
    return reply.send(pdf);
  });
}

function fmt(row: any) {
  return { ...row, status_label: STATUS_LABEL[row.status] ?? row.status, type_label: TYPE_LABEL[row.type] ?? row.type, amount: Number(row.amount), tax_amount: Number(row.tax_amount), total_amount: Number(row.total_amount) };
}
