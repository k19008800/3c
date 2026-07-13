/**
 * Seed: agent_balance_ledger for 13819008800@163.com (agent_id=1)
 *
 * Data source: real business companion data from:
 *   1. commission_logs → deduction entries (佣金结算扣费)
 *   2. withdraw_orders → freeze/unfreeze entries (提现冻结/解冻)
 *   3. call_logs / balance_logs → deduction entries (API 调用扣费)
 *
 * Strategy:
 *   - Read real commission_logs and generate corresponding balance entries
 *   - Read real withdraw_orders and generate freeze/unfreeze sequences
 *   - Entries are time-ordered and balanceBefore/balanceAfter form a consistent chain
 *   - Ref fields point back to source data (commission_logs.id, withdraw_orders.id)
 */

import "dotenv/config";
import pg from "pg";
const { Client } = pg;

const DB_URL = "postgres://postgres:postgres@localhost:5432/threecloud";
const AGENT_EMAIL = "13819008800@163.com";

// ── Helpers ──

function toBigintCents(n: string | number): number {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Math.round(v * 1e6); // scale 6 → multiply by 1e6 to get "cents"
}

function fmt(n: number): string {
  return (n / 1e6).toFixed(6);
}

type LedgerRow = {
  balance_type: string;
  change_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  ref_type: string | null;
  ref_id: number | null;
  remark: string | null;
  created_at: Date;
};

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();

  try {
    // 1. Get agent info
    const { rows: [agentRow] } = await c.query(
      `SELECT a.id as agent_id, u.id as user_id, a.total_commission, a.settled_commission
       FROM agents a JOIN users u ON u.id = a.user_id WHERE u.email = $1`,
      [AGENT_EMAIL]
    );
    if (!agentRow) {
      console.error(`Agent ${AGENT_EMAIL} not found`);
      return;
    }
    const agentId = agentRow.agent_id;
    console.log(`Agent: id=${agentId}, email=${AGENT_EMAIL}`);
    console.log(`  total_commission=${fmt(Number(agentRow.total_commission))}, settled_commission=${fmt(Number(agentRow.settled_commission))}`);

    // 2. Read commission_logs (settled ones) as companion data for deduction entries
    const { rows: commissionRows } = await c.query(
      `SELECT id, commission_amount, call_cost, commission_type, status, source_order_id,
              source_customer_id, voucher_no, created_at
       FROM commission_logs
       WHERE agent_id = $1
       ORDER BY created_at`,
      [agentId]
    );
    console.log(`\nCommission logs: ${commissionRows.length} rows`);

    // 3. Read withdraw_orders as companion data for freeze/unfreeze entries
    const { rows: withdrawRows } = await c.query(
      `SELECT id, amount, status, created_at, paid_at, reviewed_at, first_audited_at, second_audited_at
       FROM withdraw_orders
       WHERE agent_id = $1
       ORDER BY created_at`,
      [agentId]
    );
    console.log(`Withdraw orders: ${withdrawRows.length} rows`);

    // 4. Read some call_logs through clients as companion source data
    const { rows: callLogRows } = await c.query(
      `SELECT cl.id, cl.cost, cl.created_at, u.email as client_email
       FROM call_logs cl
       JOIN agent_clients ac ON ac.client_user_id = cl.user_id
       JOIN users u ON u.id = cl.user_id
       WHERE ac.agent_id = $1
       ORDER BY cl.created_at
       LIMIT 500`,
      [agentId]
    );
    console.log(`Call logs (through clients): ${callLogRows.length} rows (limited to 500)`);

    // 5. Build ledger entries — time-ordered
    const entries: LedgerRow[] = [];

    // ── Step A: Commission-based deduction entries ──
    // For each commission log, create a deduction that represents the agent's share being "spent"
    // These represent the cost incurred when agents earn commission
    let runningBalance = 0;

    // Sample ~100 commission entries spread across the timeline
    const sampleCommissions = commissionRows
      .filter(r => r.status !== 'cancelled')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Pick evenly spaced entries (~150 entries for a rich timeline)
    const step = Math.max(1, Math.floor(sampleCommissions.length / 150));
    const commissionSample = sampleCommissions.filter((_, i) => i % step === 0).slice(0, 150);

    for (const comm of commissionSample) {
      const amount = toBigintCents(comm.commission_amount);
      if (amount <= 0) continue;
      runningBalance -= amount;
      entries.push({
        balance_type: "available",
        change_type: "deduction",
        amount: -amount,
        balance_before: runningBalance + amount,
        balance_after: runningBalance,
        ref_type: "commission",
        ref_id: comm.id,
        remark: `佣金结算: ${comm.commission_type} [单号:${comm.source_order_id || '-'}]`,
        created_at: new Date(comm.created_at),
      });
    }

    // ── Step B: Call-based deduction entries ──
    // Mix in some direct call cost deductions (smaller amounts, more frequent)
    const callSample = callLogRows
      .filter(r => r.cost && Number(r.cost) > 0)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const callStep = Math.max(1, Math.floor(callSample.length / 200));
    const callEntries = callSample.filter((_, i) => i % callStep === 0).slice(0, 250);

    for (const call of callEntries) {
      const cost = Number(call.cost);
      if (cost <= 0) continue;
      // Agent's deduction is ~10% of call cost (commission rate)
      const amount = toBigintCents(cost * 0.01);
      if (amount <= 0) continue;
      runningBalance -= amount;
      entries.push({
        balance_type: "available",
        change_type: "deduction",
        amount: -amount,
        balance_before: runningBalance + amount,
        balance_after: runningBalance,
        ref_type: "call",
        ref_id: call.id,
        remark: `调用扣费: ${call.client_email || '客户'} [log#${call.id}]`,
        created_at: new Date(call.created_at),
      });
    }

    // ── Step C: Withdraw-based freeze/unfreeze entries ──
    for (const w of withdrawRows) {
      const wCreatedAt = new Date(w.created_at);
      const amount = toBigintCents(w.amount);

      if (w.status === 'paid') {
        // freeze: when withdraw submitted
        runningBalance -= amount;
        entries.push({
          balance_type: "available",
          change_type: "freeze",
          amount: -amount,
          balance_before: runningBalance + amount,
          balance_after: runningBalance,
          ref_type: "withdraw",
          ref_id: w.id,
          remark: `提现冻结: 申请提现 ¥${Number(w.amount).toFixed(2)}`,
          created_at: wCreatedAt,
        });

        // unfreeze + deduction when withdraw paid
        const paidAt = w.paid_at ? new Date(w.paid_at) : new Date(wCreatedAt.getTime() + 86400000);
        entries.push({
          balance_type: "frozen",
          change_type: "unfreeze",
          amount: amount,
          balance_before: 0,
          balance_after: amount,
          ref_type: "withdraw",
          ref_id: w.id,
          remark: `提现解冻: 审核通过`,
          created_at: paidAt,
        });
      } else if (w.status === 'rejected') {
        // freeze and unfreeze (cancel)
        runningBalance -= amount;
        entries.push({
          balance_type: "available",
          change_type: "freeze",
          amount: -amount,
          balance_before: runningBalance + amount,
          balance_after: runningBalance,
          ref_type: "withdraw",
          ref_id: w.id,
          remark: `提现冻结: 申请提现 ¥${Number(w.amount).toFixed(2)}`,
          created_at: wCreatedAt,
        });
        const rejectAt = w.reviewed_at ? new Date(w.reviewed_at) : new Date(wCreatedAt.getTime() + 43200000);
        runningBalance += amount;
        entries.push({
          balance_type: "frozen",
          change_type: "unfreeze",
          amount: amount,
          balance_before: amount,
          balance_after: 0,
          ref_type: "withdraw",
          ref_id: w.id,
          remark: `提现退回: 审核拒绝`,
          created_at: rejectAt,
        });
      } else if (w.status === 'approved') {
        // freeze only (not yet paid)
        runningBalance -= amount;
        entries.push({
          balance_type: "available",
          change_type: "freeze",
          amount: -amount,
          balance_before: runningBalance + amount,
          balance_after: runningBalance,
          ref_type: "withdraw",
          ref_id: w.id,
          remark: `提现冻结: 申请提现 ¥${Number(w.amount).toFixed(2)}`,
          created_at: wCreatedAt,
        });
      }
    }

    // ── Step D: Refund entries (credit back) ──
    // Add some refund entries from rejections and random adjustments for realism
    const refundSources = commissionRows
      .filter(r => r.status === 'cancelled')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    for (const ret of refundSources.slice(0, 10)) {
      const amount = toBigintCents(ret.commission_amount);
      if (amount <= 0) continue;
      runningBalance += amount;
      entries.push({
        balance_type: "available",
        change_type: "refund",
        amount: amount,
        balance_before: runningBalance - amount,
        balance_after: runningBalance,
        ref_type: "commission",
        ref_id: ret.id,
        remark: `佣金退款: 订单取消 ${ret.source_order_id || '-'}`,
        created_at: new Date(ret.created_at),
      });
    }

    // ── Step E: Unfreeze entries (credit from recharge/redemption) ──
    // Simulate some balance top-ups / unfreezes for realistic balance growth
    const topUpDates = generateTopUpDates(entries);
    for (const d of topUpDates) {
      const amount = Math.round(50000 + Math.random() * 450000); // 0.05 ~ 0.50 yuan cents
      runningBalance += amount;
      entries.push({
        balance_type: "available",
        change_type: "unfreeze",
        amount: amount,
        balance_before: runningBalance - amount,
        balance_after: runningBalance,
        ref_type: null,
        ref_id: null,
        remark: `余额充值入账`,
        created_at: d,
      });
    }

    // ── Step F: Sort by time and recompute balances ──
    entries.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

    // Recompute running balance from scratch
    let balance = 0;
    for (const e of entries) {
      const absAmount = Math.abs(e.amount);
      if (e.change_type === "deduction" || e.change_type === "freeze") {
        balance -= absAmount;
      } else if (e.change_type === "unfreeze" || e.change_type === "refund") {
        balance += absAmount;
      }
      e.balance_before = e.amount > 0 ? balance - absAmount : balance + absAmount;
      e.balance_after = balance;
    }

    // ── Insert into database ──
    console.log(`\nTotal entries to insert: ${entries.length}`);

    // Clear existing data for this agent (for re-runs)
    await c.query("DELETE FROM agent_balance_ledger WHERE agent_id = $1", [agentId]);

    // Batch insert
    const BATCH_SIZE = 100;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const values: any[] = [];
      const placeholders: string[] = [];

      for (let j = 0; j < batch.length; j++) {
        const e = batch[j];
        const base = j * 10;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`
        );
        values.push(
          agentId, e.balance_type, e.change_type, e.amount,
          e.balance_before, e.balance_after,
          e.ref_type, e.ref_id, e.remark,
          e.created_at
        );
      }

      await c.query(
        `INSERT INTO agent_balance_ledger (agent_id, balance_type, change_type, amount, balance_before, balance_after, ref_type, ref_id, remark, created_at)
         VALUES ${placeholders.join(", ")}`,
        values
      );
    }

    // ── Verify ──
    const { rows: [countRow] } = await c.query(
      "SELECT count(*) as cnt FROM agent_balance_ledger WHERE agent_id = $1",
      [agentId]
    );
    const { rows: summaryRows } = await c.query(
      `SELECT change_type, count(*) as cnt, sum(amount) as total
       FROM agent_balance_ledger WHERE agent_id = $1
       GROUP BY change_type
       ORDER BY change_type`,
      [agentId]
    );

    console.log(`\n=== Inserted ${countRow.cnt} entries ===`);
    console.log("Summary by change_type:");
    for (const r of summaryRows) {
      console.log(`  ${r.change_type}: ${r.cnt} entries, total=${fmt(Number(r.total))}`);
    }

  } finally {
    await c.end();
  }
}

// Generate some even-paced top-up dates across the timeline
function generateTopUpDates(entries: LedgerRow[]): Date[] {
  const allDates = entries.map(e => e.created_at.getTime());
  if (allDates.length === 0) return [];

  const min = Math.min(...allDates);
  const max = Math.max(...allDates);
  const span = max - min;

  const dates: Date[] = [];
  // ~20 top-ups spread across the timeline
  for (let i = 0; i < 20; i++) {
    const offset = span * (i / 21);
    dates.push(new Date(min + offset + Math.random() * (span / 30)));
  }
  return dates;
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
