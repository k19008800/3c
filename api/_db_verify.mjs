import pg from 'pg';
const pool = new pg.Pool({
  host: 'localhost', port: 5432, database: 'threecloud',
  user: 'postgres', password: 'postgres'
});

console.log('=== DATABASE MIGRATION VERIFICATION ===\n');

// 1. New tables
console.log('--- 1. New Tables ---');
const newTables = ['code_templates', 'code_notification_logs'];
for (const tbl of newTables) {
  const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name=$1", [tbl]);
  console.log(`  ${tbl}: ${r.rows.length > 0 ? '✅ EXISTS' : '❌ MISSING'}`);
}

// 2. Redemption_codes new columns
console.log('\n--- 2. Redemption Codes New Columns ---');
const codeCols = ['type', 'cost_price', 'face_price', 'agent_id', 'batch_no', 'risk_score'];
for (const col of codeCols) {
  const r = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='redemption_codes' AND column_name=$1",
    [col]
  );
  console.log(`  ${col}: ${r.rows.length > 0 ? '✅ EXISTS' : '❌ MISSING'} (${r.rows.length > 0 ? 'type=' + r.rows[0].column_name : ''})`);
}

// 3. Redemption_logs new columns
console.log('\n--- 3. Redemption Logs New Columns ---');
const logCols = ['code_snapshot', 'token_received', 'balance_log_id'];
for (const col of logCols) {
  const r = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='redemption_logs' AND column_name=$1",
    [col]
  );
  console.log(`  ${col}: ${r.rows.length > 0 ? '✅ EXISTS (' + r.rows[0].data_type + ')' : '❌ MISSING'}`);
}

// 4. Campaigns new columns
console.log('\n--- 4. Campaigns New Columns ---');
const campCols = ['code_count', 'used_count', 'cost_amount', 'revenue_amount'];
for (const col of campCols) {
  const r = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='campaigns' AND column_name=$1",
    [col]
  );
  console.log(`  ${col}: ${r.rows.length > 0 ? '✅ EXISTS (' + r.rows[0].data_type + ')' : '❌ MISSING'}`);
}

// 5. Code templates structure
console.log('\n--- 5. Code Templates Columns ---');
const r1 = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='code_templates'");
if (r1.rows.length > 0) {
  for (const c of r1.rows) console.log(`  ${c.column_name}: ${c.data_type}`);
} else {
  console.log('  (table does not exist)');
}

// 6. Code notification logs structure
console.log('\n--- 6. Code Notification Logs Columns ---');
const r2 = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='code_notification_logs'");
if (r2.rows.length > 0) {
  for (const c of r2.rows) console.log(`  ${c.column_name}: ${c.data_type}`);
} else {
  console.log('  (table does not exist)');
}

await pool.end();
console.log('\n=== VERIFICATION COMPLETE ===');
