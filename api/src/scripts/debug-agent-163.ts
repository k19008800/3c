import { createDb, closeDb } from "../db/index.js";
import { sql } from "drizzle-orm";

async function main() {
  const db = createDb();
  console.log("=== AGENT 163 DEBUG ===");

  // Agent info
  const [agent] = (await db.execute(sql`
    SELECT a.id, a.user_id, u.email, u.nickname
    FROM agents a JOIN users u ON a.user_id = u.id WHERE a.id = 163
  `)).rows;
  console.log("Agent:", JSON.stringify(agent));

  // Rollup for 2026-06-28
  const rollup = (await db.execute(sql`
    SELECT * FROM commission_daily_rollup WHERE agent_id = 163 AND report_date = '2026-06-28'
  `)).rows;
  console.log("\nRollup 2026-06-28:", JSON.stringify(rollup));

  // Commission_logs by status on 2026-06-28
  const stats = (await db.execute(sql`
    SELECT status, count(*)::int as cnt, sum(commission_amount)::numeric(18,6) as total
    FROM commission_logs
    WHERE agent_id = 163
      AND created_at >= '2026-06-28T00:00:00Z' 
      AND created_at <= '2026-06-28T23:59:59.999Z'
    GROUP BY status
  `)).rows;
  console.log("\nCommission Logs by Status:", JSON.stringify(stats));

  // Total records count on 2026-06-28
  const [total] = (await db.execute(sql`
    SELECT count(*)::int as cnt FROM commission_logs
    WHERE agent_id = 163
      AND created_at >= '2026-06-28T00:00:00Z' 
      AND created_at <= '2026-06-28T23:59:59.999Z'
  `)).rows;
  console.log("\nTotal records 2026-06-28:", JSON.stringify(total));

  // Check ALL pending records for this agent (any date)
  const allPending = (await db.execute(sql`
    SELECT count(*)::int as cnt, sum(commission_amount)::numeric(18,6) as total
    FROM commission_logs WHERE agent_id = 163 AND status = 'pending'
  `)).rows;
  console.log("\nAll pending for agent 163:", JSON.stringify(allPending));

  // Sample of pending records
  const samples = (await db.execute(sql`
    SELECT id, commission_amount, commission_type, status, created_at, 
           voucher_no, client_call_log_id, source_customer_id
    FROM commission_logs
    WHERE agent_id = 163 AND status = 'pending'
      AND created_at >= '2026-06-28T00:00:00Z' 
      AND created_at <= '2026-06-28T23:59:59.999Z'
    ORDER BY id LIMIT 5
  `)).rows;
  console.log("\nSample pending records:", JSON.stringify(samples));

  await closeDb();
  process.exit(0);
}
main().catch(e => { console.error("ERROR:", e); process.exit(1); });
