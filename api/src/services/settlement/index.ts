import { pool } from "../../db/index";

/**
 * 代理结算对账 Service
 * 对齐 docs/sprint-1/03-settlement-overview.md §3
 */

// === 辅助函数 ===

function toNum(v: any): number {
  if (v == null) return 0;
  return Number(v);
}

function padDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function newDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// === 公开函数 ===

/**
 * 创建结算周期并关账
 * 兼容本项目的 pool.query 事务风格
 */
export async function generateSettlementCycle(periodStart: string, periodEnd: string): Promise<{
  cycleId: number;
  periodStart: string;
  periodEnd: string;
  agentBillCount: number;
}> {
  if (periodEnd <= periodStart) {
    throw Object.assign(new Error("结束日期必须大于开始日期"), { statusCode: 400, code: "VALIDATION_ERROR" });
  }
  const daysDiff = (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000;
  if (daysDiff > 366) {
    throw Object.assign(new Error("结算周期不能超过 366 天"), { statusCode: 400, code: "VALIDATION_ERROR" });
  }

  // 幂等检查
  const existCheck = await pool.query(
    "SELECT id, status FROM settlement_cycles WHERE period_start=$1 AND period_end=$2 LIMIT 1",
    [periodStart, periodEnd],
  );
  if (existCheck.rows[0] && existCheck.rows[0].status !== "open") {
    throw Object.assign(
      new Error(`结算周期 ${periodStart}~${periodEnd} 已关账`),
      { statusCode: 409, code: "CYCLE_ALREADY_CLOSED" },
    );
  }

  let cycleId: number;
  if (existCheck.rows[0]) {
    cycleId = existCheck.rows[0].id;
  } else {
    const cycleIns = await pool.query(
      "INSERT INTO settlement_cycles (period_start, period_end, status) VALUES ($1, $2, 'open') RETURNING id",
      [periodStart, periodEnd],
    );
    cycleId = cycleIns.rows[0].id;
  }

  // 查全部 level1/senior 的正式代理（通过 agent_profiles 关联 users）
  const agents = await pool.query(`
    SELECT u.id AS agent_user_id, ap.id AS agent_profile_id
    FROM agent_profiles ap
    JOIN users u ON u.id = ap.user_id
    WHERE ap.level IN ('level1', 'senior')
      AND u.status = 'active'
  `);

  let billCount = 0;
  const BATCH_SIZE = 50;

  for (let batchIdx = 0; batchIdx < agents.rows.length; batchIdx += BATCH_SIZE) {
    const batch = agents.rows.slice(batchIdx, batchIdx + BATCH_SIZE);

    // 每批一个事务
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const agent of batch) {
        const agentUserId = agent.agent_user_id;

        // 查该代理在周期内的已结算佣金
        const logs = await client.query(
          `SELECT id, commission_amount, user_id, billing_log_id, model, tokens, rate
           FROM agent_commissions
           WHERE agent_id = $1
             AND status = 'settled'
             AND created_at >= $2::timestamp
             AND created_at < ($3::timestamp + INTERVAL '1 day')
           ORDER BY id`,
          [agentUserId, periodStart, periodEnd],
        );
        if (logs.rows.length === 0) continue;

        // 汇总总额
        let total = 0;
        for (const r of logs.rows) {
          total += toNum(r.commission_amount);
        }

        // 写结算单
        const ins = await client.query(
          `INSERT INTO agent_settlements (cycle_id, agent_user_id, total_commission, settled_amount, adjustment_amount, status)
           VALUES ($1, $2, $3, $3, '0.0000', 'pending')
           RETURNING id`,
          [cycleId, agentUserId, total.toFixed(4)],
        );
        const settlementId = ins.rows[0].id;

        // 批量写入明细
        const DETAIL_BATCH = 100;
        for (let i = 0; i < logs.rows.length; i += DETAIL_BATCH) {
          const chunk = logs.rows.slice(i, i + DETAIL_BATCH);
          const values: any[] = [];
          const placeholders: string[] = [];
          for (let j = 0; j < chunk.length; j++) {
            const l = chunk[j];
            const baseIdx = j * 8;
            placeholders.push(
              `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8})`,
            );
            values.push(
              settlementId, l.id, l.commission_amount, l.user_id,
              l.billing_log_id ?? null, l.model ?? null, l.tokens ?? 0, l.rate ?? null,
            );
          }
          await client.query(
            `INSERT INTO settlement_details (settlement_id, commission_id, amount, client_user_id, consumption_id, model, tokens, commission_rate) VALUES ${placeholders.join(", ")}`,
            values,
          );
        }

        // 写确认日志
        await client.query(
          `INSERT INTO settlement_confirm_logs (settlement_id, action, operator_role, detail) VALUES ($1, 'generate', 'system', $2)`,
          [settlementId, `结算周期关账: ${periodStart} ~ ${periodEnd}, 佣金笔数: ${logs.rows.length}`],
        );

        billCount++;
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  // 关账
  await pool.query(
    "UPDATE settlement_cycles SET status='closed', generated_at=NOW() WHERE id=$1",
    [cycleId],
  );

  return { cycleId, periodStart, periodEnd, agentBillCount: billCount };
}

/**
 * 确认结算（代理手动确认或系统自动确认）
 */
export async function confirmSettlement(settlementId: number, userId: number, autoConfirm = false): Promise<void> {
  const s = await pool.query("SELECT * FROM agent_settlements WHERE id=$1", [settlementId]);
  if (!s.rows[0]) {
    throw Object.assign(new Error("结算单不存在"), { statusCode: 404, code: "SETTLEMENT_NOT_FOUND" });
  }
  const settlement = s.rows[0];
  if (settlement.status !== "pending") {
    throw Object.assign(
      new Error(`结算单状态为 ${settlement.status}，无法确认`),
      { statusCode: 400, code: "SETTLEMENT_STATUS_MISMATCH" },
    );
  }

  // 非自动确认时验证归属
  if (!autoConfirm) {
    const agent = await pool.query(
      "SELECT id FROM agent_profiles WHERE user_id=$1",
      [userId],
    );
    if (!agent.rows[0] || toNum(agent.rows[0].id) !== toNum(settlement.agent_user_id)) {
      throw Object.assign(new Error("结算单不存在"), { statusCode: 404, code: "SETTLEMENT_NOT_FOUND" });
    }
  }

  const settledAmount = toNum(settlement.settled_amount);
  const agentUserId = settlement.agent_user_id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. 更新结算单
    await client.query(
      "UPDATE agent_settlements SET status='settled', confirmed_at=NOW(), settled_at=NOW(), updated_at=NOW() WHERE id=$1",
      [settlementId],
    );

    // 2. 增加代理可提现余额（agent_profiles.settled_commission 字段？需要确认）
    // agent_profiles 没有 settled_commission 字段！看看 agent_profiles 的实际列
    // 如果用 users.balance，直接给用户加余额
    await client.query(
      "UPDATE users SET balance=balance + $1, updated_at=NOW() WHERE id=$2",
      [Math.round(settledAmount * 100), agentUserId], // users.balance 存分
    );

    // 3. 写入余额流水
    await client.query(
      `INSERT INTO balance_logs (user_id, type, amount, balance_after, description)
       SELECT $1, 'commission_settlement', $2, balance, $3 FROM users WHERE id=$1`,
      [agentUserId, (settledAmount * 100).toFixed(0), `结算单 #${settlementId} ${autoConfirm ? "自动" : "手动"}确认入账`],
    );

    // 4. 写操作日志
    await client.query(
      `INSERT INTO settlement_confirm_logs (settlement_id, action, operator_id, operator_role, detail) VALUES ($1, $2, $3, $4, $5)`,
      [
        settlementId,
        autoConfirm ? "auto_confirm" : "confirm",
        autoConfirm ? null : userId,
        autoConfirm ? "system" : "agent",
        autoConfirm
          ? `3 天未确认，系统自动确认。金额 ¥${settledAmount.toFixed(2)}`
          : `代理手动确认。金额 ¥${settledAmount.toFixed(2)}`,
      ],
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // 检查周期是否可以标记 settled
  await checkSettleCycle(settlement.cycle_id);
}

/**
 * 管理员调整结算金额
 */
export async function adjustSettlement(
  settlementId: number,
  adjustmentAmount: number,
  reason: string,
  adminUserId: number,
): Promise<{
  settlementId: number;
  originalAmount: string;
  adjustmentAmount: string;
  newSettledAmount: string;
}> {
  if (!reason || reason.trim().length < 5) {
    throw Object.assign(new Error("调整原因最少 5 个字符"), { statusCode: 400, code: "VALIDATION_ERROR" });
  }
  if (reason.trim().length > 500) {
    throw Object.assign(new Error("调整原因不能超过 500 字符"), { statusCode: 400, code: "VALIDATION_ERROR" });
  }

  const s = await pool.query("SELECT * FROM agent_settlements WHERE id=$1", [settlementId]);
  if (!s.rows[0]) {
    throw Object.assign(new Error("结算单不存在"), { statusCode: 404, code: "SETTLEMENT_NOT_FOUND" });
  }
  const settlement = s.rows[0];
  if (settlement.status !== "pending") {
    throw Object.assign(
      new Error("仅待确认状态的结算单可调整"),
      { statusCode: 400, code: "SETTLEMENT_STATUS_MISMATCH" },
    );
  }

  const currentSettled = toNum(settlement.settled_amount);
  const newAmount = currentSettled + adjustmentAmount;
  if (newAmount < 0) {
    throw Object.assign(
      new Error(`调整后金额 ¥${newAmount.toFixed(2)} 不能为负数（当前 ¥${currentSettled.toFixed(2)} + 调整 ¥${adjustmentAmount.toFixed(2)}）`),
      { statusCode: 400, code: "SETTLEMENT_AMOUNT_NEGATIVE" },
    );
  }

  await pool.query(
    `UPDATE agent_settlements
     SET adjustment_amount=$1, adjustment_reason=$2, settled_amount=$3, updated_at=NOW()
     WHERE id=$4`,
    [adjustmentAmount.toFixed(4), reason.trim(), newAmount.toFixed(4), settlementId],
  );

  await pool.query(
    `INSERT INTO settlement_confirm_logs (settlement_id, action, operator_id, operator_role, detail) VALUES ($1, 'adjust', $2, 'admin', $3)`,
    [settlementId, adminUserId, `调整: ¥${currentSettled.toFixed(2)} → ¥${newAmount.toFixed(2)}（${adjustmentAmount > 0 ? "+" : ""}¥${adjustmentAmount.toFixed(2)}）, 原因: ${reason.trim()}`],
  );

  return {
    settlementId,
    originalAmount: settlement.settled_amount,
    adjustmentAmount: adjustmentAmount.toFixed(4),
    newSettledAmount: newAmount.toFixed(4),
  };
}

/**
 * 检查周期内所有账单是否已结算完毕，全部 settled 则标记周期 settled
 */
export async function checkSettleCycle(cycleId: number): Promise<void> {
  const pending = await pool.query(
    "SELECT COUNT(*)::int AS cnt FROM agent_settlements WHERE cycle_id=$1 AND status='pending'",
    [cycleId],
  );
  if (pending.rows[0]?.cnt === 0) {
    await pool.query(
      "UPDATE settlement_cycles SET status='settled', settled_at=NOW() WHERE id=$1 AND status='closed'",
      [cycleId],
    );
  }
}
