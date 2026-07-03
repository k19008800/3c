// 检查特定代理商的佣金状态和余额
import { createDb, closeDb } from "../db/index.js";
import { sql } from "drizzle-orm";

async function main() {
  const db = createDb();
  const email = "13819008800@163.com";

  console.log(`\n🔍 检查代理商: ${email}\n`);

  // 1. 查用户
  const [user] = (await db.execute(sql`
    SELECT id, email, nickname, role, balance
    FROM users WHERE email = ${email}
  `)).rows;

  if (!user) {
    console.log("❌ 用户不存在");
    await closeDb();
    process.exit(0);
    return;
  }
  console.log(`用户: ID=${user.id}, ${user.email}, role=${user.role}, balance=${user.balance}`);

  // 2. 查代理商
  const [agent] = (await db.execute(sql`
    SELECT a.*, u.email, u.nickname
    FROM agents a JOIN users u ON a.user_id = u.id
    WHERE a.user_id = ${user.id}
  `)).rows;

  if (!agent) {
    console.log("❌ 不是代理商");
    await closeDb();
    process.exit(0);
    return;
  }
  console.log(`代理商: ID=${agent.id}, status=${agent.status}`);
  console.log(`  total_commission=${agent.total_commission}`);
  console.log(`  settled_commission=${agent.settled_commission}`);
  console.log(`  pending_withdraw=${agent.pending_withdraw}`);
  console.log(`  frozen_amount=${agent.frozen_amount}`);

  // 3. 查佣金流水
  const commissions = (await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'pending')::int AS pending_count,
      count(*) FILTER (WHERE status = 'settled')::int AS settled_count,
      count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
      coalesce(sum(commission_amount) FILTER (WHERE status = 'pending'), 0)::numeric(18,6) AS pending_amount,
      coalesce(sum(commission_amount) FILTER (WHERE status = 'settled'), 0)::numeric(18,6) AS settled_amount
    FROM commission_logs
    WHERE agent_id = ${agent.id}
  `)).rows[0] ?? {};

  console.log(`\n佣金记录:`);
  console.log(`  总计: ${commissions.total} 条`);
  console.log(`  待结算: ${commissions.pending_count} 条, 金额 ${commissions.pending_amount}`);
  console.log(`  已结算: ${commissions.settled_count} 条, 金额 ${commissions.settled_amount}`);
  console.log(`  已作废: ${commissions.cancelled_count} 条`);

  // 4. 按类型分组
  const byType = (await db.execute(sql`
    SELECT
      commission_type,
      count(*)::int AS cnt,
      sum(commission_amount)::numeric(18,6) AS total_amount
    FROM commission_logs
    WHERE agent_id = ${agent.id} AND status = 'pending'
    GROUP BY commission_type
  `)).rows;

  if (byType.length > 0) {
    console.log(`\n待结算佣金按类型:`);
    for (const r of byType) {
      console.log(`  ${r.commission_type}: ${r.cnt} 条, ¥${r.total_amount}`);
    }
  }

  // 5. 查提现记录
  const withdraws = (await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'paid')::int AS paid_count,
      count(*) FILTER (WHERE status NOT IN ('paid', 'rejected'))::int AS pending_count,
      coalesce(sum(actual_amount), 0)::numeric(18,6) AS paid_total
    FROM withdraw_orders
    WHERE agent_id = ${agent.id}
  `)).rows[0] ?? {};

  console.log(`\n提现记录:`);
  console.log(`  总计: ${withdraws.total} 笔`);
  console.log(`  已打款: ${withdraws.paid_count} 笔, ¥${withdraws.paid_total}`);
  console.log(`  处理中: ${withdraws.pending_count} 笔`);

  // 6. 查 rollup
  const rollup = (await db.execute(sql`
    SELECT count(*)::int AS cnt,
           sum(pending_count)::int AS total_pending,
           sum(settled_count)::int AS total_settled,
           sum(pending_amount)::numeric(18,6) AS pending_amount
    FROM commission_daily_rollup
    WHERE agent_id = ${agent.id}
  `)).rows[0] ?? {};

  console.log(`\nrollup 汇总:`);
  console.log(`  行数: ${rollup.cnt}, 待结算行: ${rollup.total_pending}, 已结算行: ${rollup.total_settled}`);
  console.log(`  rollup 待结算金额: ¥${rollup.pending_amount}`);

  // 7. 已提现 + 冻结的汇总
  console.log(`\n资金校验:`);
  console.log(`  agents.settled_commission = ${agent.settled_commission}`);
  console.log(`  - withdrawn = ${withdraws.paid_total}`);
  console.log(`  - pending_withdraw = ${agent.pending_withdraw}`);
  console.log(`  - frozen = ${agent.frozen_amount}`);
  const avail = Number(agent.settled_commission) - Number(withdraws.paid_total) - Number(agent.pending_withdraw) - Number(agent.frozen_amount);
  console.log(`  = available ≈ ¥${avail.toFixed(6)}`);

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error("检查失败:", err);
  process.exit(1);
});
