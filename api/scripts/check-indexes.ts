import { createDb, getDb } from '../src/db/index.js';

async function main() {
  createDb();
  const db = getDb();
  
  const result = await db.execute(`
    SELECT tablename, indexname 
    FROM pg_indexes 
    WHERE tablename IN ('vendor_key_group_items', 'balance_logs', 'commission_logs', 'call_logs', 'agent_balance_ledger', 'user_login_history', 'redemption_logs', 'agent_customer_consumption')
    ORDER BY tablename, indexname
  `);
  
  console.log('\n=== 性能索引状态 ===\n');
  
  const byTable = new Map<string, string[]>();
  for (const row of result.rows as any[]) {
    const list = byTable.get(row.tablename) || [];
    list.push(row.indexname);
    byTable.set(row.tablename, list);
  }
  
  for (const [table, indexes] of byTable) {
    console.log(`\n${table}:`);
    for (const idx of indexes) {
      const isNew = idx.includes('_route_') || idx.includes('_ref_') || idx.includes('_client_call') || idx.includes('_key_item') || idx.includes('_abl_ref') || idx.includes('_ip') || idx.includes('_batch') || idx.includes('_customer');
      console.log(`  ${isNew ? '✅' : '  '} ${idx}`);
    }
  }
  
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
