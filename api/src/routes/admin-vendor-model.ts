import type { FastifyInstance } from "fastify";
import { eq, desc, asc, and } from "drizzle-orm";
import { db, pool } from "../db/index";
import { vendors } from "../db/schema/vendors";
import { models } from "../db/schema/models";
import { vendorModels } from "../db/schema/vendor-models";
import { sendEmail } from "../services/smtp";

/**
 * 供应商与模型管理（管理后台）
 * 对齐 ref-4.3-vendor-model.md §2 API 清单
 * - 供应商管理：列表/创建/编辑/详情/状态切换
 * - 模型管理：列表/创建/编辑/下线
 * - 供应商-模型映射：列表/添加/编辑/删除
 * 权限：admin / super_admin
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
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };
}

const VENDOR_STATUS: Record<string, string> = { active: "运行中", maintenance: "维护中", offline: "已下线", pending: "待审核", rejected: "已拒绝" };

export function adminVendorModelRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // ============================================================
  // 一、供应商管理
  // ============================================================

  // 1.1 供应商列表（分页/搜索/状态筛选）
  app.get("/admin/vendors", { onRequest: [admin] }, async (req) => {
    const q = req.query as { page?: number; page_size?: number; status?: string; keyword?: string };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;

    let where = "WHERE 1=1";
    const whereParams: any[] = [];
    const wp = (v: any) => { whereParams.push(v); return `$${whereParams.length}`; };
    if (q.status) where += ` AND v.status = ${wp(q.status)}`;
    if (q.keyword) where += ` AND (v.name ILIKE ${wp(`%${q.keyword}%`)} OR v.code ILIKE ${wp(`%${q.keyword}%`)})`;

    const pageParams = [...whereParams, pageSize, offset];
    const rows = await pool.query(
      `SELECT v.id, v.name, v.code, v.status, v.base_url, v.api_format, v.currency, v.contact,
              v.is_active, v.created_at,
              (SELECT COUNT(*)::int FROM vendor_models vm WHERE vm.vendor_id = v.id) AS model_count
       FROM vendors v ${where}
       ORDER BY v.created_at DESC LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
      pageParams,
    );
    const total = await pool.query(`SELECT COUNT(*)::int AS total FROM vendors v ${where}`, whereParams);

    return {
      code: 0,
      data: {
        list: rows.rows.map((r: any) => ({ ...r, status_label: VENDOR_STATUS[r.status] ?? r.status })),
        pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) },
      },
      message: "ok",
    };
  });

  // 1.2 供应商详情
  app.get("/admin/vendors/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const v = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
    if (!v[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "供应商不存在" });
    // 该供应商的模型映射
    const vms = await pool.query(
      `SELECT vm.id, vm.model_id, m.name AS model_name, m.display_name, vm.upstream_model,
              vm.cost_input_price::float AS cost_input_price, vm.cost_output_price::float AS cost_output_price,
              vm.weight, vm.priority, vm.is_enabled, vm.health_score, vm.avg_latency_ms
       FROM vendor_models vm JOIN models m ON m.id = vm.model_id
       WHERE vm.vendor_id = $1 ORDER BY vm.priority DESC, vm.weight DESC`,
      [id],
    );
    return { code: 0, data: { vendor: { ...v[0], status_label: VENDOR_STATUS[v[0].status] ?? v[0].status }, models: vms.rows }, message: "ok" };
  });

  // 1.3 创建供应商
  app.post("/admin/vendors", { onRequest: [admin] }, async (req, reply) => {
    const b = req.body as { name: string; code?: string; base_url?: string; api_format?: string; currency?: string; status?: string; contact?: string };
    if (!b.name?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_NAME", message: "供应商名称不能为空" });
    const code = b.code?.trim() ?? b.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    try {
      const created = await db
        .insert(vendors)
        .values({
          name: b.name.trim(),
          code,
          baseUrl: b.base_url ?? "",
          apiFormat: b.api_format ?? "openai",
          currency: b.currency ?? "CNY",
          status: b.status ?? "active",
          isActive: (b.status ?? "active") === "active",
          contact: b.contact ?? null,
        })
        .returning({ id: vendors.id });
      return { code: 0, data: { id: created[0]!.id }, message: "供应商已创建" };
    } catch (e: any) {
      if (e?.code === "23505") return reply.code(409).send({ code: 409, error: "DUPLICATE", message: "名称或编码已存在" });
      throw e;
    }
  });

  // 1.4 编辑供应商
  app.put("/admin/vendors/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as { name?: string; base_url?: string; api_format?: string; currency?: string; contact?: string; status?: string };
    const upd: any = { updatedAt: new Date() };
    if (b.name != null) upd.name = b.name.trim();
    if (b.base_url != null) upd.baseUrl = b.base_url;
    if (b.api_format != null) upd.apiFormat = b.api_format;
    if (b.currency != null) upd.currency = b.currency;
    if (b.contact != null) upd.contact = b.contact;
    if (b.status != null) { upd.status = b.status; upd.isActive = b.status === "active"; }
    const r = await db.update(vendors).set(upd).where(eq(vendors.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "供应商已更新" };
  });

  // 1.5 状态切换
  app.post("/admin/vendors/:id/toggle-status", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { status } = req.body as { status?: string };
    if (!["active", "maintenance", "offline"].includes(status ?? "")) {
      return reply.code(400).send({ code: 400, error: "BAD_STATUS", message: "状态只能是 active/maintenance/offline" });
    }
    const targetStatus = status as string;
    const r = await db.update(vendors).set({ status: targetStatus, isActive: targetStatus === "active", updatedAt: new Date() }).where(eq(vendors.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    // 非 active 时，将该供应商所有启用映射下线（避免路由到维护/下线供应商）
    if (targetStatus !== "active") {
      await db.update(vendorModels).set({ isEnabled: false, updatedAt: new Date() }).where(eq(vendorModels.vendorId, id));
    }
    return { code: 0, data: { status: targetStatus, status_label: VENDOR_STATUS[targetStatus] ?? targetStatus }, message: `已切换为${VENDOR_STATUS[targetStatus] ?? targetStatus}` };
  });

  // 1.4 入驻审核通过（pending → active）
  app.post("/admin/vendors/:id/approve", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const reviewerId = Number((req as any).user.sub);
    const v = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
    if (!v[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (v[0].status !== "pending") return reply.code(400).send({ code: 400, error: "BAD_STATE", message: "仅待审核状态可通过" });
    await db.update(vendors).set({ status: "active", isActive: true, reviewedBy: reviewerId, reviewedAt: new Date(), rejectReason: null, updatedAt: new Date() }).where(eq(vendors.id, id));
    // 通知供应商（fire-and-forget）
    if (v[0].contactEmail) {
      void sendEmail({
        to: v[0].contactEmail, subject: "3Cloud —— 供应商入驻审核通过",
        html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px"><p>你好，<strong>${v[0].name}</strong>：</p><p style="color:#16a34a;font-weight:600">✅ 你的供应商入驻申请已通过审核！</p><p>现在可使用联系邮箱登录供应商自助管理后台，查看仪表盘、模型、结算与对账。</p></div>`,
        templateName: "vendor_approved", vars: { username: v[0].name ?? "" },
      });
    }
    return { code: 0, data: { status: "active", status_label: "运行中" }, message: "已通过审核，供应商可登录" };
  });

  // 1.5 入驻审核拒绝（pending → rejected）
  app.post("/admin/vendors/:id/reject", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const reviewerId = Number((req as any).user.sub);
    const { reason } = (req.body ?? {}) as { reason?: string };
    const v = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
    if (!v[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (v[0].status !== "pending") return reply.code(400).send({ code: 400, error: "BAD_STATE", message: "仅待审核状态可拒绝" });
    await db.update(vendors).set({ status: "rejected", isActive: false, reviewedBy: reviewerId, reviewedAt: new Date(), rejectReason: reason ?? "资料不完整", updatedAt: new Date() }).where(eq(vendors.id, id));
    if (v[0].contactEmail) {
      void sendEmail({
        to: v[0].contactEmail, subject: "3Cloud —— 供应商入驻申请未通过",
        html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px"><p>你好，<strong>${v[0].name}</strong>：</p><p style="color:#dc2626;font-weight:600">很遗憾，你的入驻申请未通过审核。</p><p>原因：${reason ?? "资料不完整"}</p><p style="color:#64748b;font-size:13px">可联系平台客服修改后重新提交。</p></div>`,
        templateName: "vendor_rejected", vars: { username: v[0].name ?? "", reason: reason ?? "资料不完整" },
      });
    }
    return { code: 0, data: { status: "rejected", status_label: "已拒绝" }, message: "已拒绝" };
  });

  // ============================================================

  // 2.1 模型列表
  app.get("/admin/models", { onRequest: [admin] }, async (req) => {
    const q = req.query as { page?: number; page_size?: number; status?: string; category?: string; keyword?: string };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;

    let where = "WHERE 1=1";
    const whereParams: any[] = [];
    const wp = (v: any) => { whereParams.push(v); return `$${whereParams.length}`; };
    if (q.status) where += ` AND m.status = ${wp(q.status)}`;
    if (q.category) where += ` AND m.category = ${wp(q.category)}`;
    if (q.keyword) where += ` AND (m.name ILIKE ${wp(`%${q.keyword}%`)} OR m.display_name ILIKE ${wp(`%${q.keyword}%`)})`;

    const pageParams = [...whereParams, pageSize, offset];
    const rows = await pool.query(
      `SELECT m.id, m.name, m.display_name, m.category, m.context_length, m.description, m.status, m.created_at,
              (SELECT COUNT(*)::int FROM vendor_models vm WHERE vm.model_id = m.id AND vm.is_enabled=true) AS vendor_count
       FROM models m ${where}
       ORDER BY m.created_at DESC LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
      pageParams,
    );
    const total = await pool.query(`SELECT COUNT(*)::int AS total FROM models m ${where}`, whereParams);

    return { code: 0, data: { list: rows.rows, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) } }, message: "ok" };
  });

  // 2.2 创建模型
  app.post("/admin/models", { onRequest: [admin] }, async (req, reply) => {
    const b = req.body as { name: string; display_name?: string; category?: string; context_length?: number; description?: string };
    if (!b.name?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_NAME", message: "模型名称不能为空" });
    try {
      const created = await db
        .insert(models)
        .values({
          name: b.name.trim(),
          displayName: b.display_name ?? b.name.trim(),
          category: b.category ?? "chat",
          contextLength: b.context_length ?? 0,
          description: b.description ?? null,
          status: "active",
        })
        .returning({ id: models.id });
      return { code: 0, data: { id: created[0]!.id }, message: "模型已创建" };
    } catch (e: any) {
      if (e?.code === "23505") return reply.code(409).send({ code: 409, error: "DUPLICATE", message: "模型名称已存在" });
      throw e;
    }
  });

  // 2.3 编辑模型
  app.put("/admin/models/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as { display_name?: string; category?: string; context_length?: number; description?: string; status?: string };
    const upd: any = { updatedAt: new Date() };
    if (b.display_name != null) upd.displayName = b.display_name;
    if (b.category != null) upd.category = b.category;
    if (b.context_length != null) upd.contextLength = b.context_length;
    if (b.description != null) upd.description = b.description;
    if (b.status != null) upd.status = b.status;
    const r = await db.update(models).set(upd).where(eq(models.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "模型已更新" };
  });

  // ============================================================
  // 三、供应商-模型映射管理
  // ============================================================

  // 3.1 供应商的模型映射列表（vendor 详情内已含，此为独立接口供选择用）
  app.get("/admin/vendors/:id/models", { onRequest: [admin] }, async (req) => {
    const id = Number((req.params as any).id);
    const rows = await pool.query(
      `SELECT vm.id, vm.model_id, m.name AS model_name, m.display_name, m.category,
              vm.upstream_model, vm.cost_input_price::float AS cost_input_price, vm.cost_output_price::float AS cost_output_price,
              vm.weight, vm.priority, vm.is_enabled, vm.health_score, vm.avg_latency_ms
       FROM vendor_models vm JOIN models m ON m.id = vm.model_id
       WHERE vm.vendor_id = $1 ORDER BY vm.priority DESC, vm.weight DESC`,
      [id],
    );
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });

  // 3.2 添加映射
  app.post("/admin/vendors/:id/models", { onRequest: [admin] }, async (req, reply) => {
    const vendorId = Number((req.params as any).id);
    const b = req.body as { model_id: number; upstream_model?: string; cost_input_price?: number; cost_output_price?: number; weight?: number; priority?: number; is_enabled?: boolean };
    if (!b.model_id) return reply.code(400).send({ code: 400, error: "MISSING_MODEL", message: "请选择模型" });
    // 校验供应商存在
    const v = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
    if (!v[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "供应商不存在" });
    // 校验模型存在
    const m = await db.select().from(models).where(eq(models.id, b.model_id)).limit(1);
    if (!m[0]) return reply.code(404).send({ code: 404, error: "MODEL_NOT_FOUND", message: "模型不存在" });
    // 查重
    const dup = await db.select().from(vendorModels).where(and(eq(vendorModels.vendorId, vendorId), eq(vendorModels.modelId, b.model_id))).limit(1);
    if (dup[0]) return reply.code(409).send({ code: 409, error: "DUPLICATE", message: "该模型已在此供应商下" });
    try {
      const created = await db
        .insert(vendorModels)
        .values({
          vendorId,
          modelId: b.model_id,
          upstreamModel: b.upstream_model ?? m[0].name,
          costInputPrice: String(b.cost_input_price ?? 0),
          costOutputPrice: String(b.cost_output_price ?? 0),
          weight: b.weight ?? 1,
          priority: b.priority ?? 0,
          isEnabled: b.is_enabled ?? true,
        })
        .returning({ id: vendorModels.id });
      return { code: 0, data: { id: created[0]!.id }, message: "映射已添加" };
    } catch (e: any) {
      if (e?.code === "23505") return reply.code(409).send({ code: 409, error: "DUPLICATE" });
      throw e;
    }
  });

  // 3.3 编辑映射
  app.put("/admin/vendor-models/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as { upstream_model?: string; cost_input_price?: number; cost_output_price?: number; weight?: number; priority?: number; is_enabled?: boolean };
    const upd: any = { updatedAt: new Date() };
    if (b.upstream_model != null) upd.upstreamModel = b.upstream_model;
    if (b.cost_input_price != null) upd.costInputPrice = String(b.cost_input_price);
    if (b.cost_output_price != null) upd.costOutputPrice = String(b.cost_output_price);
    if (b.weight != null) upd.weight = b.weight;
    if (b.priority != null) upd.priority = b.priority;
    if (b.is_enabled != null) upd.isEnabled = b.is_enabled;
    const r = await db.update(vendorModels).set(upd).where(eq(vendorModels.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "映射已更新" };
  });

  // 3.4 删除映射（软下线：is_enabled=false）
  app.delete("/admin/vendor-models/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const r = await db.update(vendorModels).set({ isEnabled: false, updatedAt: new Date() }).where(eq(vendorModels.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "映射已下线" };
  });
}
