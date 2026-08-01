import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db, pool } from "../db/index";
import { users } from "../db/schema/users";
import { agentProfiles } from "../db/schema/agent-profiles";
import { agentWithdrawals } from "../db/schema/agent-withdrawals";

/**
 * 代理提现（代理端）
 * 对齐 PRD-代理商体系 §3.4 + flowcharts/02-agent-withdraw.md
 * - 提交提现：校验可提现余额 + 冻结到 pending_balance + 创建提现单（pending_first_review）
 * - 我的提现记录
 * 冻结模型：balance(可用) - amount → pending_balance + amount
 *   审核拒绝/打款失败 → 解冻（pending_balance - amount, balance + amount）
 *   打款完成 → 真实扣减（pending_balance - amount）
 */

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

const STATUS_LABEL: Record<string, string> = {
  pending_first_review: "待初审",
  pending_second_review: "待复审",
  processing: "打款中",
  completed: "已完成",
  rejected: "已驳回",
};

function genWithdrawalNo(): string {
  const d = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `WD${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${Math.floor(Math.random() * 10000)}`;
}

export function meAgentWithdrawRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);

  // ===== 1. 提交提现申请 =====
  app.post(
    "/me/agent/withdraw",
    { onRequest: [auth] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const { amount } = req.body as { amount?: number };

      // 校验金额
      const amt = Math.round((Number(amount) || 0) * 10000) / 10000;
      if (amt <= 0) return reply.code(400).send({ code: 400, error: "INVALID_AMOUNT", message: "提现金额无效" });
      const prof = await db.select().from(agentProfiles).where(eq(agentProfiles.userId, userId)).limit(1);
      if (!prof[0]) return reply.code(403).send({ code: 403, error: "NOT_AGENT", message: "请先开通代理" });
      if (prof[0].level === "prepare") return reply.code(403).send({ code: 403, error: "PREPARE_NO_WITHDRAW", message: "预备代理不可提现" });
      if (!prof[0].withdrawAccount) return reply.code(400).send({ code: 400, error: "NO_ACCOUNT", message: "请先设置收款账户" });

      // 等级最低提现额
      const minWithdraw = prof[0].level === "senior" ? 100 : 200;
      if (amt < minWithdraw) return reply.code(400).send({ code: 400, error: "BELOW_MIN", message: `最低提现金额为 ¥${minWithdraw}` });

      // 24h cooldown：同一用户最近一次提现审核通过/完成后的间隔
      const last = await pool.query(
        `SELECT MAX(created_at) AS last_at FROM agent_withdrawals
         WHERE user_id = $1 AND created_at > now() - interval '24 hours'`,
        [userId],
      );
      if (last.rows[0]?.last_at) {
        return reply.code(429).send({ code: 429, error: "COOLDOWN", message: "24 小时内只能提交一次提现申请" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // 行锁读取用户余额
        const u = await client.query("SELECT balance FROM users WHERE id = $1 FOR UPDATE", [userId]);
        const balance = Number(u.rows[0]?.balance ?? 0);
        // 可提现余额 = 总余额 - 已冻结 (pending_balance)
        const available = balance - Number(u.rows[0]?.pending_balance ?? 0);
        if (available < amt * 100) {
          await client.query("ROLLBACK");
          return reply.code(400).send({ code: 400, error: "INSUFFICIENT", message: `可提现余额不足，当前可提 ¥${(available / 100).toFixed(4)}` });
        }

        const amountCents = Math.round(amt * 100);
        // 冻结：balance - amount, pending_balance + amount
        await client.query("UPDATE users SET balance = balance - $2, pending_balance = pending_balance + $2, updated_at = now() WHERE id = $1", [userId, amountCents]);

        const no = genWithdrawalNo();
        const ins = await client.query(
          `INSERT INTO agent_withdrawals (user_id, agent_profile_id, withdrawal_no, amount, account, bank, account_name, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_first_review') RETURNING *`,
          [userId, prof[0].id, no, amt, prof[0].withdrawAccount, prof[0].withdrawBank ?? null, prof[0].withdrawName ?? null],
        );
        await client.query("COMMIT");
        return { code: 0, data: { id: ins.rows[0].id, withdrawal_no: no, amount: amt, status: "pending_first_review", status_label: STATUS_LABEL.pending_first_review }, message: "提现申请已提交，待审核" };
      } catch (e: any) {
        await client.query("ROLLBACK").catch(() => {});
        return reply.code(500).send({ code: 500, error: "DB_ERROR", message: e?.message ?? "提交失败" });
      } finally {
        client.release();
      }
    },
  );

  // ===== 2. 我的提现记录 =====
  app.get("/me/agent/withdrawals", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const q = req.query as { page?: number; page_size?: number; status?: string };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;

    let where = "WHERE user_id = $1";
    const params: any[] = [userId];
    if (q.status) { params.push(q.status); where += ` AND status = $${params.length}`; }

    const rows = await pool.query(
      `SELECT id, withdrawal_no, amount::float AS amount, status, reject_reason, first_review_note, second_review_note,
              transfer_no, created_at, completed_at
       FROM agent_withdrawals ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );
    const total = await pool.query(`SELECT COUNT(*)::int AS total FROM agent_withdrawals ${where}`, params);

    return {
      code: 0,
      data: {
        list: rows.rows.map((r: any) => ({ ...r, status_label: STATUS_LABEL[r.status] ?? r.status })),
        pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) },
      },
      message: "ok",
    };
  });

  // ===== 3. 提现汇总（含冻结额，供余额卡展示）=====
  app.get("/me/agent/withdraw-summary", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const prof = await db.select().from(agentProfiles).where(eq(agentProfiles.userId, userId)).limit(1);

    // 可提现 = balance - pending_balance（单位分）
    const balance = Number(u[0]?.balance ?? 0);
    const pending = Number(u[0]?.pendingBalance ?? 0);
    const withdrawable = (balance - pending) / 100;

    // 统计进行中的提现（待审核/打款中）
    const active = await pool.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount),0)::float AS sum_amount
       FROM agent_withdrawals WHERE user_id = $1 AND status IN ('pending_first_review','pending_second_review','processing')`,
      [userId],
    );

    return {
      code: 0,
      data: {
        balance: balance / 100,
        pending: pending / 100,
        withdrawable,
        active_withdraw: Number(active.rows[0]?.n ?? 0),
        active_amount: Number((active.rows[0]?.sum_amount) ?? 0),
        min_withdraw: prof[0]?.level === "senior" ? 100 : 200,
        account_set: !!prof[0]?.withdrawAccount,
        level: prof[0]?.level,
      },
      message: "ok",
    };
  });
}
