import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { agentProfiles } from "../db/schema/agent-profiles";
import { agentReportRequests } from "../db/schema/agent-report-requests";

/**
 * 代理设置路由（后台主导版）
 * 对齐 PRD-代理商体系-后台主导版.md + SPEC-代理商后台主导版.md
 * - 代理档案仅由后台「设为代理商」创建；用户端只读
 * - 无注册/升级/裂变入口
 * - 等级: prepare(预备)/level1(一级)/senior(高级)
 */

const LEVEL_LABEL: Record<string, string> = {
  prepare: "预备代理",
  level1: "一级代理",
  senior: "高级代理",
};

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

const toNum = (v: any) => (v == null ? 0 : Number(v));

/** 查询代理档案（只读）：非代理返回 null，不自动创建 */
async function getProfile(userId: number): Promise<typeof agentProfiles.$inferSelect | null> {
  const prof = await db.select().from(agentProfiles).where(eq(agentProfiles.userId, userId)).limit(1);
  return prof[0] ?? null;
}

export function meAgentRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);

  // ===== 1. 代理信息（只读；无档案返回 is_agent:false）=====
  app.get("/me/agent/profile", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const prof = await getProfile(userId);
    if (!prof) {
      return { code: 0, data: { is_agent: false, level: null, level_label: null, commission_rate: 0 }, message: "ok" };
    }
    return {
      code: 0,
      data: {
        is_agent: true,
        level: prof.level,
        level_label: LEVEL_LABEL[prof.level] ?? prof.level,
        commission_rate: toNum(prof.commissionRate),
        verify_status: prof.verifyStatus,
        referral_code: prof.referralCode,
        withdraw_account: prof.withdrawAccount,
        withdraw_bank: prof.withdrawBank,
        withdraw_name: prof.withdrawName,
      },
      message: "ok",
    };
  });

  // ===== 2. 提现设置（仅代理可用）=====
  app.put("/me/agent/withdraw-settings", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const prof = await getProfile(userId);
    if (!prof) return reply.code(403).send({ code: 403, error: "NOT_AGENT", message: "非代理商" });
    const { account, bank, name } = req.body as { account?: string; bank?: string; name?: string };
    if (!account?.trim()) {
      return reply.code(400).send({ code: 400, error: "MISSING_ACCOUNT", message: "收款账户不能为空" });
    }
    await db
      .update(agentProfiles)
      .set({ withdrawAccount: account, withdrawBank: bank ?? null, withdrawName: name ?? null, updatedAt: new Date() })
      .where(eq(agentProfiles.userId, userId));
    return { code: 0, data: { ok: true }, message: "ok" };
  });

  // ===== 3. 通知偏好（仅代理可用）=====
  app.get("/me/agent/notif-prefs", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const prof = await getProfile(userId);
    if (!prof) return reply.code(403).send({ code: 403, error: "NOT_AGENT", message: "非代理商" });
    let prefs: Record<string, boolean> = {};
    try { prefs = JSON.parse(prof.notifPrefs ?? "{}"); } catch { /* ignore */ }
    return { code: 0, data: prefs, message: "ok" };
  });

  app.put("/me/agent/notif-prefs", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const prof = await getProfile(userId);
    if (!prof) return reply.code(403).send({ code: 403, error: "NOT_AGENT", message: "非代理商" });
    const body = req.body as Record<string, boolean>;
    await db
      .update(agentProfiles)
      .set({ notifPrefs: JSON.stringify(body), updatedAt: new Date() })
      .where(eq(agentProfiles.userId, userId));
    return { code: 0, data: { ok: true }, message: "ok" };
  });

  // ===== 4. 佣金规则（纯展示，不自动建档案）=====
  app.get("/me/agent/commission-rules", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const prof = await getProfile(userId);
    const rules = [
      { level: "prepare", label: "预备代理", rate: 0, desc: "注册+实名即可，查看规则" },
      { level: "level1", label: "一级代理", rate: 0.1, desc: "实名+资质审核" },
      { level: "senior", label: "高级代理", rate: 0.15, desc: "月调用 >100万 Token" },
    ].map((r) => ({ ...r, current: prof ? r.level === prof.level : false }));
    return { code: 0, data: { current_level: prof?.level ?? null, is_agent: !!prof, rules }, message: "ok" };
  });

  // ===== 5. 报备目标客户（后台主导 · 报备划拨唯一来源）=====
  app.post(
    "/agent/reports",
    {
      onRequest: [auth],
      schema: { body: { type: "object", additionalProperties: true } },
    },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const prof = await getProfile(userId);
      if (!prof) return reply.code(403).send({ code: 403, error: "NOT_AGENT", message: "非代理商" });
      const body = req.body as { target_phone?: string; target_email?: string; target_user_id?: number; note?: string };
      const { target_phone, target_email, target_user_id, note } = body;
      if (!target_phone && !target_email && !target_user_id) {
        return reply.code(400).send({ code: 400, error: "MISSING_TARGET", message: "请提供手机号/邮箱/用户ID之一" });
      }

      // 解析目标客户（若提供 phone/email 但未注册，报备仍可挂起，审核时校验）
      let targetUserId: number | null = target_user_id ? Number(target_user_id) : null;

      // 若目标用户已存在，直接回填 target_user_id（便于审核展示归属）
      if (!targetUserId && target_email) {
        const u = await pool.query("SELECT id FROM users WHERE email=$1 LIMIT 1", [target_email]);
        if (u.rows[0]?.id) targetUserId = Number(u.rows[0].id);
      }
      if (!targetUserId && target_phone) {
        const u = await pool.query("SELECT id FROM users WHERE phone=$1 LIMIT 1", [target_phone]);
        if (u.rows[0]?.id) targetUserId = Number(u.rows[0].id);
      }

      const inserted = await db
        .insert(agentReportRequests)
        .values({
          agentUserId: userId,
          targetPhone: target_phone ?? null,
          targetEmail: target_email ?? null,
          targetUserId,
          note: note ?? null,
          status: "pending",
        })
        .returning();
      return { code: 0, data: { ok: true, report_id: inserted[0]!.id, status: "pending" }, message: "报备已提交，等待后台审核" };
    },
  );

  // ===== 6. 代理查看自己的报备记录 =====
  app.get("/agent/reports", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const prof = await getProfile(userId);
    if (!prof) return reply.code(403).send({ code: 403, error: "NOT_AGENT", message: "非代理商" });
    const rows = await pool.query(
      `SELECT arr.id, arr.target_phone, arr.target_email, arr.target_user_id, arr.note, arr.status,
              arr.reject_reason, arr.created_at, arr.audit_at,
              tu.email AS target_email_resolved, tu.username AS target_username
       FROM agent_report_requests arr
       LEFT JOIN users tu ON tu.id = arr.target_user_id
       WHERE arr.agent_user_id=$1
       ORDER BY arr.created_at DESC
       LIMIT 100`,
      [userId],
    );
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });
}
