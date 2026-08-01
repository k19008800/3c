import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { db, pool } from "../db/index";
import { users } from "../db/schema/users";
import { agentProfiles } from "../db/schema/agent-profiles";
import { agentReportRequests } from "../db/schema/agent-report-requests";
import { transferCustomer, unbindCustomer } from "../services/agent-binding";

/**
 * 代理管理审核端（管理后台）
 * 对齐 PRD-代理商体系-后台主导版.md + SPEC-代理商后台主导版.md（D1-D8）
 * - 代理列表/详情
 * - 设为代理商（后台授权创建，无用户自助入口）
 * - 等级调整
 * - 报备审核队列 + 审核通过自动划拨
 * - 客户归属管理（列表/日志/解绑/手动转移）
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
              ap.referral_code, ap.withdraw_account, ap.created_by_admin_id,
              u.email, u.username, u.real_name_status, u.created_at, u.balance,
              (SELECT COUNT(*)::int FROM agent_customer_bindings acb WHERE acb.agent_user_id = u.id AND acb.status='active') AS customer_count
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
    const customers = await pool.query(
      "SELECT cu.id, cu.email, cu.username, cu.phone, cu.balance, cu.created_at FROM agent_customer_bindings acb JOIN users cu ON cu.id=acb.customer_user_id WHERE acb.agent_user_id=$1 AND acb.status='active' ORDER BY acb.bound_at DESC LIMIT 50",
      [userId],
    );

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

  // ===================== 后台主导版（报备划拨制）新增 =====================

  // ===== 6. 设为代理商（后台报备创建）D：用户无自助入口 =====
  app.post(
    "/admin/agents/assign",
    {
      onRequest: [admin],
      schema: { body: { type: "object", additionalProperties: true } },
    },
    async (req, reply) => {
      const body = req.body as { userId?: number; level?: string; commissionRate?: number };
      const userId = Number(body.userId);
      const level = body.level ?? "level1";
      const rateMap: Record<string, string> = { prepare: "0", level1: "0.10", senior: "0.15" };
      if (!userId) return reply.code(400).send({ code: 400, error: "MISSING_USER", message: "缺少目标用户" });
      if (!rateMap[level]) return reply.code(400).send({ code: 400, error: "BAD_LEVEL", message: "无效等级" });
      const adminId = Number((req as any).user.sub);

      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "目标用户不存在" });

      const commissionRate = body.commissionRate != null ? String(body.commissionRate) : rateMap[level];
      const exist = await db.select().from(agentProfiles).where(eq(agentProfiles.userId, userId)).limit(1);
      if (exist[0]) {
        // 已是代理：仅更新等级/佣金率/操作人
        await db
          .update(agentProfiles)
          .set({ level, commissionRate, verifyStatus: "verified", createdByAdminId: adminId, updatedAt: new Date() })
          .where(eq(agentProfiles.userId, userId));
        return { code: 0, data: { ok: true, created: false, userId, level, commission_rate: Number(commissionRate) }, message: "已更新代理商档案" };
      }

      const created = await db
        .insert(agentProfiles)
        .values({
          userId,
          level,
          commissionRate,
          verifyStatus: "verified",
          createdByAdminId: adminId,
          referralCode: "REF" + crypto.randomBytes(4).toString("hex").toUpperCase(),
        })
        .returning();
      return { code: 0, data: { ok: true, created: true, userId, level, commission_rate: Number(commissionRate), id: created[0]!.id }, message: "已设为代理商" };
    },
  );

  // ===== 7. 报备审核队列 =====
  app.get("/admin/agent-reports", { onRequest: [admin] }, async (req) => {
    const q = req.query as { status?: string; page?: number; page_size?: number };
    const status = q.status ?? "pending";
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;
    const where = status === "all" ? "WHERE 1=1" : `WHERE arr.status = $1`;
    const params: any[] = status === "all" ? [] : [status];
    const rows = await pool.query(
      `SELECT arr.id, arr.agent_user_id, arr.target_phone, arr.target_email, arr.target_user_id, arr.note,
              arr.status, arr.reject_reason, arr.audit_at, arr.created_at,
              au.email AS agent_email, au.username AS agent_username,
              tu.email AS target_email_user, tu.username AS target_username,
              (SELECT agent_user_id FROM agent_customer_bindings acb
                WHERE acb.customer_user_id=arr.target_user_id AND acb.status='active' LIMIT 1) AS current_agent
       FROM agent_report_requests arr
       JOIN users au ON au.id = arr.agent_user_id
       LEFT JOIN users tu ON tu.id = arr.target_user_id
       ${where}
       ORDER BY arr.created_at ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );
    const total = await pool.query(
      `SELECT COUNT(*)::int AS total FROM agent_report_requests arr ${where}`,
      params,
    );
    return {
      code: 0,
      data: { list: rows.rows, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) } },
      message: "ok",
    };
  });

  // ===== 8. 审核报备（通过 → 自动划拨 D3）=====
  app.post(
    "/admin/agent-reports/:id/audit",
    {
      onRequest: [admin],
      schema: { body: { type: "object", additionalProperties: true } },
    },
    async (req, reply) => {
      const id = Number((req.params as any).id);
      const body = req.body as { action?: "pass" | "reject"; reason?: string };
      const action = body.action;
      const adminId = Number((req as any).user.sub);
      if (!["pass", "reject"].includes(action ?? "")) {
        return reply.code(400).send({ code: 400, error: "BAD_ACTION", message: "action 只能为 pass/reject" });
      }
      const rep = await db.select().from(agentReportRequests).where(eq(agentReportRequests.id, id)).limit(1);
      if (!rep[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "报备不存在" });
      if (rep[0].status !== "pending") return reply.code(400).send({ code: 400, error: "ALREADY", message: "该报备已处理" });

      if (action === "reject") {
        await db
          .update(agentReportRequests)
          .set({ status: "rejected", rejectReason: body.reason ?? null, auditOperatorId: adminId, auditAt: new Date() })
          .where(eq(agentReportRequests.id, id));
        return { code: 0, data: { ok: true, status: "rejected" }, message: "已驳回" };
      }

      // pass → 解析目标客户 → 自动划拨
      let customerUserId = rep[0].targetUserId;
      if (!customerUserId) {
        if (rep[0].targetPhone) {
          const u = await pool.query("SELECT id FROM users WHERE phone=$1 LIMIT 1", [rep[0].targetPhone]);
          customerUserId = u.rows[0]?.id ?? null;
        } else if (rep[0].targetEmail) {
          const u = await pool.query("SELECT id FROM users WHERE email=$1 LIMIT 1", [rep[0].targetEmail]);
          customerUserId = u.rows[0]?.id ?? null;
        }
      }
      if (!customerUserId) {
        return reply.code(400).send({ code: 400, error: "CUSTOMER_NOT_FOUND", message: "目标客户未注册，无法划拨" });
      }

      const result = await transferCustomer({
        customerUserId: Number(customerUserId),
        toAgentUserId: rep[0].agentUserId,
        operatorId: adminId,
        reason: `报备划拨 #${id}`,
      });

      await db
        .update(agentReportRequests)
        .set({ status: "passed", targetUserId: Number(customerUserId), auditOperatorId: adminId, auditAt: new Date() })
        .where(eq(agentReportRequests.id, id));

      return {
        code: 0,
        data: { ok: true, status: "passed", action: result.action, customer_user_id: Number(customerUserId) },
        message: "已通过并自动划拨",
      };
    },
  );

  // ===== 9. 客户归属列表 =====
  app.get("/admin/agent-customers", { onRequest: [admin] }, async (req) => {
    const q = req.query as { agent_user_id?: number; keyword?: string; page?: number; page_size?: number };
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.page_size ?? 20), 100);
    const offset = (page - 1) * pageSize;
    let where = "WHERE acb.status='active'";
    const params: any[] = [];
    const wp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.agent_user_id) where += ` AND acb.agent_user_id=${wp(Number(q.agent_user_id))}`;
    if (q.keyword) {
      where += ` AND (cu.email ILIKE ${wp(`%${q.keyword}%`)} OR cu.username ILIKE ${wp(`%${q.keyword}%`)} OR cu.phone ILIKE ${wp(`%${q.keyword}%`)})`;
    }
    const rows = await pool.query(
      `SELECT acb.id, acb.agent_user_id, acb.customer_user_id, acb.bound_at, acb.operator_id,
              au.email AS agent_email, au.username AS agent_username,
              cu.email AS customer_email, cu.username AS customer_username, cu.phone AS customer_phone
       FROM agent_customer_bindings acb
       JOIN users au ON au.id = acb.agent_user_id
       JOIN users cu ON cu.id = acb.customer_user_id
       ${where}
       ORDER BY acb.bound_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );
    const total = await pool.query(`SELECT COUNT(*)::int AS total FROM agent_customer_bindings acb ${where}`, params);
    return {
      code: 0,
      data: { list: rows.rows, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.total ?? 0) } },
      message: "ok",
    };
  });

  // ===== 10. 客户归属审计日志 =====
  app.get("/admin/agent-customers/:id/logs", { onRequest: [admin] }, async (req) => {
    const customerUserId = Number((req.params as any).id);
    const rows = await pool.query(
      `SELECT abl.id, abl.customer_user_id, abl.from_agent_user_id, abl.to_agent_user_id, abl.action,
              abl.operator_id, abl.reason, abl.created_at,
              fu.email AS from_email, tu.email AS to_email, ou.email AS operator_email
       FROM agent_binding_logs abl
       LEFT JOIN users fu ON fu.id = abl.from_agent_user_id
       LEFT JOIN users tu ON tu.id = abl.to_agent_user_id
       LEFT JOIN users ou ON ou.id = abl.operator_id
       WHERE abl.customer_user_id=$1
       ORDER BY abl.created_at DESC
       LIMIT 200`,
      [customerUserId],
    );
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });

  // ===== 11. 解除客户归属 =====
  app.post(
    "/admin/agent-customers/:id/unbind",
    {
      onRequest: [admin],
      schema: { body: { type: "object", additionalProperties: true } },
    },
    async (req, reply) => {
      const customerUserId = Number((req.params as any).id);
      const body = (req.body ?? {}) as { reason?: string };
      const adminId = Number((req as any).user.sub);
      const result = await unbindCustomer({ customerUserId, operatorId: adminId, reason: body.reason });
      if (!result.fromAgentUserId) return reply.code(400).send({ code: 400, error: "NO_BINDING", message: "该客户当前无归属" });
      return { code: 0, data: { ok: true, from_agent_user_id: result.fromAgentUserId }, message: "已解除归属" };
    },
  );

  // ===== 12. 手动转移归属（备用能力；自动划拨复用同一事务）=====
  app.post(
    "/admin/agent-customers/:id/transfer",
    {
      onRequest: [admin],
      schema: { body: { type: "object", additionalProperties: true } },
    },
    async (req, reply) => {
      const customerUserId = Number((req.params as any).id);
      const body = req.body as { to_agent_user_id?: number; reason?: string };
      const toAgentUserId = Number(body.to_agent_user_id);
      const adminId = Number((req as any).user.sub);
      if (!toAgentUserId) return reply.code(400).send({ code: 400, error: "MISSING_TARGET", message: "缺少目标代理" });
      const prof = await db.select().from(agentProfiles).where(eq(agentProfiles.userId, toAgentUserId)).limit(1);
      if (!prof[0]) return reply.code(400).send({ code: 400, error: "NOT_AGENT", message: "目标用户不是代理" });
      const result = await transferCustomer({ customerUserId, toAgentUserId, operatorId: adminId, reason: body.reason ?? "手动转移" });
      return {
        code: 0,
        data: { ok: true, action: result.action, from_agent_user_id: result.fromAgentUserId, to_agent_user_id: toAgentUserId },
        message: "已转移归属",
      };
    },
  );
}
