import { createDb, closeDb } from "../db/index.js";
import { sql } from "drizzle-orm";

async function main() {
  const db = createDb();

  // Find agent id
  const [agent] = (await db.execute(sql`
    SELECT a.id FROM agents a JOIN users u ON a.user_id = u.id WHERE u.email = '13819008800@163.com'
  `)).rows;
  const agentId = agent?.id as number;
  console.log('Agent ID:', agentId);

  // Find rollup rows where pending_count > 0
  const badRollups = (await db.execute(sql`
    SELECT report_date, pending_count, settled_count, pending_amount, settled_amount
    FROM commission_daily_rollup
    WHERE agent_id = ${agentId} AND pending_count > 0
    ORDER BY report_date
  `)).rows;
  console.log('\nRollup rows with pending > 0:');
  for (const r of badRollups) {
    console.log(`  ${r.report_date}: pending=${r.pending_count}, settled=${r.settled_count}, pending_amt=${r.pending_amount}`);
  }

  // For each bad date, check actual counts
  for (const r of badRollups as any[]) {
    const actual = (await db.execute(sql`
      SELECT status, count(*)::int as cnt, sum(commission_amount)::numeric(18,6) as total
      FROM commission_logs
      WHERE agent_id = ${agentId}
        AND created_at >= ${r.report_date + 'T00:00:00Z'}
        AND created_at <= ${r.report_date + 'T23:59:59.999Z'}
      GROUP BY status
    `)).rows;
    console.log(`  Date ${r.report_date}: rollup_pending=${r.pending_count}, actual=${JSON.stringify(actual)}`);
  }

  // Check ALL rollup rows for this agent to find any mismatches
  const allRollups = (await db.execute(sql`
    SELECT report_date, total_records, pending_count, settled_count, cancelled_count
    FROM commission_daily_rollup
    WHERE agent_id = ${agentId}
    ORDER BY report_date
  `)).rows;
  
  console.log('\n\nAll rollup rows:');
  for (const r of allRollups as any[]) {
    const actual = (await db.execute(sql`
      SELECT count(*)::int as cnt
      FROM commission_logs
      WHERE agent_id = ${agentId}
        AND created_at >= ${r.report_date + 'T00:00:00Z'}
        AND created_at <= ${r.report_date + 'T23:59:59.999Z'}
    `)).rows;
    const actualCount = (actual as any[])[0]?.cnt ?? 0;
    const rollupTotal = (r.total_records ?? 0) as number;
    if (rollupTotal !== actualCount) {
      console.log(`  MISMATCH ${r.report_date}: rollup=${rollupTotal}, actual=${actualCount}`);
    }
  }

  console.log('\nDone.');
  await closeDb();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
