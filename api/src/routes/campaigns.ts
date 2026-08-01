import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { campaigns, campaignParticipants } from "../db/schema/campaigns";
import { users } from "../db/schema/users";

/**
 * 营销活动管理
 * 对齐 ref-4.5-marketing.md §1
 * 状态机: draft → active → ended → archived
 * 活动直发余额：给目标用户发放奖励（预算内），记录参与
 */

const STATUS_LABEL: Record<string, string> = { draft: "草稿", active: "进行中", ended: "已结束", archived: "已归档" };
const TYPE_LABEL: Record<string, string> = { recharge_gift: "充值赠送", new_user: "新用户礼", discount: "折扣活动" };

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

export function campaignRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // 1. 活动列表
  app.get("/admin/campaigns", { onRequest: [admin] }, async (req) => {
    const q = req.query as { status?: string; page?: number; page_size?: number };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    if (q.status) { params.push(q.status); where += ` AND c.status = $${params.length}`; }
    params.push(pageSize, offset);
    const rows = await pool.query(
      `SELECT c.*,
              (SELECT COALESCE(SUM(cp.amount),0)::float FROM campaign_participants cp WHERE cp.campaign_id=c.id) AS issued_amount,
              (SELECT COUNT(*)::int FROM campaign_participants cp WHERE cp.campaign_id=c.id) AS participant_count,
              u.email AS created_by_email
       FROM campaigns c LEFT JOIN users u ON u.id=c.created_by ${where}
       ORDER BY c.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const total = await pool.query(`SELECT COUNT(*)::int AS total FROM campaigns c ${where}`, params.slice(0, params.length - 2));
    return {
      code: 0,
      data: { list: rows.rows.map(r => ({ ...r, budget_amount: Number(r.budget_amount), status_label: STATUS_LABEL[r.status] ?? r.status, type_label: TYPE_LABEL[r.type] ?? r.type })), pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) } },
      message: "ok",
    };
  });

  // 2. 创建活动
  app.post("/admin/campaigns", { onRequest: [admin] }, async (req, reply) => {
    const createdBy = Number((req as any).user.sub);
    const b = req.body as { name?: string; description?: string; type?: string; start_at?: string; end_at?: string; auto_end?: boolean; budget_amount?: number };
    if (!b.name?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_NAME", message: "活动名称必填" });
    const created = await db.insert(campaigns).values({
      name: b.name.trim(), description: b.description ?? null,
      type: b.type ?? "recharge_gift",
      startAt: b.start_at ? new Date(b.start_at) : null,
      endAt: b.end_at ? new Date(b.end_at) : null,
      autoEnd: b.auto_end ?? true,
      budgetAmount: String(b.budget_amount ?? 0),
      status: "draft", createdBy,
    }).returning({ id: campaigns.id });
    return { code: 0, data: { id: created[0]!.id, status: "draft" }, message: "活动已创建（草稿）" };
  });

  // 3. 更新活动
  app.put("/admin/campaigns/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as { name?: string; description?: string; type?: string; start_at?: string; end_at?: string; budget_amount?: number };
    const upd: any = { updatedAt: new Date() };
    if (b.name != null) upd.name = b.name.trim();
    if (b.description != null) upd.description = b.description;
    if (b.type != null) upd.type = b.type;
    if (b.start_at != null) upd.startAt = b.start_at ? new Date(b.start_at) : null;
    if (b.end_at != null) upd.endAt = b.end_at ? new Date(b.end_at) : null;
    if (b.budget_amount != null) upd.budgetAmount = String(b.budget_amount);
    const r = await db.update(campaigns).set(upd).where(eq(campaigns.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "活动已更新" };
  });

  // 4. 变更状态
  app.post("/admin/campaigns/:id/status", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { status } = req.body as { status?: string };
    if (!["draft", "active", "ended", "archived"].includes(status ?? "")) return reply.code(400).send({ code: 400, error: "BAD_STATUS" });
    const targetStatus = status as string;
    const r = await db.update(campaigns).set({ status: targetStatus, updatedAt: new Date() }).where(eq(campaigns.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { status: targetStatus, status_label: STATUS_LABEL[targetStatus] ?? targetStatus }, message: `已切换为${STATUS_LABEL[targetStatus] ?? targetStatus}` };
  });

  // 5. 删除活动
  app.delete("/admin/campaigns/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const r = await db.delete(campaigns).where(eq(campaigns.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "活动已删除" };
  });

  // 6. 活动详情 + 参与记录
  app.get("/admin/campaigns/:id", { onRequest: [admin] }, async (req) => {
    const id = Number((req.params as any).id);
    const c = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!c[0]) return { code: 404, error: "NOT_FOUND" };
    const parts = await pool.query(
      `SELECT cp.user_id, u.email, u.username, cp.amount::float AS amount, cp.trigger_type, cp.created_at
       FROM campaign_participants cp JOIN users u ON u.id=cp.user_id
       WHERE cp.campaign_id=$1 ORDER BY cp.created_at DESC LIMIT 100`, [id]);
    return {
      code: 0,
      data: {
        campaign: { ...c[0], budget_amount: Number(c[0].budgetAmount), status_label: STATUS_LABEL[c[0].status] ?? c[0].status, type_label: TYPE_LABEL[c[0].type] ?? c[0].type },
        participants: parts.rows,
      },
      message: "ok",
    };
  });

  // 7. 发放活动奖励（指定用户 + 金额，预算内）
  app.post("/admin/campaigns/:id/grant", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as { user_id?: number; amount?: number; trigger_type?: string };
    const amount = Math.round((Number(b.amount) || 0) * 100) / 100;
    if (!b.user_id || amount <= 0) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "用户和金额必填" });

    const c = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!c[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (c[0].status !== "active") return reply.code(400).send({ code: 400, error: "NOT_ACTIVE", message: "仅进行中的活动可发放" });

    // 预算校验
    const used = await pool.query("SELECT COALESCE(SUM(amount),0)::float AS used FROM campaign_participants WHERE campaign_id=$1", [id]);
    const usedAmt = Number(used.rows[0]?.used ?? 0);
    const budget = Number(c[0].budgetAmount ?? 0);
    if (budget > 0 && usedAmt + amount > budget) {
      return reply.code(400).send({ code: 400, error: "BUDGET_EXCEEDED", message: `预算超限：已用 ¥${usedAmt.toFixed(2)}，剩余 ¥${(budget - usedAmt).toFixed(2)}` });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE users SET balance = balance + $1, updated_at=now() WHERE id=$2", [Math.round(amount * 100), b.user_id]);
      await client.query("INSERT INTO campaign_participants (campaign_id, user_id, amount, trigger_type) VALUES ($1,$2,$3,$4)", [id, b.user_id, amount, b.trigger_type ?? "activity"]);
      const u = await client.query("SELECT balance FROM users WHERE id=$1", [b.user_id]);
      await client.query("INSERT INTO balance_logs (user_id, type, amount, balance_before, balance_after, description) VALUES ($1,'promotion',$2,$3,$4,$5)", [b.user_id, amount, Number(u.rows[0].balance) - Math.round(amount * 100), u.rows[0].balance, `活动[${c[0].name}]发放`]);
      await client.query("COMMIT");
      return { code: 0, data: { ok: true, amount }, message: `已发放 ¥${amount}` };
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      return reply.code(500).send({ code: 500, error: "DB_ERROR", message: e?.message });
    } finally {
      client.release();
    }
  });

  // 8. 统计
  app.get("/admin/campaigns/:id/stats", { onRequest: [admin] }, async (req) => {
    const id = Number((req.params as any).id);
    const r = await pool.query(
      `SELECT COUNT(DISTINCT user_id)::int AS participants, COUNT(*)::int AS grants, COALESCE(SUM(amount),0)::float AS total_amount
       FROM campaign_participants WHERE campaign_id=$1`, [id]);
    return { code: 0, data: { ...r.rows[0], total_amount: Number(r.rows[0]?.total_amount ?? 0) }, message: "ok" };
  });
}
