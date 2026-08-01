import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { db, pool } from "../db/index";
import { users } from "../db/schema/users";
import { agentProfiles } from "../db/schema/agent-profiles";

/**
 * 代理设置路由
 * 对齐 PRD-代理商体系 + ref-3-agent-system.md
 * - 每个用户可有代理档案（agent_profiles）
 * - 等级: prepare(预备)/level1(一级)/senior(高级)
 */

const LEVEL_LABEL: Record<string, string> = {
  prepare: "预备代理",
  level1: "一级代理",
  senior: "高级代理",
};
const COMMISSION_BY_LEVEL: Record<string, string> = {
  prepare: "0",
  level1: "0.10",
  senior: "0.15",
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

/** 获取或创建代理档案 */
async function getOrCreateProfile(userId: number): Promise<typeof agentProfiles.$inferSelect> {
  let prof = await db.select().from(agentProfiles).where(eq(agentProfiles.userId, userId)).limit(1);
  if (!prof[0]) {
    const created = await db
      .insert(agentProfiles)
      .values({
        userId,
        level: "prepare",
        commissionRate: COMMISSION_BY_LEVEL.prepare,
        referralCode: "REF" + crypto.randomBytes(4).toString("hex").toUpperCase(),
      })
      .returning();
    prof = created;
  }
  return prof[0]!;
}

export function meAgentRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);

  // ===== 1. 代理信息 =====
  app.get("/me/agent/profile", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const prof = await getOrCreateProfile(userId);
    return {
      code: 0,
      data: {
        level: prof.level,
        level_label: LEVEL_LABEL[prof.level] ?? prof.level,
        commission_rate: toNum(prof.commissionRate),
        verify_status: prof.verifyStatus,
        referral_code: prof.referralCode,
        withdraw_account: prof.withdrawAccount,
        withdraw_bank: prof.withdrawBank,
        withdraw_name: prof.withdrawName,
        parent_user_id: prof.parentUserId,
      },
      message: "ok",
    };
  });

  // ===== 2. 提现设置 =====
  app.put("/me/agent/withdraw-settings", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const { account, bank, name } = req.body as { account?: string; bank?: string; name?: string };
    if (!account?.trim()) {
      return reply.code(400).send({ code: 400, error: "MISSING_ACCOUNT", message: "收款账户不能为空" });
    }
    await getOrCreateProfile(userId);
    await db
      .update(agentProfiles)
      .set({ withdrawAccount: account, withdrawBank: bank ?? null, withdrawName: name ?? null, updatedAt: new Date() })
      .where(eq(agentProfiles.userId, userId));
    return { code: 0, data: { ok: true }, message: "ok" };
  });

  // ===== 3. 通知偏好 =====
  app.get("/me/agent/notif-prefs", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const prof = await getOrCreateProfile(userId);
    let prefs: Record<string, boolean> = {};
    try { prefs = JSON.parse(prof.notifPrefs ?? "{}"); } catch { /* ignore */ }
    return { code: 0, data: prefs, message: "ok" };
  });

  app.put("/me/agent/notif-prefs", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const body = req.body as Record<string, boolean>;
    await getOrCreateProfile(userId);
    await db
      .update(agentProfiles)
      .set({ notifPrefs: JSON.stringify(body), updatedAt: new Date() })
      .where(eq(agentProfiles.userId, userId));
    return { code: 0, data: { ok: true }, message: "ok" };
  });

  // ===== 4. 申请升级 =====
  app.post("/me/agent/upgrade-request", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const prof = await getOrCreateProfile(userId);
    if (prof.verifyStatus === "pending" || prof.verifyStatus === "verified") {
      return reply.code(400).send({ code: 400, error: "ALREADY", message: "已有升级申请或已通过" });
    }
    await db
      .update(agentProfiles)
      .set({ verifyStatus: "pending", updatedAt: new Date() })
      .where(eq(agentProfiles.userId, userId));
    return { code: 0, data: { ok: true }, message: "升级申请已提交，等待审核" };
  });

  // ===== 5. 佣金规则（按等级展示）=====
  app.get("/me/agent/commission-rules", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const prof = await getOrCreateProfile(userId);
    const rules = [
      { level: "prepare", label: "预备代理", rate: 0, desc: "注册+实名即可，查看规则" },
      { level: "level1", label: "一级代理", rate: 0.1, desc: "实名+资质审核" },
      { level: "senior", label: "高级代理", rate: 0.15, desc: "月调用 >100万 Token" },
    ].map((r) => ({ ...r, current: r.level === prof.level }));
    return { code: 0, data: { current_level: prof.level, rules }, message: "ok" };
  });

  // ===== 6. 提现信息汇总（含可提现余额）=====
  app.get("/me/agent/withdraw-summary", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const prof = await getOrCreateProfile(userId);

    // 下属客户数（users.agentId 指向该代理）
    const customers = await pool.query(
      "SELECT COUNT(*)::int AS c FROM users WHERE agent_id = $1",
      [userId],
    ).catch(() => ({ rows: [{ c: 0 }] }));

    // 佣金（模拟：按等级比例，从下属消费估算。生产环境应查 commission 表）
    const commissionRows = await pool.query(
      `SELECT COALESCE(SUM(actual_cost), 0)::float AS sub_consumption
       FROM billing_logs bl
       WHERE bl.user_id IN (SELECT id FROM users WHERE agent_id = $1)`,
      [userId],
    ).catch(() => ({ rows: [{ sub_consumption: 0 }] }));
    const subConsumption = toNum(commissionRows.rows[0]?.sub_consumption);
    const commission = subConsumption * toNum(prof.commissionRate);

    return {
      code: 0,
      data: {
        customer_count: customers.rows[0]?.c ?? 0,
        sub_consumption: subConsumption,
        commission_rate: toNum(prof.commissionRate),
        estimated_commission: commission,
        withdrawable: prof.level === "prepare" ? 0 : commission, // 预备不可提现
        min_withdraw: prof.level === "senior" ? 100 : 200,
        account_set: !!prof.withdrawAccount,
      },
      message: "ok",
    };
  });

  // ===== 7. 邀请裂变 =====
  app.get("/me/agent/referral", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const prof = await getOrCreateProfile(userId);
    const invite = await pool.query(
      "SELECT COUNT(*)::int AS total FROM users WHERE agent_id = $1",
      [userId],
    ).catch(() => ({ rows: [{ total: 0 }] }));
    return {
      code: 0,
      data: {
        referral_code: prof.referralCode,
        invite_url: `https://unmisa.com/register?ref=${prof.referralCode}`,
        invited_count: invite.rows[0]?.total ?? 0,
      },
      message: "ok",
    };
  });
}
