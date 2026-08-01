import type { FastifyInstance } from "fastify";
import { db, pool } from "../db/index";

/**
 * 代理提现管理端（双审）
 * 对齐 flowcharts/02-agent-withdraw.md
 * 状态机: pending_first_review → pending_second_review → processing → completed
 *                     \--→ rejected
 * 双审权限: 初审/复审均需 admin 或 super_admin
 * - 初审 approve → pending_second_review
 * - 复审 approve → processing（发起打款）
 * - complete（打款成功）→ completed + 真实扣减 pending_balance
 * - transfer_failed（打款失败）→ 解冻
 * - reject（任一审拒绝）→ rejected + 解冻
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

const STATUS_LABEL: Record<string, string> = {
  pending_first_review: "待初审",
  pending_second_review: "待复审",
  processing: "打款中",
  completed: "已完成",
  rejected: "已驳回",
};

export function adminAgentWithdrawRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // ===== 1. 提现列表（状态筛选 + 分页）=====
  app.get("/admin/agent-withdrawals", { onRequest: [admin] }, async (req) => {
    const q = req.query as { page?: number; page_size?: number; status?: string; keyword?: string };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;

    let where = "WHERE 1=1";
    const whereParams: any[] = [];
    const wparam = (v: any) => { whereParams.push(v); return `$${whereParams.length}`; };
    if (q.status) where += ` AND aw.status = ${wparam(q.status)}`;
    if (q.keyword) where += ` AND (u.email ILIKE ${wparam(`%${q.keyword}%`)} OR aw.withdrawal_no ILIKE ${wparam(`%${q.keyword}%`)})`;

    const pageParams = [...whereParams, pageSize, offset];
    const rows = await pool.query(
      `SELECT aw.id, aw.user_id, aw.withdrawal_no, aw.amount::float AS amount, aw.status,
              aw.account, aw.bank, aw.account_name, aw.reject_reason, aw.created_at, aw.completed_at,
              u.email, u.username
       FROM agent_withdrawals aw JOIN users u ON u.id = aw.user_id
       ${where} ORDER BY aw.created_at DESC LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
      pageParams,
    );
    const total = await pool.query(
      `SELECT COUNT(*)::int AS total FROM agent_withdrawals aw JOIN users u ON u.id = aw.user_id ${where}`,
      whereParams,
    );

    return {
      code: 0,
      data: {
        list: rows.rows.map((r: any) => ({ ...r, status_label: STATUS_LABEL[r.status] ?? r.status })),
        pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) },
      },
      message: "ok",
    };
  });

  // ===== 2. 提现详情 =====
  app.get("/admin/agent-withdrawals/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const rows = await pool.query(
      `SELECT aw.*, u.email, u.username,
              (SELECT COUNT(*)::int FROM users c WHERE c.agent_id = aw.user_id) AS customer_count
       FROM agent_withdrawals aw JOIN users u ON u.id = aw.user_id WHERE aw.id = $1`,
      [id],
    );
    if (!rows.rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "提现记录不存在" });
    const r = rows.rows[0];
    return { code: 0, data: { ...r, amount: Number(r.amount), status_label: STATUS_LABEL[r.status] ?? r.status }, message: "ok" };
  });

  // ===== 3. 双审操作 =====
  app.post("/admin/agent-withdrawals/:id/review", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const reviewerId = Number((req as any).user.sub);
    const { action, stage, note } = req.body as { action: "approve" | "reject"; stage: "first" | "second"; note?: string };
    if (!["approve", "reject"].includes(action)) return reply.code(400).send({ code: 400, error: "BAD_ACTION" });
    if (!["first", "second"].includes(stage ?? "")) return reply.code(400).send({ code: 400, error: "BAD_STAGE" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const rows = await client.query("SELECT * FROM agent_withdrawals WHERE id = $1 FOR UPDATE", [id]);
      const w = rows.rows[0];
      if (!w) { await client.query("ROLLBACK"); return reply.code(404).send({ code: 404, error: "NOT_FOUND" }); }

      // 校验当前阶段合法性
      if (stage === "first" && w.status !== "pending_first_review") {
        await client.query("ROLLBACK");
        return reply.code(400).send({ code: 400, error: "BAD_STATE", message: `当前状态 ${w.status} 不可初审` });
      }
      if (stage === "second" && w.status !== "pending_second_review") {
        await client.query("ROLLBACK");
        return reply.code(400).send({ code: 400, error: "BAD_STATE", message: `当前状态 ${w.status} 不可复审` });
      }

      const now = new Date().toISOString();

      if (action === "reject") {
        // 驳回（佣金账户由状态聚合自动释放，无须操作用户余额）
        const upd = stage === "first"
          ? `SET status='rejected', first_reviewer_id=$2, first_review_at=$3, first_review_note=$4, reject_reason=$4, updated_at=$3`
          : `SET status='rejected', second_reviewer_id=$2, second_review_at=$3, second_review_note=$4, reject_reason=$4, updated_at=$3`;
        await client.query(`UPDATE agent_withdrawals ${upd} WHERE id=$1`, [id, reviewerId, now, note ?? "管理员驳回"]);
        await client.query("COMMIT");
        return { code: 0, data: { id, status: "rejected", message: "已驳回并解冻资金" }, message: "ok" };
      }

      // approve
      if (stage === "first") {
        await client.query(
          `UPDATE agent_withdrawals SET status='pending_second_review', first_reviewer_id=$2, first_review_at=$3, first_review_note=$4, updated_at=$3 WHERE id=$1`,
          [id, reviewerId, now, note ?? "初审通过"],
        );
        await client.query("COMMIT");
        return { code: 0, data: { id, status: "pending_second_review", message: "初审通过，进入复审" }, message: "ok" };
      }

      // 复审通过 → processing（发起打款；为本地演示直接置 completed 由前端/后续 complete 接口确认）
      await client.query(
        `UPDATE agent_withdrawals SET status='processing', second_reviewer_id=$2, second_review_at=$3, second_review_note=$4, updated_at=$3 WHERE id=$1`,
        [id, reviewerId, now, note ?? "复审通过，发起打款"],
      );
      await client.query("COMMIT");
      return { code: 0, data: { id, status: "processing", message: "复审通过，进入打款" }, message: "ok" };
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      return reply.code(500).send({ code: 500, error: "DB_ERROR", message: e?.message ?? "审核失败" });
    } finally {
      client.release();
    }
  });

  // ===== 4. 打款结果（模拟支付平台回调：成功/失败）=====
  app.post("/admin/agent-withdrawals/:id/transfer", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { result, transfer_no } = req.body as { result: "success" | "failed"; transfer_no?: string };
    if (!["success", "failed"].includes(result ?? "")) return reply.code(400).send({ code: 400, error: "BAD_RESULT" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const rows = await client.query("SELECT * FROM agent_withdrawals WHERE id = $1 FOR UPDATE", [id]);
      const w = rows.rows[0];
      if (!w) { await client.query("ROLLBACK"); return reply.code(404).send({ code: 404, error: "NOT_FOUND" }); }
      if (w.status !== "processing") { await client.query("ROLLBACK"); return reply.code(400).send({ code: 400, error: "BAD_STATE", message: `当前状态 ${w.status} 不可标记打款结果` }); }

      const now = new Date().toISOString();

      if (result === "success") {
        // 打款成功 → completed（佣金 withdrawn 由状态聚合自动计入，无须操作余额）
        await client.query(
          `UPDATE agent_withdrawals SET status='completed', transfer_no=$2, transfer_at=$3, completed_at=$3, updated_at=$3 WHERE id=$1`,
          [id, transfer_no ?? `TF${Date.now()}`, now],
        );
        await client.query("COMMIT");
        return { code: 0, data: { id, status: "completed", message: "打款成功，提现完成" }, message: "ok" };
      } else {
        // 打款失败 → rejected（佣金 pending 自动释放）
        await client.query(
          `UPDATE agent_withdrawals SET status='rejected', reject_reason='打款失败，已退回', updated_at=$2 WHERE id=$1`,
          [id, now],
        );
        await client.query("COMMIT");
        return { code: 0, data: { id, status: "rejected", message: "打款失败，已退回" }, message: "ok" };
      }
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      return reply.code(500).send({ code: 500, error: "DB_ERROR", message: e?.message ?? "打款处理失败" });
    } finally {
      client.release();
    }
  });
}
