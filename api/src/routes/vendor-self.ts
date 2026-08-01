import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, pool } from "../db/index";
import { vendors } from "../db/schema/vendors";
import { vendorModels } from "../db/schema/vendor-models";
import { sendEmail } from "../services/smtp";

/**
 * 供应商自助服务（ref-4.10-vendor-self-service.md）
 * - 入驻注册（status=pending，待管理员审核）
 * - 登录（JWT role=vendor）
 * - 自助管理：仪表盘 / 模型 / 统计 / 结算 / 公告
 */

/** 生成唯一 code（供应商别名，防撞名） */
async function genUniqueCode(name: string): Promise<string> {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "vendor";
  let code = base;
  for (let i = 1; i < 100; i++) {
    const r = await pool.query("SELECT 1 FROM vendors WHERE code=$1", [code]);
    if (r.rowCount === 0) return code;
    code = `${base}${i}`;
  }
  return `vendor${Date.now()}`;
}

export function vendorSelfRoutes(app: FastifyInstance) {
  // 供应商 JWT 校验
  const requireVendor = async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      if ((decoded as any).role !== "vendor") return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "需要供应商权限" });
      req.vendor = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };

  // ===== 1. 入驻注册 =====
  app.post("/vendor/register", async (req, reply) => {
    const b = req.body as {
      name?: string; contact_name?: string; contact_email?: string; contact_phone?: string; password?: string;
      base_url?: string; api_auth_type?: string; commission_rate?: number;
    } | undefined;
    if (!b) return reply.code(400).send({ code: 400, error: "INVALID", message: "注册信息不能为空" });
    const { name, contact_name, contact_email, contact_phone, password, base_url } = b;
    if (!name?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_NAME", message: "供应商名称必填" });
    if (!contact_email?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_EMAIL", message: "联系邮箱必填" });
    const email = contact_email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply.code(400).send({ code: 400, error: "BAD_EMAIL", message: "邮箱格式不正确" });
    if (!password || password.length < 8) return reply.code(400).send({ code: 400, error: "WEAK_PASSWORD", message: "密码至少 8 位" });

    // 邮箱唯一性
    const dedup = await pool.query("SELECT id FROM vendors WHERE contact_email=$1", [email]);
    if (dedup.rows[0]) return reply.code(409).send({ code: 409, error: "EMAIL_EXISTS", message: "该邮箱已被注册" });

    const code = await genUniqueCode(name);
    const passwordHash = await bcrypt.hash(password, 10);
    const created = await db
      .insert(vendors)
      .values({
        name: name.trim(),
        code,
        status: "pending",
        contactEmail: email,
        passwordHash,
        contactName: contact_name?.trim() ?? null,
        contactPhone: contact_phone?.trim() ?? null,
        baseUrl: base_url?.trim() ?? null,
        apiAuthType: b.api_auth_type === "api_key" ? "api_key" : "bearer_token",
        commissionRate: b.commission_rate != null ? String(b.commission_rate) : "0.1000",
        contact: JSON.stringify({ name: contact_name?.trim(), email, phone: contact_phone?.trim() }),
      })
      .returning({ id: vendors.id, name: vendors.name, status: vendors.status });
    const v = created[0]!;
    // 通知管理员（站内/邮件 fire-and-forget）
    void sendEmail({
      to: email,
      subject: "3Cloud —— 供应商入驻申请已提交",
      html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px">
        <p>你好，<strong>${v.name}</strong>：</p>
        <p>你的供应商入驻申请已提交，平台将在 1-3 个工作日内审核。</p>
        <p>当前状态：<strong style="color:#d97706">待审核</strong></p>
        <p style="color:#64748b;font-size:13px">审核通过后即可使用同一邮箱登录供应商自助管理后台。</p>
      </div>`,
      templateName: "vendor_registered",
      vars: { username: v.name ?? "" },
    });
    return reply.code(201).send({ code: 0, data: { id: v.id, name: v.name, status: v.status }, message: "入驻申请已提交，请等待平台审核" });
  });

  // ===== 2. 登录 =====
  app.post("/vendor/login", async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    if (!email || !password) return reply.code(400).send({ code: 400, error: "MISSING", message: "邮箱和密码必填" });
    const v = await pool.query("SELECT * FROM vendors WHERE contact_email=$1", [email.trim().toLowerCase()]);
    const row = v.rows[0];
    if (!row) return reply.code(401).send({ code: 401, error: "INVALID_CREDENTIALS", message: "邮箱或密码错误" });
    if (row.status === "pending") return reply.code(403).send({ code: 403, error: "PENDING", message: "入驻申请审核中，请等待" });
    if (row.status === "rejected") return reply.code(403).send({ code: 403, error: "REJECTED", message: `入驻申请未通过：${row.reject_reason ?? "请联系管理员"}` });
    if (row.status === "offline" || row.status === "maintenance") return reply.code(403).send({ code: 403, error: "VENDOR_DISABLED", message: "供应商已被下线，请联系平台" });
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) return reply.code(401).send({ code: 401, error: "INVALID_CREDENTIALS", message: "邮箱或密码错误" });
    await pool.query("UPDATE vendors SET last_login_at=now() WHERE id=$1", [row.id]);
    const token = app.jwt.sign({ sub: String(row.id), role: "vendor", vid: row.id });
    return { code: 0, data: { token, vendor: { id: row.id, name: row.name, status: row.status, contact_email: row.contact_email } }, message: "ok" };
  });

  // ===== 3. 供应商信息 =====
  app.get("/vendor/profile", { onRequest: [requireVendor] }, async (req) => {
    const vid = Number(((req as any).vendor as any).sub);
    const v = await pool.query("SELECT id, name, code, status, contact_email, contact_name, contact_phone, base_url, api_auth_type, commission_rate, currency, created_at, last_login_at, reject_reason FROM vendors WHERE id=$1", [vid]);
    return { code: 0, data: v.rows[0], message: "ok" };
  });

  // ===== 4. 仪表盘 =====
  app.get("/vendor/dashboard", { onRequest: [requireVendor] }, async (req) => {
    const vid = Number(((req as any).vendor as any).sub);
    // 今日统计
    const today = await pool.query(
      `SELECT COUNT(*)::int AS calls,
              COUNT(*) FILTER (WHERE status='success')::int AS success,
              COALESCE(SUM(total_tokens),0)::bigint AS tokens,
              COALESCE(AVG(latency_ms) FILTER (WHERE status='success'),0)::int AS avg_latency
       FROM call_logs WHERE vendor_id=$1 AND created_at >= now() - interval '24 hours'`, [vid]);
    const revenue = await pool.query(
      `SELECT COALESCE(SUM(cost),0)::float AS cost FROM call_logs WHERE vendor_id=$1 AND created_at >= now() - interval '24 hours'`, [vid]);
    // 近 7 天趋势
    const trend = await pool.query(
      `SELECT to_char(created_at,'YYYY-MM-DD') AS day, COUNT(*)::int AS calls, COALESCE(SUM(cost),0)::float AS cost
       FROM call_logs WHERE vendor_id=$1 AND created_at >= now() - interval '7 days'
       GROUP BY day ORDER BY day ASC`, [vid]);
    // 模型排行
    const models = await pool.query(
      `SELECT COALESCE(m.name, cl.upstream_model,'unknown') AS model, COUNT(*)::int AS calls, COALESCE(SUM(cl.cost),0)::float AS cost
       FROM call_logs cl LEFT JOIN models m ON m.id=cl.model_id
       WHERE cl.vendor_id=$1 GROUP BY COALESCE(m.name, cl.upstream_model,'unknown') ORDER BY calls DESC`, [vid]);
    // 可用率
    const t = today.rows[0];
    const availability = t.calls > 0 ? Math.round((t.success / t.calls) * 10000) / 100 : 100;
    return {
      code: 0,
      data: {
        today: { calls: t.calls, success: t.success, tokens: t.tokens, cost: Number(revenue.rows[0]?.cost ?? 0), avg_latency: t.avg_latency, availability },
        trend: trend.rows,
        model_ranking: models.rows,
      },
      message: "ok",
    };
  });

  // ===== 5. 我的模型 =====
  app.get("/vendor/models", { onRequest: [requireVendor] }, async (req) => {
    const vid = Number(((req as any).vendor as any).sub);
    const rows = await pool.query(
      `SELECT vm.id, m.id AS model_id, m.name AS model_name, m.display_name, m.category,
              vm.upstream_model, vm.cost_input_price, vm.cost_output_price, vm.weight, vm.priority, vm.is_enabled, vm.health_score
       FROM vendor_models vm JOIN models m ON m.id=vm.model_id
       WHERE vm.vendor_id=$1 ORDER BY vm.is_enabled DESC, vm.id`, [vid]);
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });

  // ===== 6. 新增模型（入平台审核，status pending 需要平台审核——此 MVP 直接关联已存在 models）=====
  app.post("/vendor/models", { onRequest: [requireVendor] }, async (req, reply) => {
    const vid = Number(((req as any).vendor as any).sub);
    const b = req.body as { model_id?: number; upstream_model?: string; cost_input_price?: number; cost_output_price?: number; weight?: number } | undefined;
    if (!b?.model_id || !b.upstream_model?.trim()) return reply.code(400).send({ code: 400, error: "MISSING", message: "平台模型和供应商模型名必填" });
    const r = await pool.query(
      `INSERT INTO vendor_models (vendor_id, model_id, upstream_model, cost_input_price, cost_output_price, weight, priority)
       VALUES ($1,$2,$3,$4,$5,$6,0) ON CONFLICT DO NOTHING RETURNING id`,
      [vid, b.model_id, b.upstream_model.trim(), String(b.cost_input_price ?? 0), String(b.cost_output_price ?? 0), b.weight ?? 1],
    );
    if (!r.rows[0]) {
      const dup = await pool.query("SELECT id FROM vendor_models WHERE vendor_id=$1 AND model_id=$2", [vid, b.model_id]);
      if (dup.rows[0]) return reply.code(409).send({ code: 409, error: "EXISTS", message: "该模型已关联" });
    }
    return { code: 0, data: { id: r.rows[0]?.id }, message: "模型已添加" };
  });

  // ===== 7. 模型价格修改 =====
  app.put("/vendor/models/:id", { onRequest: [requireVendor] }, async (req, reply) => {
    const vid = Number(((req as any).vendor as any).sub);
    const id = Number((req.params as any).id);
    const b = req.body as { cost_input_price?: number; cost_output_price?: number; weight?: number } | undefined;
    const upd: any = { updatedAt: new Date() };
    if (b?.cost_input_price != null) upd.costInputPrice = String(b.cost_input_price);
    if (b?.cost_output_price != null) upd.costOutputPrice = String(b.cost_output_price);
    if (b?.weight != null) upd.weight = b.weight;
    const r = await db.update(vendorModels).set(upd).where(and(eq(vendorModels.id, id), eq(vendorModels.vendorId, vid)));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "模型已更新" };
  });

  // ===== 8. 数据统计 =====
  app.get("/vendor/stats", { onRequest: [requireVendor] }, async (req) => {
    const vid = Number(((req as any).vendor as any).sub);
    const q = req.query as { range?: string };
    const range = q.range === "30d" ? "30 days" : q.range === "90d" ? "90 days" : "7 days";
    const trend = await pool.query(
      `SELECT to_char(created_at,'YYYY-MM-DD') AS day, COUNT(*)::int AS calls, COALESCE(SUM(total_tokens),0)::bigint AS tokens, COALESCE(SUM(cost),0)::float AS cost
       FROM call_logs WHERE vendor_id=$1 AND created_at >= now() - $2::interval
       GROUP BY day ORDER BY day ASC`, [vid, range]);
    const byModel = await pool.query(
      `SELECT COALESCE(m.name, cl.upstream_model,'unknown') AS model, COUNT(*)::int AS calls, COALESCE(SUM(cl.cost),0)::float AS cost
       FROM call_logs cl LEFT JOIN models m ON m.id=cl.model_id
       WHERE cl.vendor_id=$1 AND cl.created_at >= now() - $2::interval
       GROUP BY COALESCE(m.name, cl.upstream_model,'unknown') ORDER BY calls DESC`, [vid, range]);
    return { code: 0, data: { range, trend: trend.rows, by_model: byModel.rows }, message: "ok" };
  });

  // ===== 9. 我的结算单 =====
  app.get("/vendor/settlements", { onRequest: [requireVendor] }, async (req) => {
    const vid = Number(((req as any).vendor as any).sub);
    const rows = await pool.query(
      `SELECT id, period, total_calls, success_calls, failed_calls, total_tokens, total_cost, user_revenue, commission_rate, commission_amount, settlement_amount, status, dispute_reason, generated_at, confirmed_at, paid_at, payment_reference
       FROM vendor_settlements WHERE vendor_id=$1 ORDER BY period DESC`, [vid]);
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });

  // ===== 10. 结算单详情（含模型明细，供对账）=====
  app.get("/vendor/settlements/:id", { onRequest: [requireVendor] }, async (req, reply) => {
    const vid = Number(((req as any).vendor as any).sub);
    const id = Number((req.params as any).id);
    const s = await pool.query("SELECT * FROM vendor_settlements WHERE id=$1 AND vendor_id=$2", [id, vid]);
    if (!s.rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const rec = s.rows[0];
    const [py, pm] = rec.period.split("-").map(Number) as [number, number];
    const pStart = `${rec.period}-01 00:00:00`;
    const pEnd = new Date(py, pm, 1).toISOString();
    const models = await pool.query(
      `SELECT COALESCE(m.name, cl.upstream_model,'unknown') AS model, COUNT(*)::int AS calls, COALESCE(SUM(cl.total_tokens),0)::bigint AS tokens, COALESCE(SUM(cl.cost),0)::float AS cost
       FROM call_logs cl LEFT JOIN models m ON m.id=cl.model_id
       WHERE cl.vendor_id=$1 AND cl.created_at >= $2 AND cl.created_at < $3
       GROUP BY COALESCE(m.name, cl.upstream_model,'unknown') ORDER BY cost DESC`, [vid, pStart, pEnd]);
    return { code: 0, data: { ...rec, model_items: models.rows, settlement_amount: Number(rec.settlement_amount), total_cost: Number(rec.total_cost), user_revenue: Number(rec.user_revenue) }, message: "ok" };
  });

  // ===== 11. 发起争议 =====
  app.post("/vendor/settlements/:id/dispute", { onRequest: [requireVendor] }, async (req, reply) => {
    const vid = Number(((req as any).vendor as any).sub);
    const id = Number((req.params as any).id);
    const { reason } = (req.body ?? {}) as { reason?: string };
    const s = await pool.query("SELECT * FROM vendor_settlements WHERE id=$1 AND vendor_id=$2", [id, vid]);
    if (!s.rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (s.rows[0].status !== "generated") return reply.code(400).send({ code: 400, error: "BAD_STATE", message: "仅已生成的结算单可发起争议" });
    await pool.query("UPDATE vendor_settlements SET status='disputed', dispute_reason=$1, updated_at=now() WHERE id=$2", [reason ?? "供应商提出争议", id]);
    return { code: 0, data: { status: "disputed" }, message: "争议已发起" };
  });

  // ===== 12. 平台公告 =====
  app.get("/vendor/announcements", { onRequest: [requireVendor] }, async (_req) => {
    const rows = await pool.query(
      `SELECT id, title, content, category, created_at FROM announcements WHERE status='published' ORDER BY created_at DESC LIMIT 50`);
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });
}
