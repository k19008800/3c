import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { agentCommissions } from "../db/schema/agent-commissions";
import { agentProfiles } from "../db/schema/agent-profiles";
import { resolveAgentByCustomerAt } from "./agent-binding";

/**
 * 代理佣金服务
 * 对齐 supplement/04-代理佣金与结算.md + PRD-代理商体系-后台主导版.md
 * 当用户消费（billing_logs settled）后，按其消费时刻归属代理的佣金率记一笔佣金
 * 归属来源 = agent_customer_bindings（报备划拨，唯一来源）
 */

/**
 * 为用户的一笔消费记录归属代理佣金
 * @returns 记入的佣金笔数（0=无归属代理或已记过）
 */
export async function recordCommissionForUser(userId: number, billingLogId: number, consumptionAmount: number, consumedAt?: Date): Promise<number> {
  if (!billingLogId || consumptionAmount <= 0) return 0;

  // 查用户消费时刻的归属代理（报备划拨制）
  const at = consumedAt ?? new Date();
  const agentId = await resolveAgentByCustomerAt(userId, at);
  if (!agentId) return 0; // 消费时刻无归属代理

  // 查代理档案（等级 + 佣金率）
  const prof = await db.select().from(agentProfiles).where(eq(agentProfiles.userId, agentId)).limit(1);
  if (!prof[0]) return 0;

  const rate = Number(prof[0].commissionRate ?? 0);
  if (rate <= 0) return 0; // 预备代理 0% 或未配置

  const commission = Math.round(consumptionAmount * rate * 10000) / 10000;
  if (commission <= 0) return 0;

  // UNIQUE(agent_id, billing_log_id) 防重：重复时忽略
  try {
    const inserted = await db
      .insert(agentCommissions)
      .values({
        agentId,
        userId,
        billingLogId,
        agentProfileId: prof[0].id,
        consumptionAmount: String(consumptionAmount),
        rate: String(rate),
        commissionAmount: String(commission),
        level: prof[0].level,
        status: "settled",
        periodDate: new Date(),
      })
      .onConflictDoNothing();
    return (inserted.rowCount ?? 0) > 0 ? 1 : 0;
  } catch {
    return 0;
  }
}

/** 聚合某代理的可提现佣金（settled - 已提现） */
export async function agentCommissionSummary(agentUserId: number): Promise<{
  total_commission: number;
  settled_commission: number;
  withdrawn_commission: number;
  available: number;
  pending_withdraw: number;
}> {
  // 累计佣金（settled）
  const comm = await pool.query(
    `SELECT COALESCE(SUM(commission_amount),0)::float AS total
     FROM agent_commissions WHERE agent_id=$1`,
    [agentUserId],
  );
  // 已提现/待提现（agent_withdrawals 中 completed+pending）
  const wd = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status='completed' THEN amount END),0)::float AS withdrawn,
       COALESCE(SUM(CASE WHEN status IN ('pending_first_review','pending_second_review','processing') THEN amount END),0)::float AS pending
     FROM agent_withdrawals WHERE user_id=$1`,
    [agentUserId],
  );
  const total = Number(comm.rows[0]?.total ?? 0);
  const withdrawn = Number(wd.rows[0]?.withdrawn ?? 0);
  const pending = Number(wd.rows[0]?.pending ?? 0);

  return {
    total_commission: Math.round(total * 100) / 100,
    settled_commission: Math.round((total - withdrawn) * 100) / 100,
    withdrawn_commission: Math.round(withdrawn * 100) / 100,
    pending_withdraw: Math.round(pending * 100) / 100,
    available: Math.round((total - withdrawn - pending) * 100) / 100,
  };
}

/** 某代理的佣金明细（分页） */
export async function agentCommissionList(agentUserId: number, page = 1, pageSize = 20): Promise<{ list: any[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const rows = await pool.query(
    `SELECT ac.id, ac.user_id, u.email AS user_email, ac.consumption_amount, ac.rate, ac.commission_amount,
            ac.level, ac.status, ac.created_at
     FROM agent_commissions ac JOIN users u ON u.id = ac.user_id
     WHERE ac.agent_id=$1 ORDER BY ac.created_at DESC LIMIT $2 OFFSET $3`,
    [agentUserId, pageSize, offset],
  );
  const total = await pool.query("SELECT COUNT(*)::int AS total FROM agent_commissions WHERE agent_id=$1", [agentUserId]);
  return { list: rows.rows.map(rank), total: Number(total.rows[0]?.total ?? 0) };
}

function rank(row: any) {
  return { ...row, consumption_amount: Number(row.consumption_amount), commission_amount: Number(row.commission_amount), rate: Number(row.rate) };
}
