import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db, pool } from "../db/index";
import { LEDGER_TYPE_LABEL } from "../db/schema/platform-ledger";
import { reconciliationDifferences, DIFF_STATUS_LABEL } from "../db/schema/reconciliation-differences";
import { accountingPeriods, PERIOD_STATUS_LABEL } from "../db/schema/accounting-periods";
import { internalAdjust, reverseLedger, reconcileVendor, closePeriod } from "../services/finance-ledger";

/**
 * 财务管理 对齐 SPEC-§29
 * 29.1 资金流水 / 29.2 资金账户 / 29.3 对账差异工作台 / 29.4 财务锁账 / 29.6 逾期管理
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

function requireSuper(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      if ((decoded as any).role !== "super_admin") {
        return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "需要超级管理员权限" });
      }
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

export function adminFinanceRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);
  const superAdmin = requireSuper(app);

  // ============ 29.1 平台资金流水 ============
  app.get("/admin/finance/ledger", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.type) where += ` AND type = ${pp(q.type)}`;
    if (q.direction) where += ` AND direction = ${pp(q.direction)}`;
    if (q.status && q.status !== "all") where += ` AND status = ${pp(q.status)}`;
    if (q.user_id) where += ` AND user_id = ${pp(Number(q.user_id))}`;
    if (q.search) where += ` AND (serial_no ILIKE ${pp(`%${q.search}%`)} OR related_order_no ILIKE ${pp(`%${q.search}%`)} OR external_ref ILIKE ${pp(`%${q.search}%`)})`;
    if (q.start_date) where += ` AND created_at >= ${pp(q.start_date)}`;
    if (q.end_date) where += ` AND created_at <= ${pp(q.end_date + " 23:59:59")}`;
    const rows = await pool.query(
      `SELECT * FROM platform_ledger ${where} ORDER BY created_at DESC, id DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`, params);
    const total = await pool.query(`SELECT COUNT(*)::int AS total FROM platform_ledger ${where}`, params.slice(0, params.length - 2));
    // 汇总（筛选范围内）+ 全局汇总
    const summary = await pool.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE direction='in' AND status='completed' ${where.replace("WHERE", "AND") ? "" : ""}),0)::float AS total_in,
              COALESCE(SUM(amount) FILTER (WHERE direction='out' AND status='completed'),0)::float AS total_out
       FROM platform_ledger WHERE status='completed'`, []);
    const totalIn = Number(summary.rows[0]?.total_in ?? 0);
    const totalOut = Number(summary.rows[0]?.total_out ?? 0);
    return {
      code: 0,
      data: {
        list: rows.rows.map(r => ({ ...r, amount: Number(r.amount), balance_after: Number(r.balance_after), type_label: LEDGER_TYPE_LABEL[r.type] ?? r.type, status_label: r.status === "completed" ? "已完成" : r.status === "reversed" ? "已冲正" : r.status === "pending" ? "处理中" : "失败" })),
        pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) },
        summary: { total_in: totalIn, total_out: totalOut, net_flow: Math.round((totalIn - totalOut) * 100) / 100 },
      },
      message: "ok",
    };
  });

  app.get("/admin/finance/ledger/:serialNo", { onRequest: [admin] }, async (req, reply) => {
    const serialNo = (req.params as any).serialNo;
    const rows = await pool.query(`SELECT * FROM platform_ledger WHERE serial_no=$1`, [serialNo]);
    if (!rows.rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const r = rows.rows[0];
    // 连带查询关联对象
    const related: any = {};
    if (r.user_id) {
      const u = await pool.query(`SELECT id, email, username FROM users WHERE id=$1`, [r.user_id]);
      related.user = u.rows[0] ?? null;
    }
    if (r.vendor_id) {
      const v = await pool.query(`SELECT id, name FROM vendors WHERE id=$1`, [r.vendor_id]);
      related.vendor = v.rows[0] ?? null;
    }
    return { code: 0, data: { ...r, amount: Number(r.amount), balance_after: Number(r.balance_after), type_label: LEDGER_TYPE_LABEL[r.type] ?? r.type, related }, message: "ok" };
  });

  app.post("/admin/finance/ledger/adjust", { onRequest: [admin] }, async (req, reply) => {
    const b = req.body as { amount?: number; remark?: string; target_type?: string; target_id?: number };
    if (!b.amount || !b.remark) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "金额与原因必填" });
    try {
      const row = await internalAdjust({
        amount: Number(b.amount), remark: b.remark, operatorId: Number((req as any).user.sub),
        targetType: b.target_type as any, targetId: b.target_id ? Number(b.target_id) : undefined,
      });
      return { code: 0, data: { serial_no: row.serialNo, type_label: "内部调账" }, message: "调账成功" };
    } catch (e: any) {
      return reply.code(400).send({ code: 400, error: "BAD_REQUEST", message: e.message });
    }
  });

  app.post("/admin/finance/ledger/:serialNo/reverse", { onRequest: [superAdmin] }, async (req, reply) => {
    const serialNo = (req.params as any).serialNo;
    const { reason } = req.body as { reason?: string };
    try {
      await reverseLedger(serialNo, Number((req as any).user.sub), reason ?? "冲正");
      return { code: 0, data: { ok: true }, message: "冲正成功" };
    } catch (e: any) {
      return reply.code(400).send({ code: 400, error: "BAD_REQUEST", message: e.message });
    }
  });

  // ============ 29.2 资金账户管理 ============
  app.get("/admin/finance/accounts", { onRequest: [admin] }, async () => {
    // 总览：从 ledger 派生
    const net = await pool.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE direction='in' AND status='completed'),0)::float AS tin,
              COALESCE(SUM(amount) FILTER (WHERE direction='out' AND status='completed'),0)::float AS tout
       FROM platform_ledger`);
    const totalBalance = Math.round((Number(net.rows[0]?.tin ?? 0) - Number(net.rows[0]?.tout ?? 0)) * 100) / 100;
    // 用户充值/消费（users.balance 单位分，/100 转元；billing actual_cost 单位元）
    const u = await pool.query(
      `SELECT (SELECT COALESCE(SUM(balance),0) FROM users)::float / 100.0 AS user_balance,
              (SELECT COALESCE(SUM(amount),0)::float FROM recharge_orders WHERE status='success') AS recharge_total,
              (SELECT COALESCE(SUM(actual_cost),0)::float FROM billing_logs WHERE status IN ('settled','success')) AS consumption_total`);
    // 待结算代理佣金（agent_commissions 中未结算/未提现）+ 进行中提现
    const comm = await pool.query(
      `SELECT COALESCE(SUM(commission_amount),0)::float AS total_earned,
              COALESCE(SUM(commission_amount) FILTER (WHERE status='pending'),0)::float AS pending
       FROM agent_commissions`);
    // 进行中提现（未完成/未拒绝）
    const pendingWithdraw = await pool.query(
      `SELECT COALESCE(SUM(amount),0)::float AS amt FROM agent_withdrawals WHERE status IN ('pending_first_review','pending_second_review','processing')`);
    // 待结算供应商（pending/generated 状态结算单）
    const vend = await pool.query(
      `SELECT COALESCE(SUM(settlement_amount),0)::float AS pending, COALESCE(SUM(settlement_amount) FILTER (WHERE status='paid'),0)::float AS paid FROM vendor_settlements WHERE status IN ('generated','confirmed','pending','paid')`);
    const settledToVendor = Number(vend.rows[0]?.paid ?? 0);
    const pendingVendor = Number(vend.rows[0]?.pending ?? 0);
    const agentPending = Number(comm.rows[0]?.pending ?? 0);
    const agentTotal = Number(comm.rows[0]?.total_earned ?? 0);
    const agentPaid = Math.max(agentTotal - agentPending, 0);
    const pendingWithdrawAmt = Number(pendingWithdraw.rows[0]?.amt ?? 0);
    const consumption = Number(u.rows[0]?.consumption_total ?? 0);
    const grossProfit = Math.round((consumption - settledToVendor) * 100) / 100;
    const margin = consumption > 0 ? Math.round((grossProfit / consumption) * 10000) / 100 : 0;
    // 冻结明细
    const frozen = [
      { label: "代理待结算佣金", amount: Math.max(agentPending, 0) },
      { label: "进行中提现", amount: Math.max(pendingWithdrawAmt, 0) },
      { label: "待结算供应商", amount: Math.max(pendingVendor, 0) },
    ];
    const frozenTotal = Math.round(frozen.reduce((s, f) => s + f.amount, 0) * 100) / 100;
    return {
      code: 0,
      data: {
        total_balance: totalBalance,
        available_balance: Math.round((totalBalance - frozenTotal) * 100) / 100,
        frozen_balance: frozenTotal,
        frozen_detail: frozen,
        user_recharge_total: Number(u.rows[0]?.recharge_total ?? 0),
        user_consumption_total: consumption,
        settled_to_vendor: settledToVendor,
        pending_vendor_settlement: pendingVendor,
        agent_commission_paid: agentPaid,
        agent_commission_pending: agentPending,
        platform_gross_profit: grossProfit,
        platform_gross_margin: margin,
      },
      message: "ok",
    };
  });

  app.get("/admin/finance/accounts/trend", { onRequest: [admin] }, async (req) => {
    const days = Math.min(Number((req.query as any).days ?? 30), 90);
    const rows = await pool.query(
      `SELECT to_char(created_at::date,'YYYY-MM-DD') AS d,
              COALESCE(SUM(amount) FILTER (WHERE direction='in' AND status='completed'),0)::float AS fin,
              COALESCE(SUM(amount) FILTER (WHERE direction='out' AND status='completed'),0)::float AS fout
       FROM platform_ledger WHERE created_at >= NOW() - ($1 || ' days')::interval
       GROUP BY d ORDER BY d`, [days]);
    // 计算累计余额
    let cum = 0;
    const trend = rows.rows.map(r => {
      cum += Number(r.fin) - Number(r.fout);
      return { date: r.d, total: Math.round(cum * 100) / 100, income: Number(r.fin), expense: Number(r.fout) };
    });
    return { code: 0, data: { trend }, message: "ok" };
  });

  // ============ 29.3 对账差异工作台 ============
  app.get("/admin/finance/reconciliation/differences", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.status && q.status !== "all") where += ` AND rd.status = ${pp(q.status)}`;
    if (q.subject_type) where += ` AND rd.subject_type = ${pp(q.subject_type)}`;
    if (q.search) where += ` AND (rd.period ILIKE ${pp(`%${q.search}%`)} OR CAST(rd.subject_id AS TEXT) LIKE ${pp(`%${q.search}%`)})`;
    const rows = await pool.query(
      `SELECT rd.*,
              COALESCE(v.name, '') AS subject_name
       FROM reconciliation_differences rd
       LEFT JOIN vendors v ON rd.subject_type='vendor' AND v.id=rd.subject_id
       ${where} ORDER BY rd.created_at DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`, params);
    const total = await pool.query(`SELECT COUNT(*)::int AS total FROM reconciliation_differences rd ${where}`, params.slice(0, params.length - 2));
    const pendingTot = await pool.query(
      `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(diff_amount) FILTER (WHERE status='pending'),0)::float AS amt FROM reconciliation_differences WHERE status='pending'`);
    return {
      code: 0, data: {
        list: rows.rows.map(r => ({ ...r, platform_amount: Number(r.platform_amount), counterparty_amount: Number(r.counterparty_amount), diff_amount: Number(r.diff_amount), status_label: DIFF_STATUS_LABEL[r.status] ?? r.status })),
        pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) },
        stats: { pending_count: Number(pendingTot.rows[0]?.cnt ?? 0), pending_amount: Number(pendingTot.rows[0]?.amt ?? 0) },
      }, message: "ok",
    };
  });

  app.post("/admin/finance/reconciliation/run", { onRequest: [admin] }, async (req) => {
    const { period } = req.body as { period?: string };
    const p = period ?? new Date().toISOString().slice(0, 7);
    const r = await reconcileVendor(p);
    return { code: 0, data: { checked: r.checked, period: p }, message: `已检查 ${r.checked} 条结算单` };
  });

  app.post("/admin/finance/reconciliation/differences/:id/resolve", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as { resolve_mode?: string; remark?: string };
    const rec = await db.select().from(reconciliationDifferences).where(eq(reconciliationDifferences.id, id)).limit(1);
    if (!rec[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (rec[0].status !== "pending") return reply.code(400).send({ code: 400, error: "BAD_STATE", message: "仅待处理可处理" });
    const mode = b.resolve_mode ?? "platform";
    if (!["platform", "counterparty", "verify"].includes(mode)) return reply.code(400).send({ code: 400, error: "BAD_PARAMS" });
    const newStatus = mode === "verify" ? "verify" : mode === "platform" ? "resolved_platform" : "resolved_counterparty";
    await db.update(reconciliationDifferences)
      .set({ status: newStatus, resolveMode: mode, remark: b.remark ?? null, resolvedBy: Number((req as any).user.sub), resolvedAt: new Date() })
      .where(eq(reconciliationDifferences.id, id));
    return { code: 0, data: { status: newStatus, status_label: DIFF_STATUS_LABEL[newStatus] }, message: "已处理" };
  });

  // ============ 29.4 财务锁账 ============
  app.get("/admin/finance/close/status", { onRequest: [admin] }, async (req) => {
    const period = (req.query as any).period ?? new Date().toISOString().slice(0, 7);
    const rec = await db.select().from(accountingPeriods).where(eq(accountingPeriods.period, period)).limit(1);
    return { code: 0, data: { period, status: rec[0]?.status ?? "open", status_label: PERIOD_STATUS_LABEL[rec[0]?.status ?? "open"], record: rec[0] ?? null }, message: "ok" };
  });

  app.post("/admin/finance/close/execute", { onRequest: [admin] }, async (req, reply) => {
    const { period } = req.body as { period?: string };
    const p = period ?? new Date().toISOString().slice(0, 7);
    try {
      const r = await closePeriod(p, Number((req as any).user.sub));
      if (!r.ok) return reply.code(409).send({ code: 409, error: "LOCKED", message: r.message });
      return { code: 0, data: { period: p, status: "locked" }, message: r.message };
    } catch (e: any) {
      return reply.code(400).send({ code: 400, error: "BAD_REQUEST", message: e.message });
    }
  });

  app.get("/admin/finance/close/history", { onRequest: [admin] }, async () => {
    const rec = await db.select().from(accountingPeriods).orderBy(desc(accountingPeriods.period)).limit(24);
    return { code: 0, data: { list: rec.map((r: any) => ({ ...r, income_total: Number(r.incomeTotal ?? r.income_total), expense_total: Number(r.expenseTotal ?? r.expense_total), gross_profit: Number(r.grossProfit ?? r.gross_profit), gross_margin: Number(r.grossMargin ?? r.gross_margin), status_label: PERIOD_STATUS_LABEL[r.status] })) }, message: "ok" };
  });

  app.post("/admin/finance/close/:period/unlock", { onRequest: [superAdmin] }, async (req, reply) => {
    const period = (req.params as any).period;
    const { reason } = req.body as { reason?: string };
    if (!reason) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "解锁理由必填" });
    const now = new Date();
    const relock = new Date(now.getTime() + 3600 * 1000);
    const rec = await db.select().from(accountingPeriods).where(eq(accountingPeriods.period, period)).limit(1);
    if (rec[0]) {
      await db.update(accountingPeriods).set({ status: "unlocked", unlockedBy: Number((req as any).user.sub), unlockedReason: reason, unlockedAt: now, relockAt: relock }).where(eq(accountingPeriods.id, rec[0].id));
    } else {
      await db.insert(accountingPeriods).values({ period, status: "unlocked", unlockedBy: Number((req as any).user.sub), unlockedReason: reason, unlockedAt: now, relockAt: relock });
    }
    return { code: 0, data: { period, status: "unlocked", relock_at: relock.toISOString() }, message: "已临时解锁（1 小时后自动重锁）" };
  });

  // ============ 29.6 逾期管理（信用额度，简化） ============
  // 当 users 具备 credit_limit 字段时启用；当前 schema 若缺则返回空列表
  app.get("/admin/finance/overdue/list", { onRequest: [admin] }, async () => {
    try {
      const cols = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name IN ('credit_limit','credit_used','credit_due_date')`);
      if (cols.rows.length < 2) {
        return { code: 0, data: { list: [], stats: { total: 0, amount: 0 } }, message: "未启用信用额度，跳过" };
      }
      const rows = await pool.query(
        `SELECT id, email, username, credit_limit, credit_used,
                EXTRACT(DAY FROM (NOW() - credit_due_date))::int AS overdue_days,
                GREATEST(0, CEIL(EXTRACT(DAY FROM (NOW() - credit_due_date)))) AS penalty_days
         FROM users
         WHERE credit_limit > 0 AND credit_due_date < NOW() AND credit_used > 0
         ORDER BY credit_due_date LIMIT 200`);
      const list = rows.rows.map(r => ({
        id: r.id, email: r.email, username: r.username,
        credit_limit: Number(r.credit_limit), credit_used: Number(r.credit_used),
        overdue_days: Number(r.overdue_days) || 0,
        penalty: Math.round(Number(r.credit_used) * Math.min(Number(r.penalty_days) || 0, 30) * 0.001 * 100) / 100,
      }));
      const totalAmount = Math.round(list.reduce((s, x) => s + x.credit_used, 0) * 100) / 100;
      return { code: 0, data: { list, stats: { total: list.length, amount: totalAmount } }, message: "ok" };
    } catch {
      return { code: 0, data: { list: [], stats: { total: 0, amount: 0 } }, message: "ok" };
    }
  });
}
