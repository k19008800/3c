import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { users } from "../db/schema/users";
import { agentProfiles } from "../db/schema/agent-profiles";

/**
 * 代理管理审核端（管理后台）
 * 对齐 PRD-代理商体系 §3.1 三级审核制
 * - 代理列表/详情
 * - 升级申请审核（approve/reject）
 * - 等级调整
 * - 下属客户查看
 * 权限：需要 admin / super_admin 角色
 */

const LEVEL_LABEL: Record<string, string> = {
  prepare: "预备代理",
  level1: "一级代理",
  senior: "高级代理",
};

function requireAdmin(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      // 校验角色
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

const toNum = (v: any) => (v == null ? 0 : Number(v));

export function adminAgentRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // ===== 1. 代理列表（分页 + 筛选）=====
  app.get("/admin/agents", { onRequest: [admin] }, async (req) => {
    const q = req.query as { page?: number; page_size?: number; level?: string; verify_status?: string; keyword?: string };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;

    let where = "WHERE 1=1";
    const whereParams: any[] = [];
    const wp = (v: any) => { whereParams.push(v); return `$${whereParams.length}`; };

    if (q.level) { where += ` AND ap.level = ${wp(q.level)}`; }
    if (q.verify_status) { where += ` AND ap.verify_status = ${wp(q.verify_status)}`; }
    if (q.keyword) {
      where += ` AND (u.email ILIKE ${wp(`%${q.keyword}%`)} OR u.username ILIKE ${wp(`%${q.keyword}%`)} OR ap.referral_code ILIKE ${wp(`%${q.keyword}%`)})`;
    }

    // 查代理档案 + 关联用户 + 下属客户数（独立分页参数）
    const rows = await pool.query(
      `SELECT ap.id, ap.user_id, ap.level, ap.commission_rate::float AS commission_rate, ap.verify_status,
              ap.referral_code, ap.withdraw_account, ap.parent_user_id,
              u.email, u.username, u.real_name_status, u.created_at, u.balance,
              (SELECT COUNT(*)::int FROM users c WHERE c.agent_id = u.id) AS customer_count
       FROM agent_profiles ap
       JOIN users u ON u.id = ap.user_id
       ${where}
       ORDER BY ap.created_at DESC
       LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
      [...whereParams, pageSize, offset],
    );

    const total = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM agent_profiles ap JOIN users u ON u.id = ap.user_id ${where}`,
      whereParams,
    );

    return {
      code: 0,
      data: {
        list: rows.rows.map((r: any) => ({
          ...r,
          level_label: LEVEL_LABEL[r.level] ?? r.level,
        })),
        pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) },
      },
      message: "ok",
    };
  });

  // ===== 2. 代理详情 =====
  app.get("/admin/agents/:userId", { onRequest: [admin] }, async (req, reply) => {
    const userId = Number((req.params as any).userId);
    const prof = await db.select().from(agentProfiles).where(eq(agentProfiles.userId, userId)).limit(1);
    if (!prof[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "该用户不是代理" });

    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const customers = await pool.query("SELECT id, email, username, balance, created_at FROM users WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 50", [userId]);

    return {
      code: 0,
      data: {
        profile: {
          ...prof[0],
          commission_rate: toNum(prof[0].commissionRate),
          level_label: LEVEL_LABEL[prof[0].level] ?? prof[0].level,
        },
        user: u[0] ? { id: u[0].id, email: u[0].email, username: u[0].username, role: u[0].role, balance: u[0].balance, real_name_status: u[0].realNameStatus, created_at: u[0].createdAt } : null,
        customers: customers.rows,
      },
      message: "ok",
    };
  });

  // ===== 3. 升级审核 =====
  app.post("/admin/agents/:userId/audit", { onRequest: [admin] }, async (req, reply) => {
    const userId = Number((req.params as any).userId);
    const { action, note } = req.body as { action: "approve" | "reject"; note?: string };
    if (!["approve", "reject"].includes(action)) {
      return reply.code(400).send({ code: 400, error: "BAD_ACTION", message: "action 只能为 approve/reject" });
    }

    const prof = await db.select().from(agentProfiles).where(eq(agentProfiles.userId, userId)).limit(1);
    if (!prof[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });

    if (action === "approve") {
      // 升级为一级代理，佣金率 10%
      await db
        .update(agentProfiles)
        .set({ level: "level1", commissionRate: "0.10", verifyStatus: "verified", updatedAt: new Date() })
        .where(eq(agentProfiles.userId, userId));
      return { code: 0, data: { ok: true, level: "level1", message: "已升级为一级代理" }, message: "ok" };
    } else {
      await db
        .update(agentProfiles)
        .set({ verifyStatus: "rejected", updatedAt: new Date() })
        .where(eq(agentProfiles.userId, userId));
      return { code: 0, data: { ok: true, level: prof[0].level, message: note ?? "已驳回升级申请" }, message: "ok" };
    }
  });

  // ===== 4. 等级调整（手动设置）=====
  app.put("/admin/agents/:userId/level", { onRequest: [admin] }, async (req, reply) => {
    const userId = Number((req.params as any).userId);
    const { level } = req.body as { level?: string };
    if (!["prepare", "level1", "senior"].includes(level ?? "")) {
      return reply.code(400).send({ code: 400, error: "BAD_LEVEL" });
    }
    // 各级默认佣金率
    const rate: Record<string, string> = { prepare: "0", level1: "0.10", senior: "0.15" };
    const r = await db.update(agentProfiles).set({ level, commissionRate: rate[level!], updatedAt: new Date() }).where(eq(agentProfiles.userId, userId));
    if ((r.rowCount ?? 0) === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { ok: true, level, commission_rate: Number(rate[level!]) }, message: "ok" };
  });

  // ===== 5. 待审核申请列表（升级申请 pending）=====
  app.get("/admin/agents/pending", { onRequest: [admin] }, async (_req) => {
    const rows = await pool.query(
      `SELECT ap.user_id, ap.level, ap.commission_rate::float AS commission_rate, ap.referral_code, ap.created_at,
              u.email, u.username, u.real_name_status
       FROM agent_profiles ap JOIN users u ON u.id = ap.user_id
       WHERE ap.verify_status = 'pending'
       ORDER BY ap.created_at ASC`,
    );
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });
}
