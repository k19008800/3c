import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { redemptionBatches, redemptionCodes, redemptionLogs } from "../db/schema/redemption";
import { users } from "../db/schema/users";
import crypto from "node:crypto";

/**
 * 兑换码系统
 * 对齐 ref-4.5-marketing.md §2
 * 管理端：批次 CRUD + 生成码
 * 用户端：兑换（余额到账 + 记录）
 */

const STATUS_LABEL: Record<string, string> = { active: "有效", disabled: "停用", unused: "未使用", used: "已使用" };

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

/** 生成唯一兑换码: 3C- 前缀 + 10位大写字母数字 */
function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去易混淆
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[crypto.randomInt(chars.length)];
  return "3C-" + s;
}

export function redemptionRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);
  const admin = requireAdmin(app);

  // ============================================================
  // 用户端
  // ============================================================

  // 1. 兑换码兑换（余额到账）
  app.post("/me/redemption/redeem", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const { code } = req.body as { code?: string };
    const input = (code ?? "").trim().toUpperCase();
    if (!input) return reply.code(400).send({ code: 400, error: "MISSING_CODE", message: "请输入兑换码" });
    if (!input.startsWith("3C-")) return reply.code(400).send({ code: 400, error: "BAD_FORMAT", message: "兑换码格式不正确" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // 查码（锁行）
      const rows = await client.query("SELECT * FROM redemption_codes WHERE code=$1 FOR UPDATE", [input]);
      const row = rows.rows[0];
      if (!row) { await client.query("ROLLBACK"); return reply.code(404).send({ code: 404, error: "CODE_NOT_FOUND", message: "兑换码无效" }); }
      if (row.status === "used") { await client.query("ROLLBACK"); return reply.code(400).send({ code: 400, error: "ALREADY_USED", message: "兑换码已被使用" }); }

      // 批次校验
      const batches = await client.query("SELECT * FROM redemption_batches WHERE id=$1", [row.batch_id]);
      const batch = batches.rows[0];
      if (batch?.status !== "active") { await client.query("ROLLBACK"); return reply.code(400).send({ code: 400, error: "BATCH_DISABLED", message: "该批次已停用" }); }
      if (batch?.expires_at && new Date(batch.expires_at) < new Date()) {
        await client.query("ROLLBACK"); return reply.code(400).send({ code: 400, error: "EXPIRED", message: "兑换码已过期" });
      }

      // 用户余额（分）+ 兑换面额（元→分）
      const amt = Number(row.amount) / 100; // 注意：amount 是元，users.balance 是分 → 乘以 100
      const balanceDelta = Math.round(Number(row.amount) * 100);

      // 更新码状态 + 用户余额 + 日志 + 批次已用数
      await client.query("UPDATE redemption_codes SET status='used', used_by=$1, used_at=now() WHERE id=$2", [userId, row.id]);
      await client.query("UPDATE users SET balance = balance + $1, updated_at=now() WHERE id=$2", [balanceDelta, userId]);
      await client.query("INSERT INTO redemption_logs (code_id, user_id, batch_id, amount, code) VALUES ($1,$2,$3,$4,$5)", [row.id, userId, row.batch_id, row.amount, input]);
      await client.query("UPDATE redemption_batches SET used_count = used_count + 1 WHERE id=$1", [row.batch_id]);
      // 余额变动日志
      const uAfter = await client.query("SELECT balance FROM users WHERE id=$1", [userId]);
      await client.query("INSERT INTO balance_logs (user_id, type, amount, balance_before, balance_after, order_id, description) VALUES ($1,'promotion',$2, $3, $4, NULL, $5)", [userId, row.amount, Number(uAfter.rows[0].balance) - balanceDelta, uAfter.rows[0].balance, `兑换码 ${input}`]);

      await client.query("COMMIT");
      return { code: 0, data: { success: true, amount: amt, new_balance: Number(uAfter.rows[0].balance) / 100 }, message: `兑换成功，已到账 ¥${amt}` };
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      return reply.code(500).send({ code: 500, error: "DB_ERROR", message: e?.message ?? "兑换失败" });
    } finally {
      client.release();
    }
  });

  // 2. 兑换记录
  app.get("/me/redemption/history", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const q = req.query as { page?: number; page_size?: number };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;
    const rows = await pool.query(
      `SELECT rl.id, rl.code, rl.amount::float AS amount, rl.created_at, rb.name AS batch_name
       FROM redemption_logs rl LEFT JOIN redemption_batches rb ON rb.id = rl.batch_id
       WHERE rl.user_id=$1 ORDER BY rl.created_at DESC LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    );
    const total = await pool.query("SELECT COUNT(*)::int AS total FROM redemption_logs WHERE user_id=$1", [userId]);
    return { code: 0, data: { list: rows.rows, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) } }, message: "ok" };
  });

  // ============================================================
  // 管理端
  // ============================================================

  // 3. 批次列表
  app.get("/admin/redemption/batches", { onRequest: [admin] }, async (req) => {
    const rows = await pool.query("SELECT * FROM redemption_batches ORDER BY created_at DESC LIMIT 100");
    return { code: 0, data: { list: rows.rows.map(r => ({ ...r, amount: Number(r.amount), status_label: STATUS_LABEL[r.status] ?? r.status })) }, message: "ok" };
  });

  // 4. 创建批次 + 生成码
  app.post("/admin/redemption/batches", { onRequest: [admin] }, async (req, reply) => {
    const creatorId = Number((req as any).user.sub);
    const b = req.body as { name?: string; amount?: number; total_count?: number; expires_at?: string; note?: string };
    const amount = Math.round((Number(b.amount) || 0) * 100) / 100;
    const count = Math.min(Math.max(Number(b.total_count) || 1, 1), 10000);
    if (!b.name?.trim() || amount <= 0) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "批次名称和面额必填" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO redemption_batches (creator_id, name, amount, total_count, expires_at, note, status)
         VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING id`,
        [creatorId, b.name.trim(), amount, count, b.expires_at ? new Date(b.expires_at) : null, b.note ?? null],
      );
      const batchId = ins.rows[0].id;
      // 批量生成码（去重）
      const codes = new Set<string>();
      while (codes.size < count) codes.add(genCode());
      for (const code of Array.from(codes)) {
        await client.query("INSERT INTO redemption_codes (batch_id, code, amount, status) VALUES ($1,$2,$3,'unused')", [batchId, code, amount]);
      }
      await client.query("COMMIT");
      return { code: 0, data: { id: batchId, name: b.name.trim(), amount, count }, message: `批次已创建，生成 ${count} 个兑换码` };
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      return reply.code(500).send({ code: 500, error: "DB_ERROR", message: e?.message });
    } finally {
      client.release();
    }
  });

  // 5. 批次详情（含码列表）
  app.get("/admin/redemption/batches/:id", { onRequest: [admin] }, async (req) => {
    const id = Number((req.params as any).id);
    const b = await db.select().from(redemptionBatches).where(eq(redemptionBatches.id, id)).limit(1);
    if (!b[0]) return { code: 404, error: "NOT_FOUND" };
    const codes = await pool.query(
      `SELECT rc.id, rc.code, rc.status, rc.used_at, rc.created_at, u.email AS used_by_email
       FROM redemption_codes rc LEFT JOIN users u ON u.id = rc.used_by
       WHERE rc.batch_id=$1 ORDER BY rc.id LIMIT 500`,
      [id],
    );
    return { code: 0, data: { batch: { ...b[0], amount: Number(b[0].amount) }, codes: codes.rows }, message: "ok" };
  });

  // 6. 停用/启用批次
  app.post("/admin/redemption/batches/:id/toggle", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { status } = req.body as { status?: string };
    if (!["active", "disabled"].includes(status ?? "")) return reply.code(400).send({ code: 400, error: "BAD_STATUS" });
    const r = await db.update(redemptionBatches).set({ status, updatedAt: new Date() }).where(eq(redemptionBatches.id, id));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true }, message: "批次已更新" };
  });
}
